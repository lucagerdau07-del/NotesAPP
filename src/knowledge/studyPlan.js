import { extractJson, replyText } from "./documentScan.js";

// Zuhause-Grundlast an einem Schultag ohne eigene Schul-Lernzeit.
export const BASE_MINUTES = 70;
// Schul-Lernzeit Mo/Di/Do/Fr 9:20-10:25: deckt einen Teil der Grundlast schon ab.
export const LERNZEIT_WEEKDAYS = [1, 2, 4, 5];
export const LERNZEIT_MINUTES = 65;
export const HOME_BASE_MINUTES = Math.max(0, BASE_MINUTES - LERNZEIT_MINUTES);

export const HOMEWORK_MINUTES = 30;
// Standardbedarf einer Klausur; mit Thema bestimmt der Klausurplan ihn selbst.
export const EXAM_MINUTES = 300;
// So viele Tage vor der Klausur beginnt die Vorbereitung frühestens.
export const EXAM_LEAD_DAYS = 14;
// Eine Klausur wird in Lerneinheiten (Lernblöcken) vorbereitet.
// Regelgröße ist eine halbe Stunde; bleiben nur wenige Tage, werden die
// Einheiten länger, aber nie über das Maximum.
export const EXAM_SESSION_MINUTES = 30;
export const EXAM_SESSION_MAX_MINUTES = 90;
// Was an einem vollen Tag weniger Platz lässt, lohnt keine eigene Einheit.
export const EXAM_SESSION_MIN_MINUTES = 15;

// Für Aufgaben, die noch mehrere Tage entfernt sind, nie mehr als das an
// Freizeit verlangen - kurz vor der Frist gilt kein Deckel mehr.
export const FAR_CAP_MINUTES = 60;
export const URGENT_LEAD_DAYS = 2;

// Ohne erkannte Uhrzeit gilt der Abgabetag noch als Arbeitszeit (23:59). Eine
// Abgabe vor Mittag (z.B. vor der ersten Stunde) lässt sich am Abgabetag
// selbst nicht mehr erledigen - der Tag davor ist dann der letzte.
const MORNING_CUTOFF = "12:00";

export const PLAN_DAYS = 7;
// Hochzählen, wenn sich die Planungsregeln ändern: ein gespeicherter Plan mit
// älterer Version wird dann sofort neu berechnet statt erst am nächsten Tag.
export const PLAN_RULES_VERSION = 6;

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

// Der letzte Tag, an dem an einer Aufgabe noch gearbeitet werden kann. Einzige
// Quelle dieser Regel - Budgets, Rückfallplan und Modellprüfung nutzen sie alle.
// Überfälliges und heute früh Fälliges landet auf heute statt ganz zu verschwinden.
export function lastWorkDay(event, today) {
  const due = event.due < today ? today : event.due;
  if (due === today || (event.kind !== "exam" && dueDayIsWorkable(event))) return due;
  const previous = dateOf(due);
  previous.setDate(previous.getDate() - 1);
  return isoDate(previous);
}

const isLearnable = (event) => event && !event.done && event.kind !== "appointment";

// Der zu einer Klausur erstellte Lernplan (examPrep.js). Verschiebt sich die
// Klausur, passen seine Tage nicht mehr, und er zählt nicht mehr.
export const activePrep = (event) =>
  event?.kind === "exam" && !event.done && event.prep?.due === event.due && Array.isArray(event.prep.blocks)
    ? event.prep
    : null;

// Die Schätzung des Vorbereitungsbedarfs (examNeed.js) gilt nur zu Thema und
// Termin, für die sie gemacht wurde.
export const activeNeed = (event) =>
  event?.kind === "exam" && event.need?.due === event.due && event.need?.topic === (event.topic || "") ? event.need : null;

// Alles, wovon der Plan abhängt. Weicht es vom gespeicherten Plan ab (neue
// Aufgabe, andere Frist, erledigt, neuer Klausurplan), ist der Plan veraltet -
// nicht erst morgen.
export function planInputsKey(events) {
  return JSON.stringify(
    (Array.isArray(events) ? events : [])
      .filter(isLearnable)
      .map((event) => [event.kind, event.title, event.subject || "", event.due, event.time || "", activePrep(event)?.at || 0, activeNeed(event)?.at || 0])
      .sort(),
  );
}

export const isPlanCurrent = (plan, events, today) =>
  plan?.generatedFor === today && plan?.rules === PLAN_RULES_VERSION && plan?.inputs === planInputsKey(events);

const asList = (events) => (Array.isArray(events) ? events : []);

// Aufgaben (Hausaufgaben wie Lernzeitaufgaben, die Unterscheidung spielt für den
// Plan keine Rolle) tragen oft eine vorgesehene Bearbeitungszeit in der
// Beschreibung: "ca. 30 Minuten", "20-30 min", "1,5 Stunden". Die obere Zahl gilt.
export const TASK_SPREAD_DAYS = 7;
const TIME_PATTERN =
  /(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|bis)\s*(\d+(?:[.,]\d+)?))?\s*(minuten|minute|min|stunden|stunde|std|h)(?![a-zäöüß])/i;

export function estimatedMinutes(event) {
  const match = String(event?.description || "").match(TIME_PATTERN);
  if (!match) return null;
  const value = Number((match[2] || match[1]).replace(",", "."));
  const minutes = /^m/i.test(match[3]) ? value : value * 60;
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(240, Math.max(5, Math.round(minutes))) : null;
}

// Eine Aufgabe, die in einen Lernblock passt, wird an einem Tag in einem Block
// erledigt. Nur größere werden in Teile dieser Größe auf mehrere Tage geteilt.
export const TASK_BLOCK_MINUTES = 60;
// Ein Wochenendtag zählt beim Verteilen so, als wäre er schon so voll.
const WEEKEND_PENALTY = 30;

/**
 * Wann welche Aufgabe gemacht wird: Aufgabe -> Map(Tag -> Minuten). Die früheste
 * Frist wählt zuerst; jedes Stück kommt auf den am wenigsten belegten Tag der
 * letzten TASK_SPREAD_DAYS vor der Frist (bei Gleichstand den früheren), ein
 * Stück je Tag, solange Tage reichen. Klausuren stehen nicht hier.
 */
function placeTasks(open, today) {
  const load = new Map();
  const placed = new Map();
  const tasks = open
    .filter((event) => event.kind !== "exam")
    .sort((a, b) => lastWorkDay(a, today).localeCompare(lastWorkDay(b, today)) || String(a.due).localeCompare(String(b.due)));
  for (const event of tasks) {
    const window = daysThrough(today, lastWorkDay(event, today)).slice(-TASK_SPREAD_DAYS);
    const minutes = estimatedMinutes(event) ?? HOMEWORK_MINUTES;
    const parts = Math.max(1, Math.ceil(minutes / TASK_BLOCK_MINUTES));
    const mine = new Map();
    const cost = (iso) => (load.get(iso) || 0) + ([0, 6].includes(weekdayOf(iso)) ? WEEKEND_PENALTY : 0);
    for (let part = 0; part < parts; part += 1) {
      const free = window.filter((iso) => !mine.has(iso));
      const pool = free.length > 0 ? free : window;
      const day = [...pool].sort((x, y) => cost(x) - cost(y) || x.localeCompare(y))[0];
      const share = minutes / parts;
      mine.set(day, (mine.get(day) || 0) + share);
      load.set(day, (load.get(day) || 0) + share);
    }
    placed.set(event, mine);
  }
  return placed;
}

// Die Minuten je Tag, die alle Aufgaben zusammen verlangen.
function taskDemand(open, today) {
  const demand = new Map();
  for (const mine of placeTasks(open, today).values()) {
    for (const [iso, minutes] of mine) demand.set(iso, (demand.get(iso) || 0) + minutes);
  }
  return demand;
}

