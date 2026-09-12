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

describe("insert_section_header", () => {
  it("puts a tinted bar behind the title so the bar is drawn first", () => {
    const api = createApi();
    const result = executeTool(
      "insert_section_header",
      { pageId: "note-1-page-1", x: 64, y: 100, width: 672, title: "Diazotierung" },
      api,
    );
    const objects = pageObjectsOf(api.getDocument());
    expect(objects).toHaveLength(2);
    const [bar, title] = objects;
    expect(bar.type).toBe("rect");
    expect(title).toMatchObject({ type: "text", text: "Diazotierung", bold: true });
    // Translucent tint, and the title keeps the solid role colour.
    expect(bar.fillColor).toMatch(/^#[0-9a-f]{8}$/i);
    expect(title.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result.bottom).toBeGreaterThan(100);
  });

  it("fits the pill variant to the words instead of the column", () => {
    const api = createApi();
    const banner = executeTool(
      "insert_section_header",
      { pageId: "note-1-page-1", x: 64, y: 100, width: 672, title: "Kurz", variant: "banner" },
      api,
    );
    const pill = executeTool(
      "insert_section_header",
      { pageId: "note-1-page-1", x: 64, y: 300, width: 672, title: "Kurz", variant: "pill" },
      api,
    );
    expect(banner.width).toBe(672);
    expect(pill.width).toBeLessThan(banner.width);
  });

  it("draws a rule under the title for the underline variant", () => {
    const api = createApi();
    executeTool(
      "insert_section_header",
      { pageId: "note-1-page-1", x: 64, y: 100, width: 672, title: "Evolution", variant: "underline" },
      api,
    );
    const objects = pageObjectsOf(api.getDocument());
    const rule = objects.find((object) => object.type === "rect");
    const title = objects.find((object) => object.type === "text");
    expect(rule.y).toBeGreaterThan(title.y);
    expect(rule.height).toBeLessThan(8);
  });

  it("rejects an empty title", () => {
    const api = createApi();
    const result = executeTool(
      "insert_section_header",
      { pageId: "note-1-page-1", x: 64, y: 100, width: 672, title: "   " },
      api,
    );
    expect(result).toMatch(/^Fehler:/);
    expect(pageObjectsOf(api.getDocument())).toHaveLength(0);
  });
});

describe("insert_callout", () => {
  it("builds a box with a spine, label and body in one undo step", () => {
    const api = createApi();
    const before = api.undoSteps();
    const result = executeTool(
      "insert_callout",
      {
        pageId: "note-1-page-1",
        x: 64,
        y: 200,
        width: 672,
        text: "Ein Benami ist ein fiktiver Käufer.",
        variant: "definition",
      },
      api,
    );
    const objects = pageObjectsOf(api.getDocument());
    expect(objects).toHaveLength(4);
    const [box, spine, label, body] = objects;
    expect(box).toMatchObject({ type: "rect", width: 672 });
    expect(spine.width).toBeLessThan(box.width);
    expect(spine.height).toBe(box.height);
    expect(label).toMatchObject({ type: "text", text: "Definition", bold: true });
    expect(body.text).toContain("Benami");
    // The body sits inside the box, not over its border.
    expect(body.x).toBeGreaterThan(box.x);
    expect(result.bottom).toBe(Math.round(box.y + box.height));
    expect(api.undoSteps()).toBe(before + 1);
  });

  it("grows the box for longer text", () => {
    const api = createApi();
    const short = executeTool(
      "insert_callout",
      { pageId: "note-1-page-1", x: 64, y: 100, width: 400, text: "Kurz." },
      api,
    );
    const long = executeTool(
      "insert_callout",
      {
        pageId: "note-1-page-1",
        x: 64,
        y: 400,
        width: 400,
        text: "Kurz. ".repeat(80),
      },
      api,
    );
    expect(long.height).toBeGreaterThan(short.height);
  });

  it("falls back to the definition variant for an unknown one", () => {
    const api = createApi();
    const result = executeTool(
      "insert_callout",
      { pageId: "note-1-page-1", x: 64, y: 100, width: 400, text: "Test", variant: "quatsch" },
      api,
    );
    expect(result.variant).toBe("definition");
  });
});

describe("write_text highlighting", () => {
  it("lays marker bars behind the text they mark", () => {
    const api = createApi();
    const result = executeTool(
      "write_text",
      {
        pageId: "note-1-page-1",
        x: 64,
        y: 120,
        width: 300,
        text: "Permanent Settlement",
        highlight: "yellow",
      },
      api,
    );
    const objects = pageObjectsOf(api.getDocument());
    const markers = objects.filter((object) => object.type === "rect");
    const text = objects.find((object) => object.id === result.id);
    expect(markers.length).toBeGreaterThan(0);
    // Drawn before the text, so the text stays readable on top.
    expect(objects.indexOf(markers[0])).toBeLessThan(objects.indexOf(text));
    expect(markers[0].fillColor).toMatch(/^#[0-9a-f]{8}$/i);
    expect(markers[0].y).toBeGreaterThanOrEqual(text.y);
  });

  it("writes no marker without the highlight argument", () => {
    const api = createApi();
    executeTool(
      "write_text",
      { pageId: "note-1-page-1", x: 64, y: 120, width: 300, text: "Schlicht" },
      api,
    );
    expect(pageObjectsOf(api.getDocument()).filter((o) => o.type === "rect")).toHaveLength(0);
  });

  it("takes its colour from the role when no colour is given", () => {
    const api = createApi();
    const result = executeTool(
      "write_text",
      { pageId: "note-1-page-1", x: 64, y: 120, width: 300, text: "Achtung", role: "signal" },
      api,
    );
    const text = pageObjectsOf(api.getDocument()).find((o) => o.id === result.id);
    expect(text.color).toBe("#FF5C5C");
  });
});

describe("component tools", () => {
  function withStore(api) {
    const saved = new Map();
    return {
      ...api,
      getComponentStore: () => ({
        get: (id) =>
          saved.get(id) ||
          (id === "zeitstrahl"
            ? {
                id: "zeitstrahl",
                title: "Zeitstrahl",
                params: { width: { default: 200 }, items: { default: [] } },
                body: [{ type: "stroke", points: [[0, 0], ["width", 0]] }],
              }
            : null),
        list: () => [{ id: "zeitstrahl", title: "Zeitstrahl", tags: ["geschichte"], description: "…", source: "eingebaut" }],
        save: (recipe) => {
          saved.set(recipe.id, recipe);
          return true;
        },
      }),
      saved,
    };
  }

  it("places a component and reports the space it took", () => {
    const api = withStore(createApi());
    const before = api.undoSteps();
    const result = executeTool(
      "insert_component",
      { pageId: "note-1-page-1", id: "zeitstrahl", x: 100, y: 300, args: { width: 400 } },
      api,
    );
    expect(result.id).toBe("zeitstrahl");
    expect(result.width).toBeGreaterThan(300);
    expect(api.getDocument().strokes.length).toBeGreaterThan(0);
    expect(api.undoSteps()).toBe(before + 1);
    // Placed where it was asked for, not at the recipe's own origin.
    expect(api.getDocument().strokes[0].points[0].x).toBeCloseTo(100, 0);
  });

  it("names a component that does not exist", () => {
    const api = withStore(createApi());
    const result = executeTool(
      "insert_component",
      { pageId: "note-1-page-1", id: "gibtsnicht", x: 0, y: 0 },
      api,
    );
    expect(result).toMatch(/^Fehler:/);
  });

  it("saves a recipe the agent wrote", () => {
    const api = withStore(createApi());
    const result = executeTool(
      "define_component",
      {
        id: "Mein Element",
        title: "Mein Element",
        params: { size: { default: 40 } },
        body: [{ type: "rect", x: 0, y: 0, width: "size", height: "size" }],
      },
      api,
    );
    expect(result).toMatchObject({ saved: true, id: "mein-element" });
    expect(api.saved.get("mein-element")).toBeTruthy();
  });

  it("refuses a broken recipe and says what is wrong", () => {
    const api = withStore(createApi());
    const result = executeTool(
      "define_component",
      { id: "kaputt", title: "Kaputt", body: [{ type: "rect", x: "unbekannt", y: 0 }] },
      api,
    );
    expect(result).toMatch(/unbekannt/i);
    expect(api.saved.get("kaputt")).toBeUndefined();
  });

  it("does not need a page to list or define", () => {
    const api = withStore(createApi());
    expect(executeTool("list_components", {}, api).components).toHaveLength(1);
    expect(executeTool("read_component", { id: "zeitstrahl" }, api).id).toBe("zeitstrahl");
  });
});
