import { createPageObject } from "../ink/pageObjects.js";
import { clamp, color, newId } from "./agentGeometry.js";

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
  const columnWidth = clamp(args.columnWidth, 40, 400, 140);
  const rowHeight = clamp(args.rowHeight, 24, 200, 40);
  const x = clamp(args.x, bounds.minX, bounds.maxX, 0);
  const y = clamp(args.y, bounds.minY, bounds.maxY, 0);
  const lineColor = color(args.color, defaultColor);
  const headers = Array.isArray(args.headers) ? args.headers : null;
  const cellText = Array.isArray(args.cellText) ? args.cellText : null;

  const objects = [];
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellX = x + col * columnWidth;
      const cellY = y + row * rowHeight;
      objects.push(
        createPageObject({
          id: newId("shape"),
          pageId: args.pageId,
          type: "rect",
          x: cellX,
          y: cellY,
          width: columnWidth,
          height: rowHeight,
          color: lineColor,
          strokeWidth: 2,
        }),
      );
      const isHeaderRow = row === 0 && Boolean(headers);
      const text = isHeaderRow
        ? String(headers[col] ?? "")
        : String(cellText?.[row]?.[col] ?? "");
      const textObject = createPageObject({
        id: newId("text"),
        pageId: args.pageId,
        type: "text",
        x: cellX + CELL_TEXT_MARGIN,
        y: cellY + CELL_TEXT_MARGIN,
        width: Math.max(20, columnWidth - CELL_TEXT_MARGIN * 2),
        height: Math.max(16, rowHeight - CELL_TEXT_MARGIN * 2),
        text,
        fontSize: 16,
        color: defaultColor,
        bold: isHeaderRow,
      });
      objects.push(textObject);
      cells.push({ id: textObject.id, row, col });
    }
  }
  return {
    objects,
    result: { cells, rows, cols, width: cols * columnWidth, height: rows * rowHeight },
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

const ROOT_WIDTH = 180;
const ROOT_HEIGHT = 72;
const BRANCH_WIDTH = 150;
const BRANCH_HEIGHT = 56;
const BRANCH_RADIUS = 260;

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
      x: centerX - ROOT_WIDTH / 2 + CELL_TEXT_MARGIN,
      y: centerY - ROOT_HEIGHT / 2 + CELL_TEXT_MARGIN,
      width: ROOT_WIDTH - CELL_TEXT_MARGIN * 2,
      height: ROOT_HEIGHT - CELL_TEXT_MARGIN * 2,
      text: String(args.root ?? ""),
      fontSize: 17,
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
    objects.push(
      createPageObject({
        id: newId("shape"),
        pageId: args.pageId,
        type: "line",
        x: centerX,
        y: centerY,
        width: branchCenterX - centerX,
        height: branchCenterY - centerY,
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
        x: branchCenterX - BRANCH_WIDTH / 2 + CELL_TEXT_MARGIN,
        y: branchCenterY - BRANCH_HEIGHT / 2 + CELL_TEXT_MARGIN,
        width: BRANCH_WIDTH - CELL_TEXT_MARGIN * 2,
        height: BRANCH_HEIGHT - CELL_TEXT_MARGIN * 2,
        text: String(branch?.label ?? ""),
        fontSize: 14,
        color: defaultColor,
        textAlign: "center",
      }),
    );
    return { id: boxId, textId, index };
  });

  return {
    objects,
    result: { root: { id: rootId, textId: rootTextId }, branches },
  };
}
