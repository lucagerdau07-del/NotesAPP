import React from "react";
import { GraduationCap, NotebookPen } from "lucide-react";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDue(due) {
  const date = new Date(`${due}T00:00:00`);
  if (Number.isNaN(date.getTime())) return due;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`;
}

function kindLabelOf(kind) {
  return kind === "exam" ? "Klausur" : "Hausaufgabe";
}

function sourceTitleOf(sourceNoteId, sourceNoteTitles) {
  return sourceNoteTitles[sourceNoteId] || sourceNoteId || "Unbekannte Notiz";
}

export default function UpcomingCard({ events, onToggle, sourceNoteTitles = {} }) {
  if (!events.length) {
    return (
      <div
        className="agent-card"
        style={{ color: "rgba(255,255,255,.6)", font: "500 12.5px Manrope,sans-serif" }}
      >
        Nichts Offenes gefunden.
      </div>
    );
  }

  return (
    <>
      {events.map((event) => {
        const kindLabel = kindLabelOf(event.kind);
        const subject = event.subject || "Ohne Fach";
        const due = formatDue(event.due);
        const sourceTitle = sourceTitleOf(event.sourceNoteId, sourceNoteTitles);
        const accessibleLabel = `${kindLabel}: ${event.title}, ${subject}, fällig ${due}, Quelle: ${sourceTitle}. Als erledigt abhaken`;

        return (
          <button
            key={event.id}
            type="button"
            className="agent-card upcoming-row"
            data-testid={`upcoming-${event.id}`}
            data-kind={event.kind}
            onClick={() => onToggle(event.id, true)}
            aria-label={accessibleLabel}
            title="Als erledigt abhaken"
          >
            <span className="upcoming-icon" aria-hidden="true">
              {event.kind === "exam" ? <GraduationCap size={13} /> : <NotebookPen size={13} />}
            </span>
            <span className="upcoming-text">
              <span className="upcoming-title">{event.title}</span>
              <span className="upcoming-meta">{[kindLabel, subject, due].join(" · ")}</span>
              <span className="upcoming-source">Quelle: {sourceTitle}</span>
            </span>
          </button>
        );
      })}
    </>
  );
}
