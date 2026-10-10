import { browserKnowledgeRepository, KNOWLEDGE_CHANGED } from "../knowledge/knowledgeRepository.js";
import { activePrep, isoDate } from "../knowledge/studyPlan.js";
import { lessonSubject, untisIso, untisTime } from "../knowledge/calendarEntries.js";
import { fold, queryTerms } from "../knowledge/sources.js";
import { isLessonCancelled, loadArchivedWeek, untisDateNumber, untisMonday } from "../ink/untisArchive.js";
import { clip } from "./libraryOverview.js";

// Der Schul-Block für den Agenten der Startseite: was offen ist, was heute zu
// lernen ist und was im Stundenplan steht. Er steht in jedem Prompt, also ist
// er knapp und hat ein festes Zeichenbudget. Den vollen Aufgabentext holt der
// Agent erst mit list_tasks.
export const SCHOOL_MAX_CHARS = 900;

const AHEAD_DAYS = 14;
// Nie abgehakte Aufgaben von vor Monaten sind Rauschen, eine Woche zurück reicht.
const OVERDUE_DAYS = 7;
const MAX_TASKS = 8;
const MAX_LISTED = 20;
const TITLE_CHARS = 50;

const KIND = { exam: "Klausur", homework: "HA", review: "Wdh", appointment: "Termin" };
const KIND_WORDS = { exam: "Klausur", homework: "Hausaufgabe", review: "Wiederholung", appointment: "Termin" };
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const HEADER = "Schule. Offen (id, fällig, Art, Fach: Titel):";

