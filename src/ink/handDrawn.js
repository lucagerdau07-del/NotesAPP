// Sketchy (Excalidraw-style) SVG rendering for rect/ellipse/line/arrow, via
// roughjs. Every shape is seeded from its object id so the wobble is stable
// across re-renders instead of reshuffling on every paint.
import rough from "roughjs";
import { curveControlPoint, elbowBendX } from "./pageObjects.js";

const generator = rough.generator();

function seedOf(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  // roughjs wants a positive non-zero seed.
  return (Math.abs(hash) % 2147483646) + 1;
}

const DASH_PATTERNS = {
  solid: undefined,
  dashed: "8 6",
  dotted: "1.5 5",
};

export function dashArrayFor(strokeStyle) {
  return DASH_PATTERNS[strokeStyle];
}

function baseOptions(object) {
  return {
    seed: seedOf(object.id),
    stroke: object.color,
    strokeWidth: object.strokeWidth,
    roughness: 0.3,
    bowing: 0.2,
    maxRandomnessOffset: 0.5,
    disableMultiStroke: true,
    fill: object.fillColor || undefined,
    fillStyle: "solid",
  };
}

// Returns an array of {d, stroke, strokeWidth, fill} path descriptors ready
// to drop into <path> elements — roughjs may emit several strokes per shape
// (e.g. a double-stroke wobble), each needing its own <path>.
// roughjs has no built-in corner radius, so a rounded rect is drawn as a
// plain SVG path (straight edges + arc corners) and sketch-ified via
// generator.path — same call rough.js's own rounded shapes go through.
export function roughRectPaths(object, width, height) {
  if (object.rounded === false) {
    const drawable = generator.rectangle(0, 0, width, height, baseOptions(object));
    return generator.toPaths(drawable);
  }
  const r = Math.min(10, width / 2, height / 2);
  const d = [
    `M${r},0`,
    `L${width - r},0`,
    `A${r},${r} 0 0 1 ${width},${r}`,
    `L${width},${height - r}`,
    `A${r},${r} 0 0 1 ${width - r},${height}`,
    `L${r},${height}`,
    `A${r},${r} 0 0 1 0,${height - r}`,
    `L0,${r}`,
    `A${r},${r} 0 0 1 ${r},0`,
    "Z",
  ].join(" ");
  const drawable = generator.path(d, baseOptions(object));
  return generator.toPaths(drawable);
}

export function roughEllipsePaths(object, width, height) {
  const drawable = generator.ellipse(width / 2, height / 2, width, height, baseOptions(object));
  return generator.toPaths(drawable);
}

// A straight rough line between two points (no fill relevant).
export function roughLinePaths(object, x1, y1, x2, y2) {
  const drawable = generator.line(x1, y1, x2, y2, baseOptions(object));
  return generator.toPaths(drawable);
}

// A gentle quadratic-feel curve through start/mid/end.
export function roughCurvePaths(object, x1, y1, x2, y2) {
  // Same bow offset arrowPathPoints uses for hit-testing this curve, so the
  // clickable path and the drawn one never drift apart.
  const { x: cx, y: cy } = curveControlPoint(x1, y1, x2, y2, object.bow, object.curveBend);
  const drawable = generator.curve(
    [
      [x1, y1],
      [cx, cy],
      [x2, y2],
    ],
    baseOptions(object),
  );
  return generator.toPaths(drawable);
}

// Two-segment orthogonal (elbow) connector: horizontal first, then vertical.
export function roughElbowPaths(object, x1, y1, x2, y2) {
  const midX = elbowBendX(x1, x2, object.elbowBend);
  const drawable = generator.linearPath(
    [
      [x1, y1],
      [midX, y1],
      [midX, y2],
      [x2, y2],
    ],
    baseOptions(object),
  );
  return generator.toPaths(drawable);
}

// A small hand-drawn arrowhead triangle at (x, y) pointing along the given
// angle (radians).
export function roughArrowheadPaths(object, x, y, angle) {
  const size = 8 + object.strokeWidth * 2;
  const spread = 0.5;
  const p1 = [x - size * Math.cos(angle - spread), y - size * Math.sin(angle - spread)];
  const p2 = [x - size * Math.cos(angle + spread), y - size * Math.sin(angle + spread)];
  const drawable = generator.linearPath([p1, [x, y], p2], {
    ...baseOptions(object),
    seed: seedOf(object.id + (angle > Math.PI / 2 || angle < -Math.PI / 2 ? "-start" : "-end")),
  });
  return generator.toPaths(drawable);
}
