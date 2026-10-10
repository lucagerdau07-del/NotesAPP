import { requestCompletion } from "./agentClient.js";
import { extractJson, replyText } from "../knowledge/documentScan.js";
import { fold } from "../knowledge/sources.js";
import { browserKnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import { browserMemoryRepository } from "../knowledge/memoryRepository.js";
import { browserFolderRepository } from "../storage/folderRepository.js";
import { activeNeed } from "../knowledge/studyPlan.js";
import { normalizeStudy, studyCounts, studyStatus, weakTopics } from "../knowledge/examStudy.js";

// Der Klausur-Subagent: baut das Dashboard einer Klausur in einem eigenen,
// kleinen Verlauf. Er bekommt nie den Prompt des Haupt-Agenten, nur einen
// Mini-Prompt, drei Lesewerkzeuge und einen gedeckelten Kontext. Der Aufrufer
// bekommt am Ende eine Zeile, die gelesenen Quellen bleiben hier.
export const CONTEXT_MAX_CHARS = 1600;
export const RESULT_CHARS = 4000;
export const MAX_STEPS = 5;
export const SUBAGENT_TOOLS = ["list_notes", "search_sources", "read_source"];

const WISH_CHARS = 200;
const DESCRIPTION_CHARS = 400;
const MAX_TERMS = 8;
const MAX_FRONTS = 10;
const MAX_MEMORY = 4;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);

export const SYSTEM_PROMPT = [
  "Du baust für eine Klausur ein Lern-Dashboard aus den Quellen der Bibliothek. Du antwortest auf Deutsch.",
  "Vorgehen: search_sources mit Fachbegriffen des Themas (bei bekanntem Ordner mit folderId, mehrere Suchen in einer Antwort), dann read_source für die besten Treffer. Danach antwortest du nur mit einem JSON-Objekt, ohne Text davor oder danach.",
  'Format: {"topics":["Thema"],"cards":[{"topic":"Thema","front":"","back":""}],"quiz":[{"topic":"Thema","q":"","opts":["","",""],"right":0,"why":""}],"sheet":[{"title":"","text":""}]}',
  "topics: 4 bis 8 Themen der Klausur. cards: kurze, prüfbare Karten (Begriff, Regel, Rechenschritt). quiz: Fragen mit 3 bis 4 Optionen, genau eine richtig (right ist ihr Index ab 0), plausible falsche, why erklärt in einem Satz. sheet: Formeln und Merksätze.",
  "Nutze Methoden, Begriffe und Schreibweisen aus den Quellen. Erfinde nichts, was weder in den Quellen noch im Thema steht, lieber weniger Einträge. Gibt es schon Inhalt, liefere nur Neues. Zu schwachen Themen mehr Karten und Fragen.",
].join("\n");

