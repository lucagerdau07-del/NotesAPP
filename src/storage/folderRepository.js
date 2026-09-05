const STORAGE_KEY = "folders.folders.v1";

// Seeded once on first run so existing notes (subject: "Mathe", ...) keep
// matching by id/name without a migration - see Library.jsx's matchesFolder.
const DEFAULT_FOLDERS = [
  { id: "mathe", name: "Mathe" },
  { id: "chemie", name: "Chemie" },
  { id: "kunst", name: "Kunst" },
  { id: "pgw", name: "PGW" },
  { id: "philosophie", name: "Philosophie" },
  { id: "englisch", name: "Englisch" },
  { id: "spanisch", name: "Spanisch" },
].map((f) => ({ ...f, color: null, icon: null, createdAt: 0 }));

export function createFolderRepository(storage, { now = Date.now } = {}) {
  let sequence = 0;
  const nextId = () =>
    globalThis.crypto?.randomUUID?.() || `folder-${now()}-${sequence++}`;

  const write = (folders) => {
    try {
      storage?.setItem?.(STORAGE_KEY, JSON.stringify({ version: 1, folders }));
    } catch {
      // Persistence failures must not block the in-memory list.
    }
    return folders;
  };

  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || "null");
      if (Array.isArray(parsed?.folders)) return parsed.folders;
    } catch {
      // fall through to seed defaults
    }
    return write(DEFAULT_FOLDERS);
  };

  return {
    listFolders() {
      return read();
    },

    createFolder({ name, color, icon }) {
      const folder = {
        id: nextId(),
        name: String(name || "").trim(),
        color: color || null,
        icon: icon || null,
        createdAt: now(),
      };
      write([...read(), folder]);
      return folder;
    },

    renameFolder(id, { name, color, icon }) {
      const key = String(id);
      const folders = read().map((f) =>
        f.id === key
          ? {
              ...f,
              ...(name !== undefined ? { name: String(name).trim() } : {}),
              ...(color !== undefined ? { color } : {}),
              ...(icon !== undefined ? { icon } : {}),
            }
          : f,
      );
      write(folders);
      return folders.find((f) => f.id === key);
    },

    removeFolder(id) {
      const key = String(id);
      write(read().filter((f) => f.id !== key));
    },
  };
}

export const browserFolderRepository = createFolderRepository(globalThis.localStorage);
