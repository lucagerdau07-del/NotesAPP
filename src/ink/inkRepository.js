import { isInkDocument } from "./inkDocument.js";
import { INPUT_MODES } from "./inputPolicy.js";

const historyKey = (documentId) => `notes-app:ink:${documentId}`;
const legacyPreferencesKey = "notes-app:ink-preferences";
const preferencesKey = (documentId) =>
  `notes-app:ink-preferences:${documentId}`;
const supportedTools = new Set([
  "pen",
  "fountain",
  "pencil",
  "highlighter",
  "pixel-eraser",
]);
const supportedPreferenceTools = new Set([
  "pen",
  "fountain",
  "pencil",
  "highlighter",
]);
const defaultPreferences = {
  tool: "pen",
  color: "#EFECE4",
  penWidth: 3,
  eraserWidth: 15,
  inputMode: "stylus",
  eraserMode: "pixel",
};

function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizePreferences(value) {
  const preferences =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  return {
    tool: supportedPreferenceTools.has(preferences.tool)
      ? preferences.tool
      : defaultPreferences.tool,
    color:
      typeof preferences.color === "string" &&
      /^#[0-9a-f]{6}$/i.test(preferences.color)
        ? preferences.color
        : defaultPreferences.color,
    penWidth: positiveNumber(preferences.penWidth, defaultPreferences.penWidth),
    eraserWidth: positiveNumber(
      preferences.eraserWidth,
      defaultPreferences.eraserWidth,
    ),
    inputMode: INPUT_MODES.includes(preferences.inputMode)
      ? preferences.inputMode
      : defaultPreferences.inputMode,
    eraserMode: preferences.eraserMode === "stroke" ? "stroke" : "pixel",
  };
}

function parsePreferences(serialized) {
  try {
    const value = JSON.parse(serialized);
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return null;
    if (value.version !== undefined && value.version !== 1) return null;
    return normalizePreferences(value);
  } catch {
    return null;
  }
}

function hasDurableStrokes(document) {
  const pageIds = new Set(document.pages.map((page) => page.id));
  return document.strokes.every(
    (stroke) =>
      supportedTools.has(stroke.tool) &&
      stroke.width > 0 &&
      stroke.opacity >= 0 &&
      stroke.opacity <= 1 &&
      pageIds.has(stroke.pageId),
  );
}

function isValidSnapshot(document, documentId) {
  return (
    isInkDocument(document) &&
    document.documentId === documentId &&
    hasDurableStrokes(document)
  );
}

// Only the current document is persisted. The undo stack holds up to `limit`
// FULL document snapshots, so writing it stored ~N^2/2 stroke copies for an
// N-stroke note - one 76-stroke note filled the entire 5MB origin quota, after
// which every note's save threw QuotaExceededError and was swallowed silently.
// Undo/redo still works in memory for the whole session; it just no longer
// survives a restart, which nothing relied on.
function isValidHistory(value, documentId) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Number.isInteger(value.limit) &&
    value.limit >= 0 &&
    isValidSnapshot(value.present, documentId)
  );
}

export function createInkRepository(storage) {
  return {
    loadHistory(documentId) {
      const id = String(documentId);
      try {
        const stored = JSON.parse(storage.getItem(historyKey(id)));
        if (!isValidHistory(stored, id)) return null;
        // Blobs written before the quota fix carry past/future snapshots too;
        // they load fine, and the next save rewrites them compactly.
        return { past: [], present: stored.present, future: [], limit: stored.limit };
      } catch {
        return null;
      }
    },

    saveHistory(documentId, history) {
      const id = String(documentId);
      try {
        if (!isValidHistory(history, id)) return false;
        storage.setItem(
          historyKey(id),
          JSON.stringify({ present: history.present, limit: history.limit }),
        );
        return true;
      } catch (error) {
        // A full quota used to fail silently here, so a note could look saved
        // while nothing was written. Keep it visible.
        console.warn("[ink] saveHistory failed", error);
        return false;
      }
    },

    loadPreferences(documentId) {
      const id = String(documentId);
      try {
        const saved = parsePreferences(storage.getItem(preferencesKey(id)));
        if (saved) return saved;
        return (
          parsePreferences(storage.getItem(legacyPreferencesKey)) || {
            ...defaultPreferences,
          }
        );
      } catch {
        return { ...defaultPreferences };
      }
    },

    // Unlike loadPreferences(), which always synthesizes a full object, this
    // tells callers whether anything was ever actually saved for this
    // document - the "brand-new document" signal loadPreferences can't give.
    hasPreferences(documentId) {
      const id = String(documentId);
      try {
        return (
          parsePreferences(storage.getItem(preferencesKey(id))) !== null ||
          parsePreferences(storage.getItem(legacyPreferencesKey)) !== null
        );
      } catch {
        return false;
      }
    },

    savePreferences(documentId, preferences) {
      const id = String(documentId);
      try {
        storage.setItem(
          preferencesKey(id),
          JSON.stringify({
            version: 1,
            ...normalizePreferences(preferences),
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const browserInkRepository = createInkRepository(globalThis.localStorage);
