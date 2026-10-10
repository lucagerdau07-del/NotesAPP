import { describe, expect, it } from 'vitest';
import {
  calculateDocumentMetrics,
  findPageIndexAtOffset,
  pagePointToViewport,
  viewportPointToPage,
} from '../src/documents/documentLayout.js';

describe('document layout geometry', () => {
  const pages = [
    { id: 'p1', width: 800, height: 1200 },
    { id: 'p2', width: 800, height: 600 },
  ];

  it('computes accumulated offsets and total scroll extent with canonical gap', () => {
    const metrics = calculateDocumentMetrics(pages);
    expect(metrics.pageLayouts).toEqual([
      { id: 'p1', index: 0, width: 800, height: 1200, top: 0, bottom: 1200 },
      { id: 'p2', index: 1, width: 800, height: 600, top: 1228, bottom: 1828 },
    ]);
    expect(metrics.totalHeight).toBe(1828);
    expect(metrics.maxWidth).toBe(800);
  });

  it('converts viewport coordinates to page-local clamped space under zoom and scroll', () => {
    const layout = {
      pages,
      zoom: 1.5,
      scrollX: 40,
      scrollY: 100,
      originX: 100,
      originY: 50,
    };
    const point = viewportPointToPage(layout, 'p2', { clientX: 250, clientY: 1910 });
    expect(point.y).toBeCloseTo((1860 + 100 - 1228 * 1.5) / 1.5, 3);
  });

  it('resolves page index from vertical layout offset', () => {
    const metrics = calculateDocumentMetrics(pages);
    expect(findPageIndexAtOffset(metrics, 500)).toBe(0);
    expect(findPageIndexAtOffset(metrics, 1210)).toBe(0);
    expect(findPageIndexAtOffset(metrics, 1500)).toBe(1);
  });
});
