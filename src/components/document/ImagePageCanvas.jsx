import React, { useEffect, useRef } from "react";
import { backingScale } from "./pageCanvasSlice.js";

export default function ImagePageCanvas({
  page,
  sourceHandle,
  zoom = 1,
  dpr = 1,
  canvasWindow = null,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const image = sourceHandle?.image;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    // Zoomed in this is the slice of the page that is on screen, not the whole
    // page (see pageCanvasSlice). One drawImage either way, so there is no
    // low-resolution base layer here the way there is for PDF pages.
    const region = canvasWindow ?? {
      left: 0,
      top: 0,
      width: page.width * zoom,
      height: page.height * zoom,
    };
    const scaleToBacking = backingScale(region, dpr);
    const backingWidth = Math.round(region.width * scaleToBacking);
    const backingHeight = Math.round(region.height * scaleToBacking);

    canvas.width = backingWidth;
    canvas.height = backingHeight;
    canvas.style.left = `${Math.round(region.left)}px`;
    canvas.style.top = `${Math.round(region.top)}px`;
    canvas.style.width = `${Math.round(region.width)}px`;
    canvas.style.height = `${Math.round(region.height)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, backingWidth, backingHeight);

    const sourceWidth = image.naturalWidth || image.width || 0;
    const sourceHeight = image.naturalHeight || image.height || 0;
    if (!sourceWidth || !sourceHeight) return;
    const perX = sourceWidth / (page.width * zoom);
    const perY = sourceHeight / (page.height * zoom);
    ctx.drawImage(
      image,
      region.left * perX,
      region.top * perY,
      region.width * perX,
      region.height * perY,
      0,
      0,
      backingWidth,
      backingHeight,
    );
  }, [page.width, page.height, sourceHandle, zoom, dpr, canvasWindow]);

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