const WEEKDAY_LONG = (iso) => {
  const date = new Date(`${iso}T00:00:00`);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`;
};

export function buildContext({ event, terms = [], memory = [], folders = [], study = null, wish = "" }) {
  const subject = event.subject || "";
  const folder = subject ? folders.find((entry) => fold(entry.name) === fold(subject)) : null;
  const description = oneLine(event.description);
  const need = activeNeed(event);
  const counts = studyCounts(study);
  const weak = weakTopics(study, 3);
  const fronts = (study?.cards || []).slice(0, MAX_FRONTS).map((card) => clip(card.front, 40));
  const subjectTerms = terms
    .filter((term) => !subject || fold(term.subject) === fold(subject))
    .slice(0, MAX_TERMS)
    .map((term) => term.term);
  const notes = subject
    ? memory.filter((item) => fold(item.text).startsWith(fold(subject))).slice(0, MAX_MEMORY)
    : [];

  // Reihenfolge ist Rang: passt der Kontext nicht, fällt von hinten weg.
  const groups = [
    [
      `Klausur: ${[subject, event.title].filter(Boolean).join(" · ")}, ${event.due}${event.time ? ` ${event.time}` : ""}.`,
      `Thema: ${oneLine(event.topic) || "nicht angegeben, leite es aus Titel, Fach und Quellen ab"}`,
      ...(description ? [`Aufgabe: ${clip(description, DESCRIPTION_CHARS)}`] : []),
      ...(need?.content?.length ? [`Zu lernen: ${need.content.join("; ")}`] : []),
    ],
    ...(folder ? [[`Ordner: ${folder.name} (folderId ${folder.id})`]] : []),
    ...(study && counts.topics + counts.cards + counts.quiz > 0
      ? [
          [
            `Vorhanden: ${study.topics.map((topic) => `${topic.title} ${topic.level == null ? "?" : `${topic.level}/3`}`).join(", ") || "keine Themen"}; ${counts.cards} Karten, ${counts.quiz} Fragen.`,
            ...(weak.length ? [`Schwach: ${weak.join(", ")}`] : []),
            ...(fronts.length ? [`Karten schon da: ${fronts.join(" | ")}`] : []),
          ],
        ]
      : []),
    ...(subjectTerms.length ? [[`Begriffe: ${subjectTerms.join(", ")}`]] : []),
    ...(notes.length ? [["Über den Schüler:", ...notes.map((item) => `- ${item.text}`)]] : []),
    ...(oneLine(wish) ? [[`Wunsch: ${clip(oneLine(wish), WISH_CHARS)}`]] : []),
  ];
  const assemble = () => groups.map((group) => group.join("\n")).join("\n");
  while (assemble().length > CONTEXT_MAX_CHARS && groups.length > 1) groups.pop();
  return assemble().slice(0, CONTEXT_MAX_CHARS);
}

function parseArguments(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return null;
  }
}

/**
 * Der Verlauf des Subagenten. Wirft mit einer Meldung für den Nutzer, wenn kein
 * Inhalt entsteht.
 * @returns {Promise<{topics, cards, quiz, sheet}>} Rohinhalt, noch nicht geprüft.
 */
export async function runExamAgent({
  event,
  terms,
  memory,
  folders,
  study,
  wish,
  complete = requestCompletion,
  execute,
  tools,
  maxSteps = MAX_STEPS,
  signal,
}) {
  const allowed = new Set(tools.map((tool) => tool.function.name));
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildContext({ event, terms, memory, folders, study, wish }) },
  ];
  let repaired = false;

  for (let step = 0; step < maxSteps; step += 1) {
    // Im letzten Schritt ohne Werkzeuge: das Modell muss jetzt antworten.
    const reply = await complete({ messages: [...messages], tools: step === maxSteps - 1 ? undefined : tools, signal });
    const message = reply?.message ?? reply;
    const calls = message?.tool_calls || [];
    messages.push({
      role: "assistant",
      content: message?.content ?? null,
      ...(calls.length ? { tool_calls: calls } : {}),
    });

    if (calls.length > 0) {
      for (const call of calls) {
        const name = call.function?.name;
        const args = parseArguments(call.function?.arguments);
        let result;
        if (!allowed.has(name)) result = "Fehler: Werkzeug nicht verfügbar.";
        else if (args === null) result = "Fehler: Die Argumente waren kein gültiges JSON.";
        else {
          try {
            result = await execute(name, args);
          } catch (error) {
            result = `Fehler: ${error.message}`;
          }
        }
        const text = typeof result === "string" ? result : JSON.stringify(result);
        messages.push({ role: "tool", tool_call_id: call.id, content: text.slice(0, RESULT_CHARS) });
      }
      continue;
    }

    const parsed = extractJson(replyText({ message }));
    if (parsed && ["topics", "cards", "quiz", "sheet"].some((key) => Array.isArray(parsed[key]))) return parsed;
    if (repaired) break;
    repaired = true;
    messages.push({
      role: "user",
      content: 'Antworte nur mit dem JSON-Objekt {"topics":[],"cards":[],"quiz":[],"sheet":[]}.',
    });
  }
  throw new Error("Das Modell hat kein Dashboard geliefert. Später erneut versuchen.");
}

// Eine Klausur über ihre ganze id oder die Kurz-id aus dem Schul-Block finden.
function findExam(events, id) {
  const wanted = String(id ?? "").trim();
  if (wanted.length < 4) return { error: "id fehlt, sie steht im Abschnitt Schule und in list_tasks." };
  const exact = events.find((event) => event.id === wanted);
  const matches = exact ? [exact] : events.filter((event) => String(event.id).endsWith(wanted));
  if (matches.length === 0) return { error: `Eintrag ${wanted} gibt es nicht.` };
  if (matches.length > 1) return { error: `id ${wanted} ist mehrdeutig, list_tasks zeigt die Einträge.` };
  if (matches[0].kind !== "exam") return { error: `${matches[0].title} ist keine Klausur.` };
  return { event: matches[0] };
}

/**
 * Baut oder ergänzt das Dashboard einer Klausur und speichert es. Gemeinsamer
 * Weg für den Knopf im Kalender und das Werkzeug build_exam_dashboard.
 * @returns {Promise<{study, line, event}>} Wirft mit einer Meldung für den Nutzer;
 *   ein vorhandenes Dashboard bleibt dann unberührt.
 */
export async function buildExamDashboard({
  id,
  wish = "",
  mode = "add",
  repository = browserKnowledgeRepository,
  complete = requestCompletion,
  execute,
  tools,
  folders = () => browserFolderRepository.listFolders(),
  memory = () => browserMemoryRepository.list(),
  now = Date.now(),
  signal,
}) {
  const { events, terms } = repository.read();
  const found = findExam(events, id);
  if (found.error) throw new Error(found.error);
  const { event } = found;
  if (event.done) throw new Error("Die Klausur ist schon erledigt.");

  const content = await runExamAgent({
    event,
    terms,
    memory: memory(),
    folders: folders(),
    study: event.study || null,
    wish,
    complete,
    execute,
    tools,
    signal,
  });
  const study = normalizeStudy(content, event.study || null, mode === "replace" ? "replace" : "add", now);
  const counts = studyCounts(study);
  if (counts.topics + counts.cards + counts.quiz + counts.sheet === 0) {
    throw new Error("Das Modell hat kein Dashboard geliefert. Später erneut versuchen.");
  }
  repository.setExamStudy(event.id, study);
  const parts = [`${counts.topics} Themen`, `${counts.cards} Karten`, `${counts.quiz} Fragen`];
  const line = `Dashboard ${event.subject || event.title} ${WEEKDAY_LONG(event.due)}: ${parts.join(", ")}`;
  return { study, line, event, status: studyStatus(study) };
}
