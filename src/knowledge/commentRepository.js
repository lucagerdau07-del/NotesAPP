export const COMMENT_STORAGE_KEY = "notes.comments.v1";

export const MAX_COMMENT_LENGTH = 500;

const clean = (text) => String(text ?? "").trim().slice(0, MAX_COMMENT_LENGTH);

// Kommentare liegen je Dokument in einer eigenen Liste und nicht im Ink-Dokument:
// sie erzeugen keine Undo-Schritte und ändern das Notiz-Bild nicht. Die Position
// ist pageId + Seitenkoordinaten (Whiteboard: Weltkoordinaten der einen Seite).
export function createCommentRepository(storage, { now = Date.now } = {}) {
  let sequence = 0;
  const nextId = () => globalThis.crypto?.randomUUID?.() || `comment-${now()}-${sequence++}`;

  const readAll = () => {
    try {
      const parsed = JSON.parse(storage?.getItem?.(COMMENT_STORAGE_KEY) || "null");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const list = (documentId) => {
    const found = readAll()[documentId];
    return Array.isArray(found) ? found : [];
  };

  const update = (documentId, change) => {
    const all = readAll();
    const next = change(list(documentId));
    if (next.length) all[documentId] = next;
    else delete all[documentId];
    try {
      storage?.setItem?.(COMMENT_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Schreibfehler bleiben absichtlich still: die App soll weiterlaufen.
    }
  };

  return {
    list,

    add(documentId, { pageId, x, y, text }) {
      const timestamp = now();
      const comment = { id: nextId(), pageId, x, y, text: clean(text), createdAt: timestamp, updatedAt: timestamp };
      update(documentId, (current) => [...current, comment]);
      return comment;
    },

    edit(documentId, id, text) {
      const timestamp = now();
      update(documentId, (current) =>
        current.map((comment) => (comment.id === id ? { ...comment, text: clean(text), updatedAt: timestamp } : comment)),
      );
    },

    remove(documentId, id) {
      update(documentId, (current) => current.filter((comment) => comment.id !== id));
    },

    // Neu oder seit der letzten Auswertung geändert.
    pending() {
      const result = {};
      for (const [documentId, comments] of Object.entries(readAll())) {
        const open = (Array.isArray(comments) ? comments : []).filter(
          (comment) => !(comment.processedAt >= comment.updatedAt),
        );
        if (open.length) result[documentId] = open;
      }
      return result;
    },

    markProcessed(documentId, ids, at) {
      update(documentId, (current) =>
        current.map((comment) => (ids.includes(comment.id) ? { ...comment, processedAt: at } : comment)),
      );
    },
  };
}

export const browserCommentRepository = createCommentRepository(globalThis.localStorage);
