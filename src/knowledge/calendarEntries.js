import { isoDate } from "./studyPlan.js";
import { isLessonCancelled } from "../ink/untisArchive.js";

// Alles, was die App an Datiertem sammelt, als eine Liste von Kalendereinträgen:
// gefundene und eigene Termine, der Lernplan, Stundenplan-Änderungen und Notizen.
// Die Reihenfolge hier ist auch die Reihenfolge innerhalb eines Tages.
export const ENTRY_TYPES = {
  exam: { label: "Klausur" },
  appointment: { label: "Termin" },
  lesson: { label: "Stundenplan" },
  homework: { label: "Hausaufgabe" },
  review: { label: "Wiederholung" },
  study: { label: "Lernzeit" },
  note: { label: "Notiz" },
};
const TYPE_ORDER = Object.keys(ENTRY_TYPES);

const pad = (n) => String(n).padStart(2, "0");
// Untis liefert 20260924 und 745 statt ISO-Datum und Uhrzeit.
export const untisIso = (number) => {
  const text = String(number);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
};
export const untisTime = (hhmm) => `${pad(Math.floor(hhmm / 100))}:${pad(hhmm % 100)}`;
export const lessonSubject = (lesson) => lesson.su?.[0]?.longname || lesson.su?.[0]?.name || "Unterricht";

function fromEvents(events) {
  return events
    .filter((event) => event?.due)
    .map((event) => ({
      id: `event:${event.id}`,
      type: ENTRY_TYPES[event.kind] ? event.kind : "homework",
      date: event.due,
      time: event.time || "",
      title: event.title,
      subject: event.subject || "",
      done: Boolean(event.done),
      event,
    }));
}

function fromPlan(plan) {
  return (plan?.days || []).flatMap((day) =>
    (day.blocks || []).map((block, index) => ({
      id: `study:${day.date}:${index}`,
      type: "study",
      date: day.date,
      time: "",
      title: block.task,
      subject: block.subject || "",
      minutes: block.minutes,
    })),
  );
}

// Nur was vom normalen Stundenplan abweicht, ist ein Eintrag; die regulären
// Stunden zeigt die Detailansicht des Tages.
function fromLessons(lessons) {
  return lessons
    .map((lesson) => ({ lesson, cancelled: isLessonCancelled(lesson) }))
    .filter(({ lesson, cancelled }) => cancelled || lesson.code === "irregular")
    .map(({ lesson, cancelled }) => ({
      id: `lesson:${lesson.id}:${lesson.date}`,
      type: "lesson",
      date: untisIso(lesson.date),
      time: untisTime(lesson.startTime),
      title: `${lessonSubject(lesson)} ${cancelled ? "entfällt" : "geändert"}`,
      subject: lessonSubject(lesson),
      cancelled,
      lesson,
    }));
}

function fromNotes(notes) {
  return notes
    .filter((note) => Number.isFinite(note?.createdAt))
    .map((note) => ({
      id: `note:${note.id}`,
      type: "note",
      date: isoDate(note.createdAt),
      time: "",
      title: note.title || "Unbenannte Notiz",
      subject: note.subject || "",
      note,
    }));
}

export function compareEntries(left, right) {
  return (
    left.date.localeCompare(right.date) ||
    // Einträge mit Uhrzeit zuerst, wie in einem Tageskalender.
    (left.time ? 0 : 1) - (right.time ? 0 : 1) ||
    left.time.localeCompare(right.time) ||
    TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type)
  );
}

export function buildCalendarEntries({ events = [], plan = null, lessons = [], notes = [] }) {
  return [...fromEvents(events), ...fromPlan(plan), ...fromLessons(lessons), ...fromNotes(notes)].sort(
    compareEntries,
  );
}

const dateOf = (iso) => new Date(`${iso}T00:00:00`);

// Die Wochen (Mo-So) eines Monats, jeweils auf die Tage dieses Monats beschnitten.
export function weeksOfMonth(year, month) {
  const weeks = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    const days = [];
    do {
      days.push(isoDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    } while (cursor.getMonth() === month && cursor.getDay() !== 1);
    weeks.push(days);
  }
  return weeks;
}

// Die Montage aller Wochen, die den Monat berühren - für das Untis-Archiv.
export function mondaysOfMonth(year, month) {
  return weeksOfMonth(year, month).map((days) => {
    const monday = dateOf(days[0]);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
  });
}

export function groupByWeek(entries, year, month) {
  const byDate = new Map();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date).push(entry);
  }
  return weeksOfMonth(year, month).map((days) => ({
    from: days[0],
    to: days[days.length - 1],
    days: days.filter((iso) => byDate.has(iso)).map((iso) => ({ date: iso, entries: byDate.get(iso) })),
  }));
}

// Der Eintrag, der beim Öffnen gezeigt wird: der nächste ab heute, sonst der letzte davor.
export function nearestEntry(entries, today) {
  return entries.find((entry) => entry.date >= today) || entries[entries.length - 1] || null;
}
