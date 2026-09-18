import React, { useEffect, useRef } from "react";
import { renderInkStroke } from "../../ink/renderInk.js";
import { backingScale } from "./pageCanvasSlice.js";

function InkPageCanvas({
  page,
  strokes = [],
  zoom = 1,
  dpr = 1,
  canvasWindow = null,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Zoomed in this is the slice of the page that is on screen, not the whole
    // page (see pageCanvasSlice) — an ink canvas costs the same zoom² pixels
    // the PDF one does, and a page carries both.
    const region = canvasWindow ?? {
      left: 0,
      top: 0,
      width: page.width * zoom,
      height: page.height * zoom,
    };
    const scaleToBacking = backingScale(region, dpr);
    const backingWidth = Math.round(region.width * scaleToBacking);
    const backingHeight = Math.round(region.height * scaleToBacking);

    // Assigning width/height reallocates and clears the canvas, so only do it
    // when the size actually changed.
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    canvas.style.left = `${Math.round(region.left)}px`;
    canvas.style.top = `${Math.round(region.top)}px`;
    canvas.style.width = `${Math.round(region.width)}px`;
    canvas.style.height = `${Math.round(region.height)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Strokes are stored in unzoomed page coordinates; the window only moves
    // the origin.
    const pixelsPerPageUnit = zoom * scaleToBacking;
    const transform = {
      offsetX: -region.left * scaleToBacking,
      offsetY: -region.top * scaleToBacking,
      scaleX: pixelsPerPageUnit,
      scaleY: pixelsPerPageUnit,
    };
    for (const stroke of strokes) {
      if (stroke.pageId === page.id) renderInkStroke(ctx, stroke, transform);
    }
  }, [page.id, page.width, page.height, strokes, zoom, dpr, canvasWindow]);

  return (
    <canvas
      ref={canvasRef}
      className="document-ink-canvas"
      data-ink-page-id={page.id}
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

export default React.memo(InkPageCanvas);
