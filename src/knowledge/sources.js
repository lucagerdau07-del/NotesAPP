import { requestCompletion } from "../agent/agentClient.js";
import { openImage } from "../documents/imageRuntime.js";
import { fitInside } from "../ink/imageObject.js";
import { browserInkRepository } from "../ink/inkRepository.js";
import { pageObjectsOf } from "../ink/pageObjects.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";

// Quellen für den Agenten, nach dem Vorbild von NotebookLM: jedes importierte
// PDF und Bild wird einmal zu Text, seitenweise in IndexedDB (ocrPages)
// abgelegt und danach nur noch durchsucht, nie wieder komplett ans Modell
// geschickt. Eine Seite ist die Sucheinheit, damit jeder Treffer die Seite
// mitbringt, unter der er zitiert wird.

// Weniger sichtbare Zeichen hat eine PDF-Seite ohne brauchbare Textebene, also
// ein eingescanntes Blatt im PDF. Die geht an das Vision-Modell.
const MIN_TEXT_LAYER_CHARS = 40;
// Kleine Schulbuchschrift braucht mehr Pixel als die Handschrift im Notizscan.
const OCR_EDGE = 1600;
const MAX_HITS = 8;
const EXCERPT_CHARS = 320;
const MAX_READ_PAGES = 3;
const MAX_PAGE_CHARS = 6000;

// In gefalteter Schreibweise (siehe fold): "für" steht hier als "fur".
const STOPWORDS = new Set(
  "aber als am an auch auf aus bei bis das dass dem den der des die du ein eine einem einen einer eines er es fur hat ich ihr im in ist mit nach nicht noch nur oder sich sie sind so uber um und von vor war was wie wir wird zu zum zur".split(
    " ",
  ),
);
const SUFFIXES = ["ern", "en", "er", "es", "e"];
const WORD = /[\p{L}\p{N}]+/gu;

export const OCR_PROMPT = [
  "Du transkribierst eine gescannte oder fotografierte Seite aus einem Buch, Schulbuch oder Arbeitsblatt.",
  "Erste Zeile deiner Antwort: SEITE: und die auf der Seite gedruckte Seitenzahl, oder SEITE: - wenn keine zu sehen ist.",
  "Danach der Text der Seite, wortgetreu und vollständig, in Lesereihenfolge: Spalten nacheinander, Kästen und Bildunterschriften als eigene Absätze.",
  "Nichts zusammenfassen, nichts ergänzen, nichts korrigieren. Unleserliche Stellen als [unleserlich], Abbildungen nur als kurzes [Bild: ...].",
  "Zeilennummern am Rand übernimmst du als [Z. 5] am Anfang der jeweiligen Zeile.",
].join("\n");

const pageCache = new Map();
let lastIndexError = null;
let queue = Promise.resolve();

