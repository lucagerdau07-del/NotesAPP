import { createInkStroke, getToolStyle } from "../ink/inkDocument.js";
import { createPageObject, objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import { renderPagesFromDocument } from "../documents/notePreview.js";
import { FONT_STACKS, snapBaselineToRule } from "../ink/textStyle.js";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  boundsFor,
  isWhiteboardDocument,
  clamp,
  color,
  newId,
} from "./agentGeometry.js";
import { buildTablePreset, buildDiagramPreset, buildMindmapPreset } from "./presets.js";

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
const SEE_IMAGE_OPTIONS = { maxDimension: 1000, mimeType: "image/jpeg", quality: 0.72 };
const MAX_SEE_PAGES = 8;

// The model needs to know where its next block may start. Real wrapping happens
// in the DOM, so this is a deliberate estimate.
// ponytail: 0.52em average glyph width; swap for a canvas measureText pass if
// the agent's stacking ever drifts visibly.
export function estimateTextHeight(text, width, fontSize, lineHeight) {
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.52)));
  const lines = String(text)
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return Math.round(lines * (lineHeight || fontSize * 1.4));
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
          size: { type: "number", description: "Schriftgroesse 8-96" },
          color: { type: "string", description: "#rrggbb" },
          bold: { type: "boolean" },
          italic: { type: "boolean" },
          underline: { type: "boolean" },
          align: { type: "string", enum: ["left", "center", "right"] },
          font: { type: "string", enum: FONT_STACKS.map((font) => font.id) },
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
      return `Text schreiben: ${String(args.text || "").slice(0, 40)}`;
    case "edit_text":
      return "Text ändern";
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
    case "done":
      return "Fertig";
    default:
      return name;
  }
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
  const whiteboard = isWhiteboardDocument(document);
  const needsPage = [
    "write_text",
    "add_shape",
    "draw",
    "insert_table",
    "insert_diagram",
    "insert_mindmap",
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
      const patch = textPatch({ ...args, size: args.size ?? 18 }, null, inkColor, bounds);
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
      const height = estimateTextHeight(text, width, fontSize, lineHeight);
      const object = createPageObject({
        id: newId("text"),
        pageId: args.pageId,
        type: "text",
        x: 64,
        color: inkColor,
        ...patch,
        y,
        lineHeight,
        width,
        height,
      });
      api.apply([{ type: "add-object", object }]);
      return { id: object.id, height, bottom: object.y + height };
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
      const height = estimateTextHeight(text, width, fontSize, lineHeight);
      api.apply([
        {
          type: "update-object",
          objectId: existing.id,
          changes: { ...patch, y, lineHeight, height },
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
