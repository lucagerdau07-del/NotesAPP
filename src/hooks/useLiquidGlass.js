import { useEffect, useRef } from "react";
import { LiquidGlass } from "@ybouane/liquidglass";
import {
  collectControlGlassElements,
  CONTROL_GLASS_DEFAULTS,
} from "../liquidGlass/controlGlass";

// Before it reports ready, LiquidGlass pre-warms its scene cache by rasterising
// every non-glass child of the root through html-to-image. That cost scales with
// DOM node count (~1ms/node), not resolution: ~600ms on desktop, several seconds
// on a Galaxy Tab A7 — and the whole time the UI shows the CSS fallback before
// visibly swapping to real glass. The render loop refills that cache
// asynchronously on its own, so skipping the pre-warm only costs the first frame
// or two of an unfilled scene, which is not noticeable in practice.
//
// ponytail: monkeypatches a private method. If the library renames it this
// silently becomes a no-op and we are back to the slow-but-correct behaviour.
// Upgrade path if that happens: patch-package (already a dependency).
function skipStaticCapturePrewarm() {
  const prototype = LiquidGlass?.prototype;
  const prewarm = prototype?._prewarmStaticCaptures;
  if (typeof prewarm !== "function" || prewarm.__skipped) return;
  const skipped = async function () {};
  skipped.__skipped = true;
  prototype._prewarmStaticCaptures = skipped;
}

// The library primes every scene composite with an opaque #ffffff base before
// drawing the DOM behind a panel. Any region it has no capture for yet stays
// that white — which on a dark UI is a full-panel white flash for as long as
// the captures take. Repaint the base in the page's own background colour so an
// unfilled scene reads as the app's dark ground instead. Only meaningful with
// the prewarm skipped above, but correct either way.
function useAppBackgroundAsSceneBase() {
  const prototype = LiquidGlass?.prototype;
  const prepare = prototype?._prepareSceneCanvas;
  if (typeof prepare !== "function" || prepare.__rebased) return;
  const base = globalThis.getComputedStyle?.(document.body)?.backgroundColor;
  // Transparent or unreadable — leave the library's own base alone.
  if (!base || base === "transparent" || base.startsWith("rgba(0, 0, 0, 0)"))
    return;
  const rebased = function (width, height) {
    prepare.call(this, width, height);
    this._sceneCtx.fillStyle = base;
    this._sceneCtx.fillRect(0, 0, width, height);
  };
  rebased.__rebased = true;
  prototype._prepareSceneCanvas = rebased;
}

// When a glass control's box changes size — the rail animating its width open
// into the assistant panel — the library resizes its canvas, and assigning
// canvas.width clears it. It does not mark that control dirty though (its own
// caller comments claim it does), so with no dirty glass, no data-dynamic
// content and no drag in progress the render loop's frame early-outs and leaves
// the cleared canvas blank. Measured mid-transition: 529x1253 canvas, zero
// non-transparent pixels. The glass surface is simply gone for the whole 320ms
// of the animation and only returns when something else marks it changed (our
// own onTransitionEnd) — that is the blink. Mark the frame dirty so the frame
// that resized a canvas also repaints it.
//
// The same size change also dirties the control's *content image*, which is
// rebuilt with html-to-image over the whole control (~75ms on desktop, far more
// on a Galaxy Tab A7) from inside the render loop, once per animation frame —
// ~1.3s of main-thread work inside a 320ms transition, starving the very frames
// the repaint above needs. That image is only ever sampled by another glass
// panel overlapping this one, so hold it back until the box stops moving.
//
// A control's content image is only ever drawn into the scene *another* glass
// panel samples, so a control that overlaps no other glass never has its image
// read — and the library re-captures it on every DOM mutation inside the
// control. That is one html-to-image pass over the whole panel per keystroke in
// the chat input or per icon swap on a rail button: measured at ~900ms of
// blocked main thread each on a Galaxy Tab A7. Skip the ones nothing samples.
export function samplesEachOther(element, all) {
  const a = element.getBoundingClientRect();
  return all.some((other) => {
    if (other === element) return false;
    const b = other.getBoundingClientRect();
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  });
}

