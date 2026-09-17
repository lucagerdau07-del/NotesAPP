// Turns a freehand ink stroke (or a few strokes drawn back to back - see
// useInkPointer's stroke merging) into a page-object shape guess, for the
// hold-to-convert gesture. Pure geometry, no ML: a bounding-box fit for
// rect/ellipse, a straight-shaft check for line/arrow. Returns null whenever
// the input isn't a confident match, so a held pause mid-handwriting or an
// accidental tap-and-hold never mutates it.
//
// ponytail: naive heuristic - only axis-aligned rect/ellipse (no rotation or
// diamonds), and an arrowhead is "path reaches a far point, then draws a
// short flare back toward the start" (covers both a single hooked stroke and
// a separate head stroke). Upgrade to a real corner classifier if users draw
// rotated/curved shapes often.

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function dedupe(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (dist(out[out.length - 1], points[i]) > 0.5) out.push(points[i]);
  }
  return out;
}

// Light moving-average smoothing before corner detection: a real hand (or
// digitizer sensor noise) wobbles point-to-point, and that wobble alone can
// look like extra corners to RDP. Only used for finding corners - area,
// bbox and circularity still read the actual drawn points.
function smooth(points, window = 5) {
  if (points.length <= window) return points;
  const half = Math.floor(window / 2);
  return points.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(points.length - 1, i + half); k += 1) {
      sx += points[k].x;
      sy += points[k].y;
      n += 1;
    }
    return { x: sx / n, y: sy / n };
  });
}

function pathLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += dist(points[i - 1], points[i]);
  return length;
}

function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function perpendicularDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return dist(point, start);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;
  const proj = { x: start.x + t * dx, y: start.y + t * dy };
  return dist(point, proj);
}

// Ramer-Douglas-Peucker: reduces a hand-drawn stroke to its corner points.
function simplifyRDP(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplifyRDP(points.slice(0, index + 1), epsilon);
  const right = simplifyRDP(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function interiorAngleDeg(prev, cur, next) {
  const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
  const v2 = { x: next.x - cur.x, y: next.y - cur.y };
  const len1 = Math.hypot(v1.x, v1.y) || 1;
  const len2 = Math.hypot(v2.x, v2.y) || 1;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (len1 * len2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Shoelace formula, closed polygon assumed.
function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function recognizeClosed(raw) {
  const box = bboxOf(raw);
  const diag = Math.hypot(box.width, box.height);
  const corners = simplifyRDP(smooth(raw), Math.max(4, diag * 0.035));
  // A closing duplicate corner (RDP keeps the seam point) throws off the
  // corner count - drop it when it lands right next to the true start.
  const distinct =
    corners.length > 1 && dist(corners[0], corners[corners.length - 1]) < Math.max(20, diag * 0.15)
      ? corners.slice(0, -1)
      : corners;

  if (distinct.length >= 3 && distinct.length <= 8) {
    const angles = distinct.map((c, i) =>
      interiorAngleDeg(distinct[(i - 1 + distinct.length) % distinct.length], c, distinct[(i + 1) % distinct.length]),
    );
    // Hand-drawn corners overshoot/round off, and a multi-stroke rect (each
    // side its own stroke) often leaves one spurious corner at a seam - a
    // clear majority of roughly-right angles is enough, not all of them.
    const near90 = angles.filter((a) => a >= 50 && a <= 130).length;
    if (near90 >= 3 && near90 / distinct.length >= 0.6) {
      return { type: "rect", x: box.minX, y: box.minY, width: box.width, height: box.height };
    }
  }

  const area = polygonArea(raw);
  const perimeter = pathLength(raw) + dist(raw[raw.length - 1], raw[0]);
  const circularity = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
  if (circularity > 0.58) {
    return { type: "ellipse", x: box.minX, y: box.minY, width: box.width, height: box.height };
  }
  return null;
}

function recognizeOpen(raw) {
  const start = raw[0];

  // The point farthest from the start is the shaft's tip - true whether the
  // whole thing is one continuous hooked stroke or a shaft stroke followed
  // by separate arrowhead strokes drawn back toward it.
  let farIndex = 0;
  let farDist = 0;
  for (let i = 1; i < raw.length; i += 1) {
    const d = dist(start, raw[i]);
    if (d > farDist) {
      farDist = d;
      farIndex = i;
    }
  }
  const tip = raw[farIndex];
  const shaftLen = pathLength(raw.slice(0, farIndex + 1));
  const shaftStraightness = shaftLen > 0 ? farDist / shaftLen : 0;
  if (shaftStraightness < 0.75) return null;

  const flareLen = pathLength(raw.slice(farIndex));
  const hasFlare = farIndex < raw.length - 1 && flareLen > 0 && flareLen < shaftLen * 0.8;
  if (hasFlare) {
    return { type: "arrow", x: start.x, y: start.y, width: tip.x - start.x, height: tip.y - start.y, endArrowhead: "arrow" };
  }

  // No flare after the tip: the tip has to actually be (close to) where the
  // drawing ends, or this is just a wobble that happened to bulge outward.
  if (farIndex >= raw.length - 3) {
    return { type: "line", x: start.x, y: start.y, width: tip.x - start.x, height: tip.y - start.y };
  }
  return null;
}

export function recognizeShape(points) {
  if (!Array.isArray(points) || points.length < 6) return null;
  const raw = dedupe(points);
  if (raw.length < 6) return null;

  const box = bboxOf(raw);
  const diag = Math.hypot(box.width, box.height);
  if (diag < 12) return null;

  const closed = dist(raw[0], raw[raw.length - 1]) <= Math.max(28, diag * 0.3);
  return closed ? recognizeClosed(raw) : recognizeOpen(raw);
}
