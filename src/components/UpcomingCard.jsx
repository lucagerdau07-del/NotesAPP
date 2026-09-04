import React from "react";
import { GraduationCap, NotebookPen } from "lucide-react";

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

function formatDue(due) {
  const date = new Date(`${due}T00:00:00`);
  if (Number.isNaN(date.getTime())) return due;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`;
}

export default function UpcomingCard({ events, onToggle }) {
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
      {events.map((event) => (
        <button
          key={event.id}
          type="button"
          className="agent-card upcoming-row"
          data-testid={`upcoming-${event.id}`}
          data-kind={event.kind}
          onClick={() => onToggle(event.id, true)}
          aria-label={`${event.title} als erledigt abhaken`}
          title="Als erledigt abhaken"
        >
          <span className="upcoming-icon" aria-hidden="true">
            {event.kind === "exam" ? <GraduationCap size={13} /> : <NotebookPen size={13} />}
          </span>
          <span className="upcoming-text">
            <span className="upcoming-title">{event.title}</span>
            <span className="upcoming-meta">
              {[event.subject, formatDue(event.due)].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
      ))}
    </>
  );
}