/**
 * Wann für welche Klausur gelernt wird: Tag -> [{ id, minutes }].
 *
 * Eine Lerneinheit ist ein Block für genau eine Klausur. An einem Lerntag stehen
 * daneben Aufgaben, und ihr Bedarf wird nie gekürzt;
 * Klausurblöcke bekommen nur, was im Tageslimit (FAR_CAP_MINUTES) danach noch
 * frei ist. Belegt werden die Tage nächst der Klausur; wie viel insgesamt,
 * schätzt das Modell je Klausur (examNeed.js, activeNeed), bis dahin gilt
 * EXAM_MINUTES. Zuerst bekommt jede Klausur eigene Tage; nur wenn
 * der Bedarf so nicht unterkommt, teilen sich zwei Klausuren einen Tag. In den
 * letzten Tagen vor der Klausur gilt kein Limit (URGENT_LEAD_DAYS).
 *
 * Eine Klausur mit eigenem Lernplan hält ihre Tage fest, die übrigen planen um
 * sie herum. `skipId` plant eine Klausur trotz Plan neu.
 */
export function examSchedule(events, today, { skipId = null } = {}) {
  const open = asList(events).filter(isLearnable);
  const tasks = taskDemand(open, today);
  const claimed = new Map();
  const load = (iso) => (claimed.get(iso) || []).reduce((sum, entry) => sum + entry.minutes, 0);
  const claim = (iso, id, minutes) => claimed.set(iso, [...(claimed.get(iso) || []), { id, minutes }]);

  const own = (event) => (event.id === skipId ? null : activePrep(event));
  for (const event of open) {
    for (const block of own(event)?.blocks || []) {
      const held = (claimed.get(block.date) || []).find((entry) => entry.id === event.id);
      if (held) held.minutes += block.minutes;
      else claim(block.date, event.id, block.minutes);
    }
  }

  const plans = open
    .filter((event) => event.kind === "exam" && !own(event))
    .map((exam) => {
      const room = (iso) =>
        daysBetween(iso, exam.due) <= URGENT_LEAD_DAYS
          ? EXAM_SESSION_MAX_MINUTES
          : Math.max(0, FAR_CAP_MINUTES - (tasks.get(iso) || 0));
      const usable = daysThrough(today, lastWorkDay(exam, today))
        .slice(-EXAM_LEAD_DAYS)
        .filter((iso) => room(iso) >= EXAM_SESSION_MIN_MINUTES);
      const total = activeNeed(exam)?.minutes ?? EXAM_MINUTES;
      const wanted = Math.ceil(total / EXAM_SESSION_MINUTES);
      // Wenig Tage heißt längere Blöcke, viele Tage die Regelgröße.
      const size = Math.min(
        EXAM_SESSION_MAX_MINUTES,
        Math.max(EXAM_SESSION_MINUTES, Math.ceil(total / Math.min(usable.length || 1, wanted))),
      );
      return { exam, room, size, usable: new Set(usable), need: total };
    });
  if (plans.length === 0) return claimed;

  // Vom spätesten Tag rückwärts: jeder Tag geht an die Klausur, der noch am
  // meisten fehlt (bei Gleichstand die frühere), so teilen sich nahe Klausuren
  // die Tage, statt dass die erste alle nimmt. Zweiter Durchgang: Reste auf
  // Tagen, die schon einer anderen Klausur gehören.
  const horizon = plans.map((plan) => lastWorkDay(plan.exam, today)).sort().at(-1);
  const days = daysThrough(today, horizon).reverse();
  for (const shared of [false, true]) {
    for (const iso of days) {
      if (!shared && claimed.has(iso)) continue;
      const next = plans
        .filter(
          (plan) =>
            plan.need >= EXAM_SESSION_MIN_MINUTES &&
            plan.usable.has(iso) &&
            !(claimed.get(iso) || []).some((entry) => entry.id === plan.exam.id) &&
            plan.room(iso) - load(iso) >= EXAM_SESSION_MIN_MINUTES,
        )
        .sort((a, b) => b.need - a.need || a.exam.due.localeCompare(b.exam.due))[0];
      if (!next) continue;
      const minutes = Math.min(next.size, Math.floor(next.room(iso) - load(iso)), next.need);
      claim(iso, next.exam.id, minutes);
      next.need -= minutes;
    }
  }
  return claimed;
}

