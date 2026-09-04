const STORAGE_KEY = "notes.notes.v1";

// Index of user-created notes (title/subject/page style, last-edited time) so
// the library can list and re-open them. Imported documents keep their own
// index in documentRepository.js; this only covers notes started from
// scratch via NewDocumentDialog.
export function createNoteRepository(storage, { now = Date.now } = {}) {
  let sequence = 0;
  const nextId = () =>
    globalThis.crypto?.randomUUID?.() || `note-${now()}-${sequence++}`;

  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem?.(STORAGE_KEY) || "null");
      return Array.isArray(parsed?.notes) ? parsed.notes : [];
    } catch {
      return [];
    }
  };

  const write = (notes) => {
    try {
      storage?.setItem?.(STORAGE_KEY, JSON.stringify({ version: 1, notes }));
    } catch {
      // Persistence failures must not affect the editable in-memory note.
    }
  };

  return {
    listNotes() {
      return read();
    },

    saveNote(input) {
      const notes = read();
      const id = String(input.id || nextId());
      const existing = notes.find((item) => item.id === id);
      const timestamp = now();
      const saved = {
        ...existing,
        ...input,
        id,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      write([saved, ...notes.filter((item) => item.id !== id)]);
      return saved;
    },

    touchNote(id) {
      const notes = read();
      const key = String(id);
      const existing = notes.find((item) => item.id === key);
      if (!existing) return;
      write([
        { ...existing, updatedAt: now() },
        ...notes.filter((item) => item.id !== key),
      ]);
    },

    // ponytail: leaves the note's ink content (notes-app:ink:<id> in
    // localStorage) behind - orphaned but harmless. Add cleanup if that
    // ever needs reclaiming.
    removeNote(id) {
      const key = String(id);
      write(read().filter((item) => item.id !== key));
    },
  };
}

export const browserNoteRepository = createNoteRepository(globalThis.localStorage);
