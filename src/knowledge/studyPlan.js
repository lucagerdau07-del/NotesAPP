import { extractJson } from "./documentScan.js";

// The school-day baseline provides review time even when no task is due.
export const BASE_MINUTES = 70;
export const MAX_MINUTES = 120;

export const HOMEWORK_MINUTES = 30;
export const EXAM_MINUTES = 180;
export const EXAM_LEAD_DAYS = 10;

export const PLAN_DAYS = 7;
// Learning time happens at school on Wednesdays, so no app time is planned.
export const WEDNESDAY = 3;

export function isoDate(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const dateOf = (iso) => new Date(`${iso}T00:00:00`);

function weekdayOf(iso) {
  return dateOf(iso).getDay();
}

function baseMinutes(iso) {
  const weekday = weekdayOf(iso);
  if (weekday === WEDNESDAY) return 0;
  return weekday >= 1 && weekday <= 5 ? BASE_MINUTES : 0;
}

// setDate preserves the local calendar date across daylight-saving changes.
function daysFrom(startIso, count) {
  const days = [];
  const cursor = dateOf(startIso);
  for (let index = 0; index < count; index += 1) {
    days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function learningDays(startIso, endIso) {
  const days = [];
  const cursor = dateOf(startIso);
  const end = dateOf(endIso);
  while (cursor <= end) {
    const iso = isoDate(cursor);
    if (cursor.getDay() !== WEDNESDAY) days.push(iso);
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function dailyBudgets(events, { today, days = PLAN_DAYS } = {}) {
  const window = daysFrom(today, days);
  const demand = new Map(window.map((iso) => [iso, 0]));

  for (const event of Array.isArray(events) ? events : []) {
    if (!event || event.done) continue;

    const due = event.due < today ? today : event.due;
    let spread = learningDays(today, due);
    if (event.kind === "exam") {
      spread = spread.filter((iso) => iso < due).slice(-EXAM_LEAD_DAYS);
    }
    if (spread.length === 0) spread = [today];

    const minutes = event.kind === "exam" ? EXAM_MINUTES : HOMEWORK_MINUTES;
    const share = minutes / spread.length;
    for (const iso of spread) {
      if (demand.has(iso)) demand.set(iso, demand.get(iso) + share);
    }
  }

  return window.map((iso) => {
    if (weekdayOf(iso) === WEDNESDAY) return { date: iso, budgetMinutes: 0 };
    const total = baseMinutes(iso) + demand.get(iso);
    return { date: iso, budgetMinutes: Math.min(MAX_MINUTES, Math.round(total)) };
  });
}

const MIN_BLOCK_MINUTES = 5;

const PLAN_SYSTEM_PROMPT = [
  "Du bist der Lernplaner einer Schul-Notizbuch-App. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"days":{"YYYY-MM-DD":[{"subject":"","task":"","minutes":0}]}}',
  "Du bekommst für jeden Tag ein festes Minutenbudget. Die Summe der Blockminuten eines Tages darf dieses Budget nicht überschreiten.",
  "Tage mit Budget 0 bekommen keine Blöcke.",
  "Plane vorrangig, was fällig ist: nahe Hausaufgaben zuerst, Klausurstoff verteilt über die Tage davor.",
  "Ist Budget übrig, plane Wiederholung mit den genannten Begriffen und Fächern.",
  "Jede Aufgabe ist ein kurzer, konkreter deutscher Satz, kein Schlagwort.",
].join("\n");

function planRequest({ events, terms, subjects, budgets, today }) {
  const open = events.filter((event) => !event.done);
  return [
    `Heutiges Datum: ${today}.`,
    "",
    "Budgets (Minuten je Tag, unveränderlich):",
    ...budgets.map((day) => `- ${day.date}: ${day.budgetMinutes}`),
    "",
    "Offene Termine:",
    ...(open.length
      ? open.map(
          (event) =>
            `- ${event.due} · ${event.kind === "exam" ? "Klausur" : "Hausaufgabe"} · ${event.subject || "ohne Fach"} · ${event.title}`,
        )
      : ["- keine"]),
    "",
    `Fächer im Stundenplan: ${subjects.length ? subjects.join(", ") : "unbekannt"}.`,
    "",
    "Begriffe für Wiederholung:",
    ...(terms.length
      ? terms.slice(0, 40).map((term) => `- ${term.subject || "ohne Fach"}: ${term.term}`)
      : ["- keine"]),
  ].join("\n");
}

// Die harte Grenze: was das Modell auch liefert, ein Tag bekommt nie mehr
// Minuten als sein berechnetes Budget, und ein Tag mit Budget 0 bleibt leer.
function fitBlocks(blocks, budgetMinutes) {
  if (budgetMinutes <= 0) return [];
  const fitted = [];
  let remaining = budgetMinutes;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (remaining <= 0) break;
    const task = String(block?.task ?? "").trim().slice(0, 200);
    if (!task) continue;
    const wanted = Math.max(MIN_BLOCK_MINUTES, Math.round(Number(block?.minutes) || 0));
    const minutes = Math.min(remaining, wanted);
    fitted.push({ subject: String(block?.subject ?? "").trim().slice(0, 60), task, minutes });
    remaining -= minutes;
  }
  return fitted;
}

function mostLoadedSubject(events) {
  const counts = new Map();
  for (const event of events) {
    const subject = event.subject || "";
    if (subject) counts.set(subject, (counts.get(subject) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

// Ohne Modellantwort ist der Plan dürftig, aber vorhanden: je fälligem Termin
// ein Block, der Rest Wiederholung im am stärksten belasteten Fach.
function fallbackBlocks(date, events, budgetMinutes) {
  if (budgetMinutes <= 0) return [];
  const open = events.filter((event) => !event.done && event.due >= date);
  const blocks = open.slice(0, 3).map((event) => ({
    subject: event.subject,
    task: event.kind === "exam" ? `Vorbereitung: ${event.title}` : event.title,
    minutes: event.kind === "exam" ? 40 : HOMEWORK_MINUTES,
  }));
  const used = blocks.reduce((total, block) => total + block.minutes, 0);
  if (used < budgetMinutes) {
    blocks.push({
      subject: mostLoadedSubject(open),
      task: "Wiederholung der letzten Stunden",
      minutes: budgetMinutes - used,
    });
  }
  return blocks;
}

export async function buildPlan({ events = [], terms = [], subjects = [], today, complete }) {
  const budgets = dailyBudgets(events, { today });

  let blocksByDate = null;
  try {
    const message = await complete({
      messages: [
        { role: "system", content: PLAN_SYSTEM_PROMPT },
        { role: "user", content: planRequest({ events, terms, subjects, budgets, today }) },
      ],
    });
    const parsed = extractJson(message?.content);
    const days = parsed?.days;
    blocksByDate = days && typeof days === "object" && !Array.isArray(days) ? days : null;
  } catch {
    blocksByDate = null;
  }

  return {
    generatedFor: today,
    days: budgets.map(({ date, budgetMinutes }) => ({
      date,
      budgetMinutes,
      blocks: fitBlocks(
        blocksByDate?.[date] ?? fallbackBlocks(date, events, budgetMinutes),
        budgetMinutes,
      ),
    })),
  };
}
