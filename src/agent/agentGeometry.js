// Shared between tools.js and presets.js so both clamp/validate the same way
// without one importing the other.

export const PAGE_WIDTH = 800;
export const PAGE_HEIGHT = Math.round(800 * 1.414);

// A whiteboard page has no edge (WhiteboardEditor pans/zooms an infinite
// canvas), so there is nothing to clamp *to* — this is just a generous cap
// that keeps a misbehaving model argument from producing an unusable
// off-screen object instead of a real bound.
const WHITEBOARD_EXTENT = 20000;

export const PAGE_BOUNDS = { minX: 0, maxX: PAGE_WIDTH, minY: 0, maxY: PAGE_HEIGHT };
export const WHITEBOARD_BOUNDS = {
  minX: -WHITEBOARD_EXTENT,
  maxX: WHITEBOARD_EXTENT,
  minY: -WHITEBOARD_EXTENT,
  maxY: WHITEBOARD_EXTENT,
};

export function isWhiteboardDocument(document) {
  return document?.pages?.[0]?.kind === "whiteboard";
}

export function boundsFor(document) {
  return isWhiteboardDocument(document) ? WHITEBOARD_BOUNDS : PAGE_BOUNDS;
}

const HEX = /^#[0-9a-f]{6}$/i;

export const clamp = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

// The agent writes in whatever ink the user currently has selected unless it
// asks for a colour itself — dark paper would swallow a hard-coded #1A1A1A.
export const color = (value, fallback = "#1A1A1A") =>
  typeof value === "string" && HEX.test(value) ? value : fallback;

export function newId(prefix) {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
