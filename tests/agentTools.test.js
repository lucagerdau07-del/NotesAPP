import { describe, expect, it } from "vitest";
import { createInkDocument, createInkHistory, executeInkCommands } from "../src/ink/inkDocument";
import { pageObjectsOf } from "../src/ink/pageObjects";
import { executeTool, PAGE_WIDTH } from "../src/agent/tools";

// A stand-in for the ink controller: same two calls the real one exposes to the
// agent, so the tools are tested against real document commands.
function createApi(pages = 1) {
  let history = createInkHistory(createInkDocument("note-1", pages));
  return {
    getDocument: () => history.present,
    apply: (commands) => {
      history = executeInkCommands(history, commands);
      return history.present;
    },
    undoSteps: () => history.past.length,
  };
}

describe("agent tools", () => {
  it("reads pages, text and stroke counts", () => {
    const api = createApi();
    executeTool(
      "write_text",
      { pageId: "note-1-page-1", x: 64, y: 64, width: 672, text: "Hallo" },
      api,
    );
    const report = executeTool("read_document", {}, api);
    expect(report.pageWidth).toBe(PAGE_WIDTH);
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].objects[0]).toMatchObject({ type: "text", text: "Hallo" });
  });

  it("rejects an unknown page instead of writing", () => {
    const api = createApi();
    const result = executeTool(
      "write_text",
      { pageId: "nope", x: 0, y: 0, width: 400, text: "Hallo" },
      api,
    );
    expect(String(result)).toMatch(/^Fehler/);
    expect(pageObjectsOf(api.getDocument())).toHaveLength(0);
  });

  it("clamps out-of-range arguments rather than trusting the model", () => {
    const api = createApi();
    const result = executeTool(
      "write_text",
      {
        pageId: "note-1-page-1",
        x: -500,
        y: 99999,
        width: 5,
        size: 900,
        color: "blau",
        text: "x",
      },
      api,
    );
    const [block] = pageObjectsOf(api.getDocument());
    expect(block.x).toBe(0);
    expect(block.width).toBe(20);
    expect(block.fontSize).toBe(96);
    expect(block.color).toBe("#1A1A1A");
    expect(result.bottom).toBeGreaterThan(block.y);
  });

  it("makes one undo step out of a multi-stroke draw", () => {
    const api = createApi();
    const before = api.undoSteps();
    const result = executeTool(
      "draw",
      {
        pageId: "note-1-page-1",
        tool: "highlighter",
        color: "#FFDD00",
        paths: [
          [
            { x: 10, y: 10 },
            { x: 90, y: 10 },
          ],
          [
            { x: 10, y: 40 },
            { x: 90, y: 40 },
          ],
        ],
      },
      api,
    );
    expect(result.strokeIds).toHaveLength(2);
    expect(api.getDocument().strokes).toHaveLength(2);
    expect(api.undoSteps()).toBe(before + 1);
  });

  it("drops paths that cannot become a stroke", () => {
    const api = createApi();
    const result = executeTool(
      "draw",
      { pageId: "note-1-page-1", paths: [[{ x: 1, y: 1 }]] },
      api,
    );
    expect(String(result)).toMatch(/^Fehler/);
    expect(api.getDocument().strokes).toHaveLength(0);
  });

  it("edits, deletes and adds pages", () => {
    const api = createApi();
    const written = executeTool(
      "write_text",
      { pageId: "note-1-page-1", x: 64, y: 64, width: 672, text: "alt" },
      api,
    );
    executeTool("edit_text", { id: written.id, text: "neu", size: 28 }, api);
    expect(pageObjectsOf(api.getDocument())[0]).toMatchObject({ text: "neu", fontSize: 28 });

    expect(executeTool("delete_objects", { ids: [written.id] }, api)).toEqual({ deleted: 1 });
    expect(pageObjectsOf(api.getDocument())).toHaveLength(0);

    const page = executeTool("add_page", {}, api);
    expect(api.getDocument().pages.map((entry) => entry.id)).toContain(page.pageId);
  });
});