// ponytail: monkeypatches two private methods. If the library renames either,
// this becomes a no-op and we are back to the blink, not to a broken frame.
// Upgrade path: patch-package (already a dependency).
function keepGlassPaintedWhileResizing() {
  const prototype = LiquidGlass?.prototype;
  const checkSizes = prototype?._checkGlassSizeChanges;
  const captureContent = prototype?._captureGlassContent;
  if (
    typeof checkSizes !== "function" ||
    typeof captureContent !== "function" ||
    checkSizes.__repaints
  )
    return;
  const repainting = function () {
    const resized = checkSizes.call(this);
    this.__glassResizing = resized;
    if (resized) this._globalDirty = true;
    return resized;
  };
  repainting.__repaints = true;
  prototype._checkGlassSizeChanges = repainting;
  // targets === null is the init/resize pass over every control — never deferred.
  prototype._captureGlassContent = function (targets = null) {
    const all = [...this.glassSet];
    const sampled = [...(targets ?? all)].filter((el) => samplesEachOther(el, all));
    if (sampled.length === 0) return Promise.resolve();
    if (!this.__glassResizing || !targets) return captureContent.call(this, new Set(sampled));
    for (const element of sampled) this._glassContentDirty.add(element);
    return Promise.resolve();
  };
}

// Right after init the WebGL canvas exists but has captured no DOM yet, so it
// has nothing to refract and renders as a flat panel. Flipping to "enhanced"
// there tears down the CSS glass fallback and that flat panel becomes visible —
// the staged black/glass sequence. The CSS fallback already looks like glass, so
// holding it until the scene is complete costs nothing visually and makes the
// handover to WebGL invisible.
//
// The render loop requests one element's capture per glass per frame and each
// lands on its own schedule, so "no capture landed for the last N ms" is not the
// same as "the scene is complete" — it fires after the first capture of a
// staggered batch, which is the black step. Wait for the pipeline itself to go
// idle instead: nothing in flight, and no new request for a few frames (a landed
// capture re-dirties its glasses, which ask for the next one a frame later).
//
// ponytail: reads the capture's private in-flight set. If the library renames
// it we fall through to resolving immediately — back to today's flash, not a
// hang. Upgrade path: patch-package (already a dependency).
function sceneCapturesIdle(
  instance,
  { idleFrames = 3, startMs = 1000, timeoutMs = 15000 } = {},
) {
  const capture = instance?.capture;
  const inFlight = capture?._capturing;
  if (!inFlight) return Promise.resolve();
  return new Promise((resolve) => {
    const started = performance.now();
    let sawCapture = false;
    let idle = 0;
    const tick = () => {
      const busy = inFlight.size > 0;
      sawCapture = sawCapture || busy || capture.cache?.size > 0;
      idle = busy ? 0 : idle + 1;
      const elapsed = performance.now() - started;
      // Nothing ever queued: this page's panels overlap no capturable DOM.
      if (sawCapture ? idle >= idleFrames : elapsed >= startMs) return resolve();
      if (elapsed >= timeoutMs) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Every non-glass child of root is rasterised through html-to-image once and
// that cache entry is only ever treated as stale when the element's *size*
// changes. So everything behind the glass — document text, page objects, an
// opening panel — keeps refracting whatever was on screen when the instance
// initialised. markChanged() does not help: it re-runs the shader over the same
// cached bitmap. data-dynamic would re-capture every frame (~100ms+ of
// html-to-image per frame on a Galaxy Tab A7), so re-capture on an actual DOM
// change instead, debounced until the change settles. captureElement(force)
// overwrites the cache entry in place, so the old pixels stay on screen until
// the new ones land, and the library's own onCacheUpdate marks the glasses that
// sample them.
//
// ponytail: DOM mutations only. Repaints that touch no DOM still show the old
// capture — canvas pixels are fine (the library draws canvases live via
// drawImage), but a scroll offset is not: html-to-image's clone never copies
// scrollTop, so a re-capture of a scrolled container renders it from the top
// either way. Fixing that needs a patch-package patch on the bundled clone step.
const BACKGROUND_QUIET_MS = 250;

// A whiteboard pan or zoom commits by writing one `transform` onto the layers
// that carry the viewport, and nothing else in the document changes. That was
// still a DOM mutation, so it scheduled a full re-capture of the document
// wrapper — measured at 1.9s of blocked main thread on a Galaxy Tab A7, ~250ms
// after the fingers came off, once per gesture. That is the freeze. The content
// behind the glass really did move, so the capture goes stale; a strip of
// slightly stale refraction behind the rail is worth two seconds of frozen
// screen. Elements opting out carry this attribute (see WhiteboardCanvas and
// PageObjectLayer) and only their `style` changes are ignored — anything else
// about them still counts.
const IGNORED_STYLE_TARGET = "data-glass-ignore-style";

// Even when a capture is warranted, it can cost more than the staleness it
// fixes. Time each wrapper's first one and drop the ones that blow this: they
// keep their last good capture, which is exactly what a slow device had before
// this re-capture existed. Self-measuring rather than device-sniffing, so a
// fast machine keeps live refraction and a slow one stops paying for it.
const CAPTURE_BUDGET_MS = 150;

export function recaptureBackgroundOnChange(instance, root) {
  const noop = () => {};
  const wrappers = Array.from(root.children).filter(
    (child) =>
      !child.hasAttribute("data-liquid-glass-control") &&
      !["CANVAS", "IMG", "VIDEO"].includes(child.tagName),
  );
  if (!instance?.capture || wrappers.length === 0) return noop;

  let timer = 0;
  // Only the wrapper that actually changed: a re-capture is one html-to-image
  // pass over that whole subtree (~790ms for the document body on a Galaxy Tab
  // A7), so re-shooting all of them because one pill changed is three of those
  // for nothing.
  const dirty = new Set();
  const overBudget = new Set();
  const ignorable = (record) =>
    record.type === "attributes" &&
    record.attributeName === "style" &&
    record.target.hasAttribute?.(IGNORED_STYLE_TARGET);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (ignorable(record)) continue;
      const wrapper = wrappers.find((candidate) => candidate.contains(record.target));
      if (wrapper && !overBudget.has(wrapper)) dirty.add(wrapper);
    }
    // Every record was one we ignore: leave any capture already scheduled alone
    // rather than pushing it back a gesture at a time.
    if (dirty.size === 0) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const pending = [...dirty];
      dirty.clear();
      for (const wrapper of pending) {
        const started = performance.now();
        Promise.resolve(instance.capture.captureElement(wrapper, true))
          .then(() => {
            if (performance.now() - started > CAPTURE_BUDGET_MS)
              overBudget.add(wrapper);
          })
          .catch(noop);
      }
    }, BACKGROUND_QUIET_MS);
  });
  for (const wrapper of wrappers)
    observer.observe(wrapper, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

  return () => {
    observer.disconnect();
    clearTimeout(timer);
  };
}

