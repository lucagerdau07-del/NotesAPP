import { PAGE_GAP } from './fileImport.js';

export function calculateDocumentMetrics(pages = []) {
  let top = 0;
  let maxWidth = 0;
  const pageLayouts = (pages || []).map((page, index) => {
    const width = Number(page?.width) || 800;
    const height = Number(page?.height) || 800 * 1.414;
    const pageTop = top;
    const pageBottom = pageTop + height;
    maxWidth = Math.max(maxWidth, width);
    top = pageBottom + (index < pages.length - 1 ? PAGE_GAP : 0);
    return {
      id: page.id,
      index,
      width,
      height,
      top: pageTop,
      bottom: pageBottom,
    };
  });
  return {
    pageLayouts,
    totalHeight: pageLayouts.length > 0 ? pageLayouts[pageLayouts.length - 1].bottom : 0,
    maxWidth,
  };
}

export function findPageIndexAtOffset(metrics, offset) {
  const layouts = metrics?.pageLayouts || [];
  if (layouts.length === 0) return 0;
  if (offset <= layouts[0].top) return 0;
  for (let i = 0; i < layouts.length; i += 1) {
    const current = layouts[i];
    const next = layouts[i + 1];
    if (offset <= current.bottom) return current.index;
    if (next && offset < next.top) {
      const distCurrent = offset - current.bottom;
      const distNext = next.top - offset;
      return distCurrent <= distNext ? current.index : next.index;
    }
  }
  return layouts[layouts.length - 1].index;
}

export function viewportPointToPage(layout, targetPageId, point) {
  const { pages = [], zoom = 1, scrollX = 0, scrollY = 0, originX = 0, originY = 0 } = layout || {};
  const metrics = calculateDocumentMetrics(pages);
  const page = metrics.pageLayouts.find(p => p.id === targetPageId) || metrics.pageLayouts[0];
  if (!page) return { x: 0, y: 0 };
  const clientX = point?.clientX ?? point?.x ?? 0;
  const clientY = point?.clientY ?? point?.y ?? 0;
  const elementX = clientX - originX;
  const elementY = clientY - originY;
  const layoutX = elementX + scrollX;
  const layoutY = elementY + scrollY;
  const pageTopInLayout = page.top * zoom;
  const unscaledX = layoutX / zoom;
  const unscaledY = (layoutY - pageTopInLayout) / zoom;
  return {
    x: Math.max(0, Math.min(page.width, unscaledX)),
    y: Math.max(0, Math.min(page.height, unscaledY)),
  };
}

export function pagePointToViewport(layout, pageId, point) {
  const { pages = [], zoom = 1, scrollX = 0, scrollY = 0, originX = 0, originY = 0 } = layout || {};
  const metrics = calculateDocumentMetrics(pages);
  const page = metrics.pageLayouts.find(p => p.id === pageId) || metrics.pageLayouts[0];
  if (!page) return null;
  const pageTopInLayout = page.top * zoom;
  const layoutX = (point?.x || 0) * zoom;
  const layoutY = pageTopInLayout + (point?.y || 0) * zoom;
  return {
    x: originX + layoutX - scrollX,
    y: originY + layoutY - scrollY,
  };
}