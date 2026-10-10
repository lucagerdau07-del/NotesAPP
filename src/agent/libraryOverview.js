import { browserDocumentRepository } from "../storage/documentRepository.js";
import { browserFolderRepository, matchesFolder } from "../storage/folderRepository.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserCardRepository, cardText } from "../knowledge/cardRepository.js";

// Stufe 1 des Kartensystems: der Ordnerbaum mit je einer Karte, immer im
// Systemprompt. Feste Reihenfolge und keine Zeitangaben, damit der Block nur
// wechselt, wenn sich Karten oder Zahlen ändern und der Prompt-Präfix im
// Cache des Modells bleibt. Kürzungsstufen statt Wachstum: die Bibliothek darf
// beliebig groß werden, der Block nicht.
export const OVERVIEW_MAX_CHARS = 2400;

const LEVELS = [
  { card: 220, depth: Infinity },
  { card: 120, depth: Infinity },
  { card: 120, depth: 2 },
  { card: 80, depth: 1 },
];

const HEADER =
  "Bibliothek (Ordner [id], Zahl der Notizen, Karte). Nutze sie, um den Ordner zu wählen, bevor du suchst:";

export const clip = (text, limit) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);
const byName = (a, b) => a.name.localeCompare(b.name, "de");

function render(folders, counts, texts, { card, depth }) {
  const ids = new Set(folders.map((f) => f.id));
  const childrenOf = (parentId) => folders.filter((f) => f.parentId === parentId).sort(byName);
  // Ein Eltern-Verweis auf einen gelöschten Ordner zeigt den Ordner oben.
  const roots = folders.filter((f) => !f.parentId || !ids.has(f.parentId)).sort(byName);
  const lines = [];
  const seen = new Set();
  const visit = (folder, level) => {
    if (seen.has(folder.id)) return;
    seen.add(folder.id);
    const text = texts[folder.id];
    const children = childrenOf(folder.id);
    const folded = children.length > 0 && level >= depth;
    const tail = folded ? ` (Unterordner: ${children.map((c) => c.name).join(", ")})` : "";
    lines.push(
      `${"  ".repeat(level - 1)}${folder.name} [${folder.id}] ${counts[folder.id] || 0}${
        text ? `: ${clip(text, card)}` : ""
      }${tail}`,
    );
    if (!folded) children.forEach((child) => visit(child, level + 1));
  };
  roots.forEach((root) => visit(root, 1));
  return lines;
}

export function buildLibraryOverview(
  { folders = [], counts = {}, texts = {}, unassigned = 0 },
  { maxChars = OVERVIEW_MAX_CHARS } = {},
) {
  if (folders.length === 0 && unassigned === 0) return "";
  const extra = unassigned > 0 ? [`Ohne Ordner: ${unassigned} ${unassigned === 1 ? "Notiz" : "Notizen"}`] : [];
  const assemble = (lines) => [HEADER, ...lines, ...extra].join("\n");

  let lines = [];
  for (const level of LEVELS) {
    lines = render(folders, counts, texts, level);
    if (assemble(lines).length <= maxChars) return assemble(lines);
  }
  // Selbst die engste Stufe passt nicht: Zeilen vom Ende her abwerfen, der
  // Agent holt den Rest mit list_folders.
  const note = "… weitere Ordner mit list_folders";
  while (lines.length > 0 && assemble([...lines, note]).length > maxChars) lines.pop();
  return assemble([...lines, note]);
}

// Liest Ordner, eigene Notizen (synchron), Importe (IndexedDB) und Karten und
// baut daraus den Block. Zählt direkte Notizen je Ordner wie list_folders.
export async function loadLibraryOverview({
  folderRepository = browserFolderRepository,
  noteRepository = browserNoteRepository,
  documentRepository = browserDocumentRepository,
  cardRepository = browserCardRepository,
  maxChars,
} = {}) {
  const folders = folderRepository.listFolders();
  const imported = await documentRepository.listImportedNotes().catch(() => []);
  const notes = [...noteRepository.listNotes(), ...imported];
  const cards = cardRepository.all();

  const counts = {};
  const texts = {};
  for (const folder of folders) {
    counts[folder.id] = notes.filter((note) => matchesFolder(note, folder)).length;
    texts[folder.id] = cardText(cards[folder.id]);
  }
  const unassigned = notes.filter((note) => !folders.some((f) => matchesFolder(note, f))).length;
  return buildLibraryOverview({ folders, counts, texts, unassigned }, { maxChars });
}
