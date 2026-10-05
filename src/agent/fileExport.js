// Erzeugt die Dateien für das Agent-Werkzeug create_file — alles lokal im
// WebView, kein Server. Die schweren Bibliotheken kommen per dynamischem Import,
// damit sie nur laden, wenn der Agent wirklich eine Datei baut.

export const FILE_FORMATS = ["pdf", "docx", "pptx", "xlsx", "csv", "md", "txt", "ics", "flashcards"];

const MAX_TEXT = 60000;
const MAX_SLIDES = 40;
const MAX_ROWS = 500;
const MAX_COLS = 30;
const MAX_EVENTS = 100;
const MAX_CARDS = 500;

const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  ics: "text/calendar;charset=utf-8",
  flashcards: "text/plain;charset=utf-8",
};

const text = (value) => String(value ?? "");

function requireList(value, label, max) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} fehlt oder ist leer.`);
  if (value.length > max) throw new Error(`${label}: höchstens ${max} Einträge.`);
  return value;
}

// Markdown-Teilmenge: #/##/### Überschriften, "- " Aufzählung, sonst Absatz.
// Aufeinanderfolgende Textzeilen bilden einen Absatz, Leerzeilen trennen sie.
export function parseMarkdown(markdown) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const raw of text(markdown).split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
    } else if (bullet) {
      flush();
      blocks.push({ type: "li", text: bullet[1] });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}

const stripInline = (value) => value.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<![*\w])\*(.+?)\*(?!\w)/g, "$1");

// "**fett**" -> TextRun-Liste für Word; alles andere bleibt normaler Text.
function inlineRuns(TextRun, value) {
  return value
    .split(/(\*\*.+?\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? new TextRun({ text: part.slice(2, -2), bold: true })
        : new TextRun(stripInline(part)),
    );
}

async function buildPdf(title, markdown) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 20;
  const width = 210 - margin * 2;
  const bottom = 297 - margin;
  let y = margin;
  const write = (value, size, style, indent = 0, gap = 2) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lineHeight = size * 0.5;
    for (const line of doc.splitTextToSize(value, width - indent)) {
      if (y + lineHeight > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  };
  if (title) write(title, 20, "bold", 0, 4);
  for (const block of parseMarkdown(markdown)) {
    const value = stripInline(block.text);
    if (block.type === "h") write(value, [0, 17, 14, 12][block.level], "bold", 0, 2);
    else if (block.type === "li") write(`•  ${value}`, 11, "normal", 4, 1);
    else write(value, 11, "normal");
  }
  return doc.output("blob");
}

async function buildDocx(title, markdown) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const levels = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const children = [];
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
  for (const block of parseMarkdown(markdown)) {
    if (block.type === "h") children.push(new Paragraph({ text: stripInline(block.text), heading: levels[block.level] }));
    else
      children.push(
        new Paragraph({
          children: inlineRuns(TextRun, block.text),
          bullet: block.type === "li" ? { level: 0 } : undefined,
          spacing: { after: 120 },
        }),
      );
  }
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}

async function buildPptx(title, slides) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  const deck = requireList(slides, "slides", MAX_SLIDES);
  if (title) {
    const cover = pres.addSlide();
    cover.addText(title, { x: 0.6, y: 2.4, w: 12.1, h: 1.6, fontSize: 40, bold: true, align: "center" });
  }
  for (const entry of deck) {
    const slide = pres.addSlide();
    slide.addText(text(entry?.title), { x: 0.6, y: 0.4, w: 12.1, h: 1, fontSize: 30, bold: true });
    const bullets = (Array.isArray(entry?.bullets) ? entry.bullets : []).map((b) => ({
      text: stripInline(text(b)),
      options: { bullet: true, breakLine: true },
    }));
    if (bullets.length) slide.addText(bullets, { x: 0.8, y: 1.6, w: 11.7, h: 5, fontSize: 20, valign: "top" });
    if (entry?.notes) slide.addNotes(text(entry.notes));
  }
  return new Blob([await pres.write({ outputType: "arraybuffer" })], { type: MIME.pptx });
}

function gridOf(rows) {
  return requireList(rows, "rows", MAX_ROWS).map((row) => {
    if (!Array.isArray(row)) throw new Error("rows muss eine Liste von Zeilen (je eine Liste von Zellen) sein.");
    return row.slice(0, MAX_COLS);
  });
}

// Zahlen bleiben Zahlen, "=..." wird zur Formel, alles andere Text. Erste Zeile fett.
async function buildXlsx(rows, sheet) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const data = gridOf(rows).map((row, index) =>
    row.map((cell) => {
      if (typeof cell === "number" && Number.isFinite(cell)) return { type: Number, value: cell };
      const value = text(cell);
      if (value.startsWith("=")) return { type: "Formula", value };
      return { type: String, value, fontWeight: index === 0 ? "bold" : undefined };
    }),
  );
  return writeExcelFile(data, { sheet: text(sheet).slice(0, 31) || "Tabelle1" }).toBlob();
}

// Semikolon statt Komma: deutsches Excel öffnet Komma-CSV sonst in einer Spalte.
// BOM, damit Umlaute stimmen.
function buildCsv(rows) {
  const quote = (cell) => {
    const value = text(cell);
    return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const body = gridOf(rows).map((row) => row.map(quote).join(";")).join("\r\n");
  return new Blob(["﻿" + body], { type: MIME.csv });
}

const icsText = (value) => text(value).replace(/\\/g, "\\\\").replace(/[,;]/g, "\\$&").replace(/\r?\n/g, "\\n");

// "2026-10-12" -> ganztägig, "2026-10-12T08:00" -> schwebende Ortszeit (ohne Zone,
// damit das Gerät sie so anzeigt, wie sie gemeint ist).
function icsDate(value, label) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text(value).trim());
  if (!match) throw new Error(`${label}: Datum "${value}" muss JJJJ-MM-TT oder JJJJ-MM-TTTHH:MM sein.`);
  const [, y, m, d, hh, mm] = match;
  return hh === undefined ? { line: `;VALUE=DATE:${y}${m}${d}`, allDay: true } : { line: `:${y}${m}${d}T${hh}${mm}00`, allDay: false };
}

// ponytail: Zeilen nicht bei 75 Oktetten gefaltet, gängige Kalender-Apps lesen auch lange Zeilen.
export function buildIcs(events, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NotesAPP//Agent//DE", "CALSCALE:GREGORIAN"];
  requireList(events, "events", MAX_EVENTS).forEach((event, index) => {
    const start = icsDate(event?.start, `events[${index}].start`);
    lines.push("BEGIN:VEVENT", `UID:${stamp}-${index}-${Math.random().toString(36).slice(2, 10)}@notesapp`, `DTSTAMP:${stamp}`);
    lines.push(`DTSTART${start.line}`);
    if (event?.end) lines.push(`DTEND${icsDate(event.end, `events[${index}].end`).line}`);
    lines.push(`SUMMARY:${icsText(event?.title || "Termin")}`);
    if (event?.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
    if (event?.location) lines.push(`LOCATION:${icsText(event.location)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return new Blob([lines.join("\r\n") + "\r\n"], { type: MIME.ics });
}

