import React, { useEffect, useRef } from "react";
import { renderInkStroke } from "../../ink/renderInk.js";

export default function InkPageCanvas({
  page,
  strokes = [],
  zoom = 1,
  dpr = 1,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const logicalWidth = page.width * zoom;
    const logicalHeight = page.height * zoom;
    const MAX_PAGE_CANVAS_PIXELS = 16_000_000;
    let backingWidth = Math.round(logicalWidth * dpr);
    let backingHeight = Math.round(logicalHeight * dpr);

    if (backingWidth * backingHeight > MAX_PAGE_CANVAS_PIXELS) {
      const scaleFactor = Math.sqrt(MAX_PAGE_CANVAS_PIXELS / (backingWidth * backingHeight));
      backingWidth = Math.floor(backingWidth * scaleFactor);
      backingHeight = Math.floor(backingHeight * scaleFactor);
    }

    // Assigning width/height reallocates and clears the canvas, so only do it
    // when the size actually changed.
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    canvas.style.width = `${Math.round(logicalWidth)}px`;
    canvas.style.height = `${Math.round(logicalHeight)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const transform = {
      offsetX: 0,
      offsetY: 0,
      scaleX: backingWidth / page.width,
      scaleY: backingHeight / page.height,
    };
    for (const stroke of strokes) {
      if (stroke.pageId === page.id) renderInkStroke(ctx, stroke, transform);
    }
  }, [page.id, page.width, page.height, strokes, zoom, dpr]);

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
