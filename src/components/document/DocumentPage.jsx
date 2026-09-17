import React, { useEffect, useRef, useState } from "react";
import PdfPageCanvas from "./PdfPageCanvas.jsx";
import ImagePageCanvas from "./ImagePageCanvas.jsx";
import InkPageCanvas from "./InkPageCanvas.jsx";
import PdfLinkLayer from "./PdfLinkLayer.jsx";
import { useBrowserLink } from "../../browser/BrowserLinkContext.jsx";

function DocumentPage({
  page,
  sourceType,
  sourceHandle,
  strokes = [],
  zoom = 1,
  dpr = 1,
  children,
}) {
  const openLink = useBrowserLink();
  const logicalWidth = page.width * zoom;
  const logicalHeight = page.height * zoom;
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);

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
          setIsVisible(true);
          setHasRendered(true);
        } else {
          clearTimeout(hideTimer);
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
    };
  }, [zoom]);

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
            />
          )}
          {sourceType === "image" && sourceHandle && (
            <ImagePageCanvas
              page={page}
              sourceHandle={sourceHandle}
              zoom={zoom}
              dpr={dpr}
            />
          )}
          {sourceType === "pdf" && sourceHandle && (
            <PdfLinkLayer page={page} sourceHandle={sourceHandle} zoom={zoom} onOpenLink={openLink} />
          )}
          <InkPageCanvas page={page} strokes={strokes} zoom={zoom} dpr={dpr} />
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