// Kleinschreibung, Akzente weg (ä → a, é → e, ñ → n). Auf NFC-Text bleibt die
// Länge gleich, Fundstellen im gefalteten Text zeigen also auf dieselbe Stelle
// im Original.
function fold(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

// Nur die Anfrage wird gestutzt: eine Flexionsendung ab, dann zählt jedes
// Wort, das mit dem Rest beginnt. "Revolutionen" findet so "Revolution" und
// "Revolutionsbegriff". Die Seiten selbst bleiben ungestemmt, es gibt also
// keinen Stemmer, der zwischen Index und Anfrage auseinanderlaufen kann.
export function queryTerms(query) {
  const terms = new Set();
  for (const word of fold(query).match(WORD) || []) {
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    const suffix = SUFFIXES.find(
      (ending) => word.endsWith(ending) && word.length - ending.length >= 4,
    );
    const stem = suffix ? word.slice(0, -suffix.length) : word;
    // Ein doppelter Endkonsonant aus dem Plural ("Analphabetinnen",
    // "Kenntnissen") gehört nicht zum Stamm, sonst passt "Analphabetin" nicht.
    const single = stem.replace(/(\p{L})\1$/u, "$1");
    terms.add(single.length >= 4 ? single : stem);
  }
  return [...terms];
}

// Kurze Begriffe müssen als ganzes Wort stehen, sonst findet "rot" auch
// "Rotation". Begriffe bestehen nur aus Buchstaben und Ziffern, brauchen also
// kein Escaping.
function termPattern(term) {
  const end = term.length < 4 ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])${term}${end}`, "gu");
}

// "S." ist die auf der gescannten Seite gedruckte Zahl und passt damit zum
// Klassenexemplar. "PDF-S." zählt Seiten der Datei, und ein PDF aus dem Netz
// ist oft anders umbrochen als das gedruckte Buch.
export function citeOf({ title, kind, page, printedPage }) {
  if (printedPage) return `${title}, S. ${printedPage}`;
  if (kind === "image") return title;
  return `${title}, ${kind === "pdf" ? "PDF-S." : "S."} ${page}`;
}

export function toPage({ noteId, title, kind, index, text, printedPage = null }) {
  const clean = String(text ?? "").normalize("NFC");
  const folded = fold(clean);
  return {
    noteId,
    page: index + 1,
    cite: citeOf({ title, kind, page: index + 1, printedPage }),
    text: clean,
    folded,
    length: (folded.match(WORD) || []).length,
  };
}

// Okapi BM25 mit den üblichen k1 = 1.2 und b = 0.75, IDF in der Variante, die
// bei sehr häufigen Wörtern nicht negativ wird.
// ponytail: jede Suche scannt alle Seiten im Umfang per Regex. Reicht für
// einige tausend Seiten; dauert eine Suche Sekunden, einen invertierten Index
// in IndexedDB anlegen.
export function rankPages(pages, query, limit = MAX_HITS) {
  const patterns = queryTerms(query).map(termPattern);
  if (patterns.length === 0 || pages.length === 0) return [];
  const counts = pages.map((page) =>
    patterns.map((pattern) => page.folded.match(pattern)?.length ?? 0),
  );
  const averageLength =
    pages.reduce((sum, page) => sum + page.length, 0) / pages.length || 1;
  const idf = patterns.map((_, term) => {
    const containing = counts.filter((row) => row[term] > 0).length;
    return Math.log(1 + (pages.length - containing + 0.5) / (containing + 0.5));
  });
  return pages
    .map((page, index) => ({
      page,
      score: counts[index].reduce(
        (sum, tf, term) =>
          sum +
          (idf[term] * tf * 2.2) /
            (tf + 1.2 * (0.25 + (0.75 * page.length) / averageLength)),
        0,
      ),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page }) => ({ page, excerpt: excerptOf(page, patterns) }));
}

// Das Fenster mit den meisten verschiedenen Suchbegriffen, damit eine
// zitatartige Anfrage auf der Passage landet statt auf dem ersten Streutreffer.
function excerptOf(page, patterns) {
  const found = patterns
    .flatMap((pattern, term) =>
      [...page.folded.matchAll(pattern)].map((match) => ({ at: match.index, term })),
    )
    .sort((a, b) => a.at - b.at);
  let best = 0;
  let bestTerms = 0;
  for (const { at } of found) {
    const terms = new Set(
      found
        .filter((hit) => hit.at >= at && hit.at < at + EXCERPT_CHARS - 80)
        .map((hit) => hit.term),
    ).size;
    if (terms > bestTerms) [best, bestTerms] = [at, terms];
  }
  const start = Math.max(0, best - 80);
  const end = start + EXCERPT_CHARS;
  let excerpt = page.text.slice(start, end);
  if (start > 0) excerpt = `…${excerpt.replace(/^\S*\s+/, "")}`;
  if (end < page.text.length) excerpt = `${excerpt.replace(/\s+\S*$/, "")}…`;
  return excerpt.replace(/\s+/g, " ").trim();
}

// Erste Zeile "SEITE: 47" oder "SEITE: -", danach der Seitentext. Klartext
// statt JSON: ein Anführungszeichen im Buchtext kann so nichts zerbrechen.
export function parseOcrReply(content) {
  const lines = String(content ?? "")
    .replace(/```[a-z]*\n?/gi, "")
    .trim()
    .split("\n");
  const head = lines[0].match(/^[\s*_#]*SEITE[\s*_]*:[\s*_]*(.*?)[\s*_]*$/i);
  const printed = head?.[1];
  return {
    printedPage: printed && printed !== "-" ? printed.slice(0, 12) : null,
    text: (head ? lines.slice(1) : lines).join("\n").trim(),
  };
}

// pdf.js liefert positionierte Textstücke, hasEOL markiert ein Zeilenende. Am
// Zeilenende getrennte Wörter werden wieder zusammengesetzt, sonst findet die
// Suche "Revolution" nicht, wenn im PDF "Revolu-" und "tion" steht.
export function textOfContent(content) {
  return (content?.items || [])
    .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : ""}`)
    .join("")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .trim();
}

// JPEG kennt keine Transparenz: ohne weißen Grund würde eine transparente
// PDF-Seite schwarz.
function whiteCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function pdfPageImage(pdfPage) {
  const natural = pdfPage.getViewport({ scale: 1 });
  const viewport = pdfPage.getViewport({
    scale: OCR_EDGE / Math.max(natural.width, natural.height),
  });
  const { canvas, context } = whiteCanvas(viewport.width, viewport.height);
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function imageFileImage(blob) {
  const opened = await openImage(blob);
  try {
    const size = fitInside(opened.width, opened.height, OCR_EDGE);
    const { canvas, context } = whiteCanvas(size.width, size.height);
    context.drawImage(opened.image, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    opened.dispose();
  }
}

async function transcribe(src, complete) {
  const { message } = await complete({
    messages: [
      { role: "system", content: OCR_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Transkribiere diese Seite." },
          // Wie beim Notizscan: ein image_url-Teil lässt den Space selbst auf
          // das Vision-Modell umschalten.
          { type: "image_url", image_url: { url: src } },
        ],
      },
    ],
  });
  return { ...parseOcrReply(message?.content), method: "ocr" };
}

async function indexNote(note, { repository, complete }) {
  const total = note.pages?.length ?? 0;
  const done = new Set(
    (await repository.listOcrPages(note.id)).map((record) => record.pageIndex),
  );
  if (done.size >= total) return;
  const { file } = await repository.getDocumentBundle(note.id);
  const save = async (index, record) => {
    await repository.saveOcrPage(note.id, index, record);
    pageCache.delete(note.id);
  };

  if (note.source?.type !== "pdf") {
    await save(0, await transcribe(await imageFileImage(file.blob), complete));
    return;
  }

  // pdf.js nur laden, wenn wirklich ein PDF zu lesen ist (wie documentImporter).
  const { openPdf } = await import("../documents/pdfRuntime.js");
  const pdf = await openPdf(file.blob);
  try {
    for (let index = 0; index < total; index += 1) {
      if (done.has(index)) continue;
      const pdfPage = await pdf.document.getPage(index + 1);
      try {
        const text = textOfContent(await pdfPage.getTextContent());
        await save(
          index,
          text.replace(/\s/g, "").length >= MIN_TEXT_LAYER_CHARS
            ? { text, printedPage: null, method: "pdf" }
            : await transcribe(await pdfPageImage(pdfPage), complete),
        );
      } finally {
        pdfPage.cleanup();
      }
    }
  } finally {
    await pdf.dispose();
  }
}

// Ein Durchlauf nach dem anderen, egal wie oft angestoßen: die Bibliothek fragt
// bei jedem Öffnen und nach jedem Import, und zwei parallele Läufe würden
// dieselben Seiten doppelt erkennen lassen. Gelesene Seiten werden
// übersprungen, ein abgebrochener Lauf setzt beim nächsten Öffnen dort fort.
// ponytail: läuft nur, solange die App offen ist. Ein großer gescannter Band
// braucht dafür mehrere Sitzungen.
export function queueSourceIndexing(
  notes,
  { repository = browserDocumentRepository, complete = requestCompletion } = {},
) {
  queue = queue
    .then(async () => {
      lastIndexError = null;
      for (const note of notes) {
        try {
          await indexNote(note, { repository, complete });
        } catch (error) {
          // Eine kaputte Datei darf die übrigen nicht blockieren.
          lastIndexError = error?.message || "Texterkennung fehlgeschlagen.";
        }
      }
    })
    .catch(() => {});
  return queue;
}

async function pagesOfImported(note, repository) {
  const cached = pageCache.get(note.id);
  if (cached?.stamp === note.updatedAt) return cached.pages;
  const kind = note.source?.type === "pdf" ? "pdf" : "image";
  const records = await repository.listOcrPages(note.id);
  const pages = records
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((record) =>
      toPage({
        noteId: note.id,
        title: note.title || "Dokument",
        kind,
        index: record.pageIndex,
        text: record.text,
        printedPage: record.printedPage,
      }),
    );
  pageCache.set(note.id, { stamp: note.updatedAt, pages });
  return pages;
}

// Eigene Notizen tragen getippten Text als Textobjekte, der ist ohne
// Texterkennung lesbar. Handschrift bleibt außen vor.
function pagesOfNote(note) {
  const cached = pageCache.get(note.id);
  if (cached?.stamp === note.updatedAt) return cached.pages;
  const inkDoc = browserInkRepository.loadHistory(note.id)?.present;
  const texts = pageObjectsOf(inkDoc).filter(
    (object) => object.type === "text" && object.text?.trim(),
  );
  const pages = (inkDoc?.pages || []).map((page, index) =>
    toPage({
      noteId: note.id,
      title: note.title || "Notiz",
      kind: "note",
      index,
      text: texts
        .filter((object) => object.pageId === page.id)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((object) => object.text)
        .join("\n"),
    }),
  );
  pageCache.set(note.id, { stamp: note.updatedAt, pages });
  return pages;
}

export async function searchSources(
  query,
  { notes = [], imported = [] },
  repository = browserDocumentRepository,
) {
  const importedPages = await Promise.all(
    imported.map((note) => pagesOfImported(note, repository)),
  );
  const hits = rankPages([...notes.flatMap(pagesOfNote), ...importedPages.flat()], query).map(
    ({ page, excerpt }) => ({ noteId: page.noteId, page: page.page, cite: page.cite, excerpt }),
  );
  // Sonst hält das Modell "kein Treffer" für "steht nicht drin", während die
  // Texterkennung eines Buchs noch läuft.
  const unread = imported
    .map((note, index) => ({ note, read: importedPages[index].length, total: note.pages?.length ?? 0 }))
    .filter(({ read, total }) => read < total)
    .map(({ note, read, total }) => `${note.title}: ${read} von ${total} Seiten gelesen`);
  return {
    hits,
    ...(unread.length ? { unread, ...(lastIndexError ? { error: lastIndexError } : {}) } : {}),
    ...(hits.length
      ? {}
      : { hint: "Keine Treffer. Mit Synonymen oder einzelnen Stichwörtern erneut suchen." }),
  };
}

export async function readSource(
  { noteId, page, count },
  { notes = [], imported = [] },
  repository = browserDocumentRepository,
) {
  const own = notes.find((note) => note.id === noteId);
  const importedNote = imported.find((note) => note.id === noteId);
  if (!own && !importedNote)
    return `Fehler: Quelle "${noteId}" gibt es nicht. noteId aus search_sources übernehmen.`;
  const pages = own ? pagesOfNote(own) : await pagesOfImported(importedNote, repository);
  const first = Math.max(1, Math.floor(Number(page)) || 1);
  const span = Math.min(MAX_READ_PAGES, Math.max(1, Math.floor(Number(count)) || 1));
  const wanted = pages.filter((entry) => entry.page >= first && entry.page < first + span);
  if (wanted.length === 0) {
    return pages.length
      ? `Fehler: Seite ${first} ist nicht lesbar. Lesbar sind ${pages.length} Seiten, von ${pages[0].page} bis ${pages[pages.length - 1].page}.`
      : "Fehler: Diese Quelle ist noch nicht gelesen, die Texterkennung läuft im Hintergrund.";
  }
  return {
    pages: wanted.map((entry) => ({
      page: entry.page,
      cite: entry.cite,
      text: entry.text.slice(0, MAX_PAGE_CHARS),
    })),
  };
}
