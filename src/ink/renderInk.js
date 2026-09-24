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

// Committed strokes are never mutated, and the live draft only ever grows by
// push (see useInkPointer), so a measured box holds while the count does.
const strokeBoundsCache = new WeakMap();

function strokeBounds(stroke) {
  const points = stroke.points || [];
  let box = strokeBoundsCache.get(stroke);
  if (box?.count === points.length) return box;
  box = { count: points.length, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) {
    if (point.x < box.minX) box.minX = point.x;
    if (point.x > box.maxX) box.maxX = point.x;
    if (point.y < box.minY) box.minY = point.y;
    if (point.y > box.maxY) box.maxY = point.y;
  }
  box.pad = finiteOr(stroke.width, 0) / 2;
  strokeBoundsCache.set(stroke, box);
  return box;
}

// The same scale and page offset renderInkDocument draws a stroke with.
function inkPlacement(document, layout) {
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
  const offsetYOf = (stroke) => {
    if (pageLayoutsById) {
      const page = pageLayoutsById.get(stroke.pageId);
      return page ? page.top * scaleY : undefined;
    }
    const pageIndex = pageIndexById.get(stroke.pageId);
    return pageIndex === undefined ? undefined : pageIndex * (pageHeight * scaleY + pageGap);
  };
  return { scaleX, scaleY, offsetYOf };
}

// A stroke's footprint on the canvas in CSS px, anti-aliased fringe included.
function cssBounds(stroke, offsetY, scaleX, scaleY) {
  const box = strokeBounds(stroke);
  const pad = box.pad * scaleX + 2;
  return {
    minX: box.minX * scaleX - pad,
    minY: offsetY + box.minY * scaleY - pad,
    maxX: box.maxX * scaleX + pad,
    maxY: offsetY + box.maxY * scaleY + pad,
  };
}

const union = (a, b) =>
  a
    ? {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
      }
    : b;

// The part of the canvas (CSS px) whose pixels differ between rendering
// `before` and `after`, both with the same layout: the strokes that came or
// went, plus `painted`, strokes drawn onto the canvas outside a render since
// (DocumentView's live draft segments), committed or not. Everything a changed
// stroke overlaps lies inside its box, so redrawing every stroke that touches
// the region, in order, gives the same pixels as a full redraw. null when
// nothing changed.
export function changedInkRegion(before, after, document, layout, painted = []) {
  const { scaleX, scaleY, offsetYOf } = inkPlacement(document, layout);
  let region = null;
  const add = (stroke) => {
    const offsetY = offsetYOf(stroke);
    if (offsetY !== undefined) region = union(region, cssBounds(stroke, offsetY, scaleX, scaleY));
  };
  if (before !== after) {
    const had = new Set(before);
    const has = new Set(after);
    for (const stroke of after) if (!had.has(stroke)) add(stroke);
    for (const stroke of before) if (!has.has(stroke)) add(stroke);
  }
  for (const stroke of painted) add(stroke);
  return region;
}

// `region` (CSS px, from changedInkRegion) limits the clear and the redraw to
// that part of the canvas; without it the whole canvas is redrawn.
export function renderInkDocument(context, document, layout, region = null) {
  const { scaleX, scaleY, offsetYOf } = inkPlacement(document, layout);
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
  if (region) {
    // Snapped out to whole device pixels: a clip edge through the middle of a
    // pixel is anti-aliased, and that half-cleared, half-redrawn pixel row
    // would show as a faint seam around every patch.
    const x = Math.max(0, Math.floor(region.minX * transformScaleX));
    const y = Math.max(0, Math.floor(region.minY * transformScaleY));
    const right = Math.min(canvas?.width ?? Infinity, Math.ceil(region.maxX * transformScaleX));
    const bottom = Math.min(canvas?.height ?? Infinity, Math.ceil(region.maxY * transformScaleY));
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.beginPath();
    context.rect(x, y, right - x, bottom - y);
    context.clip();
    context.clearRect(x, y, right - x, bottom - y);
  }
  context.setTransform(transformScaleX, 0, 0, transformScaleY, 0, 0);
  if (!region) context.clearRect(0, 0, cssWidth, cssHeight);

  (document?.strokes || []).forEach((stroke) => {
    const offsetY = offsetYOf(stroke);
    if (offsetY === undefined) return;
    if (region) {
      const box = cssBounds(stroke, offsetY, scaleX, scaleY);
      if (
        box.maxX < region.minX ||
        box.minX > region.maxX ||
        box.maxY < region.minY ||
        box.minY > region.maxY
      )
        return;
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
