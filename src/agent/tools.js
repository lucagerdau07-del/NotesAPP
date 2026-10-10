import { createInkStroke, getToolStyle } from "../ink/inkDocument.js";
import { createPageObject, objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import { renderPagesFromDocument, previewTextOf } from "../documents/notePreview.js";
import {
  browserFolderRepository,
  folderWithDescendants,
  matchesFolder,
} from "../storage/folderRepository.js";
import { browserCardRepository, cardText } from "../knowledge/cardRepository.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";
import { fold, queryTerms, readSource, searchSources } from "../knowledge/sources.js";
import { requestGoogleDoc, requestGoogleDocEdit, requestSearch, requestWolfram } from "./agentClient.js";
import { createFile, FILE_FORMATS } from "./fileExport.js";
import { SCHOOL_TOOLS, isSchoolTool, runSchoolTool } from "./schoolContext.js";
import { buildExamDashboard, SUBAGENT_TOOLS } from "./examAgent.js";
import { KNOWLEDGE_CHANGED } from "../knowledge/knowledgeRepository.js";
import { browserMemoryRepository, MEMORY_MAX_CHARS } from "../knowledge/memoryRepository.js";
import { FONT_STACKS, fontStackOf, snapBaselineToRule } from "../ink/textStyle.js";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  boundsFor,
  isWhiteboardDocument,
  clamp,
  color,
  newId,
} from "./agentGeometry.js";
import {
  buildTablePreset,
  buildDiagramPreset,
  buildMindmapPreset,
  buildSectionHeaderPreset,
  buildCalloutPreset,
  buildHighlightObjects,
} from "./presets.js";
import {
  CALLOUT_VARIANTS,
  HIGHLIGHT_COLORS,
  STYLE_ROLES,
  roleColor,
  themeOf,
} from "./noteStyle.js";
import { createComponentStore, runRecipe } from "./components/index.js";

// Page geometry mirrors DocumentView's baseWidth/pageHeight. Coordinates are
// page-local: origin top left of the addressed page, unit = page pixel. A
// whiteboard page has no fixed size — see agentGeometry.js's boundsFor.
export { PAGE_WIDTH, PAGE_HEIGHT };

const DRAW_TOOLS = ["pen", "fountain", "pencil", "highlighter"];
const SHAPE_TYPES = ["rect", "ellipse", "line", "arrow"];
const MAX_TEXT = 4000;
const MAX_PATHS = 200;
const MAX_POINTS = 2000;
// Same encoding as the document scan (src/knowledge/documentScan.js): JPEG at
// 1000px reads handwriting fine and keeps the base64 payload manageable.
// paintBackground because the canvas is otherwise transparent and the page's
// colour is a CSS layer the caller puts behind it — which this caller cannot
// do. The JPEG encoder then flattens the transparency to black, so a note on
// light paper reached the model as dark ink on black, i.e. blank.
const SEE_IMAGE_OPTIONS = {
  maxDimension: 1000,
  mimeType: "image/jpeg",
  quality: 0.72,
  paintBackground: true,
};
const MAX_SEE_PAGES = 8;

// The model needs to know where its next block may start. Measured the same
// way the real text box wraps (an offscreen clone with identical CSS — see
// measureTextBox in PageObjectLayer.jsx) instead of guessed, since a guessed
// average glyph width drifted from the actual font metrics enough to overlap
// blocks on-device (narrower/wider real fonts than the 0.52em assumption).
// The character-count fallback covers both no-DOM environments (tests, SSR)
// and jsdom, which never runs real layout so scrollHeight always reads 0.
function estimateTextHeightByCharCount(text, width, fontSize, lineHeight) {
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.52)));
  const lines = String(text)
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return Math.round(lines * lineHeight);
}

export function estimateTextHeight(text, width, fontSize, lineHeight, fontFamily, bold) {
  const resolvedLineHeight = lineHeight || fontSize * 1.4;
  if (typeof document === "undefined")
    return estimateTextHeightByCharCount(text, width, fontSize, resolvedLineHeight);
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;` +
    `width:${width}px;font-size:${fontSize}px;font-family:${fontStackOf(fontFamily)};` +
    `font-weight:${bold ? 700 : 400};line-height:${resolvedLineHeight}px;`;
  host.textContent = String(text) || " ";
  document.body.appendChild(host);
  const height = host.scrollHeight;
  document.body.removeChild(host);
  return height > 0 ? height : estimateTextHeightByCharCount(text, width, fontSize, resolvedLineHeight);
}

const MAX_LISTED_NOTES = 40;

// Karte der Notiz (cards.js), gefunden über ihren Ordner. Leer, solange der
// Ordner noch keine hat; dann gilt der Auszug wie bisher.
function noteCardOf(note, folders, cards) {
  const folder = folders.find((f) => matchesFolder(note, f));
  return (folder && cards[folder.id]?.auto?.notes?.[note.id]) || "";
}

// Imported PDFs/Bilder haben keinen extrahierten Text (kein OCR) - der
// Auszug nennt statt Inhalt nur Seitenzahl und Quelltyp, wie schon die
// Bibliothekskarte für importierte Dokumente (Library.jsx's importedCards).
function importedNoteEntry(note) {
  const pageCount = Array.isArray(note.pages) ? note.pages.length : 1;
  const kind = note.source?.type === "pdf" ? "PDF" : "Bild";
  return {
    id: note.id,
    title: note.title || "",
    subject: note.subject || "",
    updatedAt: note.updatedAt || 0,
    preview: `${pageCount} ${pageCount === 1 ? "Seite" : "Seiten"} · ${kind}`,
  };
}

// Tool results go to the model as text, so the folder tree is indented lines
// instead of JSON objects repeating id/name/parentId keys for every folder.
function folderTree(folders, notes, cards = {}) {
  if (folders.length === 0) return "Keine Ordner.";
  const ids = new Set(folders.map((f) => f.id));
  const seen = new Set();
  const lines = [];
  const visit = (children, depth) => {
    for (const f of children) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const count = notes.filter((n) => matchesFolder(n, f)).length;
      const card = cardText(cards[f.id]);
      lines.push(`${"  ".repeat(depth)}${f.name} [${f.id}] ${count}${card ? `: ${card}` : ""}`);
      visit(folders.filter((child) => child.parentId === f.id), depth + 1);
    }
  };
  // A parentId pointing at a deleted folder still lists the folder at the top.
  visit(folders.filter((f) => !f.parentId || !ids.has(f.parentId)), 0);
  return `Ordner, Unterordner eingerückt (Name [id] Notizen: Karte):\n${lines.join("\n")}`;
}

const LISTED_PREVIEW_CHARS = 120;

// One line per note, header once. The query matches title, folder and excerpt
// with the same folding and stemming as search_sources ("Ubung" finds
// "Übungen"); notes matching more terms come first, a title hit beats an
// excerpt hit, then newest first.
function noteListing(entries, rawQuery) {
  const terms = queryTerms(rawQuery || "");
  const ranked = entries
    .map((entry) => {
      if (terms.length === 0) return { entry, score: 0 };
      const title = fold(entry.title);
      // Die Karte zählt wie der Auszug: "Kurvendiskussion" findet auch ein
      // Blatt, das nur "Blatt 4" heißt.
      const all = `${title} ${fold(entry.subject)} ${fold(entry.preview)} ${fold(entry.card || "")}`;
      const matched = terms.filter((term) => all.includes(term)).length;
      const inTitle = terms.filter((term) => title.includes(term)).length;
      return { entry, score: matched ? matched * 10 + inTitle : -1 };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt);
  if (ranked.length === 0)
    return terms.length
      ? "Keine Notiz passt. Andere Stichwörter versuchen oder search_sources für den Volltext."
      : "Keine Notizen.";
  const shown = ranked.slice(0, MAX_LISTED_NOTES);
  const lines = shown.map(({ entry }) => {
    const date = entry.updatedAt ? new Date(entry.updatedAt).toISOString().slice(0, 10) : "-";
    // Eine Karte ist schon verdichtet und kurz, nur der Auszug wird gekürzt.
    const preview = entry.card
      ? entry.card
      : String(entry.preview || "").replace(/\s+/g, " ").trim().slice(0, LISTED_PREVIEW_CHARS);
    return [entry.id, entry.title || "(ohne Titel)", entry.subject || "-", date, preview].join(" | ");
  });
  const more =
    ranked.length > shown.length
      ? ` (${ranked.length - shown.length} weitere, mit query oder folderId eingrenzen)`
      : "";
  return `${shown.length} Notizen${more}. id | Titel | Ordner | geändert | Auszug\n${lines.join("\n")}`;
}

// Wikipedia statt einer allgemeinen Suchmaschine: kostenlos, ohne Schlüssel,
// per origin=* direkt aus dem Browser abrufbar und für Unterrichtsfakten die
// verlässlichste Quelle. Ein Aufruf liefert die Einleitungen der besten
// Treffer als Klartext, deutsch mit englischem Fallback.
const SEARCH_LANGS = ["de", "en"];
const SEARCH_RESULTS = 3;
const MAX_EXTRACT = 1200;
const SEARCH_TIMEOUT_MS = 8000;

async function searchWikipedia(query, lang, signal) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    redirects: "1",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(SEARCH_RESULTS),
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    // Ohne exlimit bekäme nur der erste Treffer einen Auszug (API-Default 1).
    exlimit: String(SEARCH_RESULTS),
  });
  const response = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== "object") return [];
  return Object.values(pages)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => ({
      title: String(page?.title || "").trim(),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(page?.title || "").replace(/ /g, "_"))}`,
      extract: String(page?.extract || "").trim().slice(0, MAX_EXTRACT),
    }))
    .filter((result) => result.title && result.extract);
}

