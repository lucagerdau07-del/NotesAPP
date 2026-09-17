import { describe, expect, it } from 'vitest';
import { recognizeShape } from '../src/ink/shapeRecognizer.js';

function rectPoints(x, y, w, h, step = 4) {
  const points = [];
  const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  for (let i = 0; i < corners.length - 1; i += 1) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[i + 1];
    const segLen = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.round(segLen / step));
    for (let s = 0; s < steps; s += 1) points.push({ x: ax + (bx - ax) * (s / steps), y: ay + (by - ay) * (s / steps) });
  }
  points.push({ x, y });
  return points;
}

function circlePoints(cx, cy, r, steps = 48) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    points.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return points;
}

function linePoints(x1, y1, x2, y2, step = 4) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.round(len / step));
  const points = [];
  for (let s = 0; s <= steps; s += 1) points.push({ x: x1 + (x2 - x1) * (s / steps), y: y1 + (y2 - y1) * (s / steps) });
  return points;
}

function arrowPoints() {
  return [...linePoints(0, 0, 100, 0), ...linePoints(100, 0, 80, 15).slice(1)];
}

function zigzagPoints() {
  return [
    { x: 0, y: 0 }, { x: 10, y: 30 }, { x: 20, y: 5 }, { x: 30, y: 35 },
    { x: 40, y: 0 }, { x: 50, y: 30 }, { x: 60, y: 5 },
  ];
}

// Deterministic wobble, standing in for an unsteady hand.
function jitter(points, amount = 2) {
  return points.map((p, i) => ({
    x: p.x + Math.sin(i * 12.9898) * amount,
    y: p.y + Math.cos(i * 78.233) * amount,
  }));
}

// Four separate strokes (as drawn side by side by hand), corners not quite
// meeting - the realistic case, not a single unbroken loop.
function multiStrokeRectPoints(x, y, w, h, gap = 3) {
  return [
    ...linePoints(x, y, x + w, y),
    ...linePoints(x + w, y + gap, x + w, y + h),
    ...linePoints(x + w, y + h, x, y + h - gap),
    ...linePoints(x + gap, y + h, x, y),
  ];
}

// A shaft stroke plus two separate short strokes for the arrowhead flanks.
function multiStrokeArrowPoints() {
  return [...linePoints(0, 0, 100, 0), ...linePoints(100, 0, 82, 14), ...linePoints(100, 0, 82, -14)];
}

describe('recognizeShape', () => {
  it('recognizes a hand-drawn rectangle', () => {
    expect(recognizeShape(rectPoints(0, 0, 100, 60))).toEqual({ type: 'rect', x: 0, y: 0, width: 100, height: 60 });
  });

  it('recognizes a hand-drawn circle as an ellipse', () => {
    const result = recognizeShape(circlePoints(50, 50, 40));
    expect(result.type).toBe('ellipse');
    expect(result.width).toBeCloseTo(80, 0);
    expect(result.height).toBeCloseTo(80, 0);
  });

  it('recognizes a straight open stroke as a line', () => {
    expect(recognizeShape(linePoints(0, 0, 150, 10))).toEqual({ type: 'line', x: 0, y: 0, width: 150, height: 10 });
  });

  it('recognizes a shaft with a hooked end as an arrow', () => {
    const result = recognizeShape(arrowPoints());
    expect(result).toEqual({ type: 'arrow', x: 0, y: 0, width: 100, height: 0, endArrowhead: 'arrow' });
  });

  it('recognizes a wobbly hand-drawn rectangle', () => {
    const result = recognizeShape(jitter(rectPoints(0, 0, 120, 70), 3));
    expect(result.type).toBe('rect');
    expect(result.width).toBeGreaterThan(110);
    expect(result.width).toBeLessThan(130);
    expect(result.height).toBeGreaterThan(60);
    expect(result.height).toBeLessThan(80);
  });

  it('recognizes a wobbly hand-drawn circle', () => {
    const result = recognizeShape(jitter(circlePoints(50, 50, 40), 2));
    expect(result.type).toBe('ellipse');
  });

  it('recognizes a rectangle drawn as four separate strokes', () => {
    const result = recognizeShape(multiStrokeRectPoints(0, 0, 120, 70));
    expect(result.type).toBe('rect');
    expect(result.width).toBeCloseTo(120, -1);
    expect(result.height).toBeCloseTo(70, -1);
  });

  it('recognizes an arrow drawn as a shaft plus a separate two-stroke head', () => {
    const result = recognizeShape(multiStrokeArrowPoints());
    expect(result).toEqual({ type: 'arrow', x: 0, y: 0, width: 100, height: 0, endArrowhead: 'arrow' });
  });

  it('returns null for handwriting-shaped scribbles', () => {
    expect(recognizeShape(zigzagPoints())).toBeNull();
  });

  it('returns null for a tiny tap-and-hold cluster', () => {
    const points = Array.from({ length: 8 }, (_, i) => ({ x: i * 0.3, y: i * 0.2 }));
    expect(recognizeShape(points)).toBeNull();
  });

  it('returns null when there are too few points', () => {
    expect(recognizeShape([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBeNull();
  });
});
