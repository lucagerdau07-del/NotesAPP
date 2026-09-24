import React, { useEffect, useRef, useState } from "react";
import PdfPageCanvas from "./PdfPageCanvas.jsx";
import ImagePageCanvas from "./ImagePageCanvas.jsx";
import InkPageCanvas from "./InkPageCanvas.jsx";
import PdfLinkLayer from "./PdfLinkLayer.jsx";
import { useBrowserLink } from "../../browser/BrowserLinkContext.jsx";
import { isScrollingFast } from "./scrollSpeed.js";
import {
  PAGE_CANVAS_PIXEL_BUDGET,
  pageCanvasWindow,
  visiblePageRect,
  windowCovers,
} from "./pageCanvasSlice.js";

function DocumentPage({
  page,
  sourceType,
  sourceHandle,
  strokes = [],
  zoom = 1,
  dpr = 1,
  repaintKey,
  children,
}) {
  const openLink = useBrowserLink();
  const logicalWidth = page.width * zoom;
  const logicalHeight = page.height * zoom;
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  // The slice of this page its canvases are allocated for. null = the whole
  // page, which is what fits the budget at ordinary zoom (see pageCanvasSlice).
  const [canvasWindow, setCanvasWindow] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // A pinch/zoom preview animates a CSS transform on the shared ancestor of
    // every page (see DocumentView's live-pinch preview), which moves each
    // page's rendered box and flickers it in and out of the margin below many
    // times a second. Unmounting PdfPageCanvas on every flicker is what
    // blinks the PDF and retriggers a full LiquidGlass recapture per flicker
    // (measured: 44s of blocked main thread and 83 mount/resize events in one
    // 40s two-finger gesture on a Galaxy Tab A7). Only commit to hiding once
    // it has actually stayed out of view for a moment; re-entering cancels it.
    let hideTimer = 0;
    let showTimer = 0;
    // While that preview is up, "out of view" describes the previewed box, not
    // the layout — the page has not actually moved anywhere yet. Dropping the
    // canvas on it costs a full pdf.js re-render on the way back, so wait the
    // gesture out. Bounded, and a retry rather than a cancel: every page that
    // stays mounted holds a full-size canvas, and this renderer is 32-bit, so
    // a flag that never clears must not be able to pin them all on screen.
    const hide = (attemptsLeft) => {
      if (attemptsLeft > 0 && el.closest("[data-pinch-preview]")) {
        hideTimer = setTimeout(() => hide(attemptsLeft - 1), 400);
        return;
      }
      setIsVisible(false);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          clearTimeout(hideTimer);
          clearTimeout(showTimer);
          // A scrollbar sweep passes every page in under a second; mounting
          // them for a view that is gone before they paint is what fills the
          // renderer with canvases (see scrollSpeed). Wait it out.
          const show = () => {
            if (isScrollingFast()) {
              showTimer = setTimeout(show, 100);
              return;
            }
            setIsVisible(true);
            setHasRendered(true);
          };
          show();
        } else {
          clearTimeout(hideTimer);
          clearTimeout(showTimer);
          hideTimer = setTimeout(() => hide(10), 400);
        }
      },
      // Render eagerly a page ahead — but a page's canvas costs zoom² pixels
      // while this band stays a fixed share of the viewport, so the same
      // "one page ahead" that costs 4MB at 1x costs 61MB at 3x, twice over
      // (background plus ink). Measured on the tablet: 246MB of canvas at 3x,
      // renderer RSS 730MB, and CrRendererMain aborting on its allocation
      // ceiling every ~20 minutes. Shrinking the band by the same zoom² keeps
      // the eager budget flat instead of letting it follow the zoom.
      { rootMargin: `${Math.round(150 / Math.max(1, zoom * zoom))}% 0px ${Math.round(150 / Math.max(1, zoom * zoom))}% 0px` }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(hideTimer);
      clearTimeout(showTimer);
    };
  }, [zoom]);

  // Zoomed in, a page's canvases are allocated for the slice of it that is on
  // screen rather than for the whole page, so their cost stops growing with
  // zoom². Below that the window stays null and this does nothing at all: no
  // listener, no measuring, no change to the 1x path.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (logicalWidth * dpr * logicalHeight * dpr <= PAGE_CANVAS_PIXEL_BUDGET) {
      setCanvasWindow(null);
      return;
    }

    let current = null;
    let frame = 0;
    let retry = 0;
    const measure = (attemptsLeft = 20) => {
      frame = 0;
      // Mid-pinch the box describes the previewed transform, not the layout,
      // and re-windowing on it would re-render the page on every frame of the
      // gesture for a size it is about to leave. Bounded retry rather than a
      // cancel: the zoom that armed this effect still needs its window.
      if (el.closest("[data-pinch-preview]")) {
        if (attemptsLeft > 0)
          retry = setTimeout(() => measure(attemptsLeft - 1), 200);
        return;
      }
      const viewport = {
        width: globalThis.innerWidth || 0,
        height: globalThis.innerHeight || 0,
      };
      const box = el.getBoundingClientRect();
      const visible = visiblePageRect(box, viewport, logicalWidth, logicalHeight);
      if (windowCovers(current, visible)) return;
      current = pageCanvasWindow({
        pageBox: box,
        viewport,
        pageWidth: logicalWidth,
        pageHeight: logicalHeight,
        dpr,
      });
      setCanvasWindow(current);
    };

    // Scroll events do not bubble, but they do reach a capturing listener on
    // the document, which saves having to find this page's scroll container.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => measure());
    };
    measure();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    globalThis.addEventListener?.("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      globalThis.removeEventListener?.("resize", onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(retry);
    };
  }, [logicalWidth, logicalHeight, dpr]);

  return (
    <div
      ref={containerRef}
      className="document-page"
      data-testid={`document-page-${page.id}`}
      data-page-id={page.id}
      data-page-index={page.index}
      style={{
        position: "absolute",
        width: `${Math.round(logicalWidth)}px`,
        height: `${Math.round(logicalHeight)}px`,
        margin: "0 auto",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 5px 24px rgba(0, 0, 0, 0.45)",
        borderRadius: "2px",
        overflow: "hidden",
      }}
    >
      {hasRendered && isVisible && (
        <>
          {sourceType === "pdf" && sourceHandle && (
            <PdfPageCanvas
              page={page}
              sourceHandle={sourceHandle}
              zoom={zoom}
              dpr={dpr}
              canvasWindow={canvasWindow}
            />
          )}
          {sourceType === "image" && sourceHandle && (
            <ImagePageCanvas
              page={page}
              sourceHandle={sourceHandle}
              zoom={zoom}
              dpr={dpr}
              canvasWindow={canvasWindow}
            />
          )}
          {sourceType === "pdf" && sourceHandle && (
            <PdfLinkLayer page={page} sourceHandle={sourceHandle} zoom={zoom} onOpenLink={openLink} />
          )}
          <InkPageCanvas
            page={page}
            strokes={strokes}
            zoom={zoom}
            dpr={dpr}
            canvasWindow={canvasWindow}
            repaintKey={repaintKey}
          />
        </>
      )}
      {children}
    </div>
  );
}

// documentMetrics/strokesByPage in DocumentView are memoized so an unrelated
// re-render (opening the assistant rail, switching tools) hands this the
// same page/strokes references and this skips reconciling entirely, instead
// of re-running for every mounted page.
export default React.memo(DocumentPage);
