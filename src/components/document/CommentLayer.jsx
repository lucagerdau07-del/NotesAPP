import React, { useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { MAX_COMMENT_LENGTH } from "../../knowledge/commentRepository.js";

const POPOVER_WIDTH = 260;
const stop = (event) => event.stopPropagation();

const buttonStyle = (primary) => ({
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: primary ? "#3E7BD8" : "transparent",
  color: "#EFECE4",
  font: "600 12.5px Manrope, sans-serif",
  cursor: "pointer",
});

// Liegt nur im Kommentar-Modus über der Seite: ein Klick ins Leere öffnet das
// Eingabefenster, ein Klick auf einen Marker bearbeitet den Kommentar. Der
// Elternteil blendet die Ebene wieder aus (onSave) - so bleiben Kommentare
// unsichtbar, bis der Kommentar-Knopf erneut gedrückt wird.
// `locate(event)` -> {pageId, x, y} in Seitenkoordinaten, `project(pageId, x, y)`
// -> {x, y} relativ zur Ebene; beide kennen nur der Editor.
export default function CommentLayer({ comments, locate, project, onSave, onRemove }) {
  const layerRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const at = draft && project(draft.pageId, draft.x, draft.y);
  const maxLeft = Math.max(8, (layerRef.current?.clientWidth ?? 0) - POPOVER_WIDTH - 8);

  const save = () => {
    if (!draft.text.trim()) return;
    onSave(draft);
    setDraft(null);
  };

  return (
    <div
      ref={layerRef}
      data-testid="comment-layer"
      style={{ position: "absolute", inset: 0, zIndex: 900, cursor: "crosshair" }}
      // Stift und Maus würden sonst durch den Klick auch zeichnen; Touch bleibt
      // durchlässig, damit Scrollen und Zoomen weiter gehen (Tippen = onClick).
      onPointerDown={(event) => event.pointerType !== "touch" && stop(event)}
      onClick={(event) => {
        const point = locate(event);
        if (point) setDraft({ ...point, text: "" });
      }}
    >
      {comments.map((comment) => {
        const pos = project(comment.pageId, comment.x, comment.y);
        return (
          pos && (
            <button
              key={comment.id}
              type="button"
              title={comment.text}
              aria-label={`Kommentar: ${comment.text}`}
              data-testid="comment-marker"
              onPointerDown={stop}
              onClick={(event) => {
                stop(event);
                setDraft(comment);
              }}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,0.9)",
                background: "#3E7BD8",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <MessageSquare size={14} aria-hidden="true" />
            </button>
          )
        );
      })}
      {draft && at && (
        <div
          role="dialog"
          aria-label="Kommentar"
          data-testid="comment-popover"
          onPointerDown={stop}
          onClick={stop}
          style={{
            position: "absolute",
            left: Math.min(Math.max(8, at.x - POPOVER_WIDTH / 2), maxLeft),
            top: at.y + 22,
            width: POPOVER_WIDTH,
            padding: 10,
            borderRadius: 12,
            background: "rgba(20,20,24,0.96)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            cursor: "default",
          }}
        >
          <textarea
            autoFocus
            rows={3}
            maxLength={MAX_COMMENT_LENGTH}
            value={draft.text}
            placeholder="z. B. Nochmal erklären lassen"
            aria-label="Kommentartext"
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "none",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#EFECE4",
              padding: 8,
              font: "500 13px Manrope, sans-serif",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            {draft.id && (
              <button
                type="button"
                style={{ ...buttonStyle(false), marginRight: "auto", color: "#D8615B" }}
                onClick={() => {
                  onRemove(draft.id);
                  setDraft(null);
                }}
              >
                Löschen
              </button>
            )}
            <button type="button" style={buttonStyle(false)} onClick={() => setDraft(null)}>
              Abbrechen
            </button>
            <button type="button" style={buttonStyle(true)} disabled={!draft.text.trim()} onClick={save}>
              Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
