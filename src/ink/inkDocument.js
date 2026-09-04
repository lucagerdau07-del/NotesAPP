import {
  createPageObject,
  isPageObject,
  pageObjectsOf,
} from "./pageObjects.js";

export const INK_SCHEMA_VERSION = 1;

function normalizePageIds(documentId, pages) {
  if (Array.isArray(pages)) {
    const unique = [...new Set(pages.map(String).filter(Boolean))];
    if (unique.length > 0) return unique;
  }
  const count = Math.max(1, Number.isFinite(pages) ? Math.floor(pages) : 1);
  return Array.from(
    { length: count },
    (_, index) => `${documentId}-page-${index + 1}`,
  );
}

export function resolveInkLayerIndex(document) {
  if (!document) return 0;
  const objects = pageObjectsOf(document);
  if (Number.isFinite(document.inkLayerIndex)) {
    return Math.max(0, Math.min(objects.length, Math.round(document.inkLayerIndex)));
  }
  // Legacy default: fills below ink, all other objects above ink
  let fillCount = 0;
  for (let i = 0; i < objects.length; i++) {
    if (objects[i].type === "fill") fillCount++;
  }
  return fillCount;
}

export function createInkDocument(documentId, pages = 1, pageDefaults = {}) {
  if (documentId && typeof documentId === "object") {
    const src = documentId;
    const id = String(src.documentId || "doc-1");
    const rawObjects = Array.isArray(src.objects) ? src.objects : [];
    return {
      version: INK_SCHEMA_VERSION,
      documentId: id,
      pages: Array.isArray(src.pages)
        ? src.pages
        : normalizePageIds(id, 1).map((pageId) => ({ id: pageId })),
      strokes: Array.isArray(src.strokes) ? src.strokes : [],
      objects: rawObjects.map((o) => (isPageObject(o) ? o : createPageObject(o))),
      inkLayerIndex: src.inkLayerIndex,
      inkLayerHidden: src.inkLayerHidden === true,
      inkLayerLocked: src.inkLayerLocked === true,
      updatedAt: src.updatedAt || 0,
    };
  }
  const id = String(documentId);
  const defaults =
    pageDefaults && typeof pageDefaults === "object" && !Array.isArray(pageDefaults)
      ? pageDefaults
      : {};
  return {
    version: INK_SCHEMA_VERSION,
    documentId: id,
    pages: normalizePageIds(id, pages).map((pageId) => ({ id: pageId, ...defaults })),
    strokes: [],
    objects: [],
    inkLayerIndex: undefined,
    inkLayerHidden: false,
    inkLayerLocked: false,
    updatedAt: 0,
  };
}

export function createInkStroke(input = {}) {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? input
      : {};
  const tools = new Set([
    "pen",
    "fountain",
    "pencil",
    "highlighter",
    "pixel-eraser",
  ]);
  const points = Array.isArray(source.points)
    ? source.points
        .filter(
          (point) =>
            point && Number.isFinite(point.x) && Number.isFinite(point.y),
        )
        .map((point) => ({ x: point.x, y: point.y }))
    : [];
  const tool = tools.has(source.tool) ? source.tool : "pen";
  const color = typeof source.color === "string" ? source.color : "#000000";
  const width =
    Number.isFinite(source.width) && source.width > 0 ? source.width : 3;
  const opacity =
    Number.isFinite(source.opacity) &&
    source.opacity >= 0 &&
    source.opacity <= 1
      ? source.opacity
      : 1;
  return {
    id: String(source.id ?? ""),
    pageId: String(source.pageId ?? ""),
    tool,
    color,
    width,
    opacity,
    points,
  };
}

export function getToolStyle(tool, rawColor, rawWidth) {
  const base = Number.isFinite(rawWidth) ? rawWidth : 3;
  const styles = {
    pen: { width: base, opacity: 1, composite: "source-over" },
    fountain: {
      width: Number((base * 0.8).toFixed(6)),
      opacity: 1,
      composite: "source-over",
    },
    pencil: { width: base, opacity: 0.58, composite: "source-over" },
    highlighter: { width: base * 5, opacity: 0.32, composite: "source-over" },
    "pixel-eraser": { width: base, opacity: 1, composite: "destination-out" },
  };
  return { tool, color: rawColor, ...(styles[tool] || styles.pen) };
}

function isPoint(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
  );
}

function isStroke(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.pageId === "string" &&
    value.pageId.length > 0 &&
    typeof value.tool === "string" &&
    (typeof value.color === "string" || value.color === undefined) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.opacity) &&
    Array.isArray(value.points) &&
    value.points.every(isPoint)
  );
}

