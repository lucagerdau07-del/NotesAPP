import { createInkStroke, getToolStyle } from "../ink/inkDocument.js";
import { createPageObject, objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import { renderPagesFromDocument } from "../documents/notePreview.js";
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
          role: {
            type: "string",
            enum: STYLE_ROLES,
            description:
              "Farbrolle statt eigener Hex-Wert — passt sich hellem und dunklem Papier an. color überschreibt sie.",
          },
          highlight: {
            type: "string",
            enum: Object.keys(HIGHLIGHT_COLORS),
            description:
              "Legt einen Marker hinter die Zeilen dieses Blocks. Für einzelne Schlüsselbegriffe: eigenen kurzen Block schreiben und den markieren.",
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
        "Fügt eine Tabelle als Raster aus Zellrechtecken mit Textblöcken ein — schneller als jede Zelle einzeln zu zeichnen. Gibt je Zelle eine id zurück; einzelne Zellen danach mit edit_text anpassen.",
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
            description: 'Parametername auf {"default": Wert}, z.B. {"width": {"default": 400}}',
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

const READ_ONLY_TOOL_NAMES = new Set(["read_document", "see_document", "done"]);

// Chat mode (editDocument: false) still lets the model look at the note, just
// not change it — read_document/see_document/done from the same schema list,
// so the read path is never a second definition to drift out of sync.
export const AGENT_READ_TOOLS = AGENT_TOOLS.filter((tool) =>
  READ_ONLY_TOOL_NAMES.has(tool.function.name),
);

// Short line per tool call for the step list in the panel.
export function describeToolCall(name, args = {}) {
  switch (name) {
    case "read_document":
      return "Dokument lesen";
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
export function executeTool(name, rawArgs, api) {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const inkColor = color(api.getColor?.(), "#1A1A1A");
  const document = api.getDocument();
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
