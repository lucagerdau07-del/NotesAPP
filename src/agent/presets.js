import { createPageObject } from "../ink/pageObjects.js";
import { clamp, color, newId } from "./agentGeometry.js";
import { measureTextLines } from "./textMetrics.js";
import {
  CALLOUT_VARIANTS,
  TYPE_SCALE,
  highlightColor,
  roleColor,
} from "./noteStyle.js";

// Presets build ordinary page objects (rects, ellipses, lines, text) — the
// same primitives write_text/add_shape produce — so everything they create
// is editable/erasable/undoable exactly like hand-drawn content. Each
// returns either a "Fehler: ..." string (bad model arguments, same
// convention as executeTool) or { objects, result }, where `objects` still
// needs createPageObject's clamping applied by the caller's bounds.

const CELL_TEXT_MARGIN = 8;

export function buildTablePreset(args, bounds, defaultColor) {
  const rows = Math.round(clamp(args.rows, 1, 20, 3));
  const cols = Math.round(clamp(args.cols, 1, 10, 3));
  const x = clamp(args.x, bounds.minX, bounds.maxX, 0);
  const y = clamp(args.y, bounds.minY, bounds.maxY, 0);
  // Column width caps to whatever's left of the page, so a high column count
  // shrinks its columns instead of running the table off the right edge.
  const maxTableWidth = Math.max(cols * 40, bounds.maxX - x);
  const columnWidth = Math.min(clamp(args.columnWidth, 40, 400, 140), Math.floor(maxTableWidth / cols));
  const rowHeight = clamp(args.rowHeight, 24, 200, 40);
  const lineColor = color(args.color, defaultColor);
  const headers = Array.isArray(args.headers) ? args.headers : null;
  const cellText = Array.isArray(args.cellText) ? args.cellText.map((row) => [...row]) : [];
  if (headers) cellText[0] = headers.map((cell) => String(cell ?? ""));

  const table = createPageObject({
    id: newId("table"),
    pageId: args.pageId,
    type: "table",
    x,
    y,
    width: cols * columnWidth,
    height: rows * rowHeight,
    rows,
    cols,
    cellText: cellText.map((row) => row.map((cell) => String(cell ?? ""))),
    headerRow: Boolean(headers),
    color: lineColor,
    strokeWidth: 1,
    fontSize: 16,
  });

  return {
    objects: [table],
    result: { id: table.id, rows, cols, width: table.width, height: table.height },
  };
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 64;
const NODE_GAP = 80;

// Deliberately no graph-layout algorithm: nodes land in a straight left-to-
// right chain by array order. The model can pass explicit x/y itself (not
// exposed here) by following up with add_shape/write_text for anything more
// elaborate — this tool is for the common case, not every case.
export function buildDiagramPreset(args, bounds, defaultColor) {
  const rawNodes = Array.isArray(args.nodes) ? args.nodes.slice(0, 12) : [];
  if (rawNodes.length === 0) return "Fehler: nodes ist leer.";
  const x = clamp(args.x, bounds.minX, bounds.maxX, 0);
  const y = clamp(args.y, bounds.minY, bounds.maxY, 0);
  const lineColor = color(args.color, defaultColor);

  const objects = [];
  const nodes = rawNodes.map((node, index) => {
    const nodeX = x + index * (NODE_WIDTH + NODE_GAP);
    const boxId = newId("shape");
    const textId = newId("text");
    objects.push(
      createPageObject({
        id: boxId,
        pageId: args.pageId,
        type: "rect",
        x: nodeX,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        color: lineColor,
        strokeWidth: 2,
      }),
    );
    objects.push(
      createPageObject({
        id: textId,
        pageId: args.pageId,
        type: "text",
        x: nodeX + CELL_TEXT_MARGIN,
        y: y + CELL_TEXT_MARGIN,
        width: NODE_WIDTH - CELL_TEXT_MARGIN * 2,
        height: NODE_HEIGHT - CELL_TEXT_MARGIN * 2,
        text: String(node?.label ?? ""),
        fontSize: 15,
        color: defaultColor,
        textAlign: "center",
      }),
    );
    return { id: boxId, textId, index, x: nodeX, y, width: NODE_WIDTH, height: NODE_HEIGHT };
  });

  const rawEdges = Array.isArray(args.edges) ? args.edges : [];
  const edges = [];
  for (const edge of rawEdges) {
    const from = nodes[edge?.from];
    const to = nodes[edge?.to];
    if (!from || !to) continue;
    const startX = from.x + from.width;
    const startY = from.y + from.height / 2;
    const endX = to.x;
    const endY = to.y + to.height / 2;
    const arrowId = newId("shape");
    objects.push(
      createPageObject({
        id: arrowId,
        pageId: args.pageId,
        type: "arrow",
        x: startX,
        y: startY,
        width: endX - startX,
        height: endY - startY,
        color: lineColor,
        strokeWidth: 2,
      }),
    );
    if (edge.label) {
      objects.push(
        createPageObject({
          id: newId("text"),
          pageId: args.pageId,
          type: "text",
          x: (startX + endX) / 2 - 40,
          y: (startY + endY) / 2 - 20,
          width: 80,
          height: 20,
          text: String(edge.label),
          fontSize: 12,
          color: lineColor,
          textAlign: "center",
        }),
      );
    }
    edges.push({ id: arrowId, from: edge.from, to: edge.to });
  }

  return {
    objects,
    result: { nodes: nodes.map(({ id, textId, index }) => ({ id, textId, index })), edges },
  };
}

const ROOT_WIDTH = 130;
const ROOT_HEIGHT = 52;
const BRANCH_WIDTH = 105;
const BRANCH_HEIGHT = 38;
const BRANCH_RADIUS = 170;
const SUB_WIDTH = 82;
const SUB_HEIGHT = 24;
const SUB_GAP = 70;
const SUB_STACK_GAP = 6;
const MINDMAP_TEXT_MARGIN = 5;

// Point where a ray from (cx,cy) at the given angle exits a halfWidth x halfHeight
// box centered on (cx,cy) — so connector lines stop at the border, not the middle.
function boxEdgePoint(cx, cy, halfWidth, halfHeight, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const scale = Math.min(
    dx !== 0 ? halfWidth / Math.abs(dx) : Infinity,
    dy !== 0 ? halfHeight / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export function buildMindmapPreset(args, bounds, defaultColor) {
  const rawBranches = Array.isArray(args.branches) ? args.branches.slice(0, 10) : [];
  if (rawBranches.length === 0) return "Fehler: branches ist leer.";
  const centerX = clamp(args.x, bounds.minX, bounds.maxX, 0);
  const centerY = clamp(args.y, bounds.minY, bounds.maxY, 0);
  const lineColor = color(args.color, defaultColor);

  const objects = [];
  const rootId = newId("shape");
  const rootTextId = newId("text");
  objects.push(
    createPageObject({
      id: rootId,
      pageId: args.pageId,
      type: "ellipse",
      x: centerX - ROOT_WIDTH / 2,
      y: centerY - ROOT_HEIGHT / 2,
      width: ROOT_WIDTH,
      height: ROOT_HEIGHT,
      color: lineColor,
      strokeWidth: 2,
    }),
  );
  objects.push(
    createPageObject({
      id: rootTextId,
      pageId: args.pageId,
      type: "text",
      x: centerX - ROOT_WIDTH / 2 + MINDMAP_TEXT_MARGIN,
      y: centerY - ROOT_HEIGHT / 2 + MINDMAP_TEXT_MARGIN,
      width: ROOT_WIDTH - MINDMAP_TEXT_MARGIN * 2,
      height: ROOT_HEIGHT - MINDMAP_TEXT_MARGIN * 2,
      text: String(args.root ?? ""),
      fontSize: 13,
      bold: true,
      color: defaultColor,
      textAlign: "center",
    }),
  );

  const branches = rawBranches.map((branch, index) => {
    const angle = (2 * Math.PI * index) / rawBranches.length - Math.PI / 2;
    const branchCenterX = centerX + BRANCH_RADIUS * Math.cos(angle);
    const branchCenterY = centerY + BRANCH_RADIUS * Math.sin(angle);
    const boxId = newId("shape");
    const textId = newId("text");
    const rootEdge = boxEdgePoint(centerX, centerY, ROOT_WIDTH / 2, ROOT_HEIGHT / 2, angle);
    const branchEdgeToRoot = boxEdgePoint(
      branchCenterX,
      branchCenterY,
      BRANCH_WIDTH / 2,
      BRANCH_HEIGHT / 2,
      angle + Math.PI,
    );
    objects.push(
      createPageObject({
        id: newId("shape"),
        pageId: args.pageId,
        type: "line",
        x: rootEdge.x,
        y: rootEdge.y,
        width: branchEdgeToRoot.x - rootEdge.x,
        height: branchEdgeToRoot.y - rootEdge.y,
        color: lineColor,
        strokeWidth: 1.5,
      }),
    );
    objects.push(
      createPageObject({
        id: boxId,
        pageId: args.pageId,
        type: "rect",
        x: branchCenterX - BRANCH_WIDTH / 2,
        y: branchCenterY - BRANCH_HEIGHT / 2,
        width: BRANCH_WIDTH,
        height: BRANCH_HEIGHT,
        color: lineColor,
        strokeWidth: 2,
      }),
    );
    objects.push(
      createPageObject({
        id: textId,
        pageId: args.pageId,
        type: "text",
        x: branchCenterX - BRANCH_WIDTH / 2 + MINDMAP_TEXT_MARGIN,
        y: branchCenterY - BRANCH_HEIGHT / 2 + MINDMAP_TEXT_MARGIN,
        width: BRANCH_WIDTH - MINDMAP_TEXT_MARGIN * 2,
        height: BRANCH_HEIGHT - MINDMAP_TEXT_MARGIN * 2,
        text: String(branch?.label ?? ""),
        fontSize: 11,
        color: defaultColor,
        textAlign: "center",
      }),
    );
    const subLabels = Array.isArray(branch?.subs)
      ? branch.subs.map((s) => String(s ?? "")).filter(Boolean).slice(0, 4)
      : branch?.sub != null && String(branch.sub)
        ? [String(branch.sub)]
        : [];
    const perpAngle = angle + Math.PI / 2;
    // Stack spacing must match the sub box's footprint along the stacking axis, not
    // a fixed height — otherwise boxes that stack sideways (top/bottom branches)
    // overlap since their width is much bigger than their height.
    const halfExtent = Math.abs(Math.cos(perpAngle)) * (SUB_WIDTH / 2) + Math.abs(Math.sin(perpAngle)) * (SUB_HEIGHT / 2);
    const stackSpacing = halfExtent * 2 + SUB_STACK_GAP;
    const spread = (subLabels.length - 1) / 2;
    subLabels.forEach((subLabel, subIndex) => {
      const offset = (subIndex - spread) * stackSpacing;
      const subCenterX = centerX + (BRANCH_RADIUS + SUB_GAP) * Math.cos(angle) + offset * Math.cos(perpAngle);
      const subCenterY = centerY + (BRANCH_RADIUS + SUB_GAP) * Math.sin(angle) + offset * Math.sin(perpAngle);
      const subTextId = newId("text");
      const subAngleFromBranch = Math.atan2(subCenterY - branchCenterY, subCenterX - branchCenterX);
      const branchEdgeToSub = boxEdgePoint(
        branchCenterX,
        branchCenterY,
        BRANCH_WIDTH / 2,
        BRANCH_HEIGHT / 2,
        subAngleFromBranch,
      );
      const subEdge = boxEdgePoint(
        subCenterX,
        subCenterY,
        SUB_WIDTH / 2,
        SUB_HEIGHT / 2,
        subAngleFromBranch + Math.PI,
      );
      objects.push(
        createPageObject({
          id: newId("shape"),
          pageId: args.pageId,
          type: "line",
          x: branchEdgeToSub.x,
          y: branchEdgeToSub.y,
          width: subEdge.x - branchEdgeToSub.x,
          height: subEdge.y - branchEdgeToSub.y,
          color: lineColor,
          strokeWidth: 1,
        }),
      );
      objects.push(
        createPageObject({
          id: subTextId,
          pageId: args.pageId,
          type: "text",
          x: subCenterX - SUB_WIDTH / 2,
          y: subCenterY - SUB_HEIGHT / 2,
          width: SUB_WIDTH,
          height: SUB_HEIGHT,
          text: subLabel,
          fontSize: 9,
          color: defaultColor,
          textAlign: "center",
        }),
      );
    });
    return { id: boxId, textId, index };
  });

  return {
    objects,
    result: { root: { id: rootId, textId: rootTextId }, branches },
  };
}

// Fill-only rectangles: strokeWidth is floored at 1 by createPageObject, so a
// decoration that wants no outline gets a fully transparent stroke rather than
// a hairline edge in the fill colour.
const NO_STROKE = "#00000000";

function tint(hex, alpha = "2E") {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${alpha}` : hex;
}

// Line boxes cover the glyph band, not the leading around it, so a block's
// height is counted in whole lines rather than read off the last box.
function totalHeight(lines, lineHeight) {
  return Math.max(1, lines.length) * lineHeight;
}

function firstLineWidth(lines) {
  return lines.reduce((widest, line) => Math.max(widest, line.width), 0);
}

const HIGHLIGHT_PAD_X = 5;
// measureTextLines already returns the glyph band, so the marker only needs a
// hair of room around it. Padding the full line box instead would make
// successive lines touch and the block would read as one solid slab.
const HIGHLIGHT_PAD_Y = 2;

// Marker bars behind a text object's own lines, fitted to what each line
// actually occupies. Returned in the caller's insertion order, which is also
// z-order — emit these *before* the text they belong to.
export function buildHighlightObjects(textObject, highlightName) {
  const fill = highlightColor(highlightName);
  const lineHeight = textObject.lineHeight || textObject.fontSize * 1.4;
  const lines = measureTextLines(textObject.text, {
    width: textObject.width,
    fontSize: textObject.fontSize,
    lineHeight,
    fontFamily: textObject.fontFamily,
    bold: textObject.bold,
    italic: textObject.italic,
  });
  return lines
    .filter((line) => line.width > 1)
    .map((line) =>
      createPageObject({
        id: newId("shape"),
        pageId: textObject.pageId,
        type: "rect",
        x: textObject.x + line.x - HIGHLIGHT_PAD_X,
        y: textObject.y + line.y - HIGHLIGHT_PAD_Y,
        width: line.width + HIGHLIGHT_PAD_X * 2,
        height: line.height + HIGHLIGHT_PAD_Y * 2,
        color: NO_STROKE,
        fillColor: fill,
      }),
    );
}

const HEADER_PAD_X = 14;
const HEADER_PAD_Y = 7;
const HEADER_RULE_HEIGHT = 4;
const HEADER_VARIANTS = ["banner", "pill", "underline"];

// The three header shapes the reference notes actually use: a tinted bar across
// the column, a tinted pill hugging the words, and a plain title over a thick
// rule. The bar is a tint rather than a solid block so the title keeps the full
// role colour and stays legible on light and dark paper alike.
export function buildSectionHeaderPreset(args, bounds, theme) {
  const title = String(args.title ?? "").trim();
  if (!title) return "Fehler: title ist leer.";
  const variant = HEADER_VARIANTS.includes(args.variant) ? args.variant : "banner";
  const accent = roleColor(theme, args.role, "heading");
  const x = clamp(args.x, bounds.minX, bounds.maxX, 64);
  const y = clamp(args.y, bounds.minY, bounds.maxY, 64);
  const width = clamp(args.width, 60, bounds.maxX - x, 672);
  const fontSize = clamp(args.size, 12, 72, TYPE_SCALE.heading);
  const lineHeight = Math.round(fontSize * 1.35);

  const lines = measureTextLines(title, {
    width: width - HEADER_PAD_X * 2,
    fontSize,
    lineHeight,
    fontFamily: args.font,
    bold: true,
  });
  const textHeight = totalHeight(lines, lineHeight);
  const objects = [];

  const barHeight = textHeight + HEADER_PAD_Y * 2;
  const barWidth =
    variant === "pill" ? Math.min(width, firstLineWidth(lines) + HEADER_PAD_X * 2) : width;

  if (variant !== "underline") {
    objects.push(
      createPageObject({
        id: newId("shape"),
        pageId: args.pageId,
        type: "rect",
        x,
        y,
        width: barWidth,
        height: barHeight,
        color: NO_STROKE,
        fillColor: tint(accent),
      }),
    );
  }

  const textY = variant === "underline" ? y : y + HEADER_PAD_Y;
  const textX = variant === "underline" ? x : x + HEADER_PAD_X;
  objects.push(
    createPageObject({
      id: newId("text"),
      pageId: args.pageId,
      type: "text",
      x: textX,
      y: textY,
      width: width - (variant === "underline" ? 0 : HEADER_PAD_X * 2),
      height: textHeight,
      text: title,
      fontSize,
      lineHeight,
      color: accent,
      bold: true,
      fontFamily: args.font,
      aiGenerated: true,
    }),
  );

  let height = variant === "underline" ? textHeight : barHeight;
  if (variant === "underline") {
    objects.push(
      createPageObject({
        id: newId("shape"),
        pageId: args.pageId,
        type: "rect",
        x,
        y: y + textHeight + 4,
        width: Math.min(width, firstLineWidth(lines) || width),
        height: HEADER_RULE_HEIGHT,
        color: NO_STROKE,
        fillColor: accent,
      }),
    );
    height = textHeight + 4 + HEADER_RULE_HEIGHT;
  }

  return {
    objects,
    result: { x, y, width: barWidth, height, bottom: Math.round(y + height) },
  };
}

const CALLOUT_PAD = 14;
const CALLOUT_SPINE = 5;
const CALLOUT_LABEL_GAP = 6;

// A bordered box with a coloured spine: the "Definition"/"Achtung" blocks the
// reference notes set apart from running text. Height follows the measured body
// text, so the box never crops its own content.
export function buildCalloutPreset(args, bounds, theme) {
  const body = String(args.text ?? "").trim();
  if (!body) return "Fehler: text ist leer.";
  const variant = CALLOUT_VARIANTS[args.variant] ? args.variant : "definition";
  const spec = CALLOUT_VARIANTS[variant];
  const accent = roleColor(theme, spec.role, "subheading");
  const x = clamp(args.x, bounds.minX, bounds.maxX, 64);
  const y = clamp(args.y, bounds.minY, bounds.maxY, 64);
  const width = clamp(args.width, 120, bounds.maxX - x, 672);
  const fontSize = clamp(args.size, 10, 48, TYPE_SCALE.body);
  const lineHeight = Math.round(fontSize * 1.45);
  const title = String(args.title ?? spec.label).trim();

  const innerX = x + CALLOUT_SPINE + CALLOUT_PAD;
  const innerWidth = width - CALLOUT_SPINE - CALLOUT_PAD * 2;
  const labelSize = Math.max(11, Math.round(fontSize * 0.72));
  const labelHeight = Math.round(labelSize * 1.3);
  const bodyLines = measureTextLines(body, {
    width: innerWidth,
    fontSize,
    lineHeight,
    fontFamily: args.font,
  });
  const bodyHeight = totalHeight(bodyLines, lineHeight);
  const height = CALLOUT_PAD * 2 + labelHeight + CALLOUT_LABEL_GAP + bodyHeight;

  const objects = [
    createPageObject({
      id: newId("shape"),
      pageId: args.pageId,
      type: "rect",
      x,
      y,
      width,
      height,
      color: tint(accent, "66"),
      fillColor: theme?.surface || tint(accent, "12"),
      strokeWidth: 2,
    }),
    createPageObject({
      id: newId("shape"),
      pageId: args.pageId,
      type: "rect",
      x,
      y,
      width: CALLOUT_SPINE,
      height,
      color: NO_STROKE,
      fillColor: accent,
    }),
    createPageObject({
      id: newId("text"),
      pageId: args.pageId,
      type: "text",
      x: innerX,
      y: y + CALLOUT_PAD,
      width: innerWidth,
      height: labelHeight,
      text: title,
      fontSize: labelSize,
      lineHeight: labelHeight,
      color: accent,
      bold: true,
      aiGenerated: true,
    }),
    createPageObject({
      id: newId("text"),
      pageId: args.pageId,
      type: "text",
      x: innerX,
      y: y + CALLOUT_PAD + labelHeight + CALLOUT_LABEL_GAP,
      width: innerWidth,
      height: bodyHeight,
      text: body,
      fontSize,
      lineHeight,
      color: roleColor(theme, "body"),
      fontFamily: args.font,
      aiGenerated: true,
    }),
  ];

  return {
    objects,
    result: { x, y, width, height, bottom: Math.round(y + height), variant },
  };
}
