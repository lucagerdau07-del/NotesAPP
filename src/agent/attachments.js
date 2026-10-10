import { readImageObjectSource } from "../ink/imageObject.js";
import { isPdfFile, readPdfPages } from "../ink/pdfObject.js";

// A PDF goes out as page images (the model is sent pictures, never the file),
// so the cap keeps one message from carrying dozens of them.
export const MAX_ATTACHMENT_PDF_PAGES = 8;
const MAX_TEXT_CHARS = 30000;
const TEXT_EXTENSION = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|jsx?|tsx?|py|java|c|cpp|h|cs|go|rs|sql|ya?ml|log|tex)$/i;

export const ATTACHMENT_ACCEPT = "image/*,application/pdf,text/*,.md,.csv,.json,.tex,.py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.sql,.yaml,.yml,.log";

// One picked file -> { name, images: [dataUrl], text } for the chat. Images and
// PDF pages ride along as pictures, text files as (truncated) text.
export async function readAgentAttachment(file) {
  const name = file.name || "Datei";
  if (file.type?.startsWith("image/")) {
    const { src } = await readImageObjectSource(file);
    return { name, images: [src], text: "" };
  }
  if (isPdfFile(file)) {
    const pages = await readPdfPages(file, MAX_ATTACHMENT_PDF_PAGES);
    return { name, images: pages.map((page) => page.src), text: "" };
  }
  if (file.type?.startsWith("text/") || file.type === "application/json" || TEXT_EXTENSION.test(name)) {
    const raw = await file.text();
    const text = raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n[… gekürzt]` : raw;
    return { name, images: [], text };
  }
  throw new Error(`„${name}“ wird nicht unterstützt (Bild, PDF oder Textdatei).`);
}
