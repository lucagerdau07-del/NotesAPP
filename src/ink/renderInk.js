function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function strokeTransform(transform = {}) {
  const scale = finiteOr(transform.scale, 1);
  return {
    offsetX: finiteOr(transform.offsetX, 0),
    offsetY: finiteOr(transform.offsetY, 0),
    scaleX: finiteOr(transform.scaleX, scale),
    scaleY: finiteOr(transform.scaleY, scale),
  };
}

export const MAX_CANVAS_DIMENSION = 4096;
export const MAX_CANVAS_PIXELS = 16_000_000;

export function resizeInkCanvas(canvas, cssWidth, cssHeight, dpr = 1) {
  const pixelRatio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  let width = Math.round(Math.max(0, finiteOr(cssWidth, 0)) * pixelRatio);
  let height = Math.round(Math.max(0, finiteOr(cssHeight, 0)) * pixelRatio);

  const maxDim = Math.max(width, height);
  if (maxDim > MAX_CANVAS_DIMENSION) {
    const scale = MAX_CANVAS_DIMENSION / maxDim;
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }
  if (width * height > MAX_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export function renderInkStroke(context, stroke, transform) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2)
    return;

  const { offsetX, offsetY, scaleX, scaleY } = strokeTransform(transform);
  context.save();
  context.globalCompositeOperation =
    stroke.tool === "pixel-eraser"
      ? "destination-out"
      : stroke.tool === "highlighter"
        ? "multiply"
        : "source-over";
  context.globalAlpha = stroke.opacity;
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width * scaleX;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(
    offsetX + stroke.points[0].x * scaleX,
    offsetY + stroke.points[0].y * scaleY,
  );
  for (let i = 1; i < stroke.points.length; i += 1) {
    const point = stroke.points[i];
    context.lineTo(offsetX + point.x * scaleX, offsetY + point.y * scaleY);
  }
  context.stroke();
  context.restore();
}

export function renderInkDocument(context, document, layout) {
  const scale = finiteOr(layout?.scale, finiteOr(layout?.zoom, 1));
  const scaleX = finiteOr(layout?.scaleX, scale);
  const scaleY = finiteOr(layout?.scaleY, scale);
  const pageIds = Array.isArray(layout?.pageIds)
    ? layout.pageIds
    : Array.isArray(document?.pages)
      ? document.pages.map((page) => page.id)
      : [];
  const pageHeight = finiteOr(layout?.pageHeight, 0);
  const pageGap = layout?.showPageBreaks ? finiteOr(layout?.pageGap, 0) : 0;
  const cssWidth = finiteOr(layout?.cssWidth, finiteOr(layout?.width, 0));
  const cssHeight = finiteOr(layout?.cssHeight, finiteOr(layout?.height, 0));
  const dpr = layout?.dpr > 0 && Number.isFinite(layout.dpr) ? layout.dpr : 1;
  const canvas = context.canvas;
  const transformScaleX =
    canvas && cssWidth > 0 && Number.isFinite(canvas.width)
      ? canvas.width / cssWidth
      : dpr;
  const transformScaleY =
    canvas && cssHeight > 0 && Number.isFinite(canvas.height)
      ? canvas.height / cssHeight
      : dpr;

  context.save();
  context.setTransform(transformScaleX, 0, 0, transformScaleY, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const pageLayouts = Array.isArray(layout?.pageLayouts)
    ? layout.pageLayouts
    : null;
  (document?.strokes || []).forEach((stroke) => {
    let offsetY = 0;
    if (pageLayouts) {
      const page = pageLayouts.find((p) => p.id === stroke.pageId);
      if (!page) return;
      offsetY = page.top * scaleY;
    } else {
      const pageIndex = pageIds.indexOf(stroke.pageId);
      if (pageIndex < 0) return;
      offsetY = pageIndex * (pageHeight * scaleY + pageGap);
    }
    renderInkStroke(context, stroke, {
      offsetX: 0,
      offsetY,
      scaleX,
      scaleY,
    });
  });

  context.restore();
}
