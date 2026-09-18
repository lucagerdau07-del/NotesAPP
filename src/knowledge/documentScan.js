import { renderNotePagesOf } from "../documents/notePreview.js";
import { VISION_MODEL_CHAIN } from "../agent/agentSettings.js";

// Der Deckel begrenzt die Kosten eines einzelnen Aufrufs. Längere Notizen
// werden nur bis zur achten Seite gelesen.
export const MAX_SCAN_PAGES = 8;
export const MAX_EVENTS_PER_NOTE = 20;
export const MAX_TERMS_PER_NOTE = 40;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Modellantworten enthalten häufig Fließtext oder einen Codeblock um das JSON.
export function extractJson(text) {
  const source = String(text ?? "");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  const candidates = [
    source.trim(),
    ...(fenced ? [fenced[1].trim()] : []),
    ...(first !== -1 && last >= first ? [source.slice(first, last + 1)] : []),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next representation.
    }
  }
  return null;
}

function cleanText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function validDateText(text) {
  if (!DATE_PATTERN.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Ein Datum weiter als ein Jahr entfernt stammt fast immer aus einer
// Jahreszahl im Notiztext, nicht aus einem echten Termin.
function validDue(due, todayMs) {
  const text = String(due ?? "");
  if (!validDateText(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(time) || !Number.isFinite(todayMs)) return null;
  if (time < todayMs || time - todayMs > YEAR_MS) return null;
  return text;
}

export function validateFindings(raw, { today, fallbackSubject = "" } = {}) {
  const [todayYear, todayMonth, todayDay] = String(today ?? "").split("-").map(Number);
  const todayMs = validDateText(String(today ?? ""))
    ? Date.UTC(todayYear, todayMonth - 1, todayDay)
    : NaN;
  const subjectFallback = cleanText(fallbackSubject, 60);
  const events = [];

  for (const [kind, list] of [["homework", raw?.homework], ["exam", raw?.exams], ["review", raw?.review]]) {
    for (const entry of Array.isArray(list) ? list : []) {
      const title = cleanText(entry?.title, 200);
      const due = validDue(entry?.due, todayMs);
      if (!title || !due) continue;
      events.push({ kind, title, subject: cleanText(entry?.subject, 60) || subjectFallback, due });
    }
  }

  const terms = [];
  for (const entry of Array.isArray(raw?.terms) ? raw.terms : []) {
    const term = cleanText(entry?.term, 200);
    if (!term) continue;
    terms.push({
      term,
      definition: cleanText(entry?.definition, 500),
      subject: cleanText(entry?.subject, 60) || subjectFallback,
    });
  }

  return {
    events: events.slice(0, MAX_EVENTS_PER_NOTE),
    terms: terms.slice(0, MAX_TERMS_PER_NOTE),
  };
}

// JPEG statt PNG und 1000 px statt 1280: für Handschrift gut lesbar, als
// Base64 in einer HTTP-Anfrage rund eine Größenordnung kleiner.
const SCAN_IMAGE_OPTIONS = { maxDimension: 1000, mimeType: "image/jpeg", quality: 0.72 };

export function scanImagesOf(documentId) {
  return renderNotePagesOf(documentId, SCAN_IMAGE_OPTIONS);
}

// Ausgewertet wird nur, was der Schüler per Kommentar markiert hat - nicht mehr
// jede Notiz als Ganzes. Zwei Schritte: erst entscheidet ein billiger Textaufruf,
// ob der Kommentar allein reicht oder die Seite dazu gebraucht wird; nur dann
// wird gerendert und ein Bild geschickt.
export const TRIAGE_SYSTEM_PROMPT = [
  "Ein Schüler hat in einer Notiz Kommentare gesetzt. Du entscheidest je Kommentar, ob der Text allein reicht, um ihn zu verstehen und zu planen, oder ob die Notizseite dazu gebraucht wird.",
  'Die Seite wird gebraucht, wenn der Kommentar auf etwas Sichtbares zeigt ("das hier", "diese Aufgabe", "nochmal erklären") und der Text allein nicht sagt, worum es geht.',
  "Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"comments":[{"n":1,"needsPage":true}]} - n ist die Nummer des Kommentars.',
].join("\n");

export const SCAN_SYSTEM_PROMPT = [
  "Ein Schüler hat in seiner Schulnotiz Kommentare gesetzt. Jeder Kommentar ist ein Auftrag an dich. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  "Ordne jeden Kommentar ein: Hausaufgabe (homework), Klausur- oder Prüfungstermin (exams), Fachbegriff zum Erklären (terms), oder etwas, das der Schüler später wiederholen oder erklärt bekommen möchte, z. B. eine Nachhilfestunde (review).",
  "Format:",
  '{"homework":[{"title":"","subject":"","due":"YYYY-MM-DD"}],"exams":[{"title":"","subject":"","due":"YYYY-MM-DD"}],"review":[{"title":"","subject":"","due":"YYYY-MM-DD"}],"terms":[{"term":"","definition":"","subject":""}]}',
  "Werte nur die Kommentare aus. Die Bilder und der übrige Notizinhalt sind reiner Kontext: was dort steht, aber nicht kommentiert ist, wird ignoriert.",
  "Bei review beschreibt title kurz das Thema. Nennt der Kommentar keinen Termin, wähle einen Tag innerhalb der nächsten drei Tage ab dem heutigen Datum.",
  "Erfinde nichts. Ein leeres Ergebnis ist ein richtiges Ergebnis.",
  "Rechne relative Angaben wie \"bis nächsten Freitag\" in ein absolutes Datum um, ausgehend vom genannten heutigen Datum.",
].join("\n");

const noteLine = (note) =>
  `Notiz: "${note.title || "ohne Titel"}"${note.subject ? ` (Fach: ${note.subject})` : ""}.`;

export async function pagesNeeded(note, comments, { complete, signal }) {
  const message = await complete({
    messages: [
      { role: "system", content: TRIAGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [noteLine(note), ...comments.map((comment, index) => `${index + 1}. ${comment.text}`)].join("\n"),
      },
    ],
    signal,
  });
  const answers = extractJson(message?.content)?.comments;
  // Eine unlesbare Antwort ist kein Grund, Kontext wegzulassen.
  return comments.map((_, index) => {
    const answer = Array.isArray(answers) ? answers.find((entry) => Number(entry?.n) === index + 1) : null;
    return answer?.needsPage !== false;
  });
}

const percent = (value, min, max) =>
  Math.round(Math.min(1, Math.max(0, (value - min) / Math.max(1, max - min))) * 100);

// Ort des Kommentars als Anteil der gerenderten Seite: das Modell sieht das Bild,
// nicht die Seitenkoordinaten.
function commentLine(comment, index, pages) {
  const pageIndex = pages.findIndex((page) => page.id === comment.pageId);
  const page = pages[pageIndex];
  const place = page?.bounds
    ? ` (Bild ${pageIndex + 1}, ${percent(comment.x, page.bounds.minX, page.bounds.maxX)} % von links, ${percent(comment.y, page.bounds.minY, page.bounds.maxY)} % von oben)`
    : "";
  return `${index + 1}. "${comment.text}"${place}`;
}

export async function scanNote(note, comments, { renderPages, complete, today, signal }) {
  const needs = await pagesNeeded(note, comments, { complete, signal });
  const wanted = new Set(comments.filter((_, index) => needs[index]).map((comment) => comment.pageId));
  const pages = wanted.size
    ? renderPages(note.id).filter((page) => wanted.has(page.id)).slice(0, MAX_SCAN_PAGES)
    : [];

  const text = [
    `Heutiges Datum: ${today}.`,
    noteLine(note),
    "Kommentare des Schülers:",
    ...comments.map((comment, index) => commentLine(comment, index, pages)),
    ...(pages.length ? ["Die folgenden Bilder sind die Seiten, auf denen kommentiert wurde."] : []),
  ].join("\n");

  const message = await complete({
    messages: [
      { role: "system", content: SCAN_SYSTEM_PROMPT },
      {
        role: "user",
        content: pages.length
          ? [
              { type: "text", text },
              ...pages.map((page) => ({ type: "image_url", image_url: { url: page.src } })),
            ]
          : text,
      },
    ],
    // Der Space erkennt Bildinhalte selbst und würde ohne models-Angabe
    // auf das bezahlte DeepSeek-Vision-Modell ausweichen.
    ...(pages.length ? { models: VISION_MODEL_CHAIN } : {}),
    signal,
  });

  const parsed = extractJson(message?.content);
  if (!parsed) throw new Error("Antwort des Modells war kein gültiges JSON.");
  return validateFindings(parsed, { today, fallbackSubject: note.subject || "" });
}

// Notizen werden nacheinander ausgewertet, nicht parallel: der Proxy ist eine
// gemeinsame, ratenbegrenzte Ressource, und ein Lauf hat keine Eile.
export async function runScan({
  notes,
  repository,
  commentRepository,
  renderPages,
  complete,
  now,
  today,
  signal,
}) {
  const pending = commentRepository.pending();
  let scanned = 0;
  let lastError = null;
  for (const note of notes.filter((entry) => pending[entry.id])) {
    try {
      const comments = pending[note.id];
      const findings = await scanNote(note, comments, { renderPages, complete, today, signal });
      repository.mergeFindings({ ...findings, sourceNoteId: note.id });
      // Erst nach dem erfolgreichen Merge: ein fehlgeschlagener Kommentar bleibt
      // offen und kommt beim nächsten Lauf wieder dran.
      commentRepository.markProcessed(note.id, comments.map((comment) => comment.id), now);
      repository.markNoteScanned(note.id, now);
      scanned += 1;
    } catch (error) {
      lastError = error?.message || "Unbekannter Fehler beim Auswerten.";
    }
  }

  repository.finishRun({ at: now, error: lastError });
  return { scanned, error: lastError };
}