export function isInkDocument(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.version === INK_SCHEMA_VERSION &&
    typeof value.documentId === "string" &&
    value.documentId.length > 0 &&
    Array.isArray(value.pages) &&
    value.pages.length > 0 &&
    value.pages.every(
      (page) =>
        page !== null &&
        typeof page === "object" &&
        typeof page.id === "string" &&
        page.id.length > 0,
    ) &&
    Array.isArray(value.strokes) &&
    value.strokes.every(isStroke) &&
    // Documents saved before page objects existed simply have no field; that
    // reads as "no objects" rather than as a broken document.
    (value.objects === undefined ||
      (Array.isArray(value.objects) && value.objects.every(isPageObject))) &&
    (value.inkLayerIndex === undefined || Number.isFinite(value.inkLayerIndex)) &&
    (value.inkLayerHidden === undefined || typeof value.inkLayerHidden === "boolean") &&
    (value.inkLayerLocked === undefined || typeof value.inkLayerLocked === "boolean") &&
    Number.isFinite(value.updatedAt)
  );
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
  const existingIds = new Set(document.pages.map((item) => item.id));
  const requestedId = page && typeof page.id === "string" ? page.id : "";
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
  if (!command || typeof command !== "object") return document;

  switch (command.type) {
    case "commit-stroke": {
      if (!isStroke(command.stroke)) return document;
      return withUpdatedAt(document, {
        strokes: [...document.strokes, command.stroke],
      });
    }
    case "remove-strokes": {
      const ids = Array.isArray(command.strokeIds)
        ? new Set(command.strokeIds)
        : new Set();
      if (ids.size === 0) return document;
      const strokes = document.strokes.filter((stroke) => !ids.has(stroke.id));
      return strokes.length === document.strokes.length
        ? document
        : withUpdatedAt(document, { strokes });
    }
    case "clear-document":
      return document.strokes.length === 0 && pageObjectsOf(document).length === 0
        ? document
        : withUpdatedAt(document, { strokes: [], objects: [] });
    case "add-object": {
      const object = createPageObject(command.object);
      if (!isPageObject(object)) return document;
      return withUpdatedAt(document, {
        objects: [...pageObjectsOf(document), object],
      });
    }
    case "update-object": {
      const objects = pageObjectsOf(document);
      const index = objects.findIndex((item) => item.id === command.objectId);
      if (index < 0 || !command.changes) return document;
      const next = createPageObject({
        ...objects[index],
        ...command.changes,
        id: objects[index].id,
      });
      return withUpdatedAt(document, {
        objects: objects.map((item, i) => (i === index ? next : item)),
      });
    }
    case "remove-objects": {
      const ids = Array.isArray(command.objectIds)
        ? new Set(command.objectIds)
        : new Set();
      if (ids.size === 0) return document;
      const objects = pageObjectsOf(document).filter((item) => !ids.has(item.id));
      return objects.length === pageObjectsOf(document).length
        ? document
        : withUpdatedAt(document, { objects });
    }
    case "transform-selection": {
      const strokeIds = Array.isArray(command.strokeIds)
        ? new Set(command.strokeIds)
        : new Set();
      const objectIds = Array.isArray(command.objectIds)
        ? new Set(command.objectIds)
        : new Set();
      if (strokeIds.size === 0 && objectIds.size === 0) return document;
      const dx = Number.isFinite(command.dx) ? command.dx : 0;
      const dy = Number.isFinite(command.dy) ? command.dy : 0;
      const scaleX = Number.isFinite(command.scaleX) ? command.scaleX : 1;
      const scaleY = Number.isFinite(command.scaleY) ? command.scaleY : 1;
      const originX = Number.isFinite(command.originX) ? command.originX : 0;
      const originY = Number.isFinite(command.originY) ? command.originY : 0;
      // Moving the origin along with every point means a plain move (scale 1)
      // is just the dx/dy translation, and a corner-drag resize is the same
      // formula with dx/dy at 0 — one mapping covers both gestures.
      const mapPoint = (x, y) => ({
        x: originX + (x - originX) * scaleX + dx,
        y: originY + (y - originY) * scaleY + dy,
      });
      const scale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
      let changed = false;
      const strokes = document.strokes.map((stroke) => {
        if (!strokeIds.has(stroke.id)) return stroke;
        changed = true;
        return {
          ...stroke,
          points: stroke.points.map((point) => mapPoint(point.x, point.y)),
          width: Math.max(0.5, stroke.width * scale),
        };
      });
      const objects = pageObjectsOf(document).map((object) => {
        if (!objectIds.has(object.id)) return object;
        changed = true;
        const topLeft = mapPoint(object.x, object.y);
        return createPageObject({
          ...object,
          x: topLeft.x,
          y: topLeft.y,
          width: object.width * scaleX,
          height: object.height * scaleY,
          strokeWidth: object.strokeWidth * scale,
          fontSize: object.fontSize * scale,
        });
      });
      return changed ? withUpdatedAt(document, { strokes, objects }) : document;
    }
    case "add-page": {
      const page = createNextPage(document, command.page);
      return page === null
        ? document
        : withUpdatedAt(document, { pages: [...document.pages, page] });
    }
    case "reorder-layers": {
      const objects = pageObjectsOf(document);
      const idMap = new Map(objects.map((o) => [o.id, o]));
      const newIds = Array.isArray(command.newObjectIds) ? command.newObjectIds : [];
      const reordered = [];
      for (const id of newIds) {
        const obj = idMap.get(id);
        if (obj) {
          reordered.push(obj);
          idMap.delete(id);
        }
      }
      for (const obj of idMap.values()) {
        reordered.push(obj);
      }
      const rawInkIndex = Number.isFinite(command.inkLayerIndex)
        ? command.inkLayerIndex
        : resolveInkLayerIndex(document);
      const clampedInkIndex = Math.max(0, Math.min(reordered.length, Math.round(rawInkIndex)));
      return withUpdatedAt(document, {
        objects: reordered,
        inkLayerIndex: clampedInkIndex,
      });
    }
    case "set-layer-lock": {
      if (command.target === "ink") {
        return withUpdatedAt(document, {
          inkLayerLocked: command.locked === true,
        });
      }
      const objects = pageObjectsOf(document);
      const index = objects.findIndex((item) => item.id === command.objectId);
      if (index < 0) return document;
      const next = createPageObject({
        ...objects[index],
        locked: command.locked === true,
      });
      return withUpdatedAt(document, {
        objects: objects.map((item, i) => (i === index ? next : item)),
      });
    }
    case "set-layer-visibility": {
      if (command.target === "ink") {
        return withUpdatedAt(document, {
          inkLayerHidden: command.hidden === true,
        });
      }
      const objects = pageObjectsOf(document);
      const index = objects.findIndex((item) => item.id === command.objectId);
      if (index < 0) return document;
      const next = createPageObject({
        ...objects[index],
        hidden: command.hidden === true,
      });
      return withUpdatedAt(document, {
        objects: objects.map((item, i) => (i === index ? next : item)),
      });
    }
    case "shift-layer-order": {
      const objects = [...pageObjectsOf(document)];
      const idx = objects.findIndex((item) => item.id === command.objectId);
      if (idx < 0) return document;
      const item = objects[idx];
      objects.splice(idx, 1);
      if (command.direction === "front") {
        objects.push(item);
      } else if (command.direction === "back") {
        objects.unshift(item);
      } else if (command.direction === "forward") {
        const nextIdx = Math.min(objects.length, idx + 1);
        objects.splice(nextIdx, 0, item);
      } else if (command.direction === "backward") {
        const nextIdx = Math.max(0, idx - 1);
        objects.splice(nextIdx, 0, item);
      } else {
        return document;
      }
      return withUpdatedAt(document, { objects });
    }
    default:
      return document;
  }
}

