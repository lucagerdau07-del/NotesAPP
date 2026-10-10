import { renderInkStroke } from "./renderInk.js";

// A flood fill needs to know where the "walls" are. Ink strokes paint
// themselves; page-object shapes don't live on the canvas at all, so their
// outlines are redrawn here purely as fill barriers (never shown).
function drawObjectWall(context, object) {
  const { type, x, y, width, height, strokeWidth, color } = object;
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  const w = Math.abs(width);
  const h = Math.abs(height);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = object.fillColor || color;
  context.lineWidth = Math.max(1, strokeWidth);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (type === "rect") {
    // Matches the rx=6 rounding PageObjectLayer draws for the visible
    // stroke — a sharp-cornered wall here would flood past that curve.
    const rx = Math.min(6, w / 2, h / 2);
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(
        left + strokeWidth / 2,
        top + strokeWidth / 2,
        Math.max(0, w - strokeWidth),
        Math.max(0, h - strokeWidth),
        rx,
      );
    } else {
      context.rect(
        left + strokeWidth / 2,
        top + strokeWidth / 2,
        Math.max(0, w - strokeWidth),
        Math.max(0, h - strokeWidth),
      );
    }
    if (object.fillColor) context.fill();
    else context.stroke();
  } else if (type === "ellipse") {
    context.beginPath();
    context.ellipse(
      left + w / 2,
      top + h / 2,
      Math.max(0, w / 2 - strokeWidth / 2),
      Math.max(0, h / 2 - strokeWidth / 2),
      0,
      0,
      Math.PI * 2,
    );
    if (object.fillColor) context.fill();
    else context.stroke();
  } else if (type === "line" || type === "arrow") {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + width, y + height);
    context.stroke();
  }
  context.restore();
}

// Renders one page's ink strokes and shape outlines onto a scratch canvas at
// 1 canvas-pixel-per-page-unit, so flood-fill coordinates line up directly
// with page coordinates. Nothing here is ever shown on screen.
export function rasterizePageWalls(canvas, { strokes, objects, pageId, width, height }) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  (strokes || [])
    .filter((stroke) => stroke.pageId === pageId)
    .forEach((stroke) => {
      renderInkStroke(context, stroke, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
    });
  (objects || [])
    .filter(
      (object) =>
        object.pageId === pageId &&
        ["rect", "ellipse", "line", "arrow"].includes(object.type),
    )
    .forEach((object) => drawObjectWall(context, object));
  return context.getImageData(0, 0, width, height);
}

const WALL_ALPHA_THRESHOLD = 40;

// Stack-based 4-directional fill (no recursion — a page-sized region would
// blow the call stack). Returns null when the start point is already on a
// wall; otherwise the visited mask plus its bounding box.
export function floodFill(wallImageData, width, height, startX, startY) {
  const data = wallImageData.data;
  const isWall = (x, y) => data[(y * width + x) * 4 + 3] > WALL_ALPHA_THRESHOLD;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return null;
  if (isWall(startX, startY)) return null;

  const visited = new Uint8Array(width * height);
  const stack = [startX, startY];
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  visited[startY * width + startX] = 1;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx] || isWall(x, y)) return;
    visited[idx] = 1;
    stack.push(x, y);
  };

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  // The fill and its wall (a stroke, or a shape outline re-drawn just for
  // this check) are two separately anti-aliased, separately positioned
  // layers, so a mask cropped exactly to the flooded pixels leaves a
  // hairline gap of background peeking through along the edge. Growing the
  // mask a few pixels past the wall — invisible, since the stroke/outline
  // renders on top and covers it — closes that seam instead.
  const grown = growMask(visited, width, height, FILL_GROW_PX);

  return {
    visited: grown,
    minX: Math.max(0, minX - FILL_GROW_PX),
    maxX: Math.min(width - 1, maxX + FILL_GROW_PX),
    minY: Math.max(0, minY - FILL_GROW_PX),
    maxY: Math.min(height - 1, maxY + FILL_GROW_PX),
  };
}

const FILL_GROW_PX = 3;

function growMask(mask, width, height, radius) {
  let current = mask;
  for (let pass = 0; pass < radius; pass += 1) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        if (current[idx]) continue;
        if (
          (x > 0 && current[idx - 1]) ||
          (x < width - 1 && current[idx + 1]) ||
          (y > 0 && current[idx - width]) ||
          (y < height - 1 && current[idx + width])
        ) {
          next[idx] = 1;
        }
      }
    }
    current = next;
  }
  return current;
}

// Crops the fill mask to its bounding box and paints it solid — that crop
// becomes the new object's x/y/width/height, so it drops in already aligned.
export function fillResultToDataUrl(result, sourceWidth, colorRgb) {
  const { visited, minX, maxX, minY, maxY } = result;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(width, height);
  const out = imageData.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcIdx = (minY + y) * sourceWidth + (minX + x);
      if (!visited[srcIdx]) continue;
      const o = (y * width + x) * 4;
      out[o] = colorRgb[0];
      out[o + 1] = colorRgb[1];
      out[o + 2] = colorRgb[2];
      out[o + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), x: minX, y: minY, width, height };
}

export function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!match) return [62, 123, 216];
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}
