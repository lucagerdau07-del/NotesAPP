import { describe, expect, it } from "vitest";
import { buildLibraryOverview, loadLibraryOverview } from "../src/agent/libraryOverview.js";
import { buildSystemPrompt } from "../src/agent/systemPrompt.js";
import { createCardRepository } from "../src/knowledge/cardRepository.js";
import { createFolderRepository } from "../src/storage/folderRepository.js";
import { createNoteRepository } from "../src/storage/noteRepository.js";
import { executeTool } from "../src/agent/tools.js";

const folder = (id, name, parentId = null) => ({ id, name, parentId });

describe("buildLibraryOverview", () => {
  it("is empty for an empty library", () => {
    expect(buildLibraryOverview({})).toBe("");
  });

  it("lists folders by name with id, count and card, and counts unassigned notes", () => {
    const text = buildLibraryOverview({
      folders: [folder("m", "Mathe"), folder("a", "Analysis", "m"), folder("e", "Englisch")],
      counts: { m: 2, a: 1, e: 0 },
      texts: { m: "Mitschriften", a: "Ableitungen" },
      unassigned: 3,
    });
    expect(text.split("\n").slice(1)).toEqual([
      "Englisch [e] 0",
      "Mathe [m] 2: Mitschriften",
      "  Analysis [a] 1: Ableitungen",
      "Ohne Ordner: 3 Notizen",
    ]);
  });

  it("is byte-stable for the same data so the prompt prefix can be cached", () => {
    const data = {
      folders: [folder("b", "Bio"), folder("a", "Art")],
      counts: { a: 1, b: 1 },
      texts: { a: "x", b: "y" },
    };
    expect(buildLibraryOverview(data)).toBe(buildLibraryOverview({ ...data, folders: [...data.folders].reverse() }));
  });

  it("shrinks in steps instead of growing past the budget", () => {
    const folders = [folder("root", "Wurzel")];
    const counts = { root: 1 };
    const texts = { root: "w".repeat(300) };
    for (let i = 0; i < 12; i += 1) {
      folders.push(folder(`c${i}`, `Kind${i}`, "root"));
      folders.push(folder(`g${i}`, `Enkel${i}`, `c${i}`));
      counts[`c${i}`] = 1;
      counts[`g${i}`] = 1;
      texts[`c${i}`] = "k".repeat(200);
      texts[`g${i}`] = "e".repeat(200);
    }
    const full = buildLibraryOverview({ folders, counts, texts }, { maxChars: 100_000 });
    const tight = buildLibraryOverview({ folders, counts, texts }, { maxChars: 1500 });
    expect(tight.length).toBeLessThanOrEqual(1500);
    expect(tight.length).toBeLessThan(full.length);
    // Grandchildren fold into their parent's line before anything is dropped.
    expect(tight).toContain("Wurzel [root]");
    expect(tight).toContain("(Unterordner:");

    const hopeless = buildLibraryOverview({ folders, counts, texts }, { maxChars: 300 });
    expect(hopeless.length).toBeLessThanOrEqual(300);
    expect(hopeless).toContain("list_folders");
  });
});

describe("loadLibraryOverview", () => {
  it("counts own and imported notes per folder from the repositories", async () => {
    const storage = (() => {
      const map = new Map();
      return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
    })();
    const folderRepository = createFolderRepository(storage);
    const noteRepository = createNoteRepository(storage);
    const cardRepository = createCardRepository(storage);
    noteRepository.saveNote({ id: "n1", title: "A", subject: "Mathe" });
    noteRepository.saveNote({ id: "n2", title: "B", subject: "Irgendwas" });
    cardRepository.setManual("mathe", "Klausurstoff");
    const text = await loadLibraryOverview({
      folderRepository,
      noteRepository,
      cardRepository,
      documentRepository: { listImportedNotes: async () => [{ id: "p1", subject: "mathe" }] },
    });
    expect(text).toContain("Mathe [mathe] 2: Klausurstoff");
    expect(text).toContain("Ohne Ordner: 1 Notiz");
  });
});

describe("system prompt cache order", () => {
  const base = { canEdit: true, canRead: true, library: true };

  it("puts the cards after all static text and the volatile context last", () => {
    const prompt = buildSystemPrompt({
      ...base,
      libraryOverview: "Bibliothek (Test)\nMathe [mathe] 1",
      noteTitle: "Ordner X",
      targetNote: { title: "Ziel", id: "n9" },
      now: new Date("2026-10-10T09:30:00"),
    });
    const at = (needle) => prompt.indexOf(needle);
    expect(at("Mathe [mathe] 1")).toBeGreaterThan(at("Wähle bei search_web"));
    expect(at("Aktueller Kontext:")).toBeGreaterThan(at("Mathe [mathe] 1"));
    expect(at("Heute ist")).toBeGreaterThan(at("Aktueller Kontext:"));
    expect(at('Ordner "Ordner X"')).toBeGreaterThan(at("Aktueller Kontext:"));
    expect(at("Aktuelle Ziel-Notiz")).toBeGreaterThan(at("Aktueller Kontext:"));
  });

  it("keeps everything above the context identical when only time and note change", () => {
    const head = (prompt) => prompt.slice(0, prompt.indexOf("Aktueller Kontext:"));
    const a = buildSystemPrompt({ ...base, libraryOverview: "K", noteTitle: "A", now: new Date("2026-10-10T09:30:00") });
    const b = buildSystemPrompt({
      ...base,
      libraryOverview: "K",
      noteTitle: "B",
      targetNote: { title: "T", id: "1" },
      now: new Date("2026-10-11T17:45:00"),
    });
    expect(head(a)).toBe(head(b));
  });

  it("omits the cards in fast mode", () => {
    const prompt = buildSystemPrompt({ ...base, fast: true, libraryOverview: "Mathe [mathe] 1" });
    expect(prompt).not.toContain("Mathe [mathe] 1");
  });
});

describe("list_notes with cards", () => {
  it("shows the note card and matches a query against it", async () => {
    globalThis.localStorage.setItem(
      "folders.folders.v1",
      JSON.stringify({ version: 1, folders: [{ id: "mathe", name: "Mathe", parentId: null }] }),
    );
    globalThis.localStorage.setItem(
      "notes.notes.v1",
      JSON.stringify({ version: 1, notes: [{ id: "n1", title: "Blatt 4", subject: "Mathe", updatedAt: 1 }] }),
    );
    globalThis.localStorage.setItem(
      "notes.cards.v1",
      JSON.stringify({
        version: 1,
        cards: {
          mathe: { auto: { text: "Analysis", notes: { n1: "Kurvendiskussion mit Wendepunkten" }, seen: {}, stamp: "s", generatedAt: 1 } },
        },
      }),
    );
    try {
      const listing = await executeTool("list_notes", { query: "Wendepunkt" }, {});
      expect(listing.split("\n")[1]).toContain("Kurvendiskussion mit Wendepunkten");
      const folders = await executeTool("list_folders", {}, {});
      expect(folders).toContain("Mathe [mathe] 1: Analysis");
    } finally {
      globalThis.localStorage.clear();
    }
  });
});
