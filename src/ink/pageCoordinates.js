function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function layoutMetrics(layout) {
  if (!layout || !Array.isArray(layout.pageIds)) return null;
  const { pageWidth, pageHeight, pageGap = 0, zoom, showPageBreaks } = layout;
  if (![pageWidth, pageHeight, pageGap, zoom].every(isFiniteNumber)
    || pageWidth < 0 || pageHeight < 0 || pageGap < 0 || zoom <= 0) {
    return null;
  }

  const scaledPageWidth = pageWidth * zoom;
  const scaledPageHeight = pageHeight * zoom;
  const stride = scaledPageHeight + (showPageBreaks ? pageGap : 0);
  return { scaledPageWidth, scaledPageHeight, stride };
}

export function mapViewportPoint(layout, point) {
  const metrics = layoutMetrics(layout);
  if (!metrics || !point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)
    || point.x < 0 || point.y < 0 || metrics.stride <= 0) return null;

  const pageIndex = Math.floor(point.y / metrics.stride);
  const localVisualY = point.y - pageIndex * metrics.stride;
  if (pageIndex < 0 || pageIndex >= layout.pageIds.length
    || point.x > metrics.scaledPageWidth
    || localVisualY > metrics.scaledPageHeight) return null;

  return {
    pageId: layout.pageIds[pageIndex],
    pageIndex,
    x: point.x / layout.zoom,
    y: localVisualY / layout.zoom,
  };
}

export function pagePointToViewport(layout, pageId, point) {
  const metrics = layoutMetrics(layout);
  if (!metrics || !point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return null;

  const pageIndex = layout.pageIds.indexOf(pageId);
  if (pageIndex < 0 || point.x < 0 || point.y < 0
    || point.x > layout.pageWidth || point.y > layout.pageHeight) return null;

  return {
    x: point.x * layout.zoom,
    y: pageIndex * metrics.stride + point.y * layout.zoom,
  };
}

export function mapFocusPoint(focusRect, viewport, point) {
  if (!focusRect || !viewport || !point
    || typeof focusRect.pageId !== 'string'
    || ![focusRect.x, focusRect.y, focusRect.width, focusRect.height,
      viewport.width, viewport.height, point.x, point.y].every(isFiniteNumber)
    || focusRect.width < 0 || focusRect.height < 0
    || viewport.width <= 0 || viewport.height <= 0
    || point.x < 0 || point.y < 0
    || point.x > viewport.width || point.y > viewport.height) return null;

  return {
    pageId: focusRect.pageId,
    x: focusRect.x + (point.x / viewport.width) * focusRect.width,
    y: focusRect.y + (point.y / viewport.height) * focusRect.height,
  };
}
