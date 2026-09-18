// Dragging the scrollbar sweeps the whole document past in about a second, and
// every page that crosses the eager-render band on the way mounts two canvases
// (PDF plus ink, ~38MB together at fit-width on a Galaxy Tab A7) that nobody
// ever sees. Measured on that tablet over a 12-page PDF: six pages mounted at
// once, 41M canvas pixels, 1.7s of long tasks — on a device that is already
// shedding other apps to lmkd. A page has no reason to render for a view that
// is gone 50ms later, so DocumentPage waits out a sweep.
//
// ponytail: one capturing listener, speed measured per scroller between two
// consecutive scroll events. 6000px/s is ~8 viewports a second: past any
// reading scroll and a hard fling, well below a scrollbar drag (~19000px/s).
// Raise it if pages ever arrive blank during a fling.
const FAST_PX_PER_S = 6000;
const HOLD_MS = 150;

let fastUntil = 0;
const last = new WeakMap();

if (typeof document !== "undefined") {
  document.addEventListener(
    "scroll",
    (event) => {
      const el = event.target;
      if (typeof el?.scrollTop !== "number") return; // the document itself
      const now = performance.now();
      const prev = last.get(el);
      last.set(el, { y: el.scrollTop, now });
      if (!prev || now - prev.now < 4) return;
      const speed = (Math.abs(el.scrollTop - prev.y) / (now - prev.now)) * 1000;
      if (speed > FAST_PX_PER_S) fastUntil = now + HOLD_MS;
    },
    { capture: true, passive: true },
  );
}

export const isScrollingFast = () => performance.now() < fastUntil;
