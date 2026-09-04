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

  for (const [kind, list] of [["homework", raw?.homework], ["exam", raw?.exams]]) {
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
