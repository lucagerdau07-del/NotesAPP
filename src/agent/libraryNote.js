import { createInkDocument, createInkHistory, executeInkCommands } from "../ink/inkDocument.js";
import { browserInkRepository } from "../ink/inkRepository.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserFolderRepository } from "../storage/folderRepository.js";
import { resolvePageStyle } from "../documents/pageStyles.js";
import { newId } from "./agentGeometry.js";

// Lets the start-screen agent write into a note without an editor: the ink
// history is loaded from storage, commands run on it, and every apply is saved
// straight back (same repositories the editor persists through). The agent
// targets one note at a time - create_note/open_note switch it.
export function createLibraryNoteSession({
  inkRepository = browserInkRepository,
  noteRepository = browserNoteRepository,
  folderRepository = browserFolderRepository,
} = {}) {
  let target = null; // { note, history, inkColor }

  const setTarget = (note, history) => {
    target = { note, history, inkColor: resolvePageStyle(note).inkColor };
    return {
      noteId: note.id,
      title: note.title,
      pageKind: note.pageKind || "page",
      pageIds: history.present.pages.map((page) => page.id),
    };
  };

  return {
    get target() {
      return target?.note ?? null;
    },

    api: {
      getDocument: () => target?.history.present ?? null,
      getColor: () => target?.inkColor,
      getPaperStyle: () => target?.history.present.pages[0]?.ruling || "lined",
      apply(commands) {
        if (!target) throw new Error("Keine Notiz als Ziel gesetzt.");
        target.history = executeInkCommands(target.history, commands);
        inkRepository.saveHistory(target.note.id, target.history);
        noteRepository.touchNote(target.note.id);
        return target.history.present;
      },
      hasTarget: () => Boolean(target),

      createNote({ title, folder, kind } = {}) {
        const folders = folderRepository.listFolders();
        const match = folder
          ? folders.find(
              (f) => f.id === folder || f.name.toLowerCase() === String(folder).toLowerCase(),
            )
          : null;
        if (folder && !match)
          return `Fehler: Ordner "${folder}" gibt es nicht. Vorhanden: ${folders.map((f) => f.name).join(", ")}`;
        const pageKind = kind === "whiteboard" ? "whiteboard" : "page";
        // Same shape NewDocumentDialog hands to the editor, so the note opens
        // later exactly like a hand-made one.
        const note = noteRepository.saveNote({
          id: newId("note"),
          title: String(title || "").trim() || (match ? `Neue ${match.name}-Notiz` : "Neue Notiz"),
          subject: match?.name || "",
          pageKind,
          format: "a4-portrait",
          background: "dark",
          ruling: "lined",
        });
        const history = createInkHistory(createInkDocument(note.id, 1, resolvePageStyle(note)));
        inkRepository.saveHistory(note.id, history);
        return setTarget(note, history);
      },

      openNote({ noteId } = {}) {
        const note = noteRepository.listNotes().find((n) => n.id === String(noteId));
        if (!note)
          return `Fehler: Eigene Notiz "${noteId}" gibt es nicht. Importierte PDFs und Bilder lassen sich nicht bearbeiten.`;
        const history =
          inkRepository.loadHistory(note.id) ||
          createInkHistory(createInkDocument(note.id, 1, resolvePageStyle(note)));
        return setTarget(note, history);
      },
    },
  };
}
