import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarX2,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  GraduationCap,
  Hourglass,
  NotebookPen,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import useKnowledge from "../hooks/useKnowledge.js";
import { isoDate, isPlanCurrent, planInputsKey } from "../knowledge/studyPlan.js";
import { openIservAttachment, syncIserv } from "../knowledge/iservSync.js";
import {
  ENTRY_TYPES,
  buildCalendarEntries,
  groupByWeek,
  lessonSubject,
  mondaysOfMonth,
  nearestEntry,
  untisTime,
} from "../knowledge/calendarEntries.js";
import { isLessonCancelled, loadArchivedWeek, untisDateNumber } from "../ink/untisArchive.js";
import { iservClient } from "../lib/iservClient.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import "../styles/calendar.css";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const dateOf = (iso) => new Date(`${iso}T00:00:00`);
const shortDate = (iso) => {
  const date = dateOf(iso);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
};
const longDate = (iso) =>
  dateOf(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function EntryIcon({ entry, size = 15 }) {
  const Icon =
    entry.type === "exam" ? GraduationCap
    : entry.type === "appointment" ? CalendarClock
    : entry.type === "lesson" ? (entry.cancelled ? CalendarX2 : Shuffle)
    : entry.type === "review" ? RotateCcw
    : entry.type === "study" ? Hourglass
    : entry.type === "note" ? FileText
    : NotebookPen;
  return <Icon size={size} aria-hidden="true" />;
}

function entryMeta(entry) {
  return [
    entry.time,
    entry.type === "study" && entry.minutes ? `${entry.minutes} min` : "",
    ENTRY_TYPES[entry.type].label,
    entry.type !== "lesson" ? entry.subject : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function NewEntryForm({ initialDate, onCancel, onSave }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("appointment");
  const [due, setDue] = useState(initialDate);
  const [time, setTime] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const valid = title.trim() && due;

  return (
    <form
      className="cal-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSave({ kind, title, due, time, subject, description });
      }}
    >
      <h2 className="cal-detail-title">Neuer Eintrag</h2>
      <fieldset className="cal-segmented">
        <legend className="cal-sr">Art</legend>
        {["appointment", "homework", "exam"].map((value) => (
          <label key={value} className={kind === value ? "is-on" : ""}>
            <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} />
            {ENTRY_TYPES[value].label}
          </label>
        ))}
      </fieldset>
      <div className="cal-group">
        <label className="cal-field">
          <span>Titel</span>
          <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="z. B. Zahnarzt" />
        </label>
        <label className="cal-field">
          <span>Datum</span>
          <input type="date" required value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
        <label className="cal-field">
          <span>Uhrzeit</span>
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <label className="cal-field">
          <span>Fach</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Optional" />
        </label>
      </div>
      <label className="cal-group cal-field cal-field-note">
        <span className="cal-sr">Notiz</span>
        <textarea
          rows={4}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Notiz"
        />
      </label>
      <div className="cal-actions">
        <button type="button" className="cal-button" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="cal-button is-primary" disabled={!valid}>
          Hinzufügen
        </button>
      </div>
    </form>
  );
}