// Die Quellenwahl (Wikipedia vs. allgemeine Websuche) trifft das Modell selbst
// über den source-Parameter im Tool-Aufruf, nicht diese Funktion — sie führt
// nur aus, was verlangt wurde. "auto" bleibt als Sicherheitsnetz: erst
// Wikipedia (kein Backend-Hop, kein Kontingent), bei leerem Treffer zusätzlich
// der serverseitig geschlüsselte Tavily-Proxy.
async function searchWikipediaAllLangs(trimmed, signal) {
  let lastError = null;
  for (const lang of SEARCH_LANGS) {
    try {
      const results = await searchWikipedia(trimmed, lang, signal);
      if (results.length > 0) return { source: `${lang}.wikipedia.org`, results };
    } catch (error) {
      lastError = error;
    }
  }
  return { error: lastError };
}

export async function searchWeb(query, source = "auto") {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "Fehler: query ist leer.";
  const mode = ["wikipedia", "web"].includes(source) ? source : "auto";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let lastError = null;

  try {
    if (mode !== "web") {
      const wiki = await searchWikipediaAllLangs(trimmed, controller.signal);
      if (wiki.results) return { query: trimmed, source: wiki.source, results: wiki.results };
      lastError = wiki.error;
      if (mode === "wikipedia") {
        return lastError
          ? `Fehler: Suche fehlgeschlagen (${lastError.message}).`
          : `Keine Wikipedia-Treffer für "${trimmed}".`;
      }
    }
  } finally {
    clearTimeout(timer);
  }

  try {
    const results = await requestSearch({ query: trimmed });
    if (results.length > 0) return { query: trimmed, source: "web-search", results };
  } catch (error) {
    lastError = error;
  }

  return lastError
    ? `Fehler: Suche fehlgeschlagen (${lastError.message}).`
    : `Keine Treffer für "${trimmed}".`;
}

