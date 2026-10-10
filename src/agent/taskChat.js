import { requestCompletion } from "./agentClient.js";
import { buildContext } from "./examAgent.js";
import { browserKnowledgeRepository } from "../knowledge/knowledgeRepository.js";
import { browserMemoryRepository } from "../knowledge/memoryRepository.js";
import { browserFolderRepository } from "../storage/folderRepository.js";

// Der Chat zu einer Aufgabe im Kalender: Auswahl der Aufgabe aus einem
// Kalendereintrag, gedeckelter Kontext und die Startnachricht des Agenten.
const CHAT_KINDS = new Set(["homework", "exam"]);
const MAX_OTHERS = 2;

/**
 * Welche Aufgabe zu einem Kalendereintrag gehört, oder null (kein Chat).
 * @returns {{key, event, others, done}|null} key benennt den Verlauf. Ein Lernblock
 *   teilt ihn mit seiner Aufgabe, einer ohne Aufgabe bekommt einen eigenen.
 */
export function taskForEntry(entry, events = []) {
  if (!entry) return null;
  if (entry.event) {
    if (!CHAT_KINDS.has(entry.event.kind)) return null;
    return { key: entry.event.id, event: entry.event, others: [], done: Boolean(entry.event.done) };
  }
  if (entry.type !== "study") return null;
  const byId = new Map(events.map((event) => [event.id, event]));
  const linked = (entry.eventIds || []).map((id) => byId.get(id)).filter(Boolean);
  if (linked.length > 0) {
    const open = linked.filter((event) => !event.done);
    const [event, ...rest] = open.length > 0 ? open : linked;
    return { key: event.id, event, others: rest.slice(0, MAX_OTHERS), done: open.length === 0 };
  }
  return {
    key: entry.id,
    event: { id: entry.id, kind: "study", title: entry.title, subject: entry.subject, due: entry.date },
    others: [],
    done: Boolean(entry.done),
  };
}

/** Der Aufgabenblock des Systemprompts, gedeckelt (CONTEXT_MAX_CHARS). */
export function buildTaskContext(
  task,
  {
    repository = browserKnowledgeRepository,
    memory = () => browserMemoryRepository.list(),
    folders = () => browserFolderRepository.listFolders(),
  } = {},
) {
  const { terms } = repository.read();
  return buildContext({
    event: task.event,
    terms,
    memory: memory(),
    folders: folders(),
    study: task.event.study || null,
    others: task.others,
    attachments: task.event.attachments || [],
  });
}

export const START_PROMPT = [
  "Du bist der Helfer für genau eine Schulaufgabe, ihre Daten stehen unten. Schreibe die erste Chat-Nachricht an den Schüler, auf Deutsch, in Markdown, höchstens 110 Wörter.",
  "Sag in einem Satz, worum es geht, dann 3 bis 5 konkrete Vorschläge als Liste, was du für DIESE Aufgabe tun kannst, und frage, womit du anfangen sollst.",
  "Du kannst: im Web und in den Quellen der Bibliothek recherchieren, Anhänge der Aufgabe lesen (PDF, Bild, Text), freie Bilder suchen (mit Quelle und Lizenz), rechnen, Lösungen erklären und Dateien erstellen (PDF, Word, PowerPoint, Tabelle, Karteikarten).",
  "Kannst du das Ganze nicht fertig liefern, biete Teilschritte an: Inhalt recherchieren, Gliederung, Folientexte, Bilder suchen. Gibt es Anhänge, biete an, sie zu lesen.",
  'Biete nur an, tu jetzt nichts davon. Keine Begrüßungsfloskel, nie "-" als Gedankenstrich und nie ";".',
].join("\n");

/** Ein Aufruf ohne Werkzeuge. Wirft mit einer Meldung, wenn nichts zurückkommt. */
export async function generateStartMessage({ context, model, signal, complete = requestCompletion }) {
  const reply = await complete({
    model,
    signal,
    messages: [
      { role: "system", content: START_PROMPT },
      { role: "user", content: context },
    ],
  });
  const text = String((reply?.message ?? reply)?.content ?? "").trim();
  if (!text) throw new Error("Der Agent hat nicht geantwortet.");
  return text;
}
