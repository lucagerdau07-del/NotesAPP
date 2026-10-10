// Non-destructive image crop: the object keeps its whole source image and a
// `crop` window (fractions 0-1 of that source). Dragging an edge moves the
// window's side and the box with it, so the picture is cut, never squashed —
// and can be pulled back out until the source's own edge.
export const CROP_MIN = 20;

// Natural sizes of images already on screen, filled by the rendered <img>.
// An edge drag needs one to know where an uncropped, letterboxed image ends.
const naturalSizes = new Map();
export const rememberNaturalSize = (src, width, height) => naturalSizes.set(src, { width, height });
export const naturalSizeOf = (src) => naturalSizes.get(src) || null;

// Where the whole source image sits in the object's own box, box coordinates.
// Once cropped the source is bigger than the box and reaches past it.
export function sourceRect(object, natural) {
  const width = Math.abs(object.width);
  const height = Math.abs(object.height);
  const crop = object.crop;
  if (crop) {
    const w = width / crop.width;
    const h = height / crop.height;
    return { x: -crop.x * w, y: -crop.y * h, width: w, height: h };
  }
  if (!natural) return { x: 0, y: 0, width, height };
  const scale = Math.min(width / natural.width, height / natural.height);
  const w = natural.width * scale;
  const h = natural.height * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

// The part of the box that actually shows image (letterbox margins excluded).
export function visibleRect(object, src) {
  const left = Math.max(0, src.x);
  const top = Math.max(0, src.y);
  const right = Math.min(Math.abs(object.width), src.x + src.width);
  const bottom = Math.min(Math.abs(object.height), src.y + src.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// The object patch for showing `rect` (box coordinates) of the source `src`.
export function cropPatch(object, src, rect) {
  return {
    x: object.x + rect.x,
    y: object.y + rect.y,
    width: rect.width,
    height: rect.height,
    crop: {
      x: (rect.x - src.x) / src.width,
      y: (rect.y - src.y) / src.height,
      width: rect.width / src.width,
      height: rect.height / src.height,
    },
  };
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// One edge dragged by (dx, dy) box units, measured from the drag's start state.
export function dragCropEdge(object, natural, edge, dx, dy) {
  const src = sourceRect(object, natural);
  const vis = visibleRect(object, src);
  let left = vis.x;
  let top = vis.y;
  let right = vis.x + vis.width;
  let bottom = vis.y + vis.height;
  if (edge === "e") right = clamp(right + dx, left + CROP_MIN, src.x + src.width);
  if (edge === "w") left = clamp(left + dx, src.x, right - CROP_MIN);
  if (edge === "s") bottom = clamp(bottom + dy, top + CROP_MIN, src.y + src.height);
  if (edge === "n") top = clamp(top + dy, src.y, bottom - CROP_MIN);
  return cropPatch(object, src, { x: left, y: top, width: right - left, height: bottom - top });
}
