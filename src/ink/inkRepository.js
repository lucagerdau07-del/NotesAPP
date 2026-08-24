import { isInkDocument } from './inkDocument.js';

const historyKey = documentId => `notes-app:ink:${documentId}`;
const preferencesKey = 'notes-app:ink-preferences';
const supportedTools = new Set(['pen', 'fountain', 'pencil', 'highlighter', 'pixel-eraser']);
const defaultPreferences = { inputMode: 'stylus', eraserMode: 'pixel' };

function normalizePreferences(value) {
  const preferences = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    inputMode: preferences.inputMode === 'finger' ? 'finger' : 'stylus',
    eraserMode: preferences.eraserMode === 'stroke' ? 'stroke' : 'pixel'
  };
}

function hasDurableStrokes(document) {
  const pageIds = new Set(document.pages.map(page => page.id));
  return document.strokes.every(stroke => supportedTools.has(stroke.tool)
    && stroke.width > 0
    && stroke.opacity >= 0 && stroke.opacity <= 1
    && pageIds.has(stroke.pageId));
}

function isValidSnapshot(document, documentId) {
  return isInkDocument(document)
    && document.documentId === documentId
    && hasDurableStrokes(document);
}

function isValidHistory(value, documentId) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Number.isInteger(value.limit) && value.limit >= 0
    && Array.isArray(value.past) && value.past.length <= value.limit
    && Array.isArray(value.future) && value.future.length <= value.limit
    && isValidSnapshot(value.present, documentId)
    && value.past.every(snapshot => isValidSnapshot(snapshot, documentId))
    && value.future.every(snapshot => isValidSnapshot(snapshot, documentId));
}

export function createInkRepository(storage) {
  return {
    loadHistory(documentId) {
      const id = String(documentId);
      try {
        const history = JSON.parse(storage.getItem(historyKey(id)));
        return isValidHistory(history, id) ? history : null;
      } catch {
        return null;
      }
    },

    saveHistory(documentId, history) {
      const id = String(documentId);
      try {
        if (!isValidHistory(history, id)) return false;
        storage.setItem(historyKey(id), JSON.stringify(history));
        return true;
      } catch {
        return false;
      }
    },

    loadPreferences() {
      try {
        return normalizePreferences(JSON.parse(storage.getItem(preferencesKey)));
      } catch {
        return { ...defaultPreferences };
      }
    },

    savePreferences(preferences) {
      try {
        storage.setItem(preferencesKey, JSON.stringify(normalizePreferences(preferences)));
        return true;
      } catch {
        return false;
      }
    }
  };
}
