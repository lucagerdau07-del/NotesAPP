import { createInkStroke, getToolStyle } from "../ink/inkDocument.js";
import { createPageObject, objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import { renderPagesFromDocument, previewTextOf } from "../documents/notePreview.js";
import { browserFolderRepository, folderWithDescendants } from "../storage/folderRepository.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";
import { readSource, searchSources } from "../knowledge/sources.js";
import { requestSearch } from "./agentClient.js";
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

// Same rule as Library.jsx's matchesFolder (kept separate rather than
// imported - a UI component isn't a dependency of the tool layer): a note
// belongs to a folder when its subject string matches the folder's id or name.
function matchesFolder(note, folder) {
  const subject = String(note?.subject || "").toLowerCase();
  return !!subject && (subject === folder.name.toLowerCase() || subject === folder.id.toLowerCase());
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
        "Listet alle Ordner der Bibliothek mit id, name, parentId (null bei Ordnern oberster Ebene) und Notizanzahl. Rufe das zuerst auf, um die Ordnerstruktur günstig zu überblicken, bevor du list_notes für einen bestimmten Ordner aufrufst.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description:
        "Listet Notizen (eigene und importierte PDFs/Bilder) mit id, title, subject, updatedAt und einem kurzen Auszug (kein voller Inhalt) — günstig, um die richtige Notiz zu finden, ohne jede einzeln zu öffnen. Ohne folderId werden alle durchsucht.",
      parameters: {
        type: "object",
        properties: {
          folderId: { type: "string", description: "Nur Notizen aus diesem Ordner (id oder Name)" },
          query: { type: "string", description: "Filtert Titel und Textauszug per Teilstring, optional" },
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
        "Volltextsuche in den Quellen der Bibliothek: importierte Bücher und PDFs, gescannte Buchseiten, Arbeitsblätter und getippter Text eigener Notizen. Liefert die besten Stellen mit Auszug, noteId, page und Zitierangabe cite.",
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
              "Seiten eines importierten Dokuments als Bild statt Text, wenn Abbildung, Tabelle oder Layout genau zählen. Teurer als Text.",
          },
        },
        required: ["noteId", "page"],
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
  "read_document",
  "see_document",
  "list_folders",
  "list_notes",
  "search_sources",
  "read_source",
  "search_web",
  "done",
]);

// Chat mode (editDocument: false) still lets the model look at the note, just
// not change it — read_document/see_document/done from the same schema list,
// so the read path is never a second definition to drift out of sync.
export const AGENT_READ_TOOLS = AGENT_TOOLS.filter((tool) =>
  READ_ONLY_TOOL_NAMES.has(tool.function.name),
);

const NO_DOCUMENT_TOOL_NAMES = new Set([
  "list_folders",
  "list_notes",
  "search_sources",
  "read_source",
  "search_web",
  "done",
]);

// Start screen chat (Library.jsx): no open note at all, so read_document/
// see_document have nothing to read — only search_web/done and the library
// tools (folders, notes, sources) apply there.
export const AGENT_NO_DOCUMENT_TOOLS = AGENT_TOOLS.filter((tool) =>
  NO_DOCUMENT_TOOL_NAMES.has(tool.function.name),
);

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
  "list_folders",
  "list_notes",
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

// Executes one tool call against the live document. Never throws on bad model
// arguments: the error text goes back to the model as the tool result so it can
// correct itself, and the run continues.
export async function executeTool(name, rawArgs, api) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};

  // search_web/done need no open document — the start-screen chat (Library.jsx)
  // calls executeTool without one at all, so api.getDocument below would throw.
  if (name === "search_web") return searchWeb(args.query, args.source);
  if (name === "done") return { summary: String(args.summary || "") };

  if (name === "list_folders") {
    const folders = browserFolderRepository.listFolders();
    const notes = browserNoteRepository.listNotes();
    return browserDocumentRepository.listImportedNotes().then((imported) => {
      const allNotes = [...notes, ...imported];
      return folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId || null,
        noteCount: allNotes.filter((n) => matchesFolder(n, folder)).length,
      }));
    });
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
    if (name !== "list_notes") {
      // Sources nest (Deutsch > Der Vorleser), so searching a folder covers its
      // subfolders too. read_source takes no folderId and sees every note.
      const scopeIds = folder ? folderWithDescendants(folders, folder.id) : null;
      const inScope = (n) => !folder || folders.some((f) => scopeIds.has(f.id) && matchesFolder(n, f));
      const scope = {
        notes: notes.filter(inScope),
        imported: (await browserDocumentRepository.listImportedNotes()).filter(inScope),
      };
      return name === "search_sources" ? searchSources(args.query, scope) : readSource(args, scope);
    }
    const query = String(args.query || "").trim().toLowerCase();
    return browserDocumentRepository.listImportedNotes().then((imported) => {
      const entries = [
        ...notes.map((n) => ({
          id: n.id,
          title: n.title || "",
          subject: n.subject || "",
          updatedAt: n.updatedAt || 0,
          preview: previewTextOf(n.id),
        })),
        ...imported.map((n) => importedNoteEntry(n)),
      ];
      return entries
        .filter((n) => !folder || matchesFolder(n, folder))
        .filter(
          (n) =>
            !query ||
            n.title.toLowerCase().includes(query) ||
            n.preview.toLowerCase().includes(query),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_LISTED_NOTES);
    });
  }

  const inkColor = color(api?.getColor?.(), "#1A1A1A");
  const document = api?.getDocument ? api.getDocument() : null;
  if (!document) {
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