export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_document",
      description:
        "Liest den aktuellen Dokumentzustand: Seiten, alle Textblöcke und Formen mit Position, Größe und Inhalt sowie die Strichzahl je Seite.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "see_document",
      description:
        "Zeigt die Seite(n) als Bild, inklusive handschriftlicher Striche und Zeichnungen, die read_document nicht auflistet. Ohne pageId werden alle Seiten gezeigt (bis zu 8).",
      parameters: {
        type: "object",
        properties: { pageId: { type: "string" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_text",
      description:
        "Legt einen neuen Textblock auf einer Seite an. Gibt die geschätzte Höhe und Unterkante zurück, damit der nächste Block darunter passt.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number", description: "Umbruchbreite in Seitenpixeln" },
          text: { type: "string" },
          label: {
            type: "string",
            description:
              "Kurze thematische Bezeichnung für den Fortschrittsanzeiger, z.B. 'Einleitung', 'Hauptteil', 'Fazit' — nicht der Text selbst.",
          },
          size: { type: "number", description: "Schriftgroesse 8-96" },
          color: { type: "string", description: "#rrggbb" },
          bold: { type: "boolean" },
          italic: { type: "boolean" },
          underline: { type: "boolean" },
          align: { type: "string", enum: ["left", "center", "right"] },
          font: { type: "string", enum: FONT_STACKS.map((font) => font.id) },
          // Both concepts (which role means what, when to reach for a
          // one-word highlight block) are explained once in the system
          // prompt; only the one fact that isn't — that color wins over
          // role — needs saying again here.
          role: { type: "string", enum: STYLE_ROLES, description: "Farbrolle. color überschreibt sie." },
          highlight: {
            type: "string",
            enum: Object.keys(HIGHLIGHT_COLORS),
            description: "Marker hinter den Zeilen dieses Blocks.",
          },
        },
        required: ["pageId", "x", "y", "width", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_text",
      description: "Ändert einen bestehenden Textblock.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          label: {
            type: "string",
            description:
              "Kurze thematische Bezeichnung für den Fortschrittsanzeiger, z.B. 'Einleitung', 'Hauptteil', 'Fazit' — nicht der Text selbst.",
          },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          size: { type: "number" },
          color: { type: "string" },
          bold: { type: "boolean" },
          italic: { type: "boolean" },
          underline: { type: "boolean" },
          align: { type: "string", enum: ["left", "center", "right"] },
          font: { type: "string", enum: FONT_STACKS.map((font) => font.id) },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_objects",
      description: "Löscht Textblöcke oder Formen anhand ihrer IDs.",
      parameters: {
        type: "object",
        properties: { ids: { type: "array", items: { type: "string" } } },
        required: ["ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_shape",
      description:
        "Zeichnet eine Form: rect, ellipse, line oder arrow. Breite/Höhe dürfen negativ sein (Richtung).",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          type: { type: "string", enum: SHAPE_TYPES },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          color: { type: "string" },
          strokeWidth: { type: "number" },
          fillColor: { type: "string" },
        },
        required: ["pageId", "type", "x", "y", "width", "height"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draw",
      description:
        "Zeichnet Freihandstriche als echte Tinte. paths ist eine Liste von Pfaden, jeder Pfad eine Liste von {x,y} in Seitenkoordinaten.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          tool: { type: "string", enum: DRAW_TOOLS },
          color: { type: "string" },
          width: { type: "number" },
          paths: {
            type: "array",
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { x: { type: "number" }, y: { type: "number" } },
                required: ["x", "y"],
              },
            },
          },
        },
        required: ["pageId", "paths"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "erase",
      description: "Entfernt Striche anhand ihrer IDs.",
      parameters: {
        type: "object",
        properties: { strokeIds: { type: "array", items: { type: "string" } } },
        required: ["strokeIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_page",
      description:
        "Hängt eine neue leere Seite an und gibt ihre pageId zurück. Nicht verfügbar auf einem Whiteboard (eine unbegrenzte Fläche statt mehrerer Seiten).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_table",
      description:
        "Fügt eine Tabelle als ein einziges Element mit echten, durchgehenden Gitterlinien ein — kein Haufen einzelner Rechtecke. Gibt die id der Tabelle zurück; einzelne Zellen danach mit edit_table_cell anpassen.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          rows: { type: "number", description: "1-20" },
          cols: { type: "number", description: "1-10" },
          columnWidth: { type: "number" },
          rowHeight: { type: "number" },
          headers: { type: "array", items: { type: "string" }, description: "Kopfzeile, optional" },
          cellText: {
            type: "array",
            items: { type: "array", items: { type: "string" } },
            description: "Zeilenweise Zellinhalte, optional (Zeile 0 = headers, falls gesetzt)",
          },
          color: { type: "string", description: "#rrggbb, Rahmenfarbe" },
        },
        required: ["pageId", "x", "y", "rows", "cols"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_table_cell",
      description: "Ändert den Text einer einzelnen Zelle einer bestehenden Tabelle.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "id der Tabelle, von insert_table" },
          row: { type: "number", description: "0-basiert" },
          col: { type: "number", description: "0-basiert" },
          text: { type: "string" },
        },
        required: ["id", "row", "col", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_diagram",
      description:
        "Fügt ein Flussdiagramm ein: Kästen mit Beschriftung in einer Kette, verbunden durch Pfeile. Knoten werden per Index (0-basiert) in der Reihenfolge von nodes referenziert.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          nodes: {
            type: "array",
            items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from: { type: "number", description: "Index in nodes" },
                to: { type: "number", description: "Index in nodes" },
                label: { type: "string" },
              },
              required: ["from", "to"],
            },
          },
          color: { type: "string", description: "#rrggbb, Kasten- und Pfeilfarbe" },
        },
        required: ["pageId", "x", "y", "nodes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_mindmap",
      description:
        "Fügt eine Mindmap ein: eine Wurzel in der Mitte, Zweige im Kreis darum, je mit einer Linie zur Wurzel verbunden.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          x: { type: "number", description: "Mittelpunkt der Wurzel" },
          y: { type: "number", description: "Mittelpunkt der Wurzel" },
          root: { type: "string" },
          branches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                subs: {
                  type: "array",
                  items: { type: "string" },
                  description: "1-4 kurze Unterpunkte, jeder als eigene Box mit Linie am Zweig angehängt — für mehr Tiefe pro Zweig.",
                },
              },
              required: ["label"],
            },
          },
          color: { type: "string", description: "#rrggbb, Linien- und Rahmenfarbe" },
        },
        required: ["pageId", "x", "y", "root", "branches"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_section_header",
      description:
        "Setzt eine Abschnittsüberschrift als gestaltetes Element: getönter Balken über die Spaltenbreite (banner), schmale Pille um die Wörter (pill) oder Titel über dickem Strich (underline). Gibt die Unterkante zurück.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          title: { type: "string" },
          variant: { type: "string", enum: ["banner", "pill", "underline"] },
          role: { type: "string", enum: STYLE_ROLES, description: "Farbrolle, Standard heading" },
          size: { type: "number" },
          font: { type: "string", enum: FONT_STACKS.map((font) => font.id) },
        },
        required: ["pageId", "x", "y", "width", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_callout",
      description:
        "Setzt einen abgesetzten Kasten mit farbiger Kante für Definitionen, Beispiele, Warnungen oder Formeln. Die Höhe richtet sich nach dem Text. Gibt die Unterkante zurück.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          text: { type: "string" },
          variant: { type: "string", enum: Object.keys(CALLOUT_VARIANTS) },
          title: { type: "string", description: "Überschrift des Kastens, Standard ist die Variante" },
          size: { type: "number" },
          font: { type: "string", enum: FONT_STACKS.map((font) => font.id) },
        },
        required: ["pageId", "x", "y", "width", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_components",
      description:
        "Listet die verfügbaren Bauelemente (Zeitstrahl, Ablauf, Klammer, Kolben, Glockenkurve, …) mit ihren Parametern auf.",
      parameters: {
        type: "object",
        properties: {
          tag: { type: "string", description: "Filter, z.B. chemie, mathe, struktur, annotation" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_component",
      description:
        "Gibt das vollständige Rezept eines Bauelements zurück — als Vorlage zum Abwandeln oder um eine Proportion zu ändern.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_component",
      description:
        "Setzt ein Bauelement auf die Seite. args enthält die Parameter des Rezepts. Gibt die belegte Fläche und die Unterkante zurück.",
      parameters: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          id: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          args: { type: "object", description: "Parameter laut Rezept, z.B. {items: [...], width: 600}" },
        },
        required: ["pageId", "id", "x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "define_component",
      description:
        "Speichert ein eigenes Bauelement oder überschreibt ein vorhandenes unter derselben id. Das Rezept wird vor dem Speichern testweise ausgeführt, Fehler kommen als Text zurück.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Kleinbuchstaben, ohne Leerzeichen" },
          title: { type: "string" },
          description: { type: "string", description: "Wofür das Element gedacht ist und was die Parameter bedeuten" },
          tags: { type: "array", items: { type: "string" } },
          params: {
            type: "object",
            description:
              // Full explanation of min/max/minItems/maxItems/options/fixed is
              // in the system prompt (describeRecipeLanguage) — kept in one
              // place so the two can't drift apart. Only the concrete syntax
              // stays here, since that's what's needed at call time.
              'Parametername auf {"default": Wert, ...Grenzen}, siehe Rezeptsprache im Systemprompt. Beispiel: {"cols": {"default": 3, "min": 1, "max": 6}, "items": {"default": [], "maxItems": 8}}',
          },
          body: {
            type: "array",
            items: { type: "object" },
            description: "Elemente, repeat/when/let — siehe die Rezeptsprache im Systemprompt",
          },
        },
        required: ["id", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Sucht Fakten im Internet und liefert Titel, Link und Auszug der besten Treffer. Nutze es, sobald du dir bei einem Fakt, Datum, Namen oder einer Zahl nicht sicher bist, statt zu raten — bei stabilem Schulwissen reicht meist ein Aufruf.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Suchbegriff, am besten ein Stichwort oder Lemma statt einer ganzen Frage",
          },
          source: {
            type: "string",
            enum: ["wikipedia", "web", "auto"],
            description:
              "wikipedia: stabiles Wissen mit eigenem Artikel — Definitionen, historische Fakten, Naturwissenschaft, Personen/Werke von enzyklopädischer Bedeutung. " +
              "web: alles ohne festen Wikipedia-Artikel — aktuelle Ereignisse, Nachrichten, Ergebnisse, Preise, Personen/Firmen des Alltags. " +
              "auto (Standard, falls unsicher): erst Wikipedia, bei leerem Treffer zusätzlich Websuche.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_folders",
      description:
        "Zeigt den Ordnerbaum der Bibliothek mit id, Notizanzahl und Karte (kurze Inhaltsangabe). Steht schon im Systemprompt; nur nötig, wenn die Ordnerstruktur selbst gefragt ist oder ein Zielordner für create_note gesucht wird; zum Finden einer Notiz direkt list_notes mit query.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description:
        "Findet Notizen (eigene und importierte PDFs/Bilder) nach Titel, Ordner und Anfang des Textes: eine Zeile je Notiz mit id, Titel, Ordner, Änderungsdatum und Karte (kurze Inhaltsangabe, sonst Textanfang), beste Treffer zuerst. Für Inhalte tiefer im Text search_sources.",
      parameters: {
        type: "object",
        properties: {
          folderId: { type: "string", description: "Nur dieser Ordner samt Unterordnern (id oder Name), optional" },
          query: {
            type: "string",
            description: "Stichwörter, Wortformen und Umlaute egal; ohne query die neuesten Notizen",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_sources",
      description:
        "Volltextsuche in den Quellen der Bibliothek: importierte Bücher und PDFs, gescannte Buchseiten, Arbeitsblätter und eigene Mitschriften, getippt wie handschriftlich. Liefert die besten Stellen mit Auszug, noteId, page und Zitierangabe cite.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Stichwörter, Namen oder ein Zitatfragment. Wortformen werden mitgefunden. Ohne Treffer: Synonyme versuchen.",
          },
          folderId: {
            type: "string",
            description: "Nur dieser Ordner samt Unterordnern (id oder Name), optional",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_source",
      description:
        "Liest den vollen Text von 1 bis 3 Seiten einer Quelle, um einen Treffer aus search_sources im Zusammenhang zu lesen oder wörtlich zu zitieren.",
      parameters: {
        type: "object",
        properties: {
          noteId: { type: "string" },
          page: { type: "integer", description: "Erste Seite, der Wert page aus search_sources" },
          count: { type: "integer", description: "Anzahl Seiten, 1 bis 3, Standard 1" },
          image: {
            type: "boolean",
            description:
              "Seiten als Bild statt Text, wenn Abbildung, Skizze, Tabelle, Rechenweg oder Layout genau zählen. Teurer als Text.",
          },
        },
        required: ["noteId", "page"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wolfram_alpha",
      description:
        "Fragt Wolfram|Alpha für exakte Ergebnisse: Gleichungen lösen, Ableitungen, Integrale, Grenzwerte, Einheiten, Physik- und Chemie-Konstanten, Molmassen, Statistik. Nutze es statt im Kopf zu rechnen, sobald das Ergebnis stimmen muss. Die Anfrage am besten auf Englisch, kurz und als Rechenausdruck, z.B. \"solve x^2-5x+6=0\" oder \"molar mass of H2SO4\".",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Rechenausdruck oder kurze Frage, englisch" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description:
        "Erstellt eine Datei und öffnet das Teilen-Menü, damit der Nutzer sie speichern oder verschicken kann. Formate: pdf, docx (Referat, Bericht, Lernzettel), pptx (Präsentation), xlsx und csv (Tabelle), md und txt (Text), ics (Kalendertermine), flashcards (Karteikarten für Anki/Quizlet). Gib nur die zum Format passenden Felder an. PDF kann nur lateinische Zeichen, bei Formeln mit Sonderzeichen (π, √, Σ) nimm docx.",
      parameters: {
        type: "object",
        properties: {
          format: { type: "string", enum: FILE_FORMATS },
          title: { type: "string", description: "Dateiname und Titel im Dokument" },
          text: {
            type: "string",
            description:
              "Für pdf, docx, md, txt: Inhalt als Markdown. Erlaubt sind # ## ### Überschriften, \"- \" Aufzählungen, **fett** und Absätze.",
          },
          slides: {
            type: "array",
            description: "Für pptx: eine Folie je Eintrag",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
                notes: { type: "string", description: "Sprechernotizen, optional" },
              },
              required: ["title"],
            },
          },
          rows: {
            type: "array",
            description:
              "Für xlsx und csv: Zeilen, jede eine Liste von Zellen (Zahlen als Zahl, \"=SUMME(A1:A5)\" als Formel). Erste Zeile ist die Kopfzeile.",
            items: { type: "array", items: {} },
          },
          sheet: { type: "string", description: "Für xlsx: Tabellenblatt-Name, optional" },
          events: {
            type: "array",
            description: "Für ics: Termine",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                start: { type: "string", description: "JJJJ-MM-TT (ganztägig) oder JJJJ-MM-TTTHH:MM" },
                end: { type: "string", description: "optional, gleiches Format" },
                description: { type: "string" },
                location: { type: "string" },
              },
              required: ["title", "start"],
            },
          },
          cards: {
            type: "array",
            description: "Für flashcards: Karteikarten",
            items: {
              type: "object",
              properties: { front: { type: "string" }, back: { type: "string" } },
              required: ["front", "back"],
            },
          },
        },
        required: ["format", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_doc",
      description:
        "Legt ein Google Doc im Google Drive des Nutzers an. Im Chat erscheint automatisch eine Karte mit dem Link zum Öffnen, wiederhole den Link nicht. Nimm es, wenn der Nutzer Google Docs will oder das Dokument online weiterbearbeiten oder teilen möchte (Referat, Lernzettel, Protokoll). Sonst create_file.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titel des Dokuments" },
          text: {
            type: "string",
            description:
              "Inhalt als Markdown. Erlaubt sind # ## ### Überschriften, \"- \" Aufzählungen, **fett** und Absätze.",
          },
        },
        required: ["title", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_google_docs",
      description:
        "Listet Google Docs aus dem Drive des Nutzers (neueste zuerst), optional gefiltert nach Titel. Liefert id, Titel und Änderungsdatum. Nimm es, bevor du ein bestehendes Google Doc liest oder bearbeitest.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Teil des Titels, leer = die neuesten" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_google_doc",
      description: "Liest den Text eines bestehenden Google Docs (ohne Formatierung). id kommt aus find_google_docs oder create_google_doc-Link.",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "Dokument-ID" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_google_doc",
      description:
        "Ändert ein bestehendes Google Doc, Formatierung bleibt erhalten. mode replace: ersetzt jede Stelle, die exakt find entspricht (Groß-/Kleinschreibung zählt), durch text. mode append: hängt text als neuen Absatz ans Ende. Lies das Doc vorher mit read_google_doc, damit find exakt stimmt. Im Chat erscheint automatisch eine Karte zum Öffnen.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dokument-ID" },
          mode: { type: "string", enum: ["replace", "append"] },
          find: { type: "string", description: "Nur bei replace: exakter Text, der ersetzt wird" },
          text: { type: "string", description: "Neuer Text (bei replace darf er leer sein, um zu löschen)" },
        },
        required: ["id", "mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: `Merkt dauerhaft einen Satz über den Nutzer (Schwäche, Lehrervorgabe, Vorliebe), höchstens ${MEMORY_MAX_CHARS} Zeichen, Fach vorweg. Von selbst nutzen, wenn so etwas deutlich wird, und kurz erwähnen. Nichts Tagesaktuelles oder Doppeltes. Mit id ersetzen, mit id und leerem text löschen.`,
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, id: { type: "integer" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "done",
      description: "Beendet den Lauf mit einer kurzen deutschen Zusammenfassung.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
      },
    },
  },
];

const READ_ONLY_TOOL_NAMES = new Set([
  "create_google_doc",
  "find_google_docs",
  "read_google_doc",
  "edit_google_doc",
  "read_document",
  "see_document",
  "list_folders",
  "list_notes",
  "search_sources",
  "read_source",
  "search_web",
  "wolfram_alpha",
  "create_file",
  "remember",
  "done",
]);

// Chat mode (editDocument: false) still lets the model look at the note, just
// not change it — read_document/see_document/done from the same schema list,
// so the read path is never a second definition to drift out of sync.
export const AGENT_READ_TOOLS = AGENT_TOOLS.filter((tool) =>
  READ_ONLY_TOOL_NAMES.has(tool.function.name),
);

const NO_DOCUMENT_TOOL_NAMES = new Set([
  "create_google_doc",
  "find_google_docs",
  "read_google_doc",
  "edit_google_doc",
  "list_folders",
  "list_notes",
  "search_sources",
  "read_source",
  "search_web",
  "wolfram_alpha",
  "create_file",
  "remember",
  "done",
]);

// Start screen chat (Library.jsx): no open note at all, so read_document/
// see_document have nothing to read — only search_web/done and the library
// tools (folders, notes, sources) apply there.
export const AGENT_NO_DOCUMENT_TOOLS = AGENT_TOOLS.filter((tool) =>
  NO_DOCUMENT_TOOL_NAMES.has(tool.function.name),
);

// Start screen with write access: no editor is open, so the agent first picks
// a target note (create_note / open_note, handled by the session in
// libraryNote.js); the ordinary document tools then act on that note.
const LIBRARY_NOTE_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Legt eine neue, leere Notiz in der Bibliothek an und macht sie zum Ziel der Dokument-Werkzeuge (write_text, insert_* ...). Gibt noteId und pageIds zurück. Eine Notiz entsteht nur auf ausdrücklichen Wunsch, nicht für reine Fragen.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titel der Notiz" },
          folder: { type: "string", description: "Ordner (id oder Name) aus list_folders, optional" },
          kind: { type: "string", enum: ["page", "whiteboard"], description: "page (Standard, Seiten) oder whiteboard (unbegrenzte Fläche)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_note",
      description:
        "Wählt eine bestehende eigene Notiz (noteId aus list_notes) als Ziel zum Lesen und Bearbeiten. Importierte PDFs und Bilder gehen nicht.",
      parameters: {
        type: "object",
        properties: { noteId: { type: "string" } },
        required: ["noteId"],
      },
    },
  },
];

