import { describe, expect, it } from 'vitest';
import { shapeToInkStroke } from '../src/ink/shapeInk.js';
import { findIntersectingStrokeIds } from '../src/ink/inkDocument.js';

function boxOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

const base = { pageId: 'p1', color: '#123456', strokeWidth: 4 };

describe('shapeToInkStroke', () => {
  it('turns a rect into a closed pen stroke spanning its box, carrying color and width', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'rect', x: 10, y: 20, width: 100, height: 60 }, 's1');
    expect(stroke).toMatchObject({ id: 's1', pageId: 'p1', tool: 'pen', color: '#123456', width: 4, opacity: 1 });
    const box = boxOf(stroke.points);
    expect(box.x).toBeCloseTo(10);
    expect(box.y).toBeCloseTo(20);
    expect(box.width).toBeCloseTo(100);
    expect(box.height).toBeCloseTo(60);
    const first = stroke.points[0];
    const last = stroke.points[stroke.points.length - 1];
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(1);
  });

  it('normalizes a rect dragged up-left (negative extents)', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'rect', rounded: false, x: 110, y: 80, width: -100, height: -60 }, 's1');
    expect(boxOf(stroke.points)).toEqual({ x: 10, y: 20, width: 100, height: 60 });
  });

  it('samples straight edges densely so the lasso can catch any part of them', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'rect', rounded: false, x: 0, y: 0, width: 200, height: 100 }, 's1');
    for (let i = 1; i < stroke.points.length; i += 1) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThanOrEqual(8.0001);
    }
  });

  it('turns an ellipse into points lying on that ellipse', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'ellipse', x: 0, y: 0, width: 200, height: 100 }, 's1');
    for (const p of stroke.points) {
      const nx = (p.x - 100) / 100;
      const ny = (p.y - 50) / 50;
      expect(nx * nx + ny * ny).toBeCloseTo(1);
    }
  });

  it('draws an arrow as one stroke: shaft plus a head at the end only', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'arrow', x: 0, y: 0, width: 100, height: 0 }, 's1');
    // Shaft starts at the tail; the head flares back from the tip at x=100.
    expect(stroke.points[0]).toEqual({ x: 0, y: 0 });
    const behindTip = stroke.points.filter((p) => p.x < 100 && Math.abs(p.y) > 1);
    expect(behindTip.length).toBe(2);
    expect(behindTip.every((p) => p.x > 80)).toBe(true);
  });

  it('gives a double-headed arrow a head at both ends', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'arrow', startArrowhead: 'arrow', x: 0, y: 0, width: 100, height: 0 }, 's1');
    const barbs = stroke.points.filter((p) => Math.abs(p.y) > 1);
    expect(barbs.filter((p) => p.x < 20).length).toBe(2);
    expect(barbs.filter((p) => p.x > 80).length).toBe(2);
  });

  it('draws a plain line as just its shaft', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'line', x: 0, y: 0, width: 100, height: 50 }, 's1');
    expect(stroke.points[0]).toEqual({ x: 0, y: 0 });
    expect(stroke.points[stroke.points.length - 1]).toEqual({ x: 100, y: 50 });
  });

  it('is reached by the stroke eraser like any hand-drawn stroke', () => {
    const stroke = shapeToInkStroke({ ...base, type: 'rect', x: 0, y: 0, width: 100, height: 60 }, 's1');
    const document = { strokes: [stroke] };
    expect(findIntersectingStrokeIds(document, 'p1', [{ x: 100, y: 30 }], 2)).toEqual(['s1']);
    // Its empty middle is not ink, so a swipe through it touches nothing.
    expect(findIntersectingStrokeIds(document, 'p1', [{ x: 50, y: 30 }], 2)).toEqual([]);
  });

  it('leaves every non-shape type alone', () => {
    for (const type of ['text', 'image', 'link', 'fill', 'table']) {
      expect(shapeToInkStroke({ ...base, type, x: 0, y: 0, width: 10, height: 10 }, 's1')).toBeNull();
    }
  });
});