export default function useLiquidGlass(rootRef, invalidateKey) {
  const instanceRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let cancelled = false;
    let instance = null;
    let stopRecapture = null;
    root.dataset.liquidGlassState = "loading";

    const start = async () => {
      try {
        skipStaticCapturePrewarm();
        useAppBackgroundAsSceneBase();
        keepGlassPaintedWhileResizing();
        await document.fonts?.ready;
        if (cancelled) return;
        const glassElements = collectControlGlassElements(root);
        if (glassElements.length === 0)
          throw new Error(
            "Expected at least one Liquid Glass control, found none",
          );
        const created = await LiquidGlass.init({
          root,
          glassElements,
          defaults: CONTROL_GLASS_DEFAULTS,
        });
        if (cancelled) {
          created.destroy();
          return;
        }
        instance = created;
        instanceRef.current = created;
        instanceRef.current.markChanged();
        await sceneCapturesIdle(created);
        if (cancelled) return;
        // Only once the initial scene is complete: the re-capture keeps the
        // pipeline busy, and sceneCapturesIdle waits for it to go quiet.
        stopRecapture = recaptureBackgroundOnChange(created, root);
        root.dataset.liquidGlassState = "enhanced";
      } catch (error) {
        if (!cancelled) {
          root.dataset.liquidGlassState = "fallback";
          console.warn("[liquid-glass] Falling back to CSS glass.", error);
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      instanceRef.current = null;
      stopRecapture?.();
      instance?.destroy();
    };
  }, [rootRef]);

  useEffect(() => {
    instanceRef.current?.markChanged();
  }, [invalidateKey]);

  return instanceRef;
}
