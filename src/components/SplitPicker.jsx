import { useMemo, useState } from "react";
import { X, Search, FileText, PenLine, Presentation } from "lucide-react";
import useDocumentLibrary from "../hooks/useDocumentLibrary.js";
import { browserNoteRepository } from "../storage/noteRepository.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelativeWhen(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const diff = Date.now() - timestamp;
  if (diff < MINUTE) return "gerade eben";
  if (diff < HOUR) return `vor ${Math.round(diff / MINUTE)} Min.`;
  if (diff < DAY) return `vor ${Math.round(diff / HOUR)} Std.`;
  const days = Math.round(diff / DAY);
  if (days === 1) return "gestern";
  if (days < 7) return `vor ${days} Tagen`;
  return new Date(timestamp).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// A lightweight document picker for adding a second or third pane to the
// split-screen workspace. Deliberately not the full Library screen: that
// screen also drives Stundenplan polling, knowledge scanning and the agent
// panel, none of which should run a second time just to pick a document.
export default function SplitPicker({ excludeIds = [], onPick, onClose, documentLibraryOptions }) {
  const documentLibrary = useDocumentLibrary(documentLibraryOptions);
  const [query, setQuery] = useState("");
  const excluded = useMemo(() => new Set(excludeIds.map(String)), [excludeIds]);

  const notes = useMemo(() => {
    const imported = (documentLibrary.importedNotes || []).map((note) => ({
      ...note,
      kind: "imported",
    }));
    const created = browserNoteRepository.listNotes();
    return [...imported, ...created]
      .filter((note) => !excluded.has(String(note.id)))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [documentLibrary.importedNotes, excluded]);

  const filtered = notes.filter((note) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      note.title?.toLowerCase().includes(q) || note.subject?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="split-picker-overlay"
      data-testid="split-picker"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="split-picker">
        <div className="split-picker-head">
          <span className="split-picker-title">Zum Split-Screen hinzufügen</span>
          <button
            className="split-picker-close"
            onClick={onClose}
            title="Abbrechen"
            data-testid="split-picker-close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="split-picker-search">
          <Search size={14} />
          <input
            autoFocus
            placeholder="Notizen durchsuchen"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Notizen durchsuchen"
          />
        </div>
        <div className="split-picker-list">
          {filtered.length === 0 && (
            <div className="split-picker-empty">Keine weiteren Dokumente gefunden.</div>
          )}
          {filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              className="split-picker-row"
              onClick={() => onPick(note)}
              data-testid={`split-picker-item-${note.id}`}
            >
              {note.kind === "imported" ? (
                <FileText size={16} />
              ) : note.pageKind === "whiteboard" ? (
                <Presentation size={16} />
              ) : (
                <PenLine size={16} />
              )}
              <span className="split-picker-row-title">{note.title || "Ohne Titel"}</span>
              {note.subject && <span className="split-picker-row-subject">{note.subject}</span>}
              <span className="split-picker-row-when">{formatRelativeWhen(note.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
