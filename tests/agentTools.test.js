import { describe, expect, it, afterEach, vi } from "vitest";
import { createInkDocument, createInkHistory, executeInkCommands } from "../src/ink/inkDocument";
import { pageObjectsOf } from "../src/ink/pageObjects";
import { executeTool, PAGE_WIDTH, searchWeb, AGENT_NO_DOCUMENT_TOOLS } from "../src/agent/tools";
import { browserDocumentRepository } from "../src/storage/documentRepository";

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

function createWhiteboardApi() {
  let history = createInkHistory(createInkDocument("wb-1", 1, { kind: "whiteboard" }));
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
  it("reads pages, text and stroke counts", async () => {
    const api = createApi();
    await executeTool(
      "write_text",
      { pageId: "note-1-page-1", x: 64, y: 64, width: 672, text: "Hallo" },
      api,
    );
    const report = await executeTool("read_document", {}, api);
    expect(report.pageWidth).toBe(PAGE_WIDTH);
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].objects[0]).toMatchObject({ type: "text", text: "Hallo" });
  });

  it("renders a page as an image so it can see strokes read_document can't list", async () => {
    const api = createApi();
    await executeTool(
      "draw",
      { pageId: "note-1-page-1", paths: [[{ x: 10, y: 10 }, { x: 90, y: 10 }]] },
      api,
    );
    const result = await executeTool("see_document", {}, api);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({ id: "note-1-page-1" });
    expect(result.pages[0].src).toMatch(/^data:image\//);
  });

  it("see_document rejects an unknown page like the other tools", async () => {
    const api = createApi();
    const result = await executeTool("see_document", { pageId: "nope" }, api);
    expect(String(result)).toMatch(/^Fehler/);
  });

  it("rejects an unknown page instead of writing", async () => {
    const api = createApi();
    const result = await executeTool(
      "write_text",
      { pageId: "nope", x: 0, y: 0, width: 400, text: "Hallo" },
      api,
    );
    expect(String(result)).toMatch(/^Fehler/);
    expect(pageObjectsOf(api.getDocument())).toHaveLength(0);
  });

  it("clamps out-of-range arguments rather than trusting the model", async () => {
    const api = createApi();
    const result = await executeTool(
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

  it("makes one undo step out of a multi-stroke draw", async () => {
    const api = createApi();
    const before = api.undoSteps();
    const result = await executeTool(
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

  it("drops paths that cannot become a stroke", async () => {
    const api = createApi();
    const result = await executeTool(
      "draw",
      { pageId: "note-1-page-1", paths: [[{ x: 1, y: 1 }]] },
      api,
    );
    expect(String(result)).toMatch(/^Fehler/);
    expect(api.getDocument().strokes).toHaveLength(0);
  });

  it("edits, deletes and adds pages", async () => {
    const api = createApi();
    const written = await executeTool(
      "write_text",
      { pageId: "note-1-page-1", x: 64, y: 64, width: 672, text: "alt" },
      api,
    );
    await executeTool("edit_text", { id: written.id, text: "neu", size: 28 }, api);
    expect(pageObjectsOf(api.getDocument())[0]).toMatchObject({ text: "neu", fontSize: 28 });

    expect(await executeTool("delete_objects", { ids: [written.id] }, api)).toEqual({ deleted: 1 });
    expect(pageObjectsOf(api.getDocument())).toHaveLength(0);

    const page = await executeTool("add_page", {}, api);
    expect(api.getDocument().pages.map((entry) => entry.id)).toContain(page.pageId);
  });
});

describe("agent tools on a whiteboard", () => {
  it("does not clamp coordinates to the fixed page box", async () => {
    const api = createWhiteboardApi();
    const result = await executeTool(
      "write_text",
      { pageId: "wb-1-page-1", x: 5000, y: -3000, width: 500, text: "weit draußen" },
      api,
    );
    const [block] = pageObjectsOf(api.getDocument());
    expect(block.x).toBe(5000);
    // Baseline snapping nudges y by less than a line height; the point here
    // is that it is nowhere near clamped into the fixed 0..1131 page box.
    expect(block.y).toBeLessThan(-1000);
    expect(result.id).toBe(block.id);
  });

  it("does not clamp add_shape to the fixed page box", async () => {
    const api = createWhiteboardApi();
    await executeTool(
      "add_shape",
      { pageId: "wb-1-page-1", type: "rect", x: -4000, y: 2000, width: 3000, height: 1500 },
      api,
    );
    const [shape] = pageObjectsOf(api.getDocument());
    expect(shape.x).toBe(-4000);
    expect(shape.width).toBe(3000);
  });

  it("reports unbounded page dimensions", async () => {
    const api = createWhiteboardApi();
    const report = await executeTool("read_document", {}, api);
    expect(report.pageWidth).toBeNull();
    expect(report.pageHeight).toBeNull();
  });

  it("refuses add_page", async () => {
    const api = createWhiteboardApi();
    const before = api.getDocument().pages.length;
    const result = await executeTool("add_page", {}, api);
    expect(String(result)).toMatch(/^Fehler/);
    expect(api.getDocument().pages).toHaveLength(before);
  });
});

describe("search_web", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWikipedia(byLang) {
    const calls = [];
    vi.stubGlobal("fetch", async (url) => {
      const lang = String(url).match(/https:\/\/(\w+)\.wikipedia/)[1];
      calls.push(lang);
      return { ok: true, json: async () => byLang[lang] ?? {} };
    });
    return calls;
  }

  it("returns hits in search rank order with title, link and extract", async () => {
    stubWikipedia({
      de: {
        query: {
          pages: {
            "2": { index: 2, title: "C4-Pflanze", extract: "Zweiter Treffer." },
            "1": { index: 1, title: "Photosynthese im Wald", extract: "Erster Treffer." },
          },
        },
      },
    });
    const result = await searchWeb("Photosynthese");
    expect(result.source).toBe("de.wikipedia.org");
    expect(result.results.map((hit) => hit.title)).toEqual(["Photosynthese im Wald", "C4-Pflanze"]);
    expect(result.results[0].url).toBe("https://de.wikipedia.org/wiki/Photosynthese_im_Wald");
    expect(result.results[0].extract).toBe("Erster Treffer.");
  });

  it("falls back to English when German has no hits", async () => {
    const calls = stubWikipedia({
      de: { query: { pages: {} } },
      en: { query: { pages: { "1": { index: 1, title: "Photosynthesis", extract: "Text." } } } },
    });
    const result = await searchWeb("Photosynthese");
    expect(calls).toEqual(["de", "en"]);
    expect(result.source).toBe("en.wikipedia.org");
  });

  it("reports a network failure as a tool error instead of throwing", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    expect(String(await searchWeb("Photosynthese"))).toMatch(/^Fehler/);
  });

  it("runs through executeTool", async () => {
    stubWikipedia({
      de: { query: { pages: { "1": { index: 1, title: "Mitose", extract: "Zellteilung." } } } },
    });
    const result = await executeTool("search_web", { query: "Mitose" }, createApi());
    expect(result.results).toHaveLength(1);
  });

  it("falls back to the general web search proxy when Wikipedia has no hit", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url, init) => {
      calls.push(String(url));
      if (String(url).includes("wikipedia")) return { ok: true, json: async () => ({ query: { pages: {} } }) };
      expect(String(url)).toContain("/api/notes/search");
      expect(JSON.parse(init.body)).toEqual({ query: "Bundestagswahl 2026" });
      return {
        ok: true,
        json: async () => ({
          results: [{ title: "Bundestagswahl 2026", url: "https://example.org/wahl", extract: "Ergebnis." }],
        }),
      };
    });
    const result = await searchWeb("Bundestagswahl 2026");
    expect(calls.filter((url) => url.includes("wikipedia"))).toHaveLength(2);
    expect(result.source).toBe("web-search");
    expect(result.results).toEqual([
      { title: "Bundestagswahl 2026", url: "https://example.org/wahl", extract: "Ergebnis." },
    ]);
  });

  it("reports no hits when both Wikipedia and the web search proxy come up empty", async () => {
    vi.stubGlobal("fetch", async (url) => {
      if (String(url).includes("wikipedia")) return { ok: true, json: async () => ({ query: { pages: {} } }) };
      return { ok: true, json: async () => ({ results: [] }) };
    });
    const result = await searchWeb("ein ganz obskurer Begriff");
    expect(result).toBe('Keine Treffer für "ein ganz obskurer Begriff".');
  });

  it("respects an explicit source: wikipedia and never calls the web search proxy", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ query: { pages: {} } }) };
    });
    const result = await searchWeb("ein ganz obskurer Begriff", "wikipedia");
    expect(result).toBe('Keine Wikipedia-Treffer für "ein ganz obskurer Begriff".');
    expect(calls.every((url) => url.includes("wikipedia"))).toBe(true);
  });

  it("respects an explicit source: web and skips Wikipedia entirely", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ results: [{ title: "Heute", url: "https://n.example", extract: "X" }] }) };
    });
    const result = await searchWeb("aktuelle Nachrichten", "web");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/notes/search");
    expect(result.source).toBe("web-search");
  });

  it("executeTool forwards args.source to searchWeb", async () => {
    const calls = [];
    vi.stubGlobal("fetch", async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => ({ results: [] }) };
    });
    await executeTool("search_web", { query: "x", source: "web" }, createApi());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/notes/search");
  });

  it("works without any document api (start-screen chat has none)", async () => {
    stubWikipedia({
      de: { query: { pages: { "1": { index: 1, title: "Mitose", extract: "Zellteilung." } } } },
    });
    const result = await executeTool("search_web", { query: "Mitose" }, {});
    expect(result.results).toHaveLength(1);
    expect(await executeTool("done", { summary: "fertig" }, {})).toEqual({ summary: "fertig" });
  });
});

