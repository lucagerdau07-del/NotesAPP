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

// Pressure only thins a stroke, never thickens it: a panel that reports a flat
// 1 (finger) or 0.5 (mouse) keeps drawing exactly the width the tool asked for,
// while a pen that reports real pressure tapers. Both are calibration knobs —
// a pen that writes too thin wants a higher MIN or a lower PIVOT.
export const PRESSURE_MIN_SCALE = 0.4;
export const PRESSURE_PIVOT = 0.5;

function pressureScale(pressure) {
  if (!Number.isFinite(pressure) || pressure >= PRESSURE_PIVOT) return 1;
  if (pressure <= 0) return 1;
  return (
    PRESSURE_MIN_SCALE + ((1 - PRESSURE_MIN_SCALE) * pressure) / PRESSURE_PIVOT
  );
}

export function renderInkStroke(context, stroke, transform) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2)
    return;

  const { offsetX, offsetY, scaleX, scaleY } = strokeTransform(transform);
  const points = stroke.points;
  context.save();
  context.globalCompositeOperation =
    stroke.tool === "pixel-eraser"
      ? "destination-out"
      : stroke.tool === "highlighter"
        ? "multiply"
        : "source-over";
  context.globalAlpha = stroke.opacity;
  context.strokeStyle = stroke.color;
  context.lineCap = "round";
  context.lineJoin = "round";

  const base = stroke.width * scaleX;
  // A tapered eraser leaves the edges of what it wiped behind and a tapered
  // highlighter reads as a mistake, so pressure only shapes the drawing tools.
  const tapered =
    stroke.tool !== "pixel-eraser" &&
    stroke.tool !== "highlighter" &&
    points.some((point) => pressureScale(point.p) !== 1);
  // ponytail: widths are quantized so a smooth pressure ramp collapses into a
  // few paths instead of one stroke() call per sample — that call count is what
  // makes a full redraw crawl on a slow tablet. Per-sample outline filling only
  // if the steps ever become visible.
  const step = Math.max(0.2, base / 8);
  const widthAt = tapered
    ? (index) =>
        Math.max(step, Math.round((base * pressureScale(points[index].p)) / step) * step)
    : () => base;
  const px = (index) => offsetX + points[index].x * scaleX;
  const py = (index) => offsetY + points[index].y * scaleY;

  let width = widthAt(1);
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(px(0), py(0));
  let travelled = false;
  for (let i = 1; i < points.length; i += 1) {
    const next = widthAt(i);
    // A run ends where the width changes; the next one restarts on the shared
    // point so the round caps butt together instead of leaving a gap.
    if (next !== width) {
      context.stroke();
      context.beginPath();
      context.moveTo(px(i - 1), py(i - 1));
      context.lineWidth = next;
      width = next;
    }
    context.lineTo(px(i), py(i));
    travelled = travelled || points[i].x !== points[0].x || points[i].y !== points[0].y;
  }
  // A tap is a path of zero length, and Skia discards one of those outright —
  // measured in this device's WebView, moveTo(p);lineTo(p);stroke() with a round
  // cap leaves every pixel untouched, where the spec asks for a dot. So every
  // dot the app committed was invisible. A hundredth of a pixel is below the
  // rasteriser's grid: it gives the segment a length without moving the dot.
  if (!travelled) context.lineTo(px(points.length - 1) + 0.01, py(points.length - 1));
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
  // Index once instead of Array.find()/indexOf() per stroke - identical
  // results, but O(pages) instead of O(strokes * pages) for the whole draw.
  const pageLayoutsById = pageLayouts
    ? new Map(pageLayouts.map((page) => [page.id, page]))
    : null;
  const pageIndexById = pageLayouts
    ? null
    : new Map(pageIds.map((id, index) => [id, index]));
  (document?.strokes || []).forEach((stroke) => {
    let offsetY = 0;
    if (pageLayoutsById) {
      const page = pageLayoutsById.get(stroke.pageId);
      if (!page) return;
      offsetY = page.top * scaleY;
    } else {
      const pageIndex = pageIndexById.get(stroke.pageId);
      if (pageIndex === undefined) return;
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
