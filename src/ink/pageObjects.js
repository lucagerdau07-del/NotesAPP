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
  // A real grid: one object with shared borders and a rows x cols text grid,
  // instead of separate rect+text objects glued together cell by cell.
  "table",
];

// Rebuilds a rows x cols grid of strings from whatever was stored, keeping
// existing cell text lined up by [row][col] when rows/cols shrink or grow
// (e.g. an added column) instead of discarding it.
function normalizeTableCells(source, rows, cols) {
  const grid = Array.isArray(source) ? source : [];
  const result = [];
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = Array.isArray(grid[row]) ? grid[row] : [];
    const outRow = [];
    for (let col = 0; col < cols; col += 1) {
      outRow.push(typeof sourceRow[col] === "string" ? sourceRow[col] : "");
    }
    result.push(outRow);
  }
  return result;
}

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
    // 0 = derive from fontSize at render time. Set to a rule multiple for text
    // that must advance line by line along the paper's ruling.
    lineHeight: Math.max(0, finite(source.lineHeight, 0)),
    // Text typography. fontFamily is a FONT_STACKS id, not a CSS stack, so a
    // stored document never pins down the actual fonts a device has.
    fontFamily: text(source.fontFamily, "sans"),
    textAlign: ["left", "center", "right"].includes(source.textAlign)
      ? source.textAlign
      : "left",
    bold: source.bold === true,
    italic: source.italic === true,
    underline: source.underline === true,
    // Locks the box onto the paper's ruling: see snapTextToGrid.
    snapToLines: source.snapToLines === true,
    // Text-only: true (default) means the box still hugs its content's width
    // as you type — the plain-click starting size. False means a drag has
    // pinned the width by hand, so typing wraps within it and only grows the
    // box downward instead of also stretching it wider.
    autoWidth: source.autoWidth !== false,
    lineStep: Math.max(1, Math.round(finite(source.lineStep, 1))),
    // Set by the bucket tool on a rect/ellipse it clicked inside: stroke and
    // fill are the same object then, so moving/resizing/deleting it carries
    // both — no separate fill layer to drift out of sync.
    fillColor: text(source.fillColor),
    // Shape styling (rect/ellipse/line/arrow only; every other type ignores these).
    strokeStyle: ["solid", "dashed", "dotted"].includes(source.strokeStyle)
      ? source.strokeStyle
      : "solid",
    opacity: Math.min(100, Math.max(0, finite(source.opacity, 100))),
    // rect only: sharp vs. rounded corners.
    rounded: source.rounded !== false,
    // line/arrow only: how the two endpoints are capped.
    startArrowhead: source.startArrowhead === "arrow" ? "arrow" : "none",
    endArrowhead:
      source.endArrowhead === "arrow" ||
      (source.endArrowhead === undefined && type === "arrow")
        ? "arrow"
        : "none",
    // line/arrow only: straight segment, quadratic curve, or 2-segment elbow.
    arrowType: ["straight", "curved", "elbow"].includes(source.arrowType)
      ? source.arrowType
      : "straight",
    // curved arrow/line only: how far the curve bows off the straight chord,
    // signed (flips side) — undefined means "use the automatic default".
    bow: typeof source.bow === "number" ? source.bow : undefined,
    // curved arrow/line only: where along the chord the peak sits, 0 (start)
    // to 1 (end) — undefined means "use the midpoint".
    curveBend: typeof source.curveBend === "number" ? source.curveBend : undefined,
    // elbow arrow/line only: where the vertical bend sits along the chord,
    // 0 (at start) to 1 (at end) — undefined means "use the midpoint".
    elbowBend: typeof source.elbowBend === "number" ? source.elbowBend : undefined,
    // Table-only fields: rows/cols pin the grid shape, cellText holds its
    // content by [row][col]. Every other type ignores these.
    rows: type === "table" ? Math.max(1, Math.round(finite(source.rows, 3))) : 0,
    cols: type === "table" ? Math.max(1, Math.round(finite(source.cols, 3))) : 0,
    cellText:
      type === "table"
        ? normalizeTableCells(
            source.cellText,
            Math.max(1, Math.round(finite(source.rows, 3))),
            Math.max(1, Math.round(finite(source.cols, 3))),
          )
        : [],
    headerRow: source.headerRow === true,
    rotation: ((finite(source.rotation, 0) % 360) + 360) % 360,
    locked: source.locked === true,
    hidden: source.hidden === true,
    // Set only by the AI agent's write_text/edit_text — never by the user's
    // own text tool — so markdown syntax in the text can be rendered instead
    // of shown literally for AI output only.
    aiGenerated: source.aiGenerated === true,
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

// The control point a "curved" line/arrow bows through, given its two
// endpoints in whatever coordinate space they're already in (absolute page
// coords for hit-testing, local SVG coords for rendering — the offset math
// is translation-invariant either way). Shared so the visible curve and its
// hit-test/rotation never drift apart.
export function curveControlPoint(x1, y1, x2, y2, bowOverride, tOverride) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bow = typeof bowOverride === "number" ? bowOverride : Math.min(40, len * 0.2);
  // Where along the chord the peak sits, 0 (start) to 1 (end) — defaults to
  // the midpoint, same as an elbow's default bend position.
  const t = typeof tOverride === "number" ? tOverride : 0.5;
  return {
    x: x1 + dx * t + (-dy / len) * bow,
    y: y1 + dy * t + (dx / len) * bow,
  };
}

