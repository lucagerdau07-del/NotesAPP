// Turns a freehand ink stroke (or a few strokes drawn back to back - see
// useInkPointer's stroke merging) into a page-object shape guess, for the
// hold-to-convert gesture. Pure geometry, no ML: a bounding-box fit for
// rect/ellipse, a straight-shaft check for line/arrow. Returns null whenever
// the input isn't a confident match, so a held pause mid-handwriting or an
// accidental tap-and-hold never mutates it.
//
// ponytail: naive heuristic - only axis-aligned rect/ellipse (no rotation or
// diamonds), and an arrowhead is "ink flaring off the shaft near one end"
// (covers a single hooked stroke, a V head, and separate barb strokes; no
// curved arrows). Upgrade to a real corner classifier if users draw
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
// bbox and circularity still read the actual drawn points. Wraps around, since
// it only ever sees closed loops: a truncated window at the seam would round
// off whichever corner the stroke started on, and whether that corner then
// still counted depended on exactly where the pen stopped.
function smooth(points, window = 5) {
  if (points.length <= window) return points;
  const half = Math.floor(window / 2);
  const n = points.length;
  return points.map((_, i) => {
    let sx = 0, sy = 0;
    for (let k = i - half; k <= i + half; k += 1) {
      const p = points[(k + n) % n];
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / window, y: sy / window };
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
  // RDP tends to chamfer a rounded corner into two close points, and keeps
  // the seam point at both ends of the loop - either throws off the corner
  // count. Fold any edge that is short next to the shape's own short side
  // into one corner; a circle's RDP edges are all a sizeable arc, so it never
  // folds down into a square.
  const foldBelow = Math.min(box.width, box.height) * 0.25;
  const distinct = [...corners];
  while (distinct.length > 3) {
    const n = distinct.length;
    const edge = (i) => dist(distinct[i], distinct[(i + 1) % n]);
    let shortest = 0;
    for (let i = 1; i < n; i += 1) if (edge(i) < edge(shortest)) shortest = i;
    if (edge(shortest) >= foldBelow) break;
    const p = distinct[shortest];
    const q = distinct[(shortest + 1) % n];
    distinct.splice(shortest, 1, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
    distinct.splice(shortest === n - 1 ? 0 : shortest + 1, 1);
  }

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

function farthestFrom(points, from) {
  let best = points[0];
  let bestDist = -1;
  for (const p of points) {
    const d = dist(from, p);
    if (d > bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// Purely positional, never path-based: stroke order, pen-lift jumps between
// merged strokes, and the jitter of a pen held still at the end (the hold
// gesture itself) all leave the point cloud's shape unchanged.
function recognizeOpen(raw) {
  // The two ends of the shaft are the cloud's two farthest-apart points
  // (two-pass approximation). Arrowhead barbs sweep back toward the tail, so
  // they never outreach the tip.
  const a = farthestFrom(raw, raw[0]);
  const b = farthestFrom(raw, a);
  const len = dist(a, b);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;

  const HEAD_ZONE = 0.35; // outer share of the shaft that may hold a head
  let spreadA = 0;
  let spreadB = 0;
  let bodySpread = 0;
  for (const p of raw) {
    const t = ((p.x - a.x) * ux + (p.y - a.y) * uy) / len;
    const perp = Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
    if (t < HEAD_ZONE) spreadA = Math.max(spreadA, perp);
    else if (t > 1 - HEAD_ZONE) spreadB = Math.max(spreadB, perp);
    else bodySpread = Math.max(bodySpread, perp);
  }
  if (bodySpread > Math.max(8, len * 0.1)) return null; // bowed or zigzag middle
  if (spreadA > len * 0.6 || spreadB > len * 0.6) return null; // L/V shapes, not heads

  // A head flares well past the shaft's own wobble; a gently bowed line is
  // widest in the middle, so its ends never pass this.
  const headMin = Math.max(6, len * 0.07, bodySpread * 2);
  const headA = spreadA >= headMin;
  const headB = spreadB >= headMin;
  // Tail = the end without a head; for a plain line or a double arrow, the
  // end the drawing started at.
  const tail = headA && !headB ? b : headB && !headA ? a : dist(raw[0], a) <= dist(raw[0], b) ? a : b;
  const tip = tail === a ? b : a;
  const segment = { x: tail.x, y: tail.y, width: tip.x - tail.x, height: tip.y - tail.y };
  if (headA && headB) return { type: "arrow", ...segment, startArrowhead: "arrow", endArrowhead: "arrow" };
  if (headA || headB) return { type: "arrow", ...segment, endArrowhead: "arrow" };
  // No head is the weakest evidence of intent - just "mostly straight" - and
  // a held pause mid-handwriting is exactly that shape at word-sized scale.
  // An arrowhead's own flare already proves someone meant a shape, so only
  // the bare line needs this extra floor.
  if (len < 40) return null;
  return { type: "line", ...segment };
}

// The hold gesture itself leaves a knot of jitter where the pen rested; at a
// rect's closing corner that knot reads as extra corners. Cut it back to one
// point.
function trimHoldTail(points, radius = 6) {
  const end = points[points.length - 1];
  let i = points.length - 1;
  while (i > 0 && dist(points[i - 1], end) <= radius) i -= 1;
  return [...points.slice(0, i), end];
}

export function recognizeShape(points) {
  if (!Array.isArray(points) || points.length < 6) return null;
  const raw = trimHoldTail(dedupe(points));
  if (raw.length < 6) return null;

  const box = bboxOf(raw);
  const diag = Math.hypot(box.width, box.height);
  if (diag < 12) return null;

  // Open first: its straight-shaft test rejects every rect/ellipse, while the
  // start/end "closed" test misfires on multi-stroke arrows whose first and
  // last strokes both touch the tip.
  const open = recognizeOpen(raw);
  if (open) return open;
  const closed = dist(raw[0], raw[raw.length - 1]) <= Math.max(28, diag * 0.3);
  return closed ? recognizeClosed(raw) : null;
}
