import { objectBounds } from "./pageObjects.js";

// Ray-casting point-in-polygon. The lasso path is an open list of drag
// points; the caller is responsible for treating it as closed.
export function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

// A stroke counts as "lassoed" if any single point of it falls inside the
// loop — forgiving on purpose, so grazing a line's edge still grabs it.
export function strokesInLasso(strokes, pageId, polygon) {
  return strokes
    .filter(
      (stroke) =>
        stroke.pageId === pageId &&
        stroke.points.some((point) => pointInPolygon(point, polygon)),
    )
    .map((stroke) => stroke.id);
}

// An object counts as lassoed if its center sits inside the loop — matches
// how a drag-select usually reads "did I circle this thing".
export function objectsInLasso(objects, pageId, polygon) {
  return objects
    .filter((object) => {
      if (object.pageId !== pageId) return false;
      const bounds = objectBounds(object);
      const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      };
      return pointInPolygon(center, polygon);
    })
    .map((object) => object.id);
}

// Combined bounding box of every selected stroke point and object box, in
// page units — the handle frame is drawn from this.
export function selectionBounds(strokes, objects, strokeIds, objectIds) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const strokeIdSet = new Set(strokeIds);
  strokes.forEach((stroke) => {
    if (!strokeIdSet.has(stroke.id)) return;
    stroke.points.forEach((point) => {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    });
  });

  const objectIdSet = new Set(objectIds);
  objects.forEach((object) => {
    if (!objectIdSet.has(object.id)) return;
    const bounds = objectBounds(object);
    if (bounds.x < minX) minX = bounds.x;
    if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
    if (bounds.y < minY) minY = bounds.y;
    if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
  });

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