// Tab-getrennt "Vorderseite<TAB>Rückseite": das Importformat von Anki und Quizlet.
function buildFlashcards(cards) {
  const field = (value) => text(value).replace(/[\t\r\n]+/g, " ").trim();
  const body = requireList(cards, "cards", MAX_CARDS)
    .map((card) => `${field(card?.front)}\t${field(card?.back)}`)
    .join("\n");
  return new Blob([body + "\n"], { type: MIME.flashcards });
}

function filenameFor(title, format) {
  const base = text(title).trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "Datei";
  return `${base}.${format === "flashcards" ? "txt" : format}`;
}

// Gibt { blob, filename } zurück. Wirft einen deutschen Fehlertext bei falschen
// Argumenten — der Aufrufer reicht ihn ans Modell zurück, damit es sich korrigiert.
export async function createFile(args = {}) {
  const format = text(args.format).toLowerCase();
  if (!FILE_FORMATS.includes(format)) throw new Error(`format muss eines von ${FILE_FORMATS.join(", ")} sein.`);
  const title = text(args.title).trim();
  const markdown = text(args.text).slice(0, MAX_TEXT);
  const needsText = ["pdf", "docx", "md", "txt"].includes(format);
  if (needsText && !markdown.trim()) throw new Error(`${format}: text fehlt (Markdown).`);

  let blob;
  if (format === "pdf") blob = await buildPdf(title, markdown);
  else if (format === "docx") blob = await buildDocx(title, markdown);
  else if (format === "pptx") blob = await buildPptx(title, args.slides);
  else if (format === "xlsx") blob = await buildXlsx(args.rows, args.sheet);
  else if (format === "csv") blob = buildCsv(args.rows);
  else if (format === "ics") blob = buildIcs(args.events);
  else if (format === "flashcards") blob = buildFlashcards(args.cards);
  else blob = new Blob([markdown], { type: MIME[format] });
  return { blob, filename: filenameFor(title, format) };
}
