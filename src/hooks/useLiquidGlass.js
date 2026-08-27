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

// Right after init the WebGL canvas exists but has captured no DOM yet, so it
// has nothing to refract and renders as a flat panel. Flipping to "enhanced"
// there tears down the CSS glass fallback and that flat panel becomes visible —
// the staged black/white/glass sequence. The CSS fallback already looks like
// glass, so holding it until the captures stop arriving costs nothing visually
// and makes the handover to WebGL invisible. The hard timeout keeps a page
// whose panels overlap nothing from waiting forever.
function sceneCaptureSettled(instance, quietMs = 120, timeoutMs = 3000) {
  const capture = instance?.capture;
  if (!capture) return Promise.resolve();
  return new Promise((resolve) => {
    const libraryHandler = capture.onCacheUpdate;
    let settled = false;
    let quietTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      capture.onCacheUpdate = libraryHandler;
      resolve();
    };
    const hardTimer = setTimeout(finish, timeoutMs);
    capture.onCacheUpdate = (element) => {
      libraryHandler?.(element);
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    };
  });
}

export default function useLiquidGlass(rootRef, invalidateKey) {
  const instanceRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let cancelled = false;
    let instance = null;
    root.dataset.liquidGlassState = "loading";

    const start = async () => {
      try {
        skipStaticCapturePrewarm();
        useAppBackgroundAsSceneBase();
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
        await sceneCaptureSettled(created);
        if (cancelled) return;
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
      instance?.destroy();
    };
  }, [rootRef]);

  useEffect(() => {
    instanceRef.current?.markChanged();
  }, [invalidateKey]);
}