export function dailyBudgets(events, { today, days = PLAN_DAYS } = {}) {
  const window = daysFrom(today, days);
  const open = asList(events).filter(isLearnable);
  const tasks = taskDemand(open, today);
  const exams = examSchedule(open, today);
  // Tage mit einer Frist innerhalb der Kulanzfrist: dort gilt der
  // "weit-weg"-Deckel nicht, egal wie viele Aufgaben insgesamt anliegen.
  const urgentDates = new Set();

  for (const event of open) {
    const due = event.due < today ? today : event.due;
    for (const iso of window) {
      const lead = daysBetween(iso, due);
      if (lead >= 0 && lead <= URGENT_LEAD_DAYS) urgentDates.add(iso);
    }
  }

  return window.map((iso) => {
    const rawDemand = (tasks.get(iso) || 0) + (exams.get(iso) || []).reduce((sum, entry) => sum + entry.minutes, 0);
    const cappedDemand = urgentDates.has(iso) ? rawDemand : Math.min(rawDemand, FAR_CAP_MINUTES);
    return { date: iso, budgetMinutes: Math.round(baseMinutes(iso) + cappedDemand) };
  });
}

export const MIN_BLOCK_MINUTES = 5;

// Die Lerntage einer Klausur mit den Minuten, die der Tagesplan ihr gibt. Daran
// richtet sich der Klausurplan (examPrep.js) aus, so bleiben beide gleich.
export function examSlots(events, event, today) {
  return [...examSchedule(events, today, { skipId: event.id })]
    .flatMap(([date, entries]) =>
      entries.filter((entry) => entry.id === event.id).map((entry) => ({ date, minutes: entry.minutes })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

// "review" ist ein per Kommentar gewünschtes Wiederholen/Nachhilfe und plant wie eine Hausaufgabe.
const KIND_LABELS = { exam: "Klausur", review: "Wiederholung", appointment: "Termin (keine Lernaufgabe)" };

const PLAN_SYSTEM_PROMPT = [
  "Du bist der Lernplaner einer Schul-Notizbuch-App. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"days":{"YYYY-MM-DD":[{"refs":[""],"subject":"","task":"","minutes":0}]}}',
  "Du bekommst für jeden Tag ein festes Minutenbudget. Die Summe der Blockminuten eines Tages darf dieses Budget nicht überschreiten.",
  "Tage mit Budget 0 bekommen keine Blöcke.",
  'Jede Aufgabe hat eine Kennung wie "A1". Ein Block trägt die Kennungen der Aufgaben, an denen er arbeitet, in "refs"; ein Wiederholungsblock hat "refs":[].',
  "Eine Aufgabe darfst du nur an den Tagen einplanen, bei denen sie unter \"möglich\" steht - nie danach, auch nicht am Abgabetag, wenn er dort fehlt.",
  "Ein Block ist ein Lernblock. Er gilt einer Klausur oder einer oder mehreren Aufgaben: mehrere kurze Aufgaben dürfen in einen Block, wenn die Zeit passt, dann steht jede in der Beschreibung. Ein Tag darf Blöcke für Aufgaben und Klausurvorbereitung enthalten; wäge ab, was wie viel drankommt. Was fällig wird, muss erledigt sein: nahe Fristen vor fernen.",
  'Steht bei einer Aufgabe "ca. N Min", ist das die vorgesehene Bearbeitungszeit; richte dich danach.',
  'Eine Aufgabe, die in einen Block passt, erledigst du an einem Tag in einem Block, am besten an dem Tag, der unter "vorgesehen" steht. Nur große Aufgaben teilst du auf mehrere Tage.',
  'Für eine Klausur lernst du nur an Tagen, an denen sie unter "Klausur" steht, höchstens mit den genannten Minuten. Zwei Klausuren an einem Tag nur, wenn es nicht anders geht.',
  "Ist Budget übrig, plane Wiederholung mit den genannten Begriffen und Fächern.",
  "Jede Aufgabe ist ein kurzer, konkreter deutscher Satz, kein Schlagwort.",
].join("\n");

// Kennung je lernbarer Aufgabe, damit sich jeder Modellblock eindeutig prüfen lässt.
const refsOf = (events) => new Map(events.filter(isLearnable).map((event, index) => [`A${index + 1}`, event]));

// Eine Klausur ist nur an dem Tag möglich, an dem sie ihre Lerneinheit hat.
const barredOn = (event, date, today, schedule) =>
  date > lastWorkDay(event, today) ||
  (event.kind === "exam" && !(schedule.get(date) || []).some((entry) => entry.id === event.id));
const examMinutes = (schedule, date, id) => (schedule.get(date) || []).find((entry) => entry.id === id)?.minutes || 0;

const kindLabel = (event) => KIND_LABELS[event.kind] || "Aufgabe";
const timeNote = (event) => (estimatedMinutes(event) ? ` · ca. ${estimatedMinutes(event)} Min` : "");

function planRequest({ events, terms, subjects, budgets, today, refs, schedule, placed }) {
  const appointments = events.filter((event) => !event.done && event.kind === "appointment");
  const workableOn = (date) =>
    [...refs].filter(([, event]) => !barredOn(event, date, today, schedule)).map(([ref]) => ref);
  const examOn = (date) => {
    const parts = (schedule.get(date) || [])
      .map((entry) => {
        const ref = [...refs].find(([, event]) => event.id === entry.id)?.[0];
        return ref ? `${ref} ${entry.minutes} Min` : "";
      })
      .filter(Boolean);
    return parts.length ? ` · Klausur: ${parts.join(", ")}` : "";
  };
  const plannedOn = (date) => {
    const parts = [...refs]
      .map(([ref, event]) => {
        const minutes = placed.get(event)?.get(date);
        return minutes ? `${ref} ${Math.round(minutes)} Min` : "";
      })
      .filter(Boolean);
    return parts.length ? ` · vorgesehen: ${parts.join(", ")}` : "";
  };
  return [
    `Heutiges Datum: ${today}.`,
    "",
    "Budgets (Minuten je Tag, unveränderlich) und an dem Tag mögliche Aufgaben:",
    ...budgets.map((day) => {
      const possible = workableOn(day.date);
      return `- ${day.date}: ${day.budgetMinutes} Min · möglich: ${possible.length ? possible.join(", ") : "nur Wiederholung"}${plannedOn(day.date)}${examOn(day.date)}`;
    }),
    "",
    "Offene Aufgaben:",
    ...(refs.size
      ? [...refs].map(
          ([ref, event]) =>
            `- ${ref} · fällig ${event.due}${event.time ? ` ${event.time}` : ""} · ${kindLabel(event)} · ${event.subject || "ohne Fach"} · ${event.title}${timeNote(event)}`,
        )
      : ["- keine"]),
    "",
    "Termine (keine Lernaufgaben, nur zur Orientierung):",
    ...(appointments.length
      ? appointments.map((event) => `- ${event.due}${event.time ? ` ${event.time}` : ""} · ${event.title}`)
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
export function fitBlocks(blocks, budgetMinutes) {
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
function fallbackBlocks(date, events, budgetMinutes, today, schedule, placed) {
  if (budgetMinutes <= 0) return [];
  const open = events.filter(isLearnable);
  // Eine Aufgabe steht an dem Tag, auf den placeTasks sie gelegt hat, eine
  // Klausur an ihren Tagen.
  const shareOf = (event) => placed.get(event)?.get(date) || 0;
  const dueFromDate = open
    .filter((event) => !barredOn(event, date, today, schedule))
    .filter((event) => event.kind === "exam" || shareOf(event) > 0)
    .sort((left, right) => lastWorkDay(left, today).localeCompare(lastWorkDay(right, today)));
  const blocks = dueFromDate.slice(0, 3).map((event) => ({
    subject: event.subject,
    task: event.kind === "exam" ? `Vorbereitung: ${event.title}` : event.title,
    minutes:
      event.kind === "exam"
        ? examMinutes(schedule, date, event.id)
        : Math.max(MIN_BLOCK_MINUTES, Math.round(shareOf(event))),
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

// Harte Regel gegen das Modell: kein Block für eine Aufgabe nach ihrem letzten
// Arbeitstag und keiner für eine Klausur außerhalb ihrer Lerneinheit - per
// Kennung, und ohne Kennung über den Aufgabentitel im Text.
function allowedOn(date, today, refs, schedule) {
  const expired = [...refs.values()]
    .filter((event) => barredOn(event, date, today, schedule))
    .map((event) => String(event.title ?? "").trim().toLowerCase())
    .filter(Boolean);
  return (block) => {
    const keys = [block?.ref, ...(Array.isArray(block?.refs) ? block.refs : [block?.refs])]
      .flatMap((value) => String(value ?? "").split(","))
      .map((key) => key.trim())
      .filter(Boolean);
    const found = keys.map((key) => refs.get(key)).filter(Boolean);
    if (found.length > 0) return found.every((event) => !barredOn(event, date, today, schedule));
    const text = String(block?.task ?? "").toLowerCase();
    return !expired.some((title) => text.includes(title));
  };
}

export async function buildPlan({ events = [], terms = [], subjects = [], today, complete }) {
  // Eine Klausur mit eigenem Lernplan (examPrep.js) steht fest und erscheint im
  // Kalender direkt von ihr. Das Modell verteilt nur, was das Tagesbudget
  // darüber hinaus lässt, und sieht die Klausur nicht mehr als offene Aufgabe.
  const reserved = new Map();
  for (const event of events) {
    if (!isLearnable(event)) continue;
    for (const block of activePrep(event)?.blocks || []) {
      reserved.set(block.date, (reserved.get(block.date) || 0) + block.minutes);
    }
  }
  const budgets = dailyBudgets(events, { today }).map(({ date, budgetMinutes }) => ({
    date,
    budgetMinutes: Math.max(0, budgetMinutes - (reserved.get(date) || 0)),
  }));
  const open = events.filter((event) => !activePrep(event));
  const refs = refsOf(open);
  const schedule = examSchedule(events, today);
  const placed = placeTasks(open.filter(isLearnable), today);

  let blocksByDate = null;
  try {
    const reply = await complete({
      messages: [
        { role: "system", content: PLAN_SYSTEM_PROMPT },
        { role: "user", content: planRequest({ events: open, terms, subjects, budgets, today, refs, schedule, placed }) },
      ],
    });
    const parsed = extractJson(replyText(reply));
    const days = parsed?.days;
    blocksByDate = days && typeof days === "object" && !Array.isArray(days) ? days : null;
  } catch {
    blocksByDate = null;
  }

  return {
    generatedFor: today,
    rules: PLAN_RULES_VERSION,
    inputs: planInputsKey(events),
    days: budgets.map(({ date, budgetMinutes }) => ({
      date,
      budgetMinutes,
      blocks: fitBlocks(
        Array.isArray(blocksByDate?.[date])
          ? blocksByDate[date].filter(allowedOn(date, today, refs, schedule))
          : fallbackBlocks(date, open, budgetMinutes, today, schedule, placed),
        budgetMinutes,
      ),
    })),
  };
}
