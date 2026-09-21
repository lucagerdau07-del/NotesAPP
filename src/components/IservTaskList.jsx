import React from "react";
import { formatDue } from "./UpcomingCard.jsx";

// Offene IServ-Aufgaben zum Aufklappen: Beschreibung, Anhänge, Abhaken.
// Natives <details>, damit Tastatur und Screenreader ohne eigenen Code funktionieren.
export default function IservTaskList({ events, onDone, onOpenAttachment }) {
  return events.map((event) => (
    <details className="plan-term iserv-task" key={event.id} data-testid={`iserv-task-${event.id}`}>
      <summary className="iserv-task-summary">
        <span className="plan-term-name">{event.title}</span>
        <span className="plan-block-meta">
          {[event.subject || "Ohne Fach", formatDue(event.due)].join(" · ")}
        </span>
      </summary>
      <div className="iserv-task-content">
        {event.description && <div className="iserv-task-body">{event.description}</div>}
        {event.attachments?.length > 0 && (
          <ul className="iserv-task-files">
            {event.attachments.map((attachment, index) => (
              <li key={`${event.id}-${index}`}>
                <button
                  type="button"
                  className="plan-chip"
                  disabled={!attachment.path}
                  onClick={() => onOpenAttachment(attachment)}
                >
                  {attachment.path ? attachment.filename : `${attachment.filename} (nicht verfügbar)`}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="plan-chip iserv-task-done" onClick={() => onDone(event.id, true)}>
          Erledigt
        </button>
      </div>
    </details>
  ));
}
