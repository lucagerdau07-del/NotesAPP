export const INK_SCHEMA_VERSION = 1;

export function createInkDocument(documentId, pageCount = 1) {
  const id = String(documentId);
  const count = Math.max(1, Number.isFinite(pageCount) ? Math.floor(pageCount) : 1);
  return {
    version: INK_SCHEMA_VERSION,
    documentId: id,
    pages: Array.from({ length: count }, (_, index) => ({ id: `${id}-page-${index + 1}` })),
    strokes: [],
    updatedAt: 0
  };
}

export function createInkStroke(input = {}) {
  const source = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const tools = new Set(['pen', 'fountain', 'pencil', 'highlighter', 'pixel-eraser']);
  const points = Array.isArray(source.points)
    ? source.points
      .filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map(point => ({ x: point.x, y: point.y }))
    : [];
  const tool = tools.has(source.tool) ? source.tool : 'pen';
  const color = typeof source.color === 'string' ? source.color : '#000000';
  const width = Number.isFinite(source.width) && source.width > 0 ? source.width : 3;
  const opacity = Number.isFinite(source.opacity) && source.opacity >= 0 && source.opacity <= 1
    ? source.opacity : 1;
  return {
    id: String(source.id ?? ''),
    pageId: String(source.pageId ?? ''),
    tool,
    color,
    width,
    opacity,
    points
  };
}

export function getToolStyle(tool, rawColor, rawWidth) {
  const base = Number.isFinite(rawWidth) ? rawWidth : 3;
  const styles = {
    pen: { width: base, opacity: 1, composite: 'source-over' },
    fountain: { width: Number((base * 0.8).toFixed(6)), opacity: 1, composite: 'source-over' },
    pencil: { width: base, opacity: 0.58, composite: 'source-over' },
    highlighter: { width: base * 5, opacity: 0.32, composite: 'source-over' },
    'pixel-eraser': { width: base, opacity: 1, composite: 'destination-out' }
  };
  return { tool, color: rawColor, ...(styles[tool] || styles.pen) };
}

function isPoint(value) {
  return value !== null && typeof value === 'object'
    && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function isStroke(value) {
  return value !== null && typeof value === 'object'
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.pageId === 'string' && value.pageId.length > 0
    && typeof value.tool === 'string'
    && (typeof value.color === 'string' || value.color === undefined)
    && Number.isFinite(value.width) && Number.isFinite(value.opacity)
    && Array.isArray(value.points) && value.points.every(isPoint);
}

export function isInkDocument(value) {
  return value !== null && typeof value === 'object'
    && value.version === INK_SCHEMA_VERSION
    && typeof value.documentId === 'string' && value.documentId.length > 0
    && Array.isArray(value.pages) && value.pages.length > 0
    && value.pages.every(page => page !== null && typeof page === 'object'
      && typeof page.id === 'string' && page.id.length > 0)
    && Array.isArray(value.strokes) && value.strokes.every(isStroke)
    && Number.isFinite(value.updatedAt);
}
