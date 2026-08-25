import { describe, expect, it } from 'vitest';
import {
  mapFocusPoint,
  mapViewportPoint,
  pagePointToViewport,
} from '../src/ink/pageCoordinates.js';

const layout = {
  pageIds: ['p1', 'p2'],
  pageWidth: 800,
  pageHeight: 1000,
  pageGap: 28,
  zoom: 0.5,
  showPageBreaks: true,
};

describe('page-aware ink coordinates', () => {
  it('rejects visual page gaps', () => {
    expect(mapViewportPoint(layout, { x: 100, y: 510 })).toBeNull();
  });

  it('maps the second page into page-local coordinates', () => {
    expect(mapViewportPoint(layout, { x: 100, y: 553 })).toEqual({
      pageId: 'p2',
      pageIndex: 1,
      x: 200,
      y: 50,
    });
  });

  it('maps page-local coordinates back into the viewport', () => {
    expect(pagePointToViewport(layout, 'p2', { x: 200, y: 50 })).toEqual({
      x: 100,
      y: 553,
    });
  });

  it('rejects page points outside the page bounds', () => {
    expect(pagePointToViewport(layout, 'p2', { x: 801, y: 50 })).toBeNull();
    expect(pagePointToViewport(layout, 'missing', { x: 1, y: 1 })).toBeNull();
  });

  it('rejects layouts with zero page height consistently', () => {
    const invalidLayout = { ...layout, pageHeight: 0, pageGap: 0 };
    expect(mapViewportPoint(invalidLayout, { x: 1, y: 0 })).toBeNull();
    expect(pagePointToViewport(invalidLayout, 'p1', { x: 1, y: 0 })).toBeNull();
  });

  it('maps a focus viewport into the selected page rectangle', () => {
    expect(mapFocusPoint(
      { pageId: 'p2', x: 100, y: 200, width: 300, height: 150 },
      { width: 600, height: 300 },
      { x: 300, y: 150 },
    )).toEqual({ pageId: 'p2', x: 250, y: 275 });
  });

  it('rejects focus points outside the viewport', () => {
    expect(mapFocusPoint(
      { pageId: 'p2', x: 100, y: 200, width: 300, height: 150 },
      { width: 600, height: 300 },
      { x: 601, y: 150 },
    )).toBeNull();
  });
});
