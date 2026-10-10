// Placed shapes (rect/ellipse/line/arrow) are baked into one plain pen stroke
// instead of staying page objects: once down they behave like anything drawn
// by hand — no selection hitbox or handles, erasable by both erasers, picked
// up by the lasso. The geometry mirrors what the page-object renderer drew
// (handDrawn.js), minus the roughjs wobble.
import { arrowPathPoints, createPageObject } from "./pageObjects.js";

export const INK_SHAPE_TYPES = ["rect", "ellipse", "line", "arrow"];

// Spacing of the points laid along straight edges, in page units. The lasso
// selects a stroke by its points, so a rect drawn as just its four corners
// could not be caught by circling one side of it.
const SAMPLE_STEP = 8;

function densify(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SAMPLE_STEP));
    for (let s = 1; s <= steps; s += 1) {
      out.push({ x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps });
    }
  }
  return out;
}

function arc(cx, cy, r, from, to, steps = 6) {
  const points = [];
  for (let s = 0; s <= steps; s += 1) {
    const angle = from + ((to - from) * s) / steps;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return points;
}

function rectPoints({ x, y, width, height, rounded }) {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  const w = Math.abs(width);
  const h = Math.abs(height);
  // Same corner radius handDrawn.js's roughRectPaths gives a rounded rect.
  const r = rounded ? Math.min(10, w / 2, h / 2) : 0;
  if (r <= 0) {
    return densify([
      { x: left, y: top },
      { x: left + w, y: top },
      { x: left + w, y: top + h },
      { x: left, y: top + h },
      { x: left, y: top },
    ]);
  }
  const H = Math.PI / 2;
  return densify([
    ...arc(left + w - r, top + r, r, -H, 0),
    ...arc(left + w - r, top + h - r, r, 0, H),
    ...arc(left + r, top + h - r, r, H, 2 * H),
    ...arc(left + r, top + r, r, 2 * H, 3 * H),
    { x: left + w - r, y: top },
  ]);
}

function ellipsePoints({ x, y, width, height }) {
  const rx = Math.abs(width) / 2;
  const ry = Math.abs(height) / 2;
  const cx = Math.min(x, x + width) + rx;
  const cy = Math.min(y, y + height) + ry;
  const steps = 72;
  const points = [];
  for (let s = 0; s <= steps; s += 1) {
    const angle = (2 * Math.PI * s) / steps;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

// The two barb ends of a head at `tip`, pointing away from `from` — same size
// and spread as handDrawn.js's roughArrowheadPaths.
function barbs(tip, from, strokeWidth) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const size = 8 + strokeWidth * 2;
  const spread = 0.5;
  return [
    { x: tip.x - size * Math.cos(angle - spread), y: tip.y - size * Math.sin(angle - spread) },
    { x: tip.x - size * Math.cos(angle + spread), y: tip.y - size * Math.sin(angle + spread) },
  ];
}

// One continuous polyline for the whole arrow: start head, shaft, end head.
// A head is drawn out to one barb, back to the tip, out to the other barb
// (and back, at the start) — round joins make the retrace invisible, and one
// stroke per shape means one eraser touch removes all of it.
function linePoints(object) {
  const shaft = densify(arrowPathPoints(object));
  const first = shaft[0];
  const last = shaft[shaft.length - 1];
  const points = [];
  if (object.startArrowhead === "arrow" && shaft.length > 1) {
    const [a, b] = barbs(first, shaft[1], object.strokeWidth);
    points.push(a, first, b, first);
  }
  points.push(...shaft);
  if (object.endArrowhead === "arrow" && shaft.length > 1) {
    const [a, b] = barbs(last, shaft[shaft.length - 2], object.strokeWidth);
    points.push(a, last, b);
  }
  return points;
}

export function shapeStrokePoints(shape) {
  const object = createPageObject(shape);
  if (object.type === "rect") return rectPoints(object);
  if (object.type === "ellipse") return ellipsePoints(object);
  return linePoints(object);
}

// A committed pen stroke drawing `shape` (anything createPageObject takes,
// of an INK_SHAPE_TYPES type), or null for any other type.
export function shapeToInkStroke(shape, id) {
  if (!shape || !INK_SHAPE_TYPES.includes(shape.type)) return null;
  const object = createPageObject(shape);
  return {
    id: String(id),
    pageId: object.pageId,
    tool: "pen",
    color: object.color,
    width: object.strokeWidth,
    opacity: object.opacity / 100,
    points: shapeStrokePoints(object).map((p) => ({ x: p.x, y: p.y })),
  };
}
