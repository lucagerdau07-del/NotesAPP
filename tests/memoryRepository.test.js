import { describe, expect, it } from "vitest";
import {
  createMemoryRepository,
  memoryBlock,
  MEMORY_MAX_CHARS,
  MEMORY_MAX_ITEMS,
  MEMORY_STORAGE_KEY,
} from "../src/knowledge/memoryRepository.js";
import { executeTool } from "../src/agent/tools.js";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
}

describe("memory repository", () => {
  it("remembers, replaces and forgets by id", () => {
    const repo = createMemoryRepository(fakeStorage());
    expect(repo.remember({ text: "  Mathe:  verwechselt Ketten- und Produktregel " })).toBe("Gemerkt: 1");
    expect(repo.remember({ text: "Deutsch: Zitate mit Zeilenangabe" })).toBe("Gemerkt: 2");
    expect(repo.remember({ id: 1, text: "Mathe: Kettenregel sitzt jetzt" })).toBe("Ersetzt: 1");
    expect(repo.remember({ id: 2, text: "" })).toBe("Gelöscht: 2");
    expect(repo.list()).toEqual([{ id: 1, text: "Mathe: Kettenregel sitzt jetzt" }]);
    // Eine gelöschte id wird nicht neu vergeben, sonst zeigt ein alter Chat auf den falschen Eintrag.
    expect(repo.remember({ text: "Englisch: mag Beispiele" })).toBe("Gemerkt: 3");
  });

  it("refuses bad input with a next step instead of growing the prompt", () => {
    const repo = createMemoryRepository(fakeStorage());
    expect(repo.remember({ text: "" })).toMatch(/^Fehler: text fehlt/);
    expect(repo.remember({ id: 9, text: "x" })).toMatch(/^Fehler: Eintrag 9/);
    expect(repo.remember({ text: "x".repeat(MEMORY_MAX_CHARS + 1) })).toMatch(/^Fehler: höchstens/);
    for (let i = 0; i < MEMORY_MAX_ITEMS; i += 1) repo.remember({ text: `Eintrag ${i}` });
    const full = repo.remember({ text: "einer zu viel" });
    expect(full).toMatch(/^Fehler: Gedächtnis voll/);
    expect(full).toContain("1 Eintrag 0");
    expect(repo.list()).toHaveLength(MEMORY_MAX_ITEMS);
  });

  it("reads broken storage as empty", () => {
    expect(createMemoryRepository(fakeStorage({ [MEMORY_STORAGE_KEY]: "{kaputt" })).list()).toEqual([]);
    expect(createMemoryRepository(fakeStorage({ [MEMORY_STORAGE_KEY]: '{"items":[{"id":"x"}]}' })).list()).toEqual([]);
  });

  it("renders one short line per entry, nothing when empty", () => {
    expect(memoryBlock([])).toBe("");
    expect(memoryBlock([{ id: 3, text: "Mathe: Brüche" }])).toBe(
      "Über den Nutzer (aus remember, richte dich danach):\n3 Mathe: Brüche",
    );
  });

  it("is reachable as the remember tool without an open note", async () => {
    expect(await executeTool("remember", { text: "Physik: Einheiten immer mitschreiben" }, {})).toBe("Gemerkt: 1");
    expect(JSON.parse(globalThis.localStorage.getItem(MEMORY_STORAGE_KEY)).items[0].text).toBe(
      "Physik: Einheiten immer mitschreiben",
    );
  });
});