// Edit mode splits into a core the model reaches for on nearly every turn
// (full schema, always sent) and an extended set it only names occasionally -
// full table/diagram/component builders run 300-950 chars each, and most
// turns ("schreib einen Satz", "was steht auf Seite 2") touch none of them.
// The extended set is described in one line each instead (see
// describeExtendedToolManifest below) and only actually added to the `tools`
// array for the rest of a run once the model calls enable_tools for it -
// the same shape as this environment's own ToolSearch: named upfront,
// fetched in full on demand.
// Only tools whose need can't be told upfront from the task, or that are cheap
// enough that deferring them would cost more in a forced extra round trip
// than just sending them stays core. delete_objects/add_shape/draw/erase are
// usually obvious from the task text itself ("lösche ...", "zeichne einen
// Pfeil...") - the model can enable_tools for them in the same turn as the
// read_document call it makes anyway, so deferring costs nothing there. What
// see_document/add_page need is only known *after* a tool result comes back
// (read_document's stroke count; the page actually filling up), one turn too
// late to bundle - and both are small enough (~90/~80 tokens) that forcing a
// dedicated round trip whenever they are needed would cost more than they do.
export const CORE_TOOL_NAMES = new Set([
  "read_document",
  "see_document",
  "write_text",
  "edit_text",
  "add_page",
  "search_web",
  "wolfram_alpha",
  "list_folders",
  "list_notes",
  // Solving an exercise starts with the class material (see systemPrompt), so
  // the source tools are needed on the first turn, not after enable_tools.
  "search_sources",
  "read_source",
  // One short schema, and a weak spot shows up mid-task, not after enable_tools.
  "remember",
  "done",
]);

