import { requestCompletion } from "../agent/agentClient.js";
import { matchesFolder } from "../storage/folderRepository.js";
import { browserCardRepository, cardText } from "./cardRepository.js";
import { extractJson } from "./documentScan.js";
import { afterIndexing, leadingText } from "./sources.js";

// Karten für den Agenten: je Ordner eine kurze Inhaltsangabe plus eine Zeile je
// Notiz, aus einem einzigen Modellaufruf pro geändertem Ordner. Entwurf und
// Begründung der Zahlen: docs/superpowers/specs/2026-10-10-library-context-
// cards-design.md.

// Tippen in einer Notiz ändert sie ständig; ohne Drossel würde jedes Öffnen
// der Bibliothek einen Aufruf je bearbeitetem Ordner auslösen.
export const MIN_REFRESH_MS = 6 * 60 * 60 * 1000;
// Das Gratiskontingent des Modells ist klein (agentSettings.js). Der Rest
// folgt beim nächsten Öffnen.
export const MAX_CALLS_PER_RUN = 8;
export const MAX_NOTES_PER_CALL = 60;
const FOLDER_CHARS = 220;
const NOTE_CHARS = 140;

export const CARD_PROMPT = [
  "Du schreibst Karten für die Bibliothek einer Schul-Notizbuch-App. Ein Assistent liest sie, um zu entscheiden, wo er nachsehen muss, ohne die Notizen selbst zu lesen.",
  `Eine Karte beantwortet: Was liegt hier, und wofür braucht man es? Nenne die konkreten Themen und Fachbegriffe, die Textsorte (Mitschrift, Arbeitsblatt, Buch, Klausur) und, wenn erkennbar, den Zeitraum. Ordnerkarte höchstens ${FOLDER_CHARS} Zeichen, Notizkarte höchstens ${NOTE_CHARS}.`,
  "Kein Füllwort, kein Gedankenstrich, den Titel nicht wiederholen. Notizen unter \"Unveränderte Notizen\" behalten ihre Karte, schreib sie nicht neu.",
  'Antworte nur mit JSON: {"folder": "...", "notes": {"<id>": "..."}}. Nur ids aus der Eingabe.',
].join("\n");

// djb2, reicht als Fingerabdruck: ein Treffer zweier verschiedener Zustände
// kostet höchstens eine ausgelassene Erneuerung.
function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const clean = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

// Antwort des Modells auf das, was in die Karte darf: nur Strings, gekürzt,
// nur bekannte ids. null, wenn gar kein JSON zu finden ist.
export function parseCards(content, knownIds) {
  const parsed = extractJson(content);
  if (!parsed) return null;
  const notes = {};
  if (parsed.notes && typeof parsed.notes === "object") {
    for (const [id, text] of Object.entries(parsed.notes)) {
      const value = clean(text, NOTE_CHARS);
      if (knownIds.has(id) && value) notes[id] = value;
    }
  }
  return { folder: clean(parsed.folder, FOLDER_CHARS), notes };
}

function depthOf(folder, byId) {
  let depth = 0;
  for (let at = folder, guard = 0; at?.parentId && guard < 50; guard += 1) {
    at = byId.get(at.parentId);
    depth += at ? 1 : 0;
  }
  return depth;
}

function userMessage({ folder, manual, childCards, fresh, kept, previous }) {
  const lines = [`Ordner: ${folder.name}`];
  if (manual) lines.push(`Eigene Beschreibung des Nutzers: ${manual}`);
  if (childCards.length) {
    lines.push("Unterordner:", ...childCards.map((child) => `- ${child.name}: ${child.text}`));
  }
  if (fresh.length) {
    lines.push(
      "Neue oder geänderte Notizen (Karte schreiben):",
      ...fresh.map((e) => `${e.note.id} | ${e.note.title || "(ohne Titel)"} | ${e.excerpt || "(noch ohne Text)"}`),
    );
  }
  if (kept.length) {
    lines.push(
      "Unveränderte Notizen (Karte beibehalten):",
      ...kept.map((e) => `${e.note.id} | ${e.note.title || "(ohne Titel)"} | ${previous[e.note.id] || ""}`),
    );
  }
  return lines.join("\n");
}

