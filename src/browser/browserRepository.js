import { isInternalBrowserUrl } from "./browserInput.js";

const STORAGE_KEY = "notes.browser.v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function emptyState() {
  return { version: 1, shortcuts: [], history: [] };
}

export function createBrowserRepository(storage, { now = Date.now } = {}) {
  let sequence = 0;

  const write = (state) => {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(state));
  };

  const read = () => {
    let state = emptyState();
    try {
      const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || "null");
      if (
        parsed &&
        Array.isArray(parsed.shortcuts) &&
        Array.isArray(parsed.history)
      ) {
        state = {
          version: 1,
          shortcuts: parsed.shortcuts,
          history: parsed.history,
        };
      }
    } catch {
      state = emptyState();
    }

    state.shortcuts = state.shortcuts.filter(
      (item) => item?.id && isInternalBrowserUrl(item.url),
    );
    state.history = state.history.filter(
      (item) =>
        item?.id &&
        isInternalBrowserUrl(item.url) &&
        Number(item.visitedAt) >= now() - MAX_AGE_MS,
    );
    return state;
  };

  const nextId = () =>
    globalThis.crypto?.randomUUID?.() || `browser-${now()}-${sequence++}`;

  const normalizeUrl = (url) => {
    if (!isInternalBrowserUrl(url)) {
      throw new TypeError("Only HTTP(S) URLs are supported");
    }
    return new URL(url).href;
  };

  return {
    listShortcuts() {
      return read()
        .shortcuts.slice()
        .sort((a, b) => a.position - b.position);
    },

    saveShortcut(input) {
      const state = read();
      const url = normalizeUrl(input.url);
      const existing = state.shortcuts.find((item) => item.id === input.id);
      const saved = {
        id: existing?.id || nextId(),
        title: String(input.title || new URL(url).hostname).trim(),
        url,
        favicon: input.favicon || existing?.favicon || "",
        createdAt: existing?.createdAt || now(),
        position: existing?.position ?? state.shortcuts.length,
      };

      state.shortcuts = existing
        ? state.shortcuts.map((item) => (item.id === saved.id ? saved : item))
        : [...state.shortcuts, saved];
      write(state);
      return saved;
    },

    removeShortcut(shortcutId) {
      const state = read();
      state.shortcuts = state.shortcuts
        .filter((item) => item.id !== shortcutId)
        .map((item, position) => ({ ...item, position }));
      write(state);
    },

    reorderShortcuts(ids) {
      const state = read();
      const positions = new Map(
        ids.map((shortcutId, position) => [shortcutId, position]),
      );
      state.shortcuts = state.shortcuts
        .sort(
          (a, b) =>
            (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((item, position) => ({ ...item, position }));
      write(state);
    },

    listHistory(query = "") {
      const state = read();
      write(state);
      const needle = String(query).trim().toLocaleLowerCase("de");
      return state.history
        .filter(
          (item) =>
            !needle ||
            `${item.title} ${item.url}`
              .toLocaleLowerCase("de")
              .includes(needle),
        )
        .sort((a, b) => b.visitedAt - a.visitedAt);
    },

    recordVisit(input) {
      const state = read();
      const visit = {
        id: nextId(),
        title: String(input.title || input.url),
        url: normalizeUrl(input.url),
        visitedAt: Number(input.visitedAt ?? now()),
      };
      const newest = state.history
        .slice()
        .sort((a, b) => b.visitedAt - a.visitedAt)[0];
      const persisted = newest?.url === visit.url
        ? { ...visit, id: newest.id }
        : visit;

      state.history = newest?.url === visit.url
        ? state.history.map((item) =>
            item.id === newest.id ? persisted : item,
          )
        : [...state.history, persisted];
      state.history = state.history.filter(
        (item) => item.visitedAt >= now() - MAX_AGE_MS,
      );
      write(state);
      return persisted;
    },

    clearHistory() {
      const state = read();
      state.history = [];
      write(state);
    },
  };
}

export { MAX_AGE_MS };
