import { describe, expect, it } from "vitest";
import {
  createInkDocument,
  createInkHistory,
  executeInkCommands,
  resolveInkLayerIndex,
  whiteboardInkLayerIndex,
} from "../src/ink/inkDocument";
import { createPageObject, pageObjectsOf } from "../src/ink/pageObjects";
import {
  pdfPageCommands,
  pdfWhiteboardBackgroundCommands,
  pdfWhiteboardObjects,
} from "../src/ink/pdfObject";

const pdf = [
  { src: "data:a", width: 595, height: 842 },
  { src: "data:b", width: 842, height: 595 },
];
const run = (doc, commands) => executeInkCommands(createInkHistory(doc), commands).present;

describe("pdfPageCommands", () => {
  it("puts each PDF page as the locked bottom layer of a new page", () => {
    const base = createInkDocument("note-1", 1, { width: 800, height: 1131 });
    const below = createPageObject({ id: "below", pageId: "note-1-page-1", type: "rect" });
    const above = createPageObject({ id: "above", pageId: "note-1-page-1", type: "text" });
    const doc = { ...base, objects: [below, above], inkLayerIndex: 1 };
    const present = run(doc, pdfPageCommands(doc, pdf, { width: 800, height: 1131 }));

    expect(present.pages).toHaveLength(3);
    const objects = pageObjectsOf(present);
    // Under everything that was there before, and under the ink.
    expect(objects.map((o) => o.id).slice(2)).toEqual(["below", "above"]);
    expect(resolveInkLayerIndex(present)).toBe(3);
    const [first, second] = objects;
    expect(first.locked).toBe(true);
    expect(first.pageId).toBe(present.pages[1].id);
    expect(first.width / first.height).toBeCloseTo(595 / 842);
    // The landscape page is fitted by width and centered vertically.
    expect(second.width).toBeCloseTo(800);
    expect(second.y).toBeGreaterThan(0);
  });

  it("reuses a still-empty single page for the first PDF page", () => {
    const doc = createInkDocument("note-1", 1, { width: 800, height: 1131 });
    const present = run(doc, pdfPageCommands(doc, pdf, { width: 800, height: 1131 }));
    expect(present.pages).toHaveLength(2);
    expect(pageObjectsOf(present)[0].pageId).toBe(doc.pages[0].id);
  });
});

describe("pdfWhiteboardObjects", () => {
  it("stacks pages at their own size, first one centered on the point", () => {
    const [first, second] = pdfWhiteboardObjects("board", pdf, { x: 100, y: 200 });
    expect([first.width, first.height]).toEqual([595, 842]);
    expect(first.x + first.width / 2).toBe(100);
    expect(first.y + first.height / 2).toBe(200);
    expect(second.y).toBeGreaterThan(first.y + first.height);
  });
});

describe("pdfWhiteboardBackgroundCommands", () => {
  it("sends the PDF under the ink without burying existing objects", () => {
    const base = createInkDocument("board", 1, { kind: "whiteboard" });
    const existing = createPageObject({ id: "old", pageId: base.pages[0].id, type: "rect" });
    const doc = { ...base, objects: [existing] };
    expect(whiteboardInkLayerIndex(doc)).toBe(0);

    const present = run(doc, pdfWhiteboardBackgroundCommands(doc, pdf, { x: 0, y: 0 }));
    const objects = pageObjectsOf(present);
    expect(objects.map((o) => o.id).at(-1)).toBe("old");
    expect(objects.slice(0, 2).every((o) => o.locked)).toBe(true);
    expect(whiteboardInkLayerIndex(present)).toBe(2);
  });
});
