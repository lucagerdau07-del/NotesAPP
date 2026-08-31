import { createInkStroke, getToolStyle } from "../ink/inkDocument.js";
import { createPageObject, objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import { FONT_STACKS, snapBaselineToRule } from "../ink/textStyle.js";

// Page geometry mirrors DocumentView's baseWidth/pageHeight. Coordinates are
// page-local: origin top left of the addressed page, unit = page pixel.
export const PAGE_WIDTH = 800;
export const PAGE_HEIGHT = Math.round(800 * 1.414);

const DRAW_TOOLS = ["pen", "fountain", "pencil", "highlighter"];
const SHAPE_TYPES = ["rect", "ellipse", "line", "arrow"];
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 4000;
const MAX_PATHS = 200;
const MAX_POINTS = 2000;

const clamp = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
// The agent writes in whatever ink the user currently has selected unless it
// asks for a colour itself — dark paper would swallow a hard-coded #1A1A1A.
const color = (value, fallback = "#1A1A1A") =>
  typeof value === "string" && HEX.test(value) ? value : fallback;

function newId(prefix) {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
      description: "Hängt eine neue leere Seite an und gibt ihre pageId zurück.",
      parameters: { type: "object", properties: {}, required: [] },
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

// Short line per tool call for the step list in the panel.
export function describeToolCall(name, args = {}) {
  switch (name) {
    case "read_document":
      return "Dokument lesen";
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
    case "done":
      return "Fertig";
    default:
      return name;
  }
}

function textPatch(args, existing, defaultColor) {
  const patch = {};
  if (typeof args.text === "string") patch.text = args.text.slice(0, MAX_TEXT);
  if (Number.isFinite(args.x)) patch.x = clamp(args.x, 0, PAGE_WIDTH, 0);
  if (Number.isFinite(args.y)) patch.y = clamp(args.y, 0, PAGE_HEIGHT, 0);
  if (Number.isFinite(args.width))
    patch.width = clamp(args.width, 20, PAGE_WIDTH - (patch.x ?? existing?.x ?? 0), 400);
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
  const needsPage = ["write_text", "add_shape", "draw"].includes(name);
  if (needsPage && !pageIds.includes(args.pageId))
    return `Fehler: pageId "${args.pageId}" gibt es nicht. Vorhanden: ${pageIds.join(", ")}`;

  switch (name) {
    case "read_document":
      return {
        pageWidth: PAGE_WIDTH,
        pageHeight: PAGE_HEIGHT,
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

    case "write_text": {
      const patch = textPatch({ ...args, size: args.size ?? 18 }, null, inkColor);
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
      const patch = textPatch(args, existing, existing.color);
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
        x: clamp(args.x, 0, PAGE_WIDTH, 0),
        y: clamp(args.y, 0, PAGE_HEIGHT, 0),
        width: clamp(args.width, -PAGE_WIDTH, PAGE_WIDTH, 160),
        height: clamp(args.height, -PAGE_HEIGHT, PAGE_HEIGHT, 90),
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
              x: clamp(point?.x, 0, PAGE_WIDTH, 0),
              y: clamp(point?.y, 0, PAGE_HEIGHT, 0),
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
      api.apply([{ type: "add-page" }]);
      const pages = api.getDocument().pages;
      return { pageId: pages[pages.length - 1]?.id };
    }

    case "done":
      return { summary: String(args.summary || "") };

    default:
      return `Fehler: Unbekanntes Werkzeug "${name}".`;
  }
}
