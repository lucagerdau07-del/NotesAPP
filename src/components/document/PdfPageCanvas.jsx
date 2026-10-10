import React, { useEffect, useRef } from "react";
import { backingScale } from "./pageCanvasSlice.js";

// A whole-page copy at a fixed cost, sized once and never by the zoom. The
// sharp canvas above it only covers the slice of the page that is on screen, so
// without this, scrolling past that slice would show bare white page until the
// next render lands. Blurry for a moment beats blank. 4MB, and only allocated
// once the page is actually being windowed.
const BASE_CANVAS_PIXELS = 1_000_000;

export default function PdfPageCanvas({
  page,
  sourceHandle,
  zoom = 1,
  dpr = 1,
  canvasWindow = null,
}) {
  const canvasRef = useRef(null);
  const baseRef = useRef(null);
  // The window and zoom the bitmap currently on screen was painted for.
  const paintedRef = useRef(null);
  const windowed = canvasWindow != null;
  // Zooming back out drops the window, but the canvas above still holds the
  // slice it last painted until the full-page render lands — so the base has to
  // outlive the window that needed it, or zooming out flashes white.
  const everWindowedRef = useRef(false);
  if (windowed) everWindowedRef.current = true;

  useEffect(() => {
    if (!windowed) return;
    let cancelled = false;
    let renderTask = null;

    async function renderBase() {
      const canvas = baseRef.current;
      if (!sourceHandle?.document?.getPage || !canvas) return;
      try {
        const pdfPage = await sourceHandle.document.getPage((page.sourceIndex ?? page.index) + 1);
        if (cancelled || !baseRef.current) {
          pdfPage?.cleanup?.();
          return;
        }
        const nativeViewport = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({
          scale: Math.sqrt(
            BASE_CANVAS_PIXELS / (nativeViewport.width * nativeViewport.height),
          ),
        });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          pdfPage.cleanup?.();
          return;
        }
        renderTask = pdfPage.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        pdfPage.cleanup?.();
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          // Ignore cancelled renders
        }
      }
    }

    renderBase();
    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {}
    };
  }, [page.sourceIndex, page.index, sourceHandle, windowed]);

  useEffect(() => {
    let renderTask = null;
    let cancelled = false;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!sourceHandle?.document?.getPage || !canvas) return;

      // Zoomed in this is the slice of the page that is on screen, not the
      // whole page (see pageCanvasSlice); below that it is the whole page and
      // the offsets are zero.
      const region = canvasWindow ?? {
        left: 0,
        top: 0,
        width: page.width * zoom,
        height: page.height * zoom,
      };

      // The box follows the new zoom immediately; until the render below lands
      // the browser just scales the bitmap already in there. That bitmap covers
      // the window it was painted for, so the box tracks *that* window at the
      // new zoom rather than the one being rendered now — otherwise the old
      // pixels would be stretched into a box they do not fill.
      const painted = paintedRef.current;
      const ratio = painted ? zoom / painted.zoom : 1;
      const shown = painted
        ? {
            left: painted.region.left * ratio,
            top: painted.region.top * ratio,
            width: painted.region.width * ratio,
            height: painted.region.height * ratio,
          }
        : region;
      canvas.style.left = `${Math.round(shown.left)}px`;
      canvas.style.top = `${Math.round(shown.top)}px`;
      canvas.style.width = `${Math.round(shown.width)}px`;
      canvas.style.height = `${Math.round(shown.height)}px`;

      try {
        const pdfPage = await sourceHandle.document.getPage((page.sourceIndex ?? page.index) + 1);
        if (cancelled || !canvasRef.current) {
          pdfPage?.cleanup?.();
          return;
        }

        const scaleToBacking = backingScale(region, dpr);
        const nativeViewport = pdfPage.getViewport({ scale: 1 });
        // The native page width maps onto the canonical page width at this
        // zoom; the window only moves the origin, never the scale, so text
        // stays exactly as sharp as it was before the page was windowed.
        const scale = (page.width * zoom * scaleToBacking) / nativeViewport.width;
        const viewport = pdfPage.getViewport({
          scale,
          offsetX: -region.left * scaleToBacking,
          offsetY: -region.top * scaleToBacking,
        });
        const width = Math.round(region.width * scaleToBacking);
        const height = Math.round(region.height * scaleToBacking);

        // Assigning width/height clears a canvas, and pdf.js needs 100-400ms
        // to fill it again at these sizes (measured on a Galaxy Tab A7). Doing
        // that to the live canvas leaves whatever is behind it showing for the
        // whole gap — that is the flash on every pinch. Render the new zoom
        // level off screen and swap it in with one drawImage instead. First
        // paint has nothing on screen to protect, so it skips the second
        // allocation.
        const offscreen = painted ? document.createElement("canvas") : canvas;
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
          // own: this renderer is 32-bit.
          offscreen.width = 0;
          offscreen.height = 0;
        }
        canvas.style.left = `${Math.round(region.left)}px`;
        canvas.style.top = `${Math.round(region.top)}px`;
        canvas.style.width = `${Math.round(region.width)}px`;
        canvas.style.height = `${Math.round(region.height)}px`;
        paintedRef.current = { region, zoom };
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
  }, [page.sourceIndex, page.index, page.width, page.height, sourceHandle, zoom, dpr, canvasWindow]);

  return (
    <>
      {everWindowedRef.current && (
        <canvas
          ref={baseRef}
          className="document-background-canvas"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            display: "block",
          }}
        />
      )}
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
    </>
  );
}