export const ENABLE_TOOLS_TOOL = {
  type: "function",
  function: {
    name: "enable_tools",
    description:
      "Schaltet weitere Werkzeuge für den Rest dieses Laufs frei (siehe die Liste im Systemprompt). Vor der ersten Nutzung eines dort aufgeführten Werkzeugs aufrufen; danach steht es wie jedes andere zur Verfügung.",
    parameters: {
      type: "object",
      properties: { names: { type: "array", items: { type: "string" } } },
      required: ["names"],
    },
  },
};

export const AGENT_CORE_TOOLS = [
  ...AGENT_TOOLS.filter((tool) => CORE_TOOL_NAMES.has(tool.function.name)),
  ENABLE_TOOLS_TOOL,
];

// Union by name: some tools (list_notes, ...) sit in both source sets.
export const AGENT_LIBRARY_TOOLS = [
  ...new Map(
    [...AGENT_CORE_TOOLS, ...AGENT_NO_DOCUMENT_TOOLS, ...LIBRARY_NOTE_TOOLS, ...SCHOOL_TOOLS].map((tool) => [
      tool.function.name,
      tool,
    ]),
  ).values(),
];

// Die drei Lesewerkzeuge des Klausur-Subagenten (examAgent.js), mit den
// bestehenden Schemas.
const EXAM_AGENT_TOOLS = AGENT_LIBRARY_TOOLS.filter((tool) => SUBAGENT_TOOLS.includes(tool.function.name));

const AGENT_EXTENDED_TOOLS = AGENT_TOOLS.filter(
  (tool) => !CORE_TOOL_NAMES.has(tool.function.name),
);

export const AGENT_EXTENDED_BY_NAME = new Map(
  AGENT_EXTENDED_TOOLS.map((tool) => [tool.function.name, tool]),
);

// One line per extended tool, name plus its own first sentence — read off the
// full description rather than authored separately, so the manifest can't
// say something the real schema doesn't.
export function describeExtendedToolManifest() {
  return AGENT_EXTENDED_TOOLS.map((tool) => {
    // Split on a sentence-ending period only, not every colon — several of
    // these descriptions use a colon mid-sentence to introduce a list (e.g.
    // insert_diagram's "Kästen ... : Kästen mit Beschriftung ..."), and
    // cutting there would lose exactly the part naming what the tool does.
    const first = tool.function.description.split(/(?<=\.)\s+/)[0];
    return `${tool.function.name} — ${first}`;
  }).join("\n");
}

// Short line per tool call for the step list in the panel.
export function describeToolCall(name, args = {}) {
  switch (name) {
    case "read_document":
      return "Dokument lesen";
    case "list_folders":
      return "Ordner auflisten";
    case "list_notes":
      return args.folderId ? `Notizen in ${args.folderId} auflisten` : "Notizen auflisten";
    case "search_sources":
      return `Quellen durchsuchen: ${String(args.query || "").slice(0, 40)}`;
    case "read_source":
      return `Quelle ${args.image ? "ansehen" : "lesen"} (Seite ${args.page ?? "?"})`;
    case "see_document":
      return args.pageId ? "Seite ansehen" : "Seiten ansehen";
    case "write_text":
      return args.label
        ? `Schreibe ${args.label}`
        : `Text schreiben: ${String(args.text || "").slice(0, 40)}`;
    case "edit_text":
      return args.label ? `Überarbeite ${args.label}` : "Text ändern";
    case "delete_objects":
      return `${args.ids?.length ?? 0} Element(e) löschen`;
    case "add_shape":
      return `Form zeichnen (${args.type || "rect"})`;
    case "draw":
      return `${args.paths?.length ?? 0} Strich(e) zeichnen`;
    case "erase":
      return `${args.strokeIds?.length ?? 0} Strich(e) radieren`;
    case "add_page":
      return "Seite anhängen";
    case "insert_table":
      return `Tabelle einfügen (${args.rows || "?"}x${args.cols || "?"})`;
    case "edit_table_cell":
      return `Zelle ändern (Zeile ${args.row ?? "?"}, Spalte ${args.col ?? "?"})`;
    case "insert_diagram":
      return `Diagramm einfügen (${args.nodes?.length ?? 0} Knoten)`;
    case "insert_mindmap":
      return `Mindmap einfügen (${args.branches?.length ?? 0} Zweige)`;
    case "insert_section_header":
      return `Überschrift: ${String(args.title || "").slice(0, 40)}`;
    case "insert_callout":
      return `Kasten einfügen (${CALLOUT_VARIANTS[args.variant] ? args.variant : "definition"})`;
    case "list_components":
      return args.tag ? `Bauelemente suchen (${args.tag})` : "Bauelemente auflisten";
    case "read_component":
      return `Rezept lesen: ${args.id || "?"}`;
    case "insert_component":
      return `Element einfügen: ${args.id || "?"}`;
    case "define_component":
      return `Element speichern: ${args.id || "?"}`;
    case "enable_tools":
      return `Werkzeuge freischalten: ${(args.names || []).join(", ") || "?"}`;
    case "search_web": {
      const label = args.source === "web" ? "Websuche" : args.source === "wikipedia" ? "Wikipedia" : "Suche";
      return `${label}: ${String(args.query || "").slice(0, 40)}`;
    }
    case "wolfram_alpha":
      return `Wolfram|Alpha: ${String(args.query || "").slice(0, 40)}`;
    case "create_file":
      return `Datei erstellen: ${String(args.title || args.format || "").slice(0, 40)}`;
    case "create_google_doc":
      return `Google Doc erstellen: ${String(args.title || "").slice(0, 40)}`;
    case "find_google_docs":
      return args.query ? `Google Docs suchen: ${String(args.query).slice(0, 40)}` : "Google Docs auflisten";
    case "read_google_doc":
      return "Google Doc lesen";
    case "edit_google_doc":
      return "Google Doc bearbeiten";
    case "create_note":
      return `Notiz anlegen: ${String(args.title || "").slice(0, 40)}`;
    case "open_note":
      return "Notiz öffnen";
    case "list_tasks":
      return args.query ? `Aufgaben suchen: ${String(args.query).slice(0, 40)}` : "Aufgaben nachsehen";
    case "add_task":
      return `Eintragen: ${String(args.title || "").slice(0, 40)}`;
    case "set_task_done":
      return args.done === false ? "Aufgabe wieder öffnen" : "Aufgabe abhaken";
    case "build_exam_dashboard":
      return args.wish ? `Klausur-Dashboard: ${String(args.wish).slice(0, 40)}` : "Klausur-Dashboard bauen";
    case "remember":
      return String(args.text || "").trim() ? "Merken" : "Vergessen";
    case "done":
      return "Fertig";
    default:
      return name;
  }
}