const dateOf = (iso) => new Date(`${iso}T00:00:00`);
const shiftIso = (iso, days) => {
  const date = dateOf(iso);
  date.setDate(date.getDate() + days);
  return isoDate(date);
};
// Der Wochentag steht dabei, weil das Modell ihn sonst ausrechnet und sich verrechnet.
const shortDay = (iso) => {
  const date = dateOf(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`;
};
// Eine UUID kostet im Prompt ein Vielfaches, ihr Ende ist eindeutig genug.
// set_task_done löst es wieder auf und meldet Mehrdeutigkeit.
export const shortId = (id) => String(id).slice(-6);
const kindOf = (event) => KIND[event.kind] || KIND.homework;
// Eine vergangene Klausur oder ein vergangener Termin ist vorbei, nicht überfällig.
const canBeOverdue = (event) => event.kind !== "exam" && event.kind !== "appointment";

function openTasks(events, today) {
  const from = shiftIso(today, -OVERDUE_DAYS);
  const to = shiftIso(today, AHEAD_DAYS);
  return events
    .filter(
      (event) =>
        event?.due && !event.done && event.due <= to && (event.due >= today || (event.due >= from && canBeOverdue(event))),
    )
    .sort((a, b) => a.due.localeCompare(b.due) || (a.time || "").localeCompare(b.time || ""));
}

const taskLine = (event, today) =>
  [
    shortId(event.id),
    event.due < today ? "überfällig" : "",
    shortDay(event.due),
    event.time,
    kindOf(event),
    `${event.subject ? `${event.subject}: ` : ""}${clip(String(event.title || ""), TITLE_CHARS)}`,
  ]
    .filter(Boolean)
    .join(" ");

// Heutige Blöcke: erst die Klausurpläne (konkret, vom Nutzer angefordert), dann der Tagesplan.
function planLine(plan, events, today) {
  const examBlocks = events.flatMap((event) =>
    (activePrep(event)?.blocks || [])
      .filter((block) => block.date === today)
      .map((block) => ({ ...block, subject: event.subject || "" })),
  );
  const blocks = [...examBlocks, ...(plan?.days?.find((day) => day.date === today)?.blocks || [])];
  if (blocks.length === 0) return "";
  const parts = blocks
    .slice(0, 4)
    .map((block) => `${block.subject ? `${block.subject} ` : ""}${block.minutes} Min ${clip(block.task, TITLE_CHARS)}`);
  return `Lernplan heute: ${parts.join(" | ")}`;
}

// Eine Zeile je Tag, Doppelstunden zusammengefasst.
function lessonLine(lessons, dateNumber, label) {
  const parts = [];
  for (const lesson of lessons.filter((l) => l.date === dateNumber).sort((a, b) => a.startTime - b.startTime)) {
    const state = isLessonCancelled(lesson) ? " entfällt" : lesson.code === "irregular" ? " geändert" : "";
    const name = `${lessonSubject(lesson)}${state}`;
    if (parts.at(-1)?.name !== name) parts.push({ name, time: untisTime(lesson.startTime) });
  }
  return parts.length ? `Stundenplan ${label}: ${parts.map((p) => `${p.time} ${p.name}`).join(", ")}` : "";
}

export function buildSchoolContext(
  { events = [], plan = null, lessons = [], today },
  { maxChars = SCHOOL_MAX_CHARS } = {},
) {
  const open = openTasks(events, today);
  const todayNumber = untisDateNumber(dateOf(today));
  const nextNumber = [...new Set(lessons.map((l) => l.date))].sort((a, b) => a - b).find((d) => d > todayNumber);
  // Reihenfolge ist Rang: passt der Block nicht, fällt von hinten weg.
  const extras = [
    planLine(plan, events, today),
    lessonLine(lessons, todayNumber, "heute"),
    nextNumber ? lessonLine(lessons, nextNumber, shortDay(untisIso(nextNumber))) : "",
  ].filter(Boolean);

  let shown = Math.min(open.length, MAX_TASKS);
  const assemble = () =>
    [
      HEADER,
      ...(open.length === 0 ? [`nichts in den nächsten ${AHEAD_DAYS} Tagen`] : []),
      ...open.slice(0, shown).map((event) => taskLine(event, today)),
      ...(shown < open.length ? [`+${open.length - shown} weitere über list_tasks`] : []),
      ...extras,
    ].join("\n");
  while (assemble().length > maxChars && extras.length > 0) extras.pop();
  while (assemble().length > maxChars && shown > 1) shown -= 1;
  return assemble();
}

// Liest Termine, Lernplan und die archivierten Stundenplan-Wochen (diese und
// die nächste, für den nächsten Schultag nach dem Wochenende).
export function loadSchoolContext({
  repository = browserKnowledgeRepository,
  loadWeek = loadArchivedWeek,
  now = Date.now(),
} = {}) {
  try {
    const { events, plan } = repository.read();
    const lessons = [0, 1].flatMap((offset) => loadWeek(untisMonday(offset)) || []);
    return buildSchoolContext({ events, plan, lessons, today: isoDate(now) });
  } catch {
    return "";
  }
}

// Nur auf der Startseite (AGENT_LIBRARY_TOOLS), wie der Block selbst.
export const SCHOOL_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "Aufgaben, Klausuren und Termine aus dem Kalender mit id und vollem Aufgabentext. Ohne query die offenen, mit query auch erledigte und ältere.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Stichwörter, z.B. Fach oder Thema" },
          all: { type: "boolean", description: "Ohne query: auch erledigte und ältere" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description:
        "Trägt eine Hausaufgabe, Klausur, Wiederholung oder einen Termin in den Kalender ein. Nur auf ausdrücklichen Wunsch.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: Object.keys(KIND), description: "Standard homework" },
          title: { type: "string" },
          subject: { type: "string", description: "Fach, optional" },
          due: { type: "string", description: "JJJJ-MM-TT" },
          time: { type: "string", description: "HH:MM, optional" },
        },
        required: ["title", "due"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_task_done",
      description: "Hakt einen Eintrag ab, done false öffnet ihn wieder. Nur auf ausdrücklichen Wunsch.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, done: { type: "boolean" } },
        required: ["id"],
      },
    },
  },
];

const SCHOOL_TOOL_NAMES = new Set(SCHOOL_TOOLS.map((tool) => tool.function.name));
export const isSchoolTool = (name) => SCHOOL_TOOL_NAMES.has(name);

const changed = () => globalThis.dispatchEvent?.(new Event(KNOWLEDGE_CHANGED));

function listTasks(args, events, today) {
  const terms = queryTerms(args.query || "");
  const distance = (event) => Math.abs(dateOf(event.due) - dateOf(today));
  const found = terms.length
    ? events
        .map((event) => {
          const text = fold(
            `${event.title} ${event.subject || ""} ${KIND_WORDS[event.kind] || ""} ${event.description || ""}`,
          );
          return { event, hits: terms.filter((term) => text.includes(term)).length };
        })
        .filter(({ hits }) => hits > 0)
        // Mehr Treffer zuerst, dann Offenes, dann was dem heutigen Tag am nächsten liegt.
        .sort(
          (a, b) =>
            b.hits - a.hits ||
            Number(Boolean(a.event.done)) - Number(Boolean(b.event.done)) ||
            distance(a.event) - distance(b.event),
        )
        .map(({ event }) => event)
    : args.all === true
      ? [...events].sort((a, b) => b.due.localeCompare(a.due))
      : events
          .filter((event) => !event.done && event.due >= shiftIso(today, -OVERDUE_DAYS))
          .sort((a, b) => a.due.localeCompare(b.due));
  if (found.length === 0)
    return terms.length ? "Kein Eintrag passt. Andere Stichwörter versuchen." : "Keine offenen Einträge.";

  const shown = found.slice(0, MAX_LISTED);
  // Der volle Text nur, wenn die Auswahl schon eng ist, sonst ein Anriss.
  const textChars = shown.length <= 3 ? 1200 : 160;
  const rows = shown.map((event) => {
    const text = String(event.description || "").replace(/\s+/g, " ").trim();
    const files = (event.attachments || []).map((file) => file?.filename).filter(Boolean);
    const topic = String(event.topic || "").trim();
    // Der Klausurplan nur bei enger Auswahl, sonst bläht die Liste auf.
    const prep = shown.length <= 3 ? activePrep(event)?.blocks || [] : [];
    return [
      [
        shortId(event.id),
        `${event.due}${event.time ? ` ${event.time}` : ""}`,
        kindOf(event),
        event.subject || "-",
        `${event.title}${event.done ? " (erledigt)" : ""}`,
      ].join(" | "),
      text ? `  ${clip(text, textChars)}` : "",
      topic ? `  Thema: ${clip(topic, 300)}` : "",
      prep.length
        ? `  Lernplan: ${prep.map((block) => `${shortDay(block.date)} ${block.minutes} Min ${clip(block.task, 90)}`).join(" | ")}`
        : "",
      files.length ? `  Anhänge: ${files.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const more = found.length > shown.length ? ` (${found.length - shown.length} weitere, mit query eingrenzen)` : "";
  return `${shown.length} Einträge${more}. id | fällig | Art | Fach | Titel\n${rows.join("\n")}`;
}

function addTask(args, repository) {
  const title = String(args.title ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const due = String(args.due ?? "");
  const time = String(args.time ?? "");
  if (!title) return "Fehler: title fehlt.";
  // Der Rückweg über isoDate fängt auch den 31. Februar ab.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || isoDate(dateOf(due)) !== due)
    return "Fehler: due muss ein Datum JJJJ-MM-TT sein.";
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return "Fehler: time muss HH:MM sein.";
  const kind = KIND[args.kind] ? args.kind : "homework";
  const event = repository.addEvent({ kind, title, subject: String(args.subject ?? "").slice(0, 60), due, time });
  changed();
  return `Eingetragen: ${KIND_WORDS[kind]} ${shortDay(due)} "${title}" (id ${shortId(event.id)})`;
}

function setTaskDone(args, repository) {
  const id = String(args.id ?? "").trim();
  if (id.length < 4) return "Fehler: id fehlt, sie steht im Abschnitt Schule und in list_tasks.";
  const matches = repository.read().events.filter((event) => String(event.id).endsWith(id));
  if (matches.length === 0) return `Fehler: Eintrag ${id} gibt es nicht.`;
  if (matches.length > 1) return `Fehler: id ${id} ist mehrdeutig, list_tasks zeigt die Einträge.`;
  const done = args.done !== false;
  repository.setEventDone(matches[0].id, done);
  changed();
  return `${done ? "Erledigt" : "Wieder offen"}: ${matches[0].title}`;
}

export function runSchoolTool(
  name,
  args,
  { repository = browserKnowledgeRepository, today = isoDate(Date.now()) } = {},
) {
  if (name === "add_task") return addTask(args, repository);
  if (name === "set_task_done") return setTaskDone(args, repository);
  return listTasks(args, repository.read().events, today);
}