function cubicBezierAt(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

// Samples the actual two-segment cubic-bezier curve roughjs's generator.curve
// draws through (start, control, end) — see rough.js's _curve(): with its
// default curveTightness (0), each of the two segments' control points is
// offset by 1/6 of the OTHER segment's chord, which can bulge the short
// segment well past a straight line to the control point when the peak sits
// far from the midpoint. A straight 3-point hit-test polyline missed that
// bulge entirely, so this mirrors rough.js's own math instead.
export function curvedArrowPoints(x1, y1, x2, y2, bowOverride, tOverride) {
  const p0 = { x: x1, y: y1 };
  const p2 = { x: x2, y: y2 };
  const pc = curveControlPoint(x1, y1, x2, y2, bowOverride, tOverride);
  const c1a = { x: p0.x + (pc.x - p0.x) / 6, y: p0.y + (pc.y - p0.y) / 6 };
  const c2a = { x: pc.x + (p0.x - p2.x) / 6, y: pc.y + (p0.y - p2.y) / 6 };
  const c1b = { x: pc.x + (p2.x - p0.x) / 6, y: pc.y + (p2.y - p0.y) / 6 };
  const c2b = { x: p2.x + (pc.x - p2.x) / 6, y: p2.y + (pc.y - p2.y) / 6 };
  const STEPS = 8;
  const points = [];
  for (let i = 0; i <= STEPS; i += 1) points.push(cubicBezierAt(p0, c1a, c2a, pc, i / STEPS));
  for (let i = 1; i <= STEPS; i += 1) points.push(cubicBezierAt(pc, c1b, c2b, p2, i / STEPS));
  return points;
}

// The bounding box used for LAYOUT: the wrapper's size/position, the
// selection frame, and the local-coordinate origin every handle and the SVG
// content itself are measured from. A straight/elbow line's box is just its
// endpoints (objectBounds), but a curved one can bow — and its peak can now
// shift off-center — well outside that straight-chord box, so this expands
// to actually contain the drawn curve. Without it the selection frame and
// handles line up with the chord instead of what's on screen.
export function objectLayoutBounds(object) {
  const bounds = objectBounds(object);
  if ((object.type !== "arrow" && object.type !== "line") || object.arrowType !== "curved") {
    return bounds;
  }
  const points = curvedArrowPoints(
    object.x,
    object.y,
    object.x + object.width,
    object.y + object.height,
    object.bow,
    object.curveBend,
  );
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// The x of an elbow connector's vertical bend, given its two endpoints' x
// and how far along the chord it sits (0 = at x1, 1 = at x2, 0.5 = default
// midpoint). Shared so the visible bend and its hit-test never drift apart.
export function elbowBendX(x1, x2, bendOverride) {
  const t = typeof bendOverride === "number" ? bendOverride : 0.5;
  return x1 + (x2 - x1) * t;
}

function distanceToSegment(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

// The polyline a line/arrow's arrowType actually draws, in absolute page
// coords — straight is just its two endpoints, but curved bows through a
// midpoint and elbow bends in two segments, so hit-testing (and rendering,
// via handDrawn.js which imports this) must follow the same path or clicks
// near the visible stroke would miss it.
export function arrowPathPoints(object) {
  const x1 = object.x;
  const y1 = object.y;
  const x2 = object.x + object.width;
  const y2 = object.y + object.height;
  if (object.arrowType === "elbow") {
    const midX = elbowBendX(x1, x2, object.elbowBend);
    return [
      { x: x1, y: y1 },
      { x: midX, y: y1 },
      { x: midX, y: y2 },
      { x: x2, y: y2 },
    ];
  }
  if (object.arrowType === "curved") {
    return curvedArrowPoints(x1, y1, x2, y2, object.bow, object.curveBend);
  }
  return [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ];
}

// A tiny bit bigger than the drawn line, not the whole bounding box — an
// empty rect or ellipse only grabs the pointer near its outline, so the
// see-through middle still reaches ink/canvas clicks underneath. Filled
// shapes and every other type (text, image, link) hit-test their full box.
const HIT_PAD = 6;

export function hitTestObject(object, x, y) {
  if (object.hidden) return false;
  const bounds = objectBounds(object);
  const tolerance = HIT_PAD + object.strokeWidth / 2;

  if (object.rotation) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rad = (-object.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * cos - dy * sin;
    y = cy + dx * sin + dy * cos;
  }

  if (object.type === "line" || object.type === "arrow") {
    const points = arrowPathPoints(object);
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i += 1) {
      best = Math.min(best, distanceToSegment(x, y, points[i], points[i + 1]));
    }
    // A thin line is a much smaller target than a shape outline — give it more slack.
    return best <= tolerance + 4;
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
  if (object.hidden) return false;
  const bounds = objectBounds(object);

  if (object.rotation) {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const rad = (-object.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * cos - dy * sin;
    y = cy + dx * sin + dy * cos;
  }

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
