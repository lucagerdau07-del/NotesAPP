import { extractJson, replyText } from "./documentScan.js";
import { examSlots, fitBlocks } from "./studyPlan.js";
import { studyHint } from "./examStudy.js";
import { fold, searchSources } from "./sources.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";

// Der Klausurplan: je Lerneinheit vor der Klausur ein oder zwei konkrete Aufgaben
// aus dem angegebenen Thema und den eigenen Notizen. Ein Aufruf, und nur auf
// Knopfdruck im Fenster der Klausur - der tägliche Plan (studyPlan.js) ruft ihn
// nie von selbst. Welche Tage und wie viele Minuten legt examSlots fest, nicht
// das Modell; ein Tag gehört dabei nie zwei Klausuren.
export const TOPIC_MAX_CHARS = 600;

const MAX_TERMS = 12;
const MAX_HITS = 4;
const HIT_CHARS = 260;
const DESCRIPTION_CHARS = 400;

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

const SYSTEM_PROMPT = [
  "Du bist der Lernplaner einer Schul-Notizbuch-App und planst die Vorbereitung auf eine Klausur. Du antwortest ausschließlich mit JSON, ohne Fließtext davor oder danach.",
  'Format: {"days":{"YYYY-MM-DD":[{"task":"","minutes":0}]}}',
  "Plane nur die genannten Tage. Die Minuten je Tag sind eine Obergrenze, kein Soll: plane so viel, wie für das Thema wirklich nötig ist (großer Stoff mehr, kleiner weniger), und lass Tage leer, wenn es reicht. Jeder Block ist eine Lerneinheit nur für diese Klausur. Die Summe der Minuten eines Tages darf die Obergrenze nicht überschreiten.",
  'Jeder Block ist ein kurzer, konkreter deutscher Satz mit Inhalt aus dem Thema: was genau erarbeitet, geübt oder erklärt wird, zum Beispiel "Kettenregel: Regel aufschreiben und fünf Ableitungen üben". Kein Schlagwort wie "Vorbereitung" oder "Wiederholen".',
  "Baue auf: zuerst den Stoff erarbeiten, dann Aufgaben üben, an den letzten Tagen eine Probeklausur und die eigenen Fehler.",
  "Erfinde keine Seitenzahlen, Aufgabennummern oder Inhalte, die weder im Thema noch in den Begriffen oder Notizen stehen.",
  "Richte dich nach den Hinweisen über den Nutzer, etwa Schwächen oder Vorgaben der Lehrkraft.",
].join("\n");

function request({ event, topic, need, slots, terms, material, memory, today }) {
  const subjectTerms = terms
    .filter((term) => !event.subject || fold(term.subject) === fold(event.subject))
    .slice(0, MAX_TERMS);
  const description = oneLine(event.description);
  return [
    `Heute: ${today}.`,
    `Klausur: ${[event.subject, event.title].filter(Boolean).join(" · ")}, ${event.due}${event.time ? ` ${event.time}` : ""}.`,
    `Thema vom Schüler: ${topic || "nicht angegeben, leite es aus Titel, Fach und Notizen ab"}`,
    ...(description ? [`Aufgabenstellung: ${clip(description, DESCRIPTION_CHARS)}`] : []),
    ...(studyHint(event.study) ? [studyHint(event.study)] : []),
    ...(need ? [`Geschätzter Bedarf: ${need.minutes} Min. Zu lernen: ${need.content.join("; ")}`] : []),
    "Tage und Obergrenze:",
    ...slots.map(({ date, minutes }) => `- ${date} (${WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]}): bis ${minutes} Min`),
    ...(subjectTerms.length
      ? ["Begriffe:", ...subjectTerms.map((term) => `- ${term.term}: ${clip(oneLine(term.definition), 90)}`)]
      : []),
    ...(material ? ["Aus eigenen Notizen:", material] : []),
    ...(memory ? [memory] : []),
  ].join("\n");
}

// Die gemerkten Dinge über den Nutzer (memoryRepository) als Hinweis für den Plan.
export const examMemory = (items) =>
  items.length
    ? ["Über den Schüler (Schwächen, Vorgaben der Lehrkräfte):", ...items.map((item) => `- ${item.text}`)].join("\n")
    : "";

/**
 * @returns {Promise<{due, topic, at, blocks: {date, task, minutes}[]}>} Wirft mit
 * einer Meldung für den Nutzer, wenn kein Plan entsteht - ein vorhandener Plan
 * bleibt dann unberührt.
 */
export async function buildExamPrep({
  event,
  events,
  terms = [],
  topic = "",
  material = "",
  memory = "",
  need = null,
  today,
  complete,
  now = Date.now(),
}) {
  const slots = examSlots(events, event, today);
  if (slots.length === 0) throw new Error("Bis zur Klausur bleibt kein freier Lerntag.");

  const cleanTopic = oneLine(topic).slice(0, TOPIC_MAX_CHARS);
  const reply = await complete({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: request({ event, topic: cleanTopic, need, slots, terms, material, memory, today }) },
    ],
  });
  const days = extractJson(replyText(reply))?.days;
  const byDate = days && typeof days === "object" && !Array.isArray(days) ? days : {};

  // Die harte Grenze liegt hier, nicht im Prompt: was das Modell auch liefert,
  // ein Tag bekommt nie mehr als sein Slot, und fremde Tage fallen weg.
  const blocks = slots.flatMap(({ date, minutes }) =>
    fitBlocks(byDate[date], minutes).map(({ task, minutes: taken }) => ({ date, task, minutes: taken })),
  );
  if (blocks.length === 0) throw new Error("Das Modell hat keinen Lernplan geliefert. Später erneut versuchen.");
  return { due: event.due, topic: cleanTopic, at: now, blocks };
}

// Treffer aus den eigenen Notizen und importierten Dokumenten zu Thema, Titel
// und Fach. Wirft nie: ohne Notizen entsteht der Plan aus dem Thema allein.
export async function loadExamMaterial({
  event,
  topic = "",
  notes = () => browserNoteRepository.listNotes(),
  imported = () => browserDocumentRepository.listImportedNotes(),
  search = searchSources,
}) {
  try {
    const query = [topic, event.title, event.subject].filter(Boolean).join(" ");
    const { hits = [] } = await search(query, {
      notes: notes(),
      imported: await Promise.resolve(imported()).catch(() => []),
    });
    return hits
      .slice(0, MAX_HITS)
      .map((hit) => `- ${hit.cite}: ${clip(oneLine(hit.excerpt), HIT_CHARS)}`)
      .join("\n");
  } catch {
    return "";
  }
}
