import React, { useEffect, useRef } from "react";
import { MAX_PAGE_CANVAS_PIXELS } from "../../documents/fileImport.js";

export default function ImagePageCanvas({
  page,
  sourceHandle,
  zoom = 1,
  dpr = 1,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!sourceHandle?.image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const logicalWidth = page.width * zoom;
    const logicalHeight = page.height * zoom;
    let backingWidth = Math.round(logicalWidth * dpr);
    let backingHeight = Math.round(logicalHeight * dpr);

    if (backingWidth * backingHeight > MAX_PAGE_CANVAS_PIXELS) {
      const scale = Math.sqrt(
        MAX_PAGE_CANVAS_PIXELS / (page.width * page.height),
      );
      backingWidth = Math.round(page.width * scale);
      backingHeight = Math.round(page.height * scale);
    }

    canvas.width = backingWidth;
    canvas.height = backingHeight;
    canvas.style.width = `${Math.round(logicalWidth)}px`;
    canvas.style.height = `${Math.round(logicalHeight)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceHandle.image, 0, 0, canvas.width, canvas.height);
  }, [page.width, page.height, sourceHandle, zoom, dpr]);

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
