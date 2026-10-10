import { readAgentAttachment } from "./attachments.js";
import { fetchIservAttachment } from "../knowledge/iservSync.js";

// Werkzeuge des Aufgaben-Chats (taskChat.js): Anhang lesen, Bilder suchen.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const MAX_IMAGES = 6;
const SEARCH_TIMEOUT_MS = 12_000;

export const TASK_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_attachment",
      description:
        "Liest einen Anhang der Aufgabe (index aus der Liste Anhänge). PDF und Bilder kommen als Seitenbilder (bis 8 Seiten), Textdateien als Text. Word und PowerPoint gehen nicht.",
      parameters: {
        type: "object",
        properties: { index: { type: "integer", description: "Nummer des Anhangs, ab 0" } },
        required: ["index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_images",
      description:
        "Sucht frei lizenzierte Bilder auf Wikimedia Commons. Gibt Titel, Seite, Lizenz und Urheber zurück. Nenne beim Vorschlagen Quelle und Lizenz.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Suchbegriff, gern auch englisch" } },
        required: ["query"],
      },
    },
  },
];

const TASK_TOOL_NAMES = new Set(TASK_TOOLS.map((tool) => tool.function.name));
export const isTaskTool = (name) => TASK_TOOL_NAMES.has(name);

/**
 * Liest Anhang `index` der Aufgabe für das Modell. Gibt Seitenbilder
 * ({pages:[{src, cite}]}), Text oder eine Zeile "Fehler: ..." zurück, wirft nie.
 */
export async function readTaskAttachment(
  { attachments = [], index },
  { fetchAttachment = fetchIservAttachment, read = readAgentAttachment } = {},
) {
  const number = Number(index);
  if (!Number.isInteger(number) || number < 0 || number >= attachments.length) {
    return attachments.length
      ? `Fehler: Anhang ${index} gibt es nicht, erlaubt ist 0 bis ${attachments.length - 1}.`
      : "Fehler: Diese Aufgabe hat keine Anhänge.";
  }
  const attachment = attachments[number];
  if (!attachment?.path) return "Fehler: Dieser Anhang ist nicht verfügbar.";
  const name = String(attachment.filename || "Anhang");
  try {
    const blob = await fetchAttachment({ attachment });
    const { images, text } = await read(new File([blob], name, { type: blob.type || "" }));
    if (images.length > 0) {
      return {
        pages: images.map((src, page) => ({
          src,
          cite: images.length > 1 ? `${name} S. ${page + 1}` : name,
        })),
      };
    }
    return text ? `${name}\n${text}` : `Fehler: ${name} enthält keinen lesbaren Inhalt.`;
  } catch (error) {
    return `Fehler: ${error.message || "Anhang konnte nicht gelesen werden."}`;
  }
}

const stripTags = (html) => String(html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

export async function searchImages(query, { fetchImpl = (...args) => fetch(...args) } = {}) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return "Fehler: query ist leer.";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: trimmed,
    gsrnamespace: "6",
    gsrlimit: String(MAX_IMAGES * 2),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "320",
  });
  try {
    const response = await fetchImpl(`${COMMONS_API}?${params}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!response.ok) return `Fehler: Bildsuche fehlgeschlagen (${response.status}).`;
    const body = await response.json();
    const results = Object.values(body?.query?.pages || {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((page) => ({ page, info: page.imageinfo?.[0] }))
      .filter(({ info }) => info && String(info.mime || "").startsWith("image/"))
      .slice(0, MAX_IMAGES)
      .map(({ page, info }) => ({
        title: String(page.title).replace(/^File:/, ""),
        page: info.descriptionurl,
        thumb: info.thumburl || info.url,
        license: stripTags(info.extmetadata?.LicenseShortName?.value) || "unbekannt",
        author: stripTags(info.extmetadata?.Artist?.value).slice(0, 80) || "unbekannt",
      }));
    return results.length ? { query: trimmed, results } : `Keine Bilder für "${trimmed}".`;
  } catch (error) {
    return `Fehler: Bildsuche fehlgeschlagen (${error.message}).`;
  }
}
