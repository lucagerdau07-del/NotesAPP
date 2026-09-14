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
// Arbeitsblätter sind kurz und leben von Tabellen, Lücken und Abbildungen, die
// eine PDF-Textebene verliert. Kurze PDFs gehen deshalb immer ans
// Vision-Modell, lange Bücher bleiben bei der kostenlosen Textebene.
// ponytail: Seitenzahl als Merkmal. Ein bebildertes Skript mit mehr Seiten
// verliert so seine Abbildungen; dann je Seite auf Bild-Operatoren prüfen.
const WORKSHEET_MAX_PAGES = 4;
// Kleine Schulbuchschrift braucht mehr Pixel als die Handschrift im Notizscan.
const OCR_EDGE = 1600;
// Seitenbild für den Agenten selbst: reicht für Grafiken und Tabellen und
// kostet weniger Tokens als die OCR-Auflösung.
const SEE_EDGE = 1200;
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

// Markdown statt Fließtext: Tabellen, Lücken und Abbildungen tragen auf einem
// Arbeitsblatt oft mehr Inhalt als die Sätze dazwischen, und die Beschreibung
// einer Abbildung macht sie über search_sources auffindbar.
export const OCR_PROMPT = [
  "Du überträgst eine Seite aus einem Buch, Schulbuch oder Arbeitsblatt in Markdown, so dass man ohne das Bild alles Wichtige versteht.",
  "Erste Zeile deiner Antwort: SEITE: und die auf der Seite gedruckte Seitenzahl, oder SEITE: - wenn keine zu sehen ist.",
  "Zweite Zeile: ABBILDUNG: ja, wenn die Seite ein Foto, ein Diagramm, eine Karte, eine Grafik, eine farbige Markierung oder ein Layout enthält, das deine Markdown-Version nicht vollständig wiedergibt, sonst ABBILDUNG: nein.",
  "Text wortgetreu und vollständig in Lesereihenfolge, Spalten nacheinander. Nichts zusammenfassen, nichts ergänzen, nichts korrigieren. Unleserliches als [unleserlich].",
  "Struktur beibehalten: Überschriften mit #, Aufgaben mit ihrer Nummer, Tabellen als Markdown-Tabelle, Kästen als > Block, Lücken als ____, Ankreuzfelder als [ ].",
  "Abbildungen, Diagramme, Karten, Zeitstrahlen und Skizzen als [Abbildung: ...] mit dem, was sie zeigen, allen Beschriftungen und Werten und wohin Pfeile zeigen.",
  "Zeilennummern am Rand als [Z. 5] am Anfang der jeweiligen Zeile.",
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

export function toPage({ noteId, title, kind, index, text, printedPage = null, hasVisual = false }) {
  const clean = String(text ?? "").normalize("NFC");
  const folded = fold(clean);
  return {
    noteId,
    page: index + 1,
    cite: citeOf({ title, kind, page: index + 1, printedPage }),
    text: clean,
    hasVisual,
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

const HEAD_LINE = /^[\s*_#]*(SEITE|ABBILDUNG)[\s*_]*:[\s*_]*(.*?)[\s*_]*$/i;

// Erste Zeile "SEITE: 47" oder "SEITE: -", zweite Zeile "ABBILDUNG: ja/nein",
// danach der Seitentext. Beide Kopfzeilen optional und in beliebiger
// Reihenfolge, damit eine Antwort ohne ABBILDUNG-Zeile (ältere Notizen-Scans,
// ein Modell, das die Anweisung ignoriert) nicht kaputtgeht. Klartext statt
// JSON: ein Anführungszeichen im Buchtext kann so nichts zerbrechen.
export function parseOcrReply(content) {
  const lines = String(content ?? "")
    .replace(/```[a-z]*\n?/gi, "")
    .trim()
    .split("\n");
  let printedPage = null;
  let hasVisual = false;
  let consumed = 0;
  for (let i = 0; i < 2 && i < lines.length; i += 1) {
    const match = lines[i].match(HEAD_LINE);
    if (!match) break;
    const [, key, value] = match;
    if (/^SEITE$/i.test(key)) printedPage = value && value !== "-" ? value.slice(0, 12) : null;
    else hasVisual = /^ja/i.test(value.trim());
    consumed += 1;
  }
  return { printedPage, hasVisual, text: lines.slice(consumed).join("\n").trim() };
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

async function pdfPageImage(pdfPage, edge = OCR_EDGE) {
  const natural = pdfPage.getViewport({ scale: 1 });
  const viewport = pdfPage.getViewport({
    scale: edge / Math.max(natural.width, natural.height),
  });
  const { canvas, context } = whiteCanvas(viewport.width, viewport.height);
  await pdfPage.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.8);
}

async function imageFileImage(blob, edge = OCR_EDGE) {
  const opened = await openImage(blob);
  try {
    const size = fitInside(opened.width, opened.height, edge);
    const { canvas, context } = whiteCanvas(size.width, size.height);
    context.drawImage(opened.image, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    opened.dispose();
  }
}

// Öffnet ein PDF einmal und reicht die verlangten Seiten nacheinander durch.
// pdf.js wird erst hier geladen, wie im documentImporter.
async function eachPdfPage(blob, indexes, visit) {
  const { openPdf } = await import("../documents/pdfRuntime.js");
  const pdf = await openPdf(blob);
  try {
    for (const index of indexes) {
      const pdfPage = await pdf.document.getPage(index + 1);
      try {
        await visit(pdfPage, index);
      } finally {
        pdfPage.cleanup();
      }
    }
  } finally {
    await pdf.dispose();
  }
}

async function transcribe(src, complete) {
  const { message } = await complete({
    messages: [
      { role: "system", content: OCR_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Übertrage diese Seite." },
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

  const pending = Array.from({ length: total }, (_, index) => index).filter(
    (index) => !done.has(index),
  );
  await eachPdfPage(file.blob, pending, async (pdfPage, index) => {
    const text =
      total > WORKSHEET_MAX_PAGES ? textOfContent(await pdfPage.getTextContent()) : "";
    await save(
      index,
      text.replace(/\s/g, "").length >= MIN_TEXT_LAYER_CHARS
        ? { text, printedPage: null, method: "pdf" }
        : await transcribe(await pdfPageImage(pdfPage), complete),
    );
  });
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

// Das Original als Bild, wenn der Text einer Seite eine Abbildung oder das
// Layout nicht trägt. Nur auf Anfrage des Agenten, nie beim Indizieren.
async function pageImages(note, indexes, repository) {
  const { file } = await repository.getDocumentBundle(note.id);
  if (note.source?.type !== "pdf") return [await imageFileImage(file.blob, SEE_EDGE)];
  const images = [];
  await eachPdfPage(file.blob, indexes, async (pdfPage) => {
    images.push(await pdfPageImage(pdfPage, SEE_EDGE));
  });
  return images;
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
        hasVisual: record.hasVisual,
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
    ({ page, excerpt }) => ({
      noteId: page.noteId,
      page: page.page,
      cite: page.cite,
      excerpt,
      // Nur bei Bedarf im Ergebnis, damit ein normaler Texttreffer nicht mit
      // hasVisual: false aufgebläht wird - der Agent fragt nur nach, wenn es
      // etwas zu sehen gibt.
      ...(page.hasVisual ? { hasVisual: true } : {}),
    }),
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
  { noteId, page, count, image },
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
  // ponytail: nur importierte Dokumente als Bild. Eigene Notizen zeigt
  // see_document, sobald sie geöffnet sind.
  if (image && importedNote) {
    const images = await pageImages(
      importedNote,
      wanted.map((entry) => entry.page - 1),
      repository,
    );
    return {
      pages: wanted.map((entry, index) => ({ page: entry.page, cite: entry.cite, src: images[index] })),
    };
  }
  return {
    pages: wanted.map((entry) => ({
      page: entry.page,
      cite: entry.cite,
      text: entry.text.slice(0, MAX_PAGE_CHARS),
      ...(entry.hasVisual ? { hasVisual: true } : {}),
    })),
  };
}
