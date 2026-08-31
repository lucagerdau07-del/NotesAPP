// Everything a page can hold besides ink shares one shape: a box in page
// coordinates plus a few type-specific fields. Arrows and lines read the box
// diagonal as their vector, every other type fills the box. One model means one
// set of move/resize/delete interactions for all of them.
export const PAGE_OBJECT_TYPES = [
  "arrow",
  "line",
  "rect",
  "ellipse",
  "text",
  "image",
  "link",
  // A bucket-tool fill: a cropped, solid-color PNG shaped by flood-filling
  // whatever ink/shape outlines enclosed the click. Rendered behind the ink
  // canvas so hand-drawn strokes stay on top of the wash.
  "fill",
];

const finite = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;
const text = (value, fallback = "") =>
  typeof value === "string" ? value : fallback;

let objectCounter = 0;

function createObjectId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  objectCounter += 1;
  return `object-${Date.now()}-${objectCounter}`;
}

export function createPageObject(input = {}) {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? input
      : {};
  const type = PAGE_OBJECT_TYPES.includes(source.type) ? source.type : "rect";
  return {
    id: text(source.id) || createObjectId(),
    pageId: String(source.pageId ?? ""),
    type,
    x: finite(source.x, 0),
    y: finite(source.y, 0),
    // Negative extents are legal: an arrow drawn right-to-left needs them.
    width: finite(source.width, 160),
    height: finite(source.height, 90),
    color: text(source.color, "#3E7BD8"),
    strokeWidth: Math.max(1, finite(source.strokeWidth, 3)),
    text: text(source.text),
    href: text(source.href),
    src: text(source.src),
    fontSize: Math.max(6, finite(source.fontSize, 16)),
    // Text typography. fontFamily is a FONT_STACKS id, not a CSS stack, so a
    // stored document never pins down the actual fonts a device has.
    fontFamily: text(source.fontFamily, "sans"),
    textAlign: ["left", "center", "right"].includes(source.textAlign)
      ? source.textAlign
      : "left",
    bold: source.bold === true,
    italic: source.italic === true,
    // Locks the box onto the paper's ruling: see snapTextToGrid.
    snapToLines: source.snapToLines === true,
    lineStep: Math.max(1, Math.round(finite(source.lineStep, 1))),
    // Set by the bucket tool on a rect/ellipse it clicked inside: stroke and
    // fill are the same object then, so moving/resizing/deleting it carries
    // both — no separate fill layer to drift out of sync.
    fillColor: text(source.fillColor),
  };
}

export function isPageObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.pageId === "string" &&
    value.pageId.length > 0 &&
    PAGE_OBJECT_TYPES.includes(value.type) &&
    [value.x, value.y, value.width, value.height].every(Number.isFinite)
  );
}

// Page objects live in a stroke document that predates them, so every reader
// goes through here instead of touching document.objects directly.
export function pageObjectsOf(document) {
  return Array.isArray(document?.objects) ? document.objects : [];
}

// Normalized box for hit-testing and for the selection frame: arrows keep their
// signed extents, the frame around them does not.
export function objectBounds(object) {
  return {
    x: Math.min(object.x, object.x + object.width),
    y: Math.min(object.y, object.y + object.height),
    width: Math.abs(object.width),
    height: Math.abs(object.height),
  };
}

// A tiny bit bigger than the drawn line, not the whole bounding box — an
// empty rect or ellipse only grabs the pointer near its outline, so the
// see-through middle still reaches ink/canvas clicks underneath. Filled
// shapes and every other type (text, image, link) hit-test their full box.
const HIT_PAD = 6;

export function hitTestObject(object, x, y) {
  const bounds = objectBounds(object);
  const tolerance = HIT_PAD + object.strokeWidth / 2;

  if (object.type === "line" || object.type === "arrow") {
    const x1 = object.x;
    const y1 = object.y;
    const x2 = object.x + object.width;
    const y2 = object.y + object.height;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSq));
    const distance = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
    return distance <= tolerance;
  }

  if (object.type === "rect") {
    if (object.fillColor)
      return (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      );
    const outer =
      x >= bounds.x - tolerance &&
      x <= bounds.x + bounds.width + tolerance &&
      y >= bounds.y - tolerance &&
      y <= bounds.y + bounds.height + tolerance;
    const inner =
      x >= bounds.x + tolerance &&
      x <= bounds.x + bounds.width - tolerance &&
      y >= bounds.y + tolerance &&
      y <= bounds.y + bounds.height - tolerance;
    return outer && !inner;
  }

  if (object.type === "ellipse") {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    if (rx <= 0 || ry <= 0) return false;
    if (object.fillColor) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      return nx * nx + ny * ny <= 1;
    }
    const outerNx = (x - cx) / (rx + tolerance);
    const outerNy = (y - cy) / (ry + tolerance);
    const innerRx = Math.max(0.001, rx - tolerance);
    const innerRy = Math.max(0.001, ry - tolerance);
    const innerNx = (x - cx) / innerRx;
    const innerNy = (y - cy) / innerRy;
    const withinOuter = outerNx * outerNx + outerNy * outerNy <= 1;
    const withinInner = innerNx * innerNx + innerNy * innerNy <= 1;
    return withinOuter && !withinInner;
  }

  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

// The bucket tool's "is this click inside a drawn rect/ellipse" check — the
// full interior, not just the near-outline band hitTestObject uses for an
// unfilled shape's move/select hitbox.
export function isPointInsideObject(object, x, y) {
  const bounds = objectBounds(object);
  if (object.type === "rect") {
    return (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    );
  }
  if (object.type === "ellipse") {
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;
    if (rx <= 0 || ry <= 0) return false;
    const nx = (x - (bounds.x + rx)) / rx;
    const ny = (y - (bounds.y + ry)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return false;
}
