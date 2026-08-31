import { describe, expect, it } from 'vitest';
import { pointInPolygon, strokesInLasso, objectsInLasso, selectionBounds } from '../src/ink/lasso';

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('lasso selection', () => {
  it('tests points against a polygon by ray casting', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(false);
  });

  it('selects a stroke when any one point falls inside the loop', () => {
    const strokes = [
      { id: 'inside', pageId: 'p1', points: [{ x: -5, y: -5 }, { x: 5, y: 5 }] },
      { id: 'outside', pageId: 'p1', points: [{ x: 50, y: 50 }] },
      { id: 'other-page', pageId: 'p2', points: [{ x: 5, y: 5 }] },
    ];
    expect(strokesInLasso(strokes, 'p1', square)).toEqual(['inside']);
  });

  it('selects an object when its center falls inside the loop', () => {
    const objects = [
      { id: 'centered', pageId: 'p1', x: 2, y: 2, width: 4, height: 4 },
      { id: 'far', pageId: 'p1', x: 100, y: 100, width: 4, height: 4 },
    ];
    expect(objectsInLasso(objects, 'p1', square)).toEqual(['centered']);
  });

  it('bounds the combined selection and returns null for an empty one', () => {
    const strokes = [{ id: 'a', pageId: 'p1', points: [{ x: 0, y: 0 }, { x: 4, y: 6 }] }];
    const objects = [{ id: 'o', pageId: 'p1', x: 8, y: -2, width: 2, height: 2 }];
    expect(selectionBounds(strokes, objects, ['a'], ['o'])).toEqual({ x: 0, y: -2, width: 10, height: 8 });
    expect(selectionBounds(strokes, objects, [], [])).toBeNull();
  });
});
