import { COMPONENT_BY_ID, COMPONENT_LIBRARY } from "./library.js";

// Components the agent wrote itself, or its edits to a built-in one. Saved
// recipes shadow a built-in with the same id, so "make the flask wider" is a
// save under the same name rather than a fork the model has to remember.

const STORAGE_KEY = "notes.agent.components";

function readAll(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(storage, value) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function createComponentStore(storage = globalThis.localStorage) {
  return {
    get(id) {
      const saved = readAll(storage)[id];
      return saved || COMPONENT_BY_ID.get(id) || null;
    },
    list() {
      const saved = readAll(storage);
      const builtIn = COMPONENT_LIBRARY.map((entry) => ({
        id: entry.id,
        title: entry.title,
        tags: entry.tags || [],
        description: entry.description,
        source: saved[entry.id] ? "geändert" : "eingebaut",
      }));
      const own = Object.values(saved)
        .filter((entry) => entry && !COMPONENT_BY_ID.has(entry.id))
        .map((entry) => ({
          id: entry.id,
          title: entry.title || entry.id,
          tags: entry.tags || [],
          description: entry.description || "",
          source: "eigen",
        }));
      return [...builtIn, ...own];
    },
    save(recipe) {
      const all = readAll(storage);
      all[recipe.id] = recipe;
      return writeAll(storage, all);
    },
    // Only ever removes the saved copy: a built-in comes back rather than
    // disappearing, so an edit that made things worse is always reversible.
    reset(id) {
      const all = readAll(storage);
      if (!all[id]) return false;
      delete all[id];
      writeAll(storage, all);
      return true;
    },
  };
}
