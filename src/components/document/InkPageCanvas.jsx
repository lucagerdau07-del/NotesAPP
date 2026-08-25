import React, { useEffect, useRef } from "react";

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
    canvas.width = Math.round(logicalWidth * dpr);
    canvas.height = Math.round(logicalHeight * dpr);
    canvas.style.width = `${Math.round(logicalWidth)}px`;
    canvas.style.height = `${Math.round(logicalHeight)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageStrokes = strokes.filter((s) => s.pageId === page.id);
    if (pageStrokes.length === 0) return;

    ctx.save();
    ctx.scale(zoom * dpr, zoom * dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of pageStrokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.save();
      ctx.strokeStyle = stroke.color || "#000000";
      ctx.lineWidth = stroke.width || 3;
      ctx.globalAlpha = stroke.opacity ?? 1;
      if (stroke.tool === "highlighter") {
        ctx.globalCompositeOperation = "multiply";
      }

      ctx.beginPath();
      const first = stroke.points[0];
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [page.id, page.width, page.height, strokes, zoom, dpr]);

  return (
    <canvas
      ref={canvasRef}
      className="document-ink-canvas"
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
