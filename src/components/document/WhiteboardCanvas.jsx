// src/components/document/WhiteboardCanvas.jsx
import React, { useEffect, useRef } from "react";
import { renderInkStroke } from "../../ink/renderInk.js";

// ponytail: redraws every stroke on every camera/stroke change (no viewport
// culling, no incremental per-segment paint like the page-stack canvas).
// Fine at normal note stroke counts; add bounding-box culling if a whiteboard
// document's stroke count makes full redraws visibly slow.
export default function WhiteboardCanvas({
  pageId,
  strokes = [],
  draftStroke,
  camera,
  width,
  height,
  dpr = 1,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const transform = {
      offsetX: -camera.x * camera.scale,
      offsetY: -camera.y * camera.scale,
      scaleX: camera.scale,
      scaleY: camera.scale,
    };

    for (const stroke of strokes) {
      if (stroke.pageId === pageId) renderInkStroke(ctx, stroke, transform);
    }
    if (draftStroke && draftStroke.pageId === pageId) {
      renderInkStroke(ctx, draftStroke, transform);
    }
  }, [pageId, strokes, draftStroke, camera, width, height, dpr]);

  return (
    <canvas
      ref={canvasRef}
      className="whiteboard-ink-canvas"
      data-testid="whiteboard-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        touchAction: "none",
      }}
    />
  );
}