// Ein Durchlauf über alle Ordner, Blätter zuerst, weil die Karte eines Ordners
// auch die seiner Unterordner liest. Gibt zurück, was geschah, damit Tests und
// Aufrufer nicht in den Speicher schauen müssen.
export async function generateCards(
  { folders = [], notes = [], imported = [] },
  {
    repository = browserCardRepository,
    complete = requestCompletion,
    excerpt = leadingText,
    docRepository,
    now = Date.now,
  } = {},
) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const cards = repository.all();
  const order = folders
    .map((folder) => ({ folder, depth: depthOf(folder, byId) }))
    .sort(
      (a, b) =>
        b.depth - a.depth ||
        // Fehlende Karte zuerst, dann die am längsten nicht erneuerte.
        (cards[a.folder.id]?.auto?.generatedAt ?? -1) - (cards[b.folder.id]?.auto?.generatedAt ?? -1),
    );

  const result = { calls: 0, generated: [], errors: [] };
  for (const { folder } of order) {
    if (result.calls >= MAX_CALLS_PER_RUN) break;

    const direct = [
      ...notes.filter((note) => matchesFolder(note, folder)).map((note) => ({ note, imported: false })),
      ...imported.filter((note) => matchesFolder(note, folder)).map((note) => ({ note, imported: true })),
    ];
    const childCards = folders
      .filter((child) => child.parentId === folder.id)
      .map((child) => ({ name: child.name, text: cardText(cards[child.id]) }))
      .filter((child) => child.text);
    if (direct.length === 0 && childCards.length === 0) continue;

    try {
      const entries = [];
      for (const item of direct) {
        const { text, pages } = await excerpt(item.note, { imported: item.imported, repository: docRepository });
        entries.push({
          ...item,
          excerpt: text,
          version: item.imported ? `${item.note.updatedAt}:${pages}` : String(item.note.updatedAt),
        });
      }
      const stamp = hash(
        [
          ...entries.map((e) => `${e.note.id}:${e.version}`).sort(),
          ...childCards.map((child) => `${child.name}\n${child.text}`),
        ].join("\n"),
      );

      const auto = cards[folder.id]?.auto;
      if (auto?.stamp === stamp) continue;
      const seen = auto?.seen || {};
      const hasNew = entries.some((e) => !(e.note.id in seen));
      if (auto && !hasNew && now() - (auto.generatedAt || 0) < MIN_REFRESH_MS) continue;

      const previous = auto?.notes || {};
      const isFresh = (e) => seen[e.note.id] !== e.version || !previous[e.note.id];
      const included = [...entries.filter(isFresh), ...entries.filter((e) => !isFresh(e))].slice(
        0,
        MAX_NOTES_PER_CALL,
      );

      result.calls += 1;
      const { message } = await complete({
        messages: [
          { role: "system", content: CARD_PROMPT },
          {
            role: "user",
            content: userMessage({
              folder,
              manual: String(cards[folder.id]?.manual || "").trim(),
              childCards,
              fresh: included.filter(isFresh),
              kept: included.filter((e) => !isFresh(e)),
              previous,
            }),
          },
        ],
      });
      const parsed = parseCards(message?.content, new Set(included.map((e) => e.note.id)));
      if (!parsed) throw new Error("Keine Karte in der Antwort.");

      const nextNotes = {};
      const nextSeen = {};
      for (const e of entries) {
        const id = e.note.id;
        const text = parsed.notes[id] || previous[id];
        if (text) nextNotes[id] = text;
        // Nicht mitgeschickte Notizen (Deckel) bleiben "neu" für den nächsten
        // Lauf; mitgeschickte gelten als gesehen, auch wenn das Modell keine
        // Zeile lieferte, sonst läuft ein leeres Blatt bei jedem Öffnen neu.
        if (included.includes(e)) nextSeen[id] = e.version;
        else if (seen[id] !== undefined) nextSeen[id] = seen[id];
      }
      const next = {
        text: parsed.folder || auto?.text || "",
        notes: nextNotes,
        seen: nextSeen,
        stamp,
        generatedAt: now(),
      };
      repository.setAuto(folder.id, next);
      // Die Elternkarte dieses Laufs liest die frische Karte.
      cards[folder.id] = { ...cards[folder.id], auto: next };
      result.generated.push(folder.id);
    } catch (error) {
      // Eine kaputte Antwort darf die übrigen Ordner nicht blockieren.
      result.errors.push(`${folder.name}: ${error?.message || "Fehler"}`);
    }
  }
  return result;
}

export function queueCardGeneration(scope, deps) {
  return afterIndexing(() => generateCards(scope, deps));
}
