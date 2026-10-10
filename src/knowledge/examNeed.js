import { extractJson, replyText } from "./documentScan.js";
import { activeNeed, activePrep } from "./studyPlan.js";
import { fold } from "./sources.js";
import { studyHint } from "./examStudy.js";

// Wie viel Zeit eine Klausur braucht und was dafür zu lernen ist, je Klausur
// einzeln geschätzt: aus Fach, Thema, Beschreibung, den Begriffen des Fachs, den
// eigenen Notizen und dem, was der Agent über den Nutzer gemerkt hat. Die
// Schätzung legt fest, wie viele Lernblöcke examSchedule vergibt. Ein Aufruf für
// alle Klausuren ohne gültige Schätzung, ausgelöst vom Planen (useKnowledge).
export const NEED_MIN_MINUTES = 60;
export const NEED_MAX_MINUTES = 900;
const MAX_CONTENT = 8;
const MAX_TERMS = 8;

const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);

const SYSTEM_PROMPT = [
  "Du schätzt für Klausuren einer Schülerin oder eines Schülers, wie viel Vorbereitungszeit nötig ist und was dafür zu lernen ist. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"exams":{"E1":{"minutes":0,"content":[""]}}}',
  "Schätze jede Klausur einzeln: Umfang und Schwierigkeit des Stoffs (Thema, Beschreibung, Begriffe, Notizen), das Fach und die Hinweise über den Nutzer, etwa Schwächen. Eine kleine Klausur braucht etwa 90 bis 180 Minuten, großer oder schwieriger Stoff deutlich mehr.",
  "content sind drei bis acht kurze Stichpunkte der Inhalte, die gelernt werden müssen. Erfinde nichts, was weder im Thema noch in den Begriffen oder Notizen steht.",
].join("\n");

// Klausuren, die eine Schätzung brauchen: offen, noch ohne eigenen Plan, ohne
// gültige Schätzung zu Thema und Termin.
export const needsEstimate = (event, today) =>
  event?.kind === "exam" && !event.done && event.due >= today && !activePrep(event) && !activeNeed(event);

export async function estimateExamNeeds({ exams, terms = [], memory = "", materials = {}, today, complete, now = Date.now() }) {
  if (exams.length === 0) return [];
  const keys = new Map(exams.map((event, index) => [`E${index + 1}`, event]));
  const lines = [...keys].flatMap(([key, event]) => {
    const subjectTerms = terms
      .filter((term) => !event.subject || fold(term.subject) === fold(event.subject))
      .slice(0, MAX_TERMS)
      .map((term) => term.term);
    const description = oneLine(event.description);
    return [
      `${key} · ${[event.subject, event.title].filter(Boolean).join(" · ")} · ${event.due}${event.time ? ` ${event.time}` : ""}`,
      `  Thema: ${event.topic ? oneLine(event.topic) : "nicht angegeben"}`,
      ...(description ? [`  Beschreibung: ${clip(description, 300)}`] : []),
      ...(studyHint(event.study) ? [`  ${studyHint(event.study)}`] : []),
      ...(subjectTerms.length ? [`  Begriffe: ${subjectTerms.join(", ")}`] : []),
      ...(materials[event.id] ? [`  Aus Notizen:\n${materials[event.id]}`] : []),
    ];
  });

  const reply = await complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: [`Heute: ${today}.`, ...lines, ...(memory ? [memory] : [])].join("\n") },
    ],
  });
  const answers = extractJson(replyText(reply))?.exams;
  if (!answers || typeof answers !== "object") return [];

  return [...keys].flatMap(([key, event]) => {
    const minutes = Math.round(Number(answers[key]?.minutes));
    if (!Number.isFinite(minutes) || minutes <= 0) return [];
    const content = (Array.isArray(answers[key]?.content) ? answers[key].content : [])
      .map((item) => clip(oneLine(item), 80))
      .filter(Boolean)
      .slice(0, MAX_CONTENT);
    return [
      {
        id: event.id,
        need: {
          minutes: Math.min(NEED_MAX_MINUTES, Math.max(NEED_MIN_MINUTES, minutes)),
          content,
          topic: event.topic || "",
          due: event.due,
          at: now,
        },
      },
    ];
  });
}