export function createInkHistory(document, limit = 100) {
  const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 100;
  return {
    past: [],
    present: document,
    future: [],
    limit: Math.max(0, parsedLimit),
  };
}

function appendBoundedPast(past, present, limit) {
  return limit === 0 ? [] : [...past, present].slice(-limit);
}

export function executeInkCommand(history, command) {
  if (!command) return history;
  if (command.type === "undo") return undoInkHistory(history);
  if (command.type === "redo") return redoInkHistory(history);
  return executeInkCommands(history, [command]);
}

// One history entry for a whole batch: an agent's single tool call can emit
// dozens of strokes, and undo should take back the paragraph, not one stroke.
export function executeInkCommands(history, commands) {
  const list = Array.isArray(commands) ? commands : [];
  const next = list.reduce(applyInkCommand, history.present);
  if (next === history.present) return history;
  return {
    past: appendBoundedPast(history.past, history.present, history.limit),
    present: next,
    future: [],
    limit: history.limit,
  };
}

export function undoInkHistory(history) {
  if (history.past.length === 0) return history;
  const present = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

export function redoInkHistory(history) {
  if (history.future.length === 0) return history;
  const [present, ...future] = history.future;
  return {
    past: appendBoundedPast(history.past, history.present, history.limit),
    present,
    future,
    limit: history.limit,
  };
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + position * dx),
    point.y - (start.y + position * dy),
  );
}

function strokeIntersectsPoints(stroke, points, radius) {
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) {
    return points.some(
      (point) =>
        pointToSegmentDistance(point, stroke.points[0], stroke.points[0]) <=
        radius,
    );
  }
  return points.some((point) =>
    stroke.points.some(
      (start, index) =>
        index > 0 &&
        pointToSegmentDistance(point, stroke.points[index - 1], start) <=
          radius,
    ),
  );
}

export function findIntersectingStrokeIds(document, pageId, points, radius) {
  if (
    !document ||
    !Array.isArray(document.strokes) ||
    !Array.isArray(points) ||
    !Number.isFinite(radius) ||
    radius < 0
  ) {
    return [];
  }
  const samples = points.filter(isPoint);
  if (samples.length === 0) return [];
  return document.strokes
    .filter(
      (stroke) =>
        stroke.pageId === pageId &&
        strokeIntersectsPoints(stroke, samples, radius),
    )
    .map((stroke) => stroke.id);
}