// One store per app run unless the caller supplies its own (tests do), so the
// agent's saved components survive between runs without being re-read on every
// tool call.
let sharedComponentStore = null;
function componentStore(api) {
  if (api?.getComponentStore) return api.getComponentStore();
  if (!sharedComponentStore) sharedComponentStore = createComponentStore();
  return sharedComponentStore;
}

// What a placed component actually occupies, so the model can put the next
// block under it without guessing the recipe's internal geometry.
function componentExtent({ objects, strokes }) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const see = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const object of objects) {
    see(object.x, object.y);
    see(object.x + object.width, object.y + object.height);
  }
  for (const stroke of strokes) for (const point of stroke.points) see(point.x, point.y);
  if (minX === Infinity) return { width: 0, height: 0, bottom: 0 };
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    bottom: Math.round(maxY),
  };
}

function textPatch(args, existing, defaultColor, bounds) {
  const patch = {};
  if (typeof args.text === "string") patch.text = args.text.slice(0, MAX_TEXT);
  if (Number.isFinite(args.x)) patch.x = clamp(args.x, bounds.minX, bounds.maxX, 0);
  if (Number.isFinite(args.y)) patch.y = clamp(args.y, bounds.minY, bounds.maxY, 0);
  if (Number.isFinite(args.width))
    patch.width = clamp(args.width, 20, bounds.maxX - (patch.x ?? existing?.x ?? 0), 400);
  if (args.size !== undefined) patch.fontSize = clamp(args.size, 8, 96, existing?.fontSize ?? 18);
  if (args.color !== undefined) patch.color = color(args.color, defaultColor);
  if (args.bold !== undefined) patch.bold = args.bold === true;
  if (args.italic !== undefined) patch.italic = args.italic === true;
  if (args.underline !== undefined) patch.underline = args.underline === true;
  if (["left", "center", "right"].includes(args.align)) patch.textAlign = args.align;
  if (FONT_STACKS.some((font) => font.id === args.font)) patch.fontFamily = args.font;
  return patch;
}

async function askWolfram(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return "Fehler: query ist leer.";
  try {
    return (await requestWolfram({ query: trimmed })) || `Wolfram|Alpha hat zu "${trimmed}" nichts geliefert.`;
  } catch (error) {
    return `Fehler: Wolfram|Alpha fehlgeschlagen (${error.message}).`;
  }
}

