import { describe, expect, it } from "vitest";
import { createInkDocument, createInkHistory, executeInkCommands } from "../src/ink/inkDocument";
import { pageObjectsOf } from "../src/ink/pageObjects";
import { executeTool } from "../src/agent/tools";

function createApi(pages = 1, pageDefaults = {}) {
  let history = createInkHistory(createInkDocument("note-1", pages, pageDefaults));
  return {
    getDocument: () => history.present,
    apply: (commands) => {
      history = executeInkCommands(history, commands);
      return history.present;
    },
    undoSteps: () => history.past.length,
  };
}

describe("insert_table", () => {
  it("creates rows x cols cells at grid coordinates in one undo step", () => {
    const api = createApi();
    const before = api.undoSteps();
    const result = executeTool(
      "insert_table",
      {
        pageId: "note-1-page-1",
        x: 100,
        y: 50,
        rows: 2,
        cols: 3,
        columnWidth: 100,
        rowHeight: 30,
        headers: ["A", "B", "C"],
      },
      api,
    );
    expect(result.cells).toHaveLength(6);
    expect(result.rows).toBe(2);
    expect(result.cols).toBe(3);
    // 6 text cells + 6 border rects
    expect(pageObjectsOf(api.getDocument())).toHaveLength(12);
    expect(api.undoSteps()).toBe(before + 1);

    const headerCellId = result.cells.find((cell) => cell.row === 0 && cell.col === 1).id;
    const headerText = pageObjectsOf(api.getDocument()).find((o) => o.id === headerCellId);
    expect(headerText).toMatchObject({ text: "B", x: 208, y: 58, bold: true });
  });

  it("lets the agent adjust a single cell afterwards with edit_text", () => {
    const api = createApi();
    const result = executeTool(
      "insert_table",
      { pageId: "note-1-page-1", x: 0, y: 0, rows: 1, cols: 1 },
      api,
    );
    const cellId = result.cells[0].id;
    executeTool("edit_text", { id: cellId, text: "neu" }, api);
    const cell = pageObjectsOf(api.getDocument()).find((o) => o.id === cellId);
    expect(cell.text).toBe("neu");
  });
});

describe("insert_diagram", () => {
  it("connects nodes by index with real arrow ids", () => {
    const api = createApi();
    const result = executeTool(
      "insert_diagram",
      {
        pageId: "note-1-page-1",
        x: 0,
        y: 0,
        nodes: [{ label: "Start" }, { label: "Ende" }],
        edges: [{ from: 0, to: 1, label: "weiter" }],
      },
      api,
    );
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    const arrow = pageObjectsOf(api.getDocument()).find((o) => o.id === result.edges[0].id);
    expect(arrow.type).toBe("arrow");
    expect(arrow.width).toBeGreaterThan(0);
  });

  it("rejects an empty node list", () => {
    const api = createApi();
    const result = executeTool(
      "insert_diagram",
      { pageId: "note-1-page-1", x: 0, y: 0, nodes: [] },
      api,
    );
    expect(String(result)).toMatch(/^Fehler/);
  });
});

describe("insert_mindmap", () => {
  it("places branches around the root without overlapping it", () => {
    const api = createApi();
    const result = executeTool(
      "insert_mindmap",
      {
        pageId: "note-1-page-1",
        x: 400,
        y: 400,
        root: "Thema",
        branches: [{ label: "A" }, { label: "B" }, { label: "C" }],
      },
      api,
    );
    expect(result.branches).toHaveLength(3);
    const root = pageObjectsOf(api.getDocument()).find((o) => o.id === result.root.id);
    for (const branch of result.branches) {
      const box = pageObjectsOf(api.getDocument()).find((o) => o.id === branch.id);
      const dx = box.x + box.width / 2 - (root.x + root.width / 2);
      const dy = box.y + box.height / 2 - (root.y + root.height / 2);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(150);
    }
  });

  it("works unbounded on a whiteboard document", () => {
    const api = createApi(1, { kind: "whiteboard" });
    const result = executeTool(
      "insert_mindmap",
      { pageId: "note-1-page-1", x: -9000, y: 9000, root: "Weit weg", branches: [{ label: "A" }] },
      api,
    );
    const root = pageObjectsOf(api.getDocument()).find((o) => o.id === result.root.id);
    expect(root.x).toBeLessThan(-8000);
  });
});
