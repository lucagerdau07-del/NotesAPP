import React, { useEffect, useRef } from "react";
import { MAX_PAGE_CANVAS_PIXELS } from "../../documents/fileImport.js";

export default function PdfPageCanvas({
  page,
  sourceHandle,
  zoom = 1,
  dpr = 1,
}) {
  const canvasRef = useRef(null);

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
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.style.width = `${Math.round(logicalWidth)}px`;
        canvas.style.height = `${Math.round(logicalHeight)}px`;

        const ctx = canvas.getContext("2d");
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
