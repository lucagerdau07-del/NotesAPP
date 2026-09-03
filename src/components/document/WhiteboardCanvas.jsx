// src/components/document/WhiteboardCanvas.jsx
import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { renderInkStroke } from "../../ink/renderInk.js";

function cameraTransform(camera) {
  return {
    offsetX: -camera.x * camera.scale,
    offsetY: -camera.y * camera.scale,
    scaleX: camera.scale,
    scaleY: camera.scale,
  };
}

const WhiteboardCanvas = forwardRef(function WhiteboardCanvas({
  pageId,
  strokes = [],
  draftStroke,
  camera,
  width,
  height,
  dpr = 1,
}, forwardedRef) {
  const canvasRef = useRef(null);
  const previousDraftRef = useRef(null);

  useImperativeHandle(forwardedRef, () => ({
    appendDraftSegment(draft, appendedFrom) {
      if (!draft || draft.pageId !== pageId) return;
      const points = draft.points.slice(Math.max(0, appendedFrom - 1));
      if (points.length < 2) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderInkStroke(ctx, { ...draft, points }, cameraTransform(camera));
    },
    setViewportPreview(translateX, translateY, scale) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.style.transformOrigin = "0 0";
      canvas.style.willChange = "transform";
      canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    },
    clearViewportPreview() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.style.transform = "";
      canvas.style.transformOrigin = "";
      canvas.style.willChange = "";
    },
  }), [camera, dpr, pageId]);

  // A camera commit or completed stroke redraws the stable scene once. Pointer
  // moves bypass React through appendDraftSegment above.
  useLayoutEffect(() => {
    const draftJustStarted = draftStroke && previousDraftRef.current !== draftStroke;
    previousDraftRef.current = draftStroke;
    if (draftJustStarted && draftStroke.points?.length < 2) return;

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

    const transform = cameraTransform(camera);

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
});

export default WhiteboardCanvas;
