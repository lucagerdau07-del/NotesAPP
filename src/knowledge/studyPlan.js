import { extractJson } from "./documentScan.js";

// Zuhause-Grundlast an einem Schultag ohne eigene Schul-Lernzeit.
export const BASE_MINUTES = 70;
// Schul-Lernzeit Mo/Di/Do/Fr 9:20-10:25: deckt einen Teil der Grundlast schon ab.
export const LERNZEIT_WEEKDAYS = [1, 2, 4, 5];
export const LERNZEIT_MINUTES = 65;
export const HOME_BASE_MINUTES = Math.max(0, BASE_MINUTES - LERNZEIT_MINUTES);

export const HOMEWORK_MINUTES = 30;
export const EXAM_MINUTES = 180;
export const EXAM_LEAD_DAYS = 10;

// Für Aufgaben, die noch mehrere Tage entfernt sind, nie mehr als das an
// Freizeit verlangen - kurz vor der Frist gilt kein Deckel mehr.
export const FAR_CAP_MINUTES = 60;
export const URGENT_LEAD_DAYS = 2;

// Ohne erkannte Uhrzeit gilt der Abgabetag noch als Arbeitszeit (23:59). Eine
// Abgabe vor Mittag (z.B. vor der ersten Stunde) lässt sich am Abgabetag
// selbst nicht mehr erledigen - der Tag davor ist dann der letzte.
const MORNING_CUTOFF = "12:00";

export const PLAN_DAYS = 7;

export function isoDate(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const dateOf = (iso) => new Date(`${iso}T00:00:00`);
const daysBetween = (fromIso, toIso) => Math.round((dateOf(toIso) - dateOf(fromIso)) / 86400000);

function weekdayOf(iso) {
  return dateOf(iso).getDay();
}

function baseMinutes(iso) {
  const weekday = weekdayOf(iso);
  if (weekday < 1 || weekday > 5) return 0;
  return LERNZEIT_WEEKDAYS.includes(weekday) ? HOME_BASE_MINUTES : BASE_MINUTES;
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

function daysThrough(startIso, endIso) {
  const days = [];
  const cursor = dateOf(startIso);
  const end = dateOf(endIso);
  while (cursor <= end) {
    days.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const dueDayIsWorkable = (event) => !event.time || event.time >= MORNING_CUTOFF;

export function dailyBudgets(events, { today, days = PLAN_DAYS } = {}) {
  const window = daysFrom(today, days);
  const demand = new Map(window.map((iso) => [iso, 0]));
  // Tage mit einer Frist innerhalb der Kulanzfrist: dort gilt der
  // "weit-weg"-Deckel nicht, egal wie viele Aufgaben insgesamt anliegen.
  const urgentDates = new Set();

  const openEvents = (Array.isArray(events) ? events : []).filter(
    (event) => event && !event.done && event.kind !== "appointment",
  );

  for (const event of openEvents) {
    const due = event.due < today ? today : event.due;
    let spread = daysThrough(today, due);
    if (event.kind === "exam" || !dueDayIsWorkable(event)) {
      spread = spread.filter((iso) => iso < due);
    }
    if (event.kind === "exam") {
      spread = spread.slice(-EXAM_LEAD_DAYS);
    }
    if (spread.length === 0) spread = [today];

    const minutes = event.kind === "exam" ? EXAM_MINUTES : HOMEWORK_MINUTES;
    const share = minutes / spread.length;
    for (const iso of spread) {
      if (demand.has(iso)) demand.set(iso, demand.get(iso) + share);
    }

    for (const iso of window) {
      const lead = daysBetween(iso, due);
      if (lead >= 0 && lead <= URGENT_LEAD_DAYS) urgentDates.add(iso);
    }
  }

  return window.map((iso) => {
    const rawDemand = demand.get(iso);
    const cappedDemand = urgentDates.has(iso) ? rawDemand : Math.min(rawDemand, FAR_CAP_MINUTES);
    return { date: iso, budgetMinutes: Math.round(baseMinutes(iso) + cappedDemand) };
  });
}

const MIN_BLOCK_MINUTES = 5;

// "review" ist ein per Kommentar gewünschtes Wiederholen/Nachhilfe und plant wie eine Hausaufgabe.
const KIND_LABELS = { exam: "Klausur", review: "Wiederholung", appointment: "Termin (keine Lernaufgabe)" };

const PLAN_SYSTEM_PROMPT = [
  "Du bist der Lernplaner einer Schul-Notizbuch-App. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"days":{"YYYY-MM-DD":[{"subject":"","task":"","minutes":0}]}}',
  "Du bekommst für jeden Tag ein festes Minutenbudget. Die Summe der Blockminuten eines Tages darf dieses Budget nicht überschreiten.",
  "Tage mit Budget 0 bekommen keine Blöcke.",
  "Plane vorrangig, was fällig ist: nahe Hausaufgaben zuerst, Klausurstoff verteilt über die Tage davor.",
  "Eine Abgabe mit Uhrzeit vor 12:00 ist am Abgabetag selbst nicht mehr zu schaffen - dafür keinen Block mehr an diesem Tag einplanen, nur an den Tagen davor.",
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
            `- ${event.due}${event.time ? ` ${event.time}` : ""} · ${KIND_LABELS[event.kind] || "Hausaufgabe"} · ${event.subject || "ohne Fach"} · ${event.title}`,
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
    const requestedMinutes = Number(block?.minutes);
    if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) continue;
    const wanted = Math.max(MIN_BLOCK_MINUTES, Math.round(requestedMinutes));
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
function fallbackBlocks(date, events, budgetMinutes, today) {
  if (budgetMinutes <= 0) return [];
  const open = events.filter((event) => !event.done && event.kind !== "appointment");
  const dueOn = (event) => (event.due < today ? today : event.due);
  // Am Fälligkeitstag selbst nur noch einplanen, wenn die Abgabe nicht schon vormittags ist.
  const dueFromDate = open
    .filter((event) => date < dueOn(event) || (date === dueOn(event) && dueDayIsWorkable(event)))
    .sort((left, right) => dueOn(left).localeCompare(dueOn(right)));
  const blocks = dueFromDate.slice(0, 3).map((event) => ({
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
        blocksByDate?.[date] ?? fallbackBlocks(date, events, budgetMinutes, today),
        budgetMinutes,
      ),
    })),
  };
}
