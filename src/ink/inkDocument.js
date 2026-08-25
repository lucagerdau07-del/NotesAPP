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

let lastUpdatedAt = 0;

function nextUpdatedAt(document) {
  const current = Number.isFinite(document.updatedAt) ? document.updatedAt : 0;
  const next = Math.max(Date.now(), current + 1, lastUpdatedAt + 1);
  lastUpdatedAt = next;
  return next;
}

function withUpdatedAt(document, changes) {
  return { ...document, ...changes, updatedAt: nextUpdatedAt(document) };
}

function createNextPage(document, page) {
  const existingIds = new Set(document.pages.map(item => item.id));
  const requestedId = page && typeof page.id === 'string' ? page.id : '';
  if (requestedId) {
    return existingIds.has(requestedId) ? null : { id: requestedId };
  }
  let index = document.pages.length + 1;
  let id = `${document.documentId}-page-${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `${document.documentId}-page-${index}`;
  }
  return { id };
}

function applyInkCommand(document, command) {
  if (!command || typeof command !== 'object') return document;

  switch (command.type) {
    case 'commit-stroke': {
      if (!isStroke(command.stroke)) return document;
      return withUpdatedAt(document, { strokes: [...document.strokes, command.stroke] });
    }
    case 'remove-strokes': {
      const ids = Array.isArray(command.strokeIds) ? new Set(command.strokeIds) : new Set();
      if (ids.size === 0) return document;
      const strokes = document.strokes.filter(stroke => !ids.has(stroke.id));
      return strokes.length === document.strokes.length ? document : withUpdatedAt(document, { strokes });
    }
    case 'clear-document':
      return document.strokes.length === 0 ? document : withUpdatedAt(document, { strokes: [] });
    case 'add-page': {
      const page = createNextPage(document, command.page);
      return page === null ? document : withUpdatedAt(document, { pages: [...document.pages, page] });
    }
    default:
      return document;
  }
}

export function createInkHistory(document, limit = 100) {
  const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 100;
  return { past: [], present: document, future: [], limit: Math.max(0, parsedLimit) };
}

function appendBoundedPast(past, present, limit) {
  return limit === 0 ? [] : [...past, present].slice(-limit);
}

export function executeInkCommand(history, command) {
  const next = applyInkCommand(history.present, command);
  if (next === history.present) return history;
  return {
    past: appendBoundedPast(history.past, history.present, history.limit),
    present: next,
    future: [],
    limit: history.limit
  };
}

export function undoInkHistory(history) {
  if (history.past.length === 0) return history;
  const present = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future],
    limit: history.limit
  };
}

export function redoInkHistory(history) {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return {
    past: appendBoundedPast(history.past, history.present, history.limit),
    present,
    future,
    limit: history.limit
  };
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + position * dx), point.y - (start.y + position * dy));
}

function strokeIntersectsPoints(stroke, points, radius) {
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    return points.some(point => pointToSegmentDistance(point, stroke.points[0], stroke.points[0]) <= radius);
  }
  return points.some(point => stroke.points.some((start, index) => index > 0
    && pointToSegmentDistance(point, stroke.points[index - 1], start) <= radius));
}

export function findIntersectingStrokeIds(document, pageId, points, radius) {
  if (!document || !Array.isArray(document.strokes) || !Array.isArray(points) || !Number.isFinite(radius) || radius < 0) {
    return [];
  }
  const samples = points.filter(isPoint);
  if (samples.length === 0) return [];
  return document.strokes
    .filter(stroke => stroke.pageId === pageId && strokeIntersectsPoints(stroke, samples, radius))
    .map(stroke => stroke.id);
}
