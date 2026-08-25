import { openDB } from "idb";

export const DOCUMENT_DB_NAME = "notes-app-db";
export const DOCUMENT_DB_VERSION = 1;

export class DocumentRepositoryError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "DocumentRepositoryError";
    this.code = code;
  }
}

export function createDocumentRepository({ dbName = DOCUMENT_DB_NAME } = {}) {
  let dbPromise;
  const database = () => {
    dbPromise ||= openDB(dbName, DOCUMENT_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("files"))
          db.createObjectStore("files", { keyPath: "id" });
        if (!db.objectStoreNames.contains("importedNotes")) {
          const notes = db.createObjectStore("importedNotes", {
            keyPath: "id",
          });
          notes.createIndex("by-updated-at", "updatedAt");
          notes.createIndex("by-subject", "subject");
        }
      },
    });
    return dbPromise;
  };

  return {
    database,
    async saveImportedDocument({ note, file }) {
      const db = await database();
      const transaction = db.transaction(
        ["files", "importedNotes"],
        "readwrite",
      );
      transaction.done.catch(() => {});
      let p1, p2;
      try {
        p1 = transaction.objectStore("files").put(file);
        p2 = transaction.objectStore("importedNotes").put(note);
        await Promise.all([p1, p2, transaction.done]);
        return note;
      } catch (error) {
        if (p1) p1.catch(() => {});
        if (p2) p2.catch(() => {});
        try {
          transaction.abort();
        } catch {}
        throw error;
      }
    },
    async listImportedNotes() {
      const db = await database();
      return (
        await db.getAllFromIndex("importedNotes", "by-updated-at")
      ).reverse();
    },
    async getFile(fileId) {
      return (await database()).get("files", fileId);
    },
    async getDocumentBundle(noteId) {
      const db = await database();
      const note = await db.get("importedNotes", noteId);
      if (!note)
        throw new DocumentRepositoryError(
          "note-missing",
          "Das importierte Dokument wurde nicht gefunden.",
        );
      const file = await db.get("files", note.source?.fileId);
      if (!file)
        throw new DocumentRepositoryError(
          "source-missing",
          "Die Quelldatei wurde nicht gefunden.",
        );
      return { note, file };
    },
    async close() {
      if (dbPromise) (await dbPromise).close();
    },
  };
}

export const browserDocumentRepository = createDocumentRepository();
