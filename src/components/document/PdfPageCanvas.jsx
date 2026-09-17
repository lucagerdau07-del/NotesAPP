import React, { useEffect, useRef } from "react";
import { MAX_PAGE_CANVAS_PIXELS } from "../../documents/fileImport.js";

// Below this a second bitmap is 32MB or less, which the renderer carries fine
// and which covers zoom levels up to roughly 2x on this screen.
const MAX_DOUBLE_BUFFER_PIXELS = 8_000_000;

export default function PdfPageCanvas({
  page,
  sourceHandle,
  zoom = 1,
  dpr = 1,
}) {
  const canvasRef = useRef(null);
  const hasPaintedRef = useRef(false);

  useEffect(() => {
    let renderTask = null;
    let cancelled = false;

    async function renderPage() {
      if (!sourceHandle?.document?.getPage || !canvasRef.current) return;
      try {
        const pdfPage = await sourceHandle.document.getPage(page.index + 1);
        if (cancelled || !canvasRef.current) {
          pdfPage?.cleanup?.();
          return;
        }

        const logicalWidth = page.width * zoom;
        const logicalHeight = page.height * zoom;
        const nativeViewport = pdfPage.getViewport({ scale: 1 });
        const scaleToCanonical = (page.width * zoom) / nativeViewport.width;
        let scale = scaleToCanonical * dpr;

        if (nativeViewport.width * scale * nativeViewport.height * scale > MAX_PAGE_CANVAS_PIXELS) {
          scale = Math.sqrt(
            MAX_PAGE_CANVAS_PIXELS / (nativeViewport.width * nativeViewport.height),
          );
        }

        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const width = Math.round(viewport.width);
        const height = Math.round(viewport.height);

        // The box follows the new zoom immediately; until the render below
        // lands the browser just scales the bitmap already in there.
        canvas.style.width = `${Math.round(logicalWidth)}px`;
        canvas.style.height = `${Math.round(logicalHeight)}px`;

        // Assigning width/height clears a canvas, and pdf.js needs 100-400ms
        // to fill it again at these sizes (measured on a Galaxy Tab A7, with
        // pages clamped to 16M pixels). Doing that to the live canvas leaves
        // the page's white background showing for the whole gap — that is the
        // flash on every pinch. Render the new zoom level off screen and swap
        // it in with one drawImage instead. First paint has nothing on screen
        // to protect, so it skips the second allocation.
        // ...but the copy is a second full-size bitmap, and at high zoom these
        // reach the 16M pixel clamp, i.e. 61MB each. Holding two of those while
        // pdf.js renders is what pushes CrRendererMain over its allocation
        // ceiling (measured: renderer RSS 730MB at 3x, SIGTRAP abort). Past
        // this budget take the flash over the crash.
        const affordsCopy = width * height <= MAX_DOUBLE_BUFFER_PIXELS;
        const offscreen = hasPaintedRef.current && affordsCopy
          ? document.createElement("canvas")
          : canvas;
        offscreen.width = width;
        offscreen.height = height;

        const ctx = offscreen.getContext("2d");
        if (!ctx) {
          pdfPage.cleanup?.();
          return;
        }

        renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport,
        });

        await renderTask.promise;
        pdfPage.cleanup?.();
        if (cancelled || !canvasRef.current) return;
        if (offscreen !== canvas) {
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
          // Hand the copy's memory back before the next page allocates its
          // own: these are ~64MB each and the renderer here is 32-bit.
          offscreen.width = 0;
          offscreen.height = 0;
        }
        hasPaintedRef.current = true;
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          // Ignore cancelled renders
        }
      }
    }

    renderPage();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {}
      }
    };
  }, [page.index, page.width, page.height, sourceHandle, zoom, dpr]);

  return (
    <canvas
      ref={canvasRef}
      className="document-background-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}
