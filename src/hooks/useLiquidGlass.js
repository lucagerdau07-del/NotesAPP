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
    // A panel that just finished growing now covers page objects the last
    // capture culled (see cullCaptureToGlass), and nothing in the DOM behind
    // it changed to trigger a re-capture on its own.
    if (this.__glassResizing && !resized)
      for (const child of this.root?.children ?? [])
        if (!this.glassSet.has(child) && !["CANVAS", "IMG", "VIDEO"].includes(child.tagName))
          this.capture?.captureElement(child, true);
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

// Page objects this far outside every glass panel are left out of a capture.
// Covers the panel's shadow/blur sampling margin and an object's selection
// chrome, which sits just outside its box.
const CULL_MARGIN_PX = 48;

// A pan or zoom is not re-captured straight away (see viewport handling in
// recaptureBackgroundOnChange); the refreshed capture is taken once the view
// has been still this long, so it lands while nobody is touching the screen.
const VIEWPORT_SETTLE_MS = 1500;

// Layers that carry a whiteboard's camera as a CSS transform (origin 0 0,
// filling the captured wrapper). "outer" holds the live gesture preview,
// "inner" the committed camera; the ink canvas mirrors "outer".
const VIEWPORT_ATTR = "data-glass-viewport";

function transformOf(node) {
  const value = node ? getComputedStyle(node).transform : "none";
  return !value || value === "none" ? new DOMMatrix() : new DOMMatrix(value);
}

// The camera transform applied to page content inside element, in element
// CSS pixels. Identity when element holds no whiteboard.
export function viewportMatrix(element) {
  if (typeof DOMMatrix === "undefined") return null;
  const outer = element.querySelector(`[${VIEWPORT_ATTR}="outer"]`);
  const inner = element.querySelector(`[${VIEWPORT_ATTR}="inner"]`);
  return transformOf(outer).multiply(transformOf(inner));
}

function intersects(a, b, margin) {
  return (
    a.left < b.right + margin &&
    b.left - margin < a.right &&
    a.top < b.bottom + margin &&
    b.top - margin < a.bottom
  );
}

// A capture clones the wrapper and copies every computed style onto every
// node, in one uninterruptible task: ~6-7ms per node on a Galaxy Tab A7, 1.9s
// for a 79-object whiteboard. It is only ever sampled where a glass panel sits,
// so page objects nowhere near one are left out of the clone (html-to-image's
// filter prunes the clone; the live DOM is untouched).
//
// Even culled it stays ~600ms whenever a column of objects sits behind the
// rail — too slow to run after every pan. So a capture also remembers the
// camera it was taken at, and drawing it applies the camera change since:
// the refraction follows a pan or zoom for the cost of one drawImage, and a
// real re-capture only has to fill in what newly slid behind the glass.
//
// ponytail: replaces a private and a public method on this instance's
// capture. If the library renames them this is a no-op — full-cost captures,
// refraction frozen between them. Upgrade path: patch-package.
export function cullCaptureToGlass(instance) {
  const capture = instance?.capture;
  if (
    typeof capture?._captureWithHtmlToImage !== "function" ||
    typeof capture.captureToCanvas !== "function" ||
    typeof capture.drawCachedElement !== "function"
  )
    return;

  capture._captureWithHtmlToImage = async function (element, w, h, cssW, cssH) {
    if (cssW <= 0 || cssH <= 0 || w <= 0 || h <= 0) return;
    const viewport = viewportMatrix(element);
    const glassRects = [...instance.glassSet].map((glass) => glass.getBoundingClientRect());
    const offGlass = [...element.querySelectorAll("[data-object-id]")].filter((object) => {
      const box = object.getBoundingClientRect();
      return !glassRects.some((glass) => intersects(box, glass, CULL_MARGIN_PX));
    });
    const canvas = await this.captureToCanvas(element, cssW, cssH, offGlass);
    if (!canvas) return;
    this.cache.set(element, { canvas, w, h, viewport });
    this.onCacheUpdate?.(element);
  };

  const draw = capture.drawCachedElement;
  capture.drawCachedElement = function (element, ctx, x, y, w, h) {
    const entry = this.cache.get(element);
    const now = entry && viewportMatrix(element);
    if (!now) return draw.call(this, element, ctx, x, y, w, h);
    // A capture the library took before this patch: best baseline is now.
    entry.viewport ??= now;
    const delta = now.multiply(entry.viewport.inverse());
    if (delta.isIdentity) return draw.call(this, element, ctx, x, y, w, h);
    const box = element.getBoundingClientRect();
    if (box.width <= 0) return draw.call(this, element, ctx, x, y, w, h);
    const pixels = w / box.width;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pixels, pixels);
    ctx.transform(delta.a, delta.b, delta.c, delta.d, delta.e, delta.f);
    const drawn = draw.call(this, element, ctx, 0, 0, box.width, box.height);
    ctx.restore();
    return drawn;
  };
}

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
  let viewportTimer = 0;
  const viewportMoved = new Set();
  const capture = (targets) => {
    const pending = [...targets];
    targets.clear();
    for (const wrapper of pending)
      Promise.resolve(instance.capture.captureElement(wrapper, true)).catch(noop);
  };

  const observer = new MutationObserver((records) => {
    let contentChanged = false;
    for (const record of records) {
      const wrapper = wrappers.find((candidate) => candidate.contains(record.target));
      if (!wrapper) continue;
      // A camera move: the existing capture is redrawn shifted (see
      // cullCaptureToGlass), so only the glass needs repainting now.
      if (
        record.type === "attributes" &&
        record.attributeName === "style" &&
        record.target.hasAttribute?.(VIEWPORT_ATTR)
      ) {
        viewportMoved.add(wrapper);
        instance.markChanged?.(wrapper);
        continue;
      }
      dirty.add(wrapper);
      contentChanged = true;
    }
    if (viewportMoved.size > 0) {
      clearTimeout(viewportTimer);
      viewportTimer = setTimeout(() => capture(viewportMoved), VIEWPORT_SETTLE_MS);
    }
    if (!contentChanged) return;
    clearTimeout(timer);
    timer = setTimeout(() => capture(dirty), BACKGROUND_QUIET_MS);
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
    clearTimeout(viewportTimer);
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
        cullCaptureToGlass(created);
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