function DayLessons({ lessons }) {
  if (!lessons.length) return null;
  return (
    <section className="cal-detail-section">
      <h3 className="cal-detail-label">Stundenplan an diesem Tag</h3>
      <ul className="cal-group cal-lessons">
        {lessons.map((lesson) => {
          const cancelled = isLessonCancelled(lesson);
          return (
            <li key={`${lesson.id}-${lesson.startTime}`} className={cancelled ? "is-cancelled" : ""}>
              <span className="cal-lesson-time">{untisTime(lesson.startTime)}</span>
              <span className="cal-lesson-subject">{lessonSubject(lesson)}</span>
              <span className="cal-lesson-room">{cancelled ? "Entfall" : lesson.ro?.[0]?.name || ""}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EntryDetail({ entry, notesById, onToggleDone, onRemove, onOpenNote, onOpenAttachment, attachmentError }) {
  const event = entry.event;
  const sourceNote = event && event.sourceNoteId !== "manual" && !event.iservId ? notesById[event.sourceNoteId] : null;
  const lesson = entry.lesson;

  return (
    <>
      <p className="cal-eyebrow" data-type={entry.type}>
        <EntryIcon entry={entry} size={13} />
        {[ENTRY_TYPES[entry.type].label, entry.subject].filter(Boolean).join(" · ")}
      </p>
      <h2 className={`cal-detail-title ${entry.done ? "is-done" : ""}`}>{entry.title}</h2>
      <p className="cal-detail-when">
        {longDate(entry.date)}
        {lesson ? ` · ${untisTime(lesson.startTime)}–${untisTime(lesson.endTime)}` : entry.time ? ` · ${entry.time} Uhr` : ""}
      </p>

      {event?.description && (
        <section className="cal-detail-section">
          <h3 className="cal-detail-label">{event.iservId ? "Aufgabe" : "Notiz"}</h3>
          <div className="cal-group cal-detail-body">{event.description}</div>
        </section>
      )}

      {event?.attachments?.length > 0 && (
        <section className="cal-detail-section">
          <h3 className="cal-detail-label">Anhänge</h3>
          <ul className="cal-group cal-files">
            {event.attachments.map((attachment, index) => (
              <li key={`${entry.id}-${index}`}>
                <button type="button" disabled={!attachment.path} onClick={() => onOpenAttachment(attachment)}>
                  <Paperclip size={14} aria-hidden="true" />
                  <span>{attachment.path ? attachment.filename : `${attachment.filename} (nicht verfügbar)`}</span>
                </button>
              </li>
            ))}
          </ul>
          {attachmentError && <p className="cal-hint" role="status">Anhang konnte nicht geöffnet werden.</p>}
        </section>
      )}

      {entry.type === "study" && (
        <section className="cal-detail-section">
          <div className="cal-group cal-detail-body">
            {entry.minutes} Minuten aus dem Lernplan. Er richtet sich nach deinen offenen Hausaufgaben und Klausuren und wird
            jeden Tag neu berechnet.
          </div>
        </section>
      )}

      {lesson && (lesson.substText || lesson.lstext || lesson.te?.[0]?.name) && (
        <section className="cal-detail-section">
          <h3 className="cal-detail-label">Hinweis aus Untis</h3>
          <div className="cal-group cal-detail-body">
            {[lesson.substText, lesson.lstext, lesson.te?.[0]?.name && `Lehrkraft: ${lesson.te[0].name}`, lesson.ro?.[0]?.name && `Raum: ${lesson.ro[0].name}`]
              .filter((part) => part && part !== "---" && !part.endsWith(": ---"))
              .join("\n")}
          </div>
        </section>
      )}

      <div className="cal-actions">
        {event && (
          <button type="button" className="cal-button is-primary" onClick={() => onToggleDone(event.id, !event.done)}>
            {event.done ? <RotateCcw size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
            {event.done ? "Wieder öffnen" : "Erledigt"}
          </button>
        )}
        {entry.note && (
          <button type="button" className="cal-button is-primary" onClick={() => onOpenNote(entry.note)}>
            <FileText size={15} aria-hidden="true" />
            Notiz öffnen
          </button>
        )}
        {sourceNote && (
          <button type="button" className="cal-button" onClick={() => onOpenNote(sourceNote)}>
            <FileText size={15} aria-hidden="true" />
            Aus „{sourceNote.title || "Unbenannte Notiz"}“
          </button>
        )}
        {event?.sourceNoteId === "manual" && (
          <button type="button" className="cal-button is-destructive" onClick={() => onRemove(event.id)}>
            <Trash2 size={15} aria-hidden="true" />
            Löschen
          </button>
        )}
      </div>
      {event?.iservId && <p className="cal-hint">Aus IServ übernommen.</p>}
    </>
  );
}

export default function CalendarScreen({ onBack, onOpenNote = () => {} }) {
  const notes = useMemo(() => browserNoteRepository.listNotes(), []);
  const knowledge = useKnowledge({ notes, subjects: [], syncIserv });
  const { events, plan, refreshPlan, isPlanning, setEventDone, addEvent, removeEvent, iservState } = knowledge;

  const today = isoDate(Date.now());
  const [month, setMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState(false);
  const listRef = useRef(null);

  // Der Plan wird neu berechnet, sobald er nicht mehr zu heute, den Regeln oder
  // den offenen Aufgaben passt. Der Ref merkt sich, für welchen Stand schon
  // angefragt wurde, damit ein fehlschlagendes Speichern nicht endlos wiederholt.
  const planCurrent = isPlanCurrent(plan, events, today);
  const wantedPlan = `${today}|${planInputsKey(events)}`;
  const planRequestedRef = useRef(null);
  useEffect(() => {
    if (planCurrent || planRequestedRef.current === wantedPlan) return;
    planRequestedRef.current = wantedPlan;
    void refreshPlan();
  }, [planCurrent, wantedPlan, refreshPlan]);

  const lessons = useMemo(
    () => mondaysOfMonth(month.year, month.month).flatMap((monday) => loadArchivedWeek(monday) || []),
    [month],
  );
  const notesById = useMemo(() => Object.fromEntries(notes.map((note) => [note.id, note])), [notes]);
  const entries = useMemo(() => buildCalendarEntries({ events, plan, lessons, notes }), [events, plan, lessons, notes]);
  const monthPrefix = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
  const monthEntries = useMemo(() => entries.filter((entry) => entry.date.startsWith(monthPrefix)), [entries, monthPrefix]);
  const weeks = useMemo(() => groupByWeek(monthEntries, month.year, month.month), [monthEntries, month]);

  const selected =
    monthEntries.find((entry) => entry.id === selectedId) ||
    (monthPrefix === today.slice(0, 7) ? nearestEntry(monthEntries, today) : monthEntries[0]) ||
    null;
  const dayLessons = selected
    ? lessons.filter((lesson) => lesson.date === untisDateNumber(dateOf(selected.date))).sort((a, b) => a.startTime - b.startTime)
    : [];

  // Beim Öffnen und Blättern steht der ausgewählte Tag im Blick, nicht der Monatsanfang.
  const selectedDate = selected?.date;
  useEffect(() => {
    const row = selectedDate && listRef.current?.querySelector(`[data-date="${selectedDate}"]`);
    if (row?.scrollIntoView) row.scrollIntoView({ block: "center" });
    else listRef.current?.scrollTo?.(0, 0);
    // Nur bei einem Monatswechsel springen, nicht bei jedem Antippen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthPrefix]);

  const shiftMonth = (delta) => {
    setMonth(({ year, month: current }) => {
      const next = new Date(year, current + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    setSelectedId(null);
    setCreating(false);
  };

  const goToday = () => {
    const now = new Date();
    setMonth({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedId(null);
  };

  const select = (id) => {
    setSelectedId(id);
    setCreating(false);
    setDetailOpen(true);
    setAttachmentError(false);
  };

  const save = (input) => {
    const event = addEvent(input);
    const date = dateOf(event.due);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
    setSelectedId(`event:${event.id}`);
    setCreating(false);
  };

  const openAttachment = (attachment) => {
    setAttachmentError(false);
    openIservAttachment({ client: iservClient, attachment }).catch(() => setAttachmentError(true));
  };

  return (
    <main className="cal" data-testid="calendar-screen" data-detail-open={detailOpen || creating}>
      <section className="cal-list-pane" aria-label="Einträge">
        <header className="cal-head">
          <button type="button" className="cal-round" onClick={onBack} aria-label="Zurück zur Bibliothek" title="Zurück">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div className="cal-head-text">
            <h1 className="cal-title">Kalender</h1>
            <p className="cal-subtitle">
              {monthEntries.length === 1 ? "1 Eintrag" : `${monthEntries.length} Einträge`}
              {iservState === "error" ? " · IServ nicht erreichbar" : isPlanning ? " · Lernplan wird berechnet" : ""}
            </p>
          </div>
          <button
            type="button"
            className="cal-round"
            onClick={() => void refreshPlan()}
            disabled={isPlanning}
            aria-label="Lernplan neu berechnen"
            title="Lernplan neu berechnen"
            data-testid="plan-refresh"
          >
            <RefreshCw size={16} aria-hidden="true" className={isPlanning ? "cal-spin" : ""} />
          </button>
          <button type="button" className="cal-today" onClick={goToday}>
            Heute
          </button>
        </header>

        <nav className="cal-month" aria-label="Monat wählen">
          <button type="button" className="cal-month-step" onClick={() => shiftMonth(-1)} aria-label="Vorheriger Monat">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h2 className="cal-month-name" aria-live="polite">
            {MONTHS[month.month]} <span>{month.year}</span>
          </h2>
          <button type="button" className="cal-month-step" onClick={() => shiftMonth(1)} aria-label="Nächster Monat">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </nav>

        <div className="cal-scroll" ref={listRef}>
          {weeks.map((week) => (
            <section key={week.from} className="cal-week" aria-label={`Woche ${shortDate(week.from)} bis ${shortDate(week.to)}`}>
              <h3 className="cal-week-name">
                Woche {shortDate(week.from)} – {shortDate(week.to)}
              </h3>
              {week.days.length === 0 && <p className="cal-week-empty">Keine Einträge</p>}
              {week.days.map((day) => {
                const weekday = WEEKDAYS_SHORT[dateOf(day.date).getDay()];
                return (
                  <div
                    key={day.date}
                    className={`cal-day ${day.date === today ? "is-today" : ""} ${day.date < today ? "is-past" : ""}`}
                    data-date={day.date}
                  >
                    <div className="cal-tile" aria-hidden="true">
                      <span className="cal-tile-num">{dateOf(day.date).getDate()}</span>
                      <span className="cal-tile-day">{weekday}</span>
                    </div>
                    <ul className="cal-day-entries" aria-label={longDate(day.date)}>
                      {day.entries.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className={`cal-entry ${entry.done ? "is-done" : ""}`}
                            data-type={entry.type}
                            aria-current={!creating && selected?.id === entry.id ? "true" : undefined}
                            onClick={() => select(entry.id)}
                            data-testid={`cal-entry-${entry.id}`}
                          >
                            <span className="cal-entry-text">
                              <span className="cal-entry-title">{entry.title}</span>
                              <span className="cal-entry-meta">{entryMeta(entry)}</span>
                            </span>
                            <span className="cal-entry-icon">
                              <EntryIcon entry={entry} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <div className="cal-create-bar">
          <button
            type="button"
            className="cal-create"
            onClick={() => {
              setCreating(true);
              setDetailOpen(true);
            }}
          >
            <Plus size={17} aria-hidden="true" />
            Neuer Eintrag
          </button>
        </div>
      </section>

      <aside className="cal-detail" aria-label="Details">
        <button
          type="button"
          className="cal-round cal-detail-close"
          onClick={() => {
            setDetailOpen(false);
            setCreating(false);
          }}
          aria-label="Details schließen"
        >
          <X size={18} aria-hidden="true" />
        </button>
        <div className="cal-detail-inner" key={creating ? "new" : selected?.id || "empty"}>
          {creating ? (
            <NewEntryForm
              initialDate={selected?.date >= today ? selected.date : today}
              onCancel={() => setCreating(false)}
              onSave={save}
            />
          ) : selected ? (
            <>
              <EntryDetail
                entry={selected}
                notesById={notesById}
                onToggleDone={setEventDone}
                onRemove={(id) => {
                  removeEvent(id);
                  setSelectedId(null);
                }}
                onOpenNote={onOpenNote}
                onOpenAttachment={openAttachment}
                attachmentError={attachmentError}
              />
              <DayLessons lessons={dayLessons} />
            </>
          ) : (
            <div className="cal-empty">
              <p className="cal-empty-title">Nichts in diesem Monat</p>
              <p className="cal-hint">Hausaufgaben, Klausuren und Notizen erscheinen hier von selbst. Eigene Termine legst du unten an.</p>
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}