// Baut die Datei und reicht sie ans Teilen-Menü. saveAndShare kommt per
// dynamischem Import (jspdf + Capacitor-Plugins), api.shareFile ersetzt es in Tests.
async function makeFile(args, api) {
  try {
    const { blob, filename } = await createFile(args);
    const share = api?.shareFile || (await import("../documents/exportDocument.js")).saveAndShare;
    await share(blob, filename);
    return { created: filename, size: blob.size, hint: "Das Teilen-Menü wurde geöffnet." };
  } catch (error) {
    return `Fehler: ${error.message}`;
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Baut dasselbe .docx wie create_file, der Space macht daraus ein Google Doc.
// result.card geht nicht ans Modell, sondern als Karte in den Chat (useAgent).
async function makeGoogleDoc(args) {
  try {
    const { blob } = await createFile({ format: "docx", title: args.title, text: args.text });
    const doc = await requestGoogleDoc({ title: String(args.title || "").trim() || "Dokument", docx: await blobToBase64(blob) });
    return {
      created: doc.title,
      hint: "Der Nutzer sieht im Chat eine Karte zum Öffnen.",
      card: { kind: "gdoc", title: doc.title, url: doc.url },
    };
  } catch (error) {
    return `Fehler: Google Docs fehlgeschlagen (${error.message}). Alternativ create_file mit format docx.`;
  }
}

const gdocError = (error) => `Fehler: Google Docs fehlgeschlagen (${error.message}).`;

async function findGoogleDocs(args) {
  try {
    const { files = [] } = await requestGoogleDocEdit({ action: "list", query: String(args.query || "").trim() });
    if (!files.length) return "Keine Google Docs gefunden.";
    return files.map((f) => ({ id: f.id, title: f.name, modified: f.modifiedTime }));
  } catch (error) {
    return gdocError(error);
  }
}

async function readGoogleDoc(args) {
  try {
    const { text = "" } = await requestGoogleDocEdit({ action: "read", id: String(args.id || "") });
    return text || "Das Dokument ist leer.";
  } catch (error) {
    return gdocError(error);
  }
}

// result.card geht wie bei create_google_doc nicht ans Modell, sondern in den Chat.
async function editGoogleDoc(args) {
  const mode = args.mode;
  if (mode !== "replace" && mode !== "append") return "Fehler: mode muss replace oder append sein.";
  if (mode === "replace" && !String(args.find || "")) return "Fehler: find fehlt.";
  if (mode === "append" && !String(args.text || "").trim()) return "Fehler: text fehlt.";
  try {
    const { title, url, changed } = await requestGoogleDocEdit({
      action: mode,
      id: String(args.id || ""),
      find: args.find,
      text: String(args.text ?? ""),
    });
    // replaceAllText succeeds with 0 hits when find does not match exactly.
    if (mode === "replace" && !changed) return "Fehler: find kommt im Dokument nicht vor. Lies es mit read_google_doc und kopiere die Stelle exakt.";
    if (!/^https:\/\/(docs|drive)\.google\.com\//.test(url || "")) return "Fehler: Google Docs fehlgeschlagen (Keine Dokument-Adresse erhalten).";
    return {
      edited: title,
      ...(mode === "replace" ? { replaced: changed } : {}),
      hint: "Der Nutzer sieht im Chat eine Karte zum Öffnen.",
      card: { kind: "gdoc", title, url },
    };
  } catch (error) {
    return gdocError(error);
  }
}

// Baut ein Klausur-Dashboard mit dem Subagenten (examAgent.js): gemeinsamer Weg
// für den Knopf im Kalender (useKnowledge) und das Werkzeug unten.
export const runExamDashboard = (options) =>
  buildExamDashboard({ execute: executeTool, tools: EXAM_AGENT_TOOLS, ...options });

// Delegiert an den Klausur-Subagenten. Der Haupt-Agent bekommt eine Zeile
// zurück, die gelesenen Quellen bleiben im Verlauf des Subagenten.
async function buildDashboardTool(args) {
  try {
    const { line, event } = await runExamDashboard({ id: args.id, wish: args.wish, mode: args.mode });
    globalThis.dispatchEvent?.(new Event(KNOWLEDGE_CHANGED));
    return { summary: line, card: { kind: "exam", title: event.title, sub: line, eventId: event.id } };
  } catch (error) {
    return `Fehler: ${error.message}`;
  }
}

// Executes one tool call against the live document. Never throws on bad model
// arguments: the error text goes back to the model as the tool result so it can
// correct itself, and the run continues.
export async function executeTool(name, rawArgs, api) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};

  // search_web/done need no open document — the start-screen chat (Library.jsx)
  // calls executeTool without one at all, so api.getDocument below would throw.
  if (name === "search_web") return searchWeb(args.query, args.source);
  if (name === "wolfram_alpha") return askWolfram(args.query);
  if (name === "create_file") return makeFile(args, api);
  if (name === "create_google_doc") return makeGoogleDoc(args);
  if (name === "find_google_docs") return findGoogleDocs(args);
  if (name === "read_google_doc") return readGoogleDoc(args);
  if (name === "edit_google_doc") return editGoogleDoc(args);
  if (name === "done") return { summary: String(args.summary || "") };
  if (name === "remember") return browserMemoryRepository.remember(args);
  if (name === "build_exam_dashboard") return buildDashboardTool(args);
  if (isSchoolTool(name)) return runSchoolTool(name, args);
  if (name === "create_note") return api?.createNote ? api.createNote(args) : "Fehler: Notizen anlegen geht nur auf der Startseite.";
  if (name === "open_note") return api?.openNote ? api.openNote(args) : "Fehler: Notizen wechseln geht nur auf der Startseite.";

  if (name === "list_folders") {
    const folders = browserFolderRepository.listFolders();
    const allNotes = [...browserNoteRepository.listNotes(), ...(await browserDocumentRepository.listImportedNotes())];
    return folderTree(folders, allNotes, browserCardRepository.all());
  }

  if (name === "list_notes" || name === "search_sources" || name === "read_source") {
    const notes = browserNoteRepository.listNotes();
    const folders = browserFolderRepository.listFolders();
    const folder = args.folderId
      ? folders.find(
          (f) => f.id === args.folderId || f.name.toLowerCase() === String(args.folderId).toLowerCase(),
        )
      : null;
    if (args.folderId && !folder)
      return `Fehler: Ordner "${args.folderId}" gibt es nicht. Vorhanden: ${folders.map((f) => f.name).join(", ")}`;
    // Folders nest (Deutsch > Der Vorleser), so a folder covers its subfolders
    // too. read_source takes no folderId and sees every note.
    const scopeIds = folder ? folderWithDescendants(folders, folder.id) : null;
    const inScope = (n) => !folder || folders.some((f) => scopeIds.has(f.id) && matchesFolder(n, f));
    const imported = (await browserDocumentRepository.listImportedNotes()).filter(inScope);
    if (name !== "list_notes") {
      const scope = { notes: notes.filter(inScope), imported };
      return name === "search_sources" ? searchSources(args.query, scope) : readSource(args, scope);
    }
    const cards = browserCardRepository.all();
    const entries = [
      ...notes.filter(inScope).map((n) => ({
        id: n.id,
        title: n.title || "",
        subject: n.subject || "",
        updatedAt: n.updatedAt || 0,
        preview: previewTextOf(n.id),
        card: noteCardOf(n, folders, cards),
      })),
      ...imported.map((n) => ({ ...importedNoteEntry(n), card: noteCardOf(n, folders, cards) })),
    ];
    return noteListing(entries, args.query);
  }

  const inkColor = color(api?.getColor?.(), "#1A1A1A");
  const document = api?.getDocument ? api.getDocument() : null;
  if (!document) {
    if (api?.createNote)
      return `Fehler: Noch keine Notiz als Ziel für "${name}". Rufe zuerst create_note oder open_note auf.`;
    return `Fehler: Kein Dokument geöffnet für "${name}".`;
  }
  const pageIds = document.pages.map((page) => page.id);
  const objects = pageObjectsOf(document);
  const bounds = boundsFor(document);
  const theme = themeOf(document);
  const whiteboard = isWhiteboardDocument(document);
  const needsPage = [
    "write_text",
    "add_shape",
    "draw",
    "insert_table",
    "insert_diagram",
    "insert_mindmap",
    "insert_section_header",
    "insert_callout",
    "insert_component",
  ].includes(name);
  if (needsPage && !pageIds.includes(args.pageId))
    return `Fehler: pageId "${args.pageId}" gibt es nicht. Vorhanden: ${pageIds.join(", ")}`;

  switch (name) {
    case "read_document":
      return {
        pageWidth: whiteboard ? null : PAGE_WIDTH,
        pageHeight: whiteboard ? null : PAGE_HEIGHT,
        pages: pageIds.map((pageId) => ({
          pageId,
          strokes: document.strokes.filter((stroke) => stroke.pageId === pageId).length,
          objects: objects
            .filter((object) => object.pageId === pageId)
            .map((object) => ({
              id: object.id,
              type: object.type,
              ...objectBounds(object),
              ...(object.type === "text"
                ? { text: object.text, size: object.fontSize }
                : { color: object.color }),
            })),
        })),
      };

    case "see_document": {
      if (args.pageId && !pageIds.includes(args.pageId))
        return `Fehler: pageId "${args.pageId}" gibt es nicht. Vorhanden: ${pageIds.join(", ")}`;
      const pages = renderPagesFromDocument(document, SEE_IMAGE_OPTIONS)
        .filter((page) => !args.pageId || page.id === args.pageId)
        .slice(0, MAX_SEE_PAGES)
        .map((page) => ({ id: page.id, src: page.src }));
      if (pages.length === 0) return "Fehler: Keine Seite zum Anzeigen gefunden.";
      return { pages };
    }

    case "write_text": {
      // An explicit colour still wins; the role only moves the default off the
      // user's ink so the palette holds up on light and dark paper alike.
      const baseColor = args.role ? roleColor(theme, args.role) : inkColor;
      const patch = textPatch({ ...args, size: args.size ?? 18 }, null, baseColor, bounds);
      const text = patch.text ?? "";
      if (!text.trim()) return "Fehler: text ist leer.";
      const width = patch.width ?? 400;
      const fontSize = patch.fontSize ?? 18;
      const { y, lineHeight } = snapBaselineToRule(
        patch.y ?? 64,
        fontSize,
        api.getPaperStyle?.(),
        patch.fontFamily,
        patch.bold,
      );
      const height = estimateTextHeight(text, width, fontSize, lineHeight, patch.fontFamily, patch.bold);
      const object = createPageObject({
        id: newId("text"),
        pageId: args.pageId,
        type: "text",
        x: 64,
        color: baseColor,
        aiGenerated: true,
        ...patch,
        y,
        lineHeight,
        width,
        height,
      });
      // Markers are ordinary rects, and objects render in insertion order, so
      // they go in ahead of the text they sit behind.
      const markers = HIGHLIGHT_COLORS[args.highlight]
        ? buildHighlightObjects(object, args.highlight)
        : [];
      api.apply(
        [...markers, object].map((added) => ({ type: "add-object", object: added })),
      );
      return { id: object.id, height, bottom: object.y + height };
    }

    case "insert_section_header": {
      const built = buildSectionHeaderPreset(args, bounds, theme);
      if (typeof built === "string") return built;
      api.apply(built.objects.map((object) => ({ type: "add-object", object })));
      return built.result;
    }

    case "insert_callout": {
      const built = buildCalloutPreset(args, bounds, theme);
      if (typeof built === "string") return built;
      api.apply(built.objects.map((object) => ({ type: "add-object", object })));
      return built.result;
    }

    case "list_components": {
      const tag = typeof args.tag === "string" ? args.tag.toLowerCase() : null;
      const entries = componentStore(api)
        .list()
        .filter((entry) => !tag || entry.tags.includes(tag))
        .map((entry) => {
          const recipe = componentStore(api).get(entry.id);
          return {
            ...entry,
            params: Object.entries(recipe?.params || {}).map(
              ([name, spec]) => `${name}=${JSON.stringify(spec?.default)}`,
            ),
          };
        });
      return { components: entries };
    }

    case "read_component": {
      const recipe = componentStore(api).get(args.id);
      if (!recipe) return `Fehler: Kein Bauelement mit der id "${args.id}".`;
      return recipe;
    }

    case "insert_component": {
      const recipe = componentStore(api).get(args.id);
      if (!recipe) return `Fehler: Kein Bauelement mit der id "${args.id}". list_components zeigt die vorhandenen.`;
      let built;
      try {
        built = runRecipe(
          recipe,
          { ...(args.args || {}), x: args.x, y: args.y },
          { pageId: args.pageId, theme },
        );
      } catch (error) {
        return `Fehler im Rezept "${args.id}": ${error.message}`;
      }
      if (built.objects.length === 0 && built.strokes.length === 0)
        return `Fehler: "${args.id}" hat nichts erzeugt. Sind die Listen-Parameter gefüllt?`;
      api.apply([
        ...built.objects.map((object) => ({ type: "add-object", object })),
        ...built.strokes.map((stroke) => ({ type: "commit-stroke", stroke })),
      ]);
      return { id: args.id, ...componentExtent(built) };
    }

    case "define_component": {
      const id = String(args.id || "").trim().toLowerCase().replace(/\s+/g, "-");
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(id))
        return "Fehler: id braucht Kleinbuchstaben, Ziffern, - oder _.";
      const recipe = {
        id,
        title: String(args.title || id),
        description: String(args.description || ""),
        tags: Array.isArray(args.tags) ? args.tags.map((tag) => String(tag).toLowerCase()) : [],
        params: args.params && typeof args.params === "object" ? args.params : {},
        body: args.body,
      };
      // Run it once before saving: a recipe that throws is worth far less to
      // the model as a stored element than as an error it can still fix.
      try {
        runRecipe(recipe, {}, { pageId: pageIds[0], theme });
      } catch (error) {
        return `Fehler im Rezept: ${error.message}`;
      }
      if (!componentStore(api).save(recipe))
        return "Fehler: Bauelement konnte nicht gespeichert werden (Speicher voll?).";
      return { id, saved: true };
    }

    case "edit_text": {
      const existing = objects.find((object) => object.id === args.id);
      if (!existing) return `Fehler: Kein Element mit der ID "${args.id}".`;
      const patch = textPatch(args, existing, existing.color, bounds);
      const text = patch.text ?? existing.text;
      const width = patch.width ?? existing.width;
      const fontSize = patch.fontSize ?? existing.fontSize;
      const { y, lineHeight } = snapBaselineToRule(
        patch.y ?? existing.y,
        fontSize,
        api.getPaperStyle?.(),
        patch.fontFamily ?? existing.fontFamily,
        patch.bold ?? existing.bold,
      );
      const height = estimateTextHeight(
        text,
        width,
        fontSize,
        lineHeight,
        patch.fontFamily ?? existing.fontFamily,
        patch.bold ?? existing.bold,
      );
      api.apply([
        {
          type: "update-object",
          objectId: existing.id,
          changes: { ...patch, y, lineHeight, height, aiGenerated: true },
        },
      ]);
      return { id: existing.id, height, bottom: y + height };
    }

    case "delete_objects": {
      const ids = Array.isArray(args.ids) ? args.ids.filter((id) => typeof id === "string") : [];
      if (ids.length === 0) return "Fehler: ids ist leer.";
      const deleted = ids.filter((id) => objects.some((object) => object.id === id)).length;
      api.apply([{ type: "remove-objects", objectIds: ids }]);
      return { deleted };
    }

    case "add_shape": {
      if (!SHAPE_TYPES.includes(args.type))
        return `Fehler: type muss eines von ${SHAPE_TYPES.join(", ")} sein.`;
      const object = createPageObject({
        id: newId("shape"),
        pageId: args.pageId,
        type: args.type,
        x: clamp(args.x, bounds.minX, bounds.maxX, 0),
        y: clamp(args.y, bounds.minY, bounds.maxY, 0),
        width: clamp(args.width, -(bounds.maxX - bounds.minX), bounds.maxX - bounds.minX, 160),
        height: clamp(args.height, -(bounds.maxY - bounds.minY), bounds.maxY - bounds.minY, 90),
        color: color(args.color, "#3E7BD8"),
        strokeWidth: clamp(args.strokeWidth, 1, 40, 3),
        fillColor: args.fillColor ? color(args.fillColor, "") : "",
      });
      api.apply([{ type: "add-object", object }]);
      return { id: object.id };
    }

    case "draw": {
      const paths = Array.isArray(args.paths) ? args.paths.slice(0, MAX_PATHS) : [];
      if (paths.length === 0) return "Fehler: paths ist leer.";
      const tool = DRAW_TOOLS.includes(args.tool) ? args.tool : "pen";
      const style = getToolStyle(tool, color(args.color, inkColor), clamp(args.width, 1, 40, 3));
      const strokes = paths
        .map((path) =>
          createInkStroke({
            id: newId("stroke"),
            pageId: args.pageId,
            tool,
            color: style.color,
            width: style.width,
            opacity: style.opacity,
            points: (Array.isArray(path) ? path : []).slice(0, MAX_POINTS).map((point) => ({
              x: clamp(point?.x, bounds.minX, bounds.maxX, 0),
              y: clamp(point?.y, bounds.minY, bounds.maxY, 0),
            })),
          }),
        )
        .filter((stroke) => stroke.points.length > 1);
      if (strokes.length === 0) return "Fehler: Kein Pfad hatte mindestens zwei gültige Punkte.";
      api.apply(strokes.map((stroke) => ({ type: "commit-stroke", stroke })));
      return { strokeIds: strokes.map((stroke) => stroke.id) };
    }

    case "erase": {
      const ids = Array.isArray(args.strokeIds) ? args.strokeIds : [];
      if (ids.length === 0) return "Fehler: strokeIds ist leer.";
      const erased = ids.filter((id) => document.strokes.some((stroke) => stroke.id === id)).length;
      api.apply([{ type: "remove-strokes", strokeIds: ids }]);
      return { erased };
    }

    case "add_page": {
      if (whiteboard)
        return "Fehler: Whiteboard hat nur eine unbegrenzte Fläche, add_page ist hier nicht möglich.";
      api.apply([{ type: "add-page" }]);
      const pages = api.getDocument().pages;
      return { pageId: pages[pages.length - 1]?.id };
    }

    case "insert_table": {
      const built = buildTablePreset(args, bounds, inkColor);
      if (typeof built === "string") return built;
      api.apply(built.objects.map((object) => ({ type: "add-object", object })));
      return built.result;
    }

    case "edit_table_cell": {
      const existing = objects.find((object) => object.id === args.id);
      if (!existing || existing.type !== "table")
        return `Fehler: Keine Tabelle mit der ID "${args.id}".`;
      const row = Math.round(args.row);
      const col = Math.round(args.col);
      if (row < 0 || row >= existing.rows || col < 0 || col >= existing.cols)
        return `Fehler: Zelle (${args.row}, ${args.col}) liegt außerhalb der Tabelle (${existing.rows}x${existing.cols}).`;
      const cellText = existing.cellText.map((r) => [...r]);
      cellText[row][col] = String(args.text ?? "");
      api.apply([{ type: "update-object", objectId: existing.id, changes: { cellText } }]);
      return { id: existing.id };
    }

    case "insert_diagram": {
      const built = buildDiagramPreset(args, bounds, inkColor);
      if (typeof built === "string") return built;
      api.apply(built.objects.map((object) => ({ type: "add-object", object })));
      return built.result;
    }

    case "insert_mindmap": {
      const built = buildMindmapPreset(args, bounds, inkColor);
      if (typeof built === "string") return built;
      api.apply(built.objects.map((object) => ({ type: "add-object", object })));
      return built.result;
    }

    case "done":
      return { summary: String(args.summary || "") };

    default:
      return `Fehler: Unbekanntes Werkzeug "${name}".`;
  }
}