describe("list_folders / list_notes", () => {
  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it("lists folders with note counts and filters notes by folder and query", async () => {
    globalThis.localStorage.setItem(
      "folders.folders.v1",
      JSON.stringify({
        version: 1,
        folders: [{ id: "mathe", name: "Mathe", color: null, icon: null, parentId: null, createdAt: 0 }],
      }),
    );
    globalThis.localStorage.setItem(
      "notes.notes.v1",
      JSON.stringify({
        version: 1,
        notes: [
          { id: "n1", title: "Ableitungen", subject: "Mathe", updatedAt: 2 },
          { id: "n2", title: "Gedicht", subject: "Deutsch", updatedAt: 1 },
        ],
      }),
    );

    const folders = await executeTool("list_folders", {}, {});
    expect(folders).toEqual([{ id: "mathe", name: "Mathe", parentId: null, noteCount: 1 }]);

    const inMathe = await executeTool("list_notes", { folderId: "mathe" }, {});
    expect(inMathe.map((n) => n.id)).toEqual(["n1"]);

    const missing = await executeTool("list_notes", { query: "nichtvorhanden" }, {});
    expect(missing).toEqual([]);
  });

  it("includes imported PDFs/Bilder alongside own notes", async () => {
    await browserDocumentRepository.saveImportedDocument({
      note: {
        id: "imp-1",
        kind: "imported",
        title: "Skript Kapitel 3",
        subject: "Chemie",
        updatedAt: 5,
        source: { fileId: "file-1", type: "pdf" },
        pages: [{ id: "p1" }, { id: "p2" }],
      },
      file: { id: "file-1", name: "skript.pdf", mimeType: "application/pdf", size: 1, blob: new Blob() },
    });

    const all = await executeTool("list_notes", {}, {});
    const imported = all.find((n) => n.id === "imp-1");
    expect(imported).toMatchObject({ title: "Skript Kapitel 3", subject: "Chemie" });
    expect(imported.preview).toMatch(/2 Seiten.*PDF/);
  });
});

describe("AGENT_NO_DOCUMENT_TOOLS", () => {
  it("exposes only library browsing and search, nothing that needs an open note", () => {
    expect(AGENT_NO_DOCUMENT_TOOLS.map((tool) => tool.function.name).sort()).toEqual([
      "done",
      "list_folders",
      "list_notes",
      "read_source",
      "search_sources",
      "search_web",
    ]);
  });
});
