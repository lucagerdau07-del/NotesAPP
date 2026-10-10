import { describe, expect, it, vi } from "vitest";
import { createCardRepository, cardText } from "../src/knowledge/cardRepository.js";
import {
  CARD_PROMPT,
  MAX_CALLS_PER_RUN,
  MIN_REFRESH_MS,
  generateCards,
  parseCards,
} from "../src/knowledge/cards.js";

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

const folder = (id, name, parentId = null) => ({ id, name, parentId });
const note = (id, subject, updatedAt = 1, title = id) => ({ id, title, subject, updatedAt });
const reply = (payload) => ({ message: { content: JSON.stringify(payload) } });

function setup(completeImpl) {
  const repository = createCardRepository(fakeStorage());
  const complete = vi.fn(completeImpl);
  const excerpt = vi.fn(async (n) => ({ text: `Text ${n.id}`, pages: 1 }));
  let clock = 1_000_000;
  const now = () => clock;
  const run = (scope) => generateCards(scope, { repository, complete, excerpt, now });
  return { repository, complete, run, advance: (ms) => (clock += ms) };
}

describe("card repository", () => {
  it("survives broken storage and prefers the user's own line", () => {
    const storage = fakeStorage();
    storage.setItem("notes.cards.v1", "{not json");
    const repo = createCardRepository(storage);
    expect(repo.all()).toEqual({});

    repo.setAuto("mathe", { text: "auto", notes: {}, seen: {}, stamp: "x", generatedAt: 1 });
    expect(cardText(repo.get("mathe"))).toBe("auto");
    repo.setManual("mathe", "  meine Zeile ");
    expect(cardText(repo.get("mathe"))).toBe("meine Zeile");
    // Clearing the line falls back to the generated card without regenerating.
    repo.setManual("mathe", "");
    expect(cardText(repo.get("mathe"))).toBe("auto");
    expect(repo.get("mathe").auto.stamp).toBe("x");
  });

  it("drops an entry that has neither a line nor a card, and removes by ids", () => {
    const repo = createCardRepository(fakeStorage());
    repo.setManual("a", "x");
    repo.setManual("a", "");
    expect(repo.all()).toEqual({});
    repo.setManual("b", "y");
    repo.remove(["b", "unknown"]);
    expect(repo.all()).toEqual({});
  });
});

describe("parseCards", () => {
  it("keeps only known ids, trims and caps, and rejects non-JSON", () => {
    const parsed = parseCards(
      '```json\n{"folder": "  Analysis  ", "notes": {"n1": "ok", "ghost": "x", "n2": 5, "n3": ""}}\n```',
      new Set(["n1", "n2", "n3"]),
    );
    expect(parsed).toEqual({ folder: "Analysis", notes: { n1: "ok", n2: "5" } });
    expect(parseCards("keine Antwort", new Set())).toBeNull();
    expect(parseCards(JSON.stringify({ folder: "x".repeat(500) }), new Set()).folder).toHaveLength(220);
  });

  it("tells the model where the user's own notes keep their card", () => {
    expect(CARD_PROMPT).toContain("Unveränderte Notizen");
  });
});

describe("generateCards", () => {
  it("writes the folder card and note cards in one call per folder", async () => {
    const { run, complete, repository } = setup(async () =>
      reply({ folder: "Analysis: Ableitungen", notes: { n1: "Kurvendiskussion", n2: "Übungsblatt" } }),
    );
    const result = await run({
      folders: [folder("mathe", "Mathe")],
      notes: [note("n1", "Mathe"), note("n2", "Mathe")],
    });
    expect(result.generated).toEqual(["mathe"]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(repository.get("mathe").auto).toMatchObject({
      text: "Analysis: Ableitungen",
      notes: { n1: "Kurvendiskussion", n2: "Übungsblatt" },
    });
  });

  it("does nothing for an unchanged folder and skips empty folders", async () => {
    const { run, complete } = setup(async () => reply({ folder: "Karte", notes: { n1: "x" } }));
    const scope = { folders: [folder("mathe", "Mathe"), folder("leer", "Leer")], notes: [note("n1", "Mathe")] };
    await run(scope);
    await run(scope);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("throttles edits for six hours but picks up a new note at once", async () => {
    const { run, complete, advance } = setup(async () => reply({ folder: "Karte", notes: {} }));
    const folders = [folder("mathe", "Mathe")];
    await run({ folders, notes: [note("n1", "Mathe", 1)] });

    advance(60_000);
    await run({ folders, notes: [note("n1", "Mathe", 2)] }); // edited: throttled
    expect(complete).toHaveBeenCalledTimes(1);

    await run({ folders, notes: [note("n1", "Mathe", 2), note("n2", "Mathe", 1)] }); // new note
    expect(complete).toHaveBeenCalledTimes(2);

    advance(MIN_REFRESH_MS);
    await run({ folders, notes: [note("n1", "Mathe", 3), note("n2", "Mathe", 1)] }); // edit, after throttle
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it("sends unchanged notes with their old card instead of the excerpt", async () => {
    const { run, complete } = setup(async (request) => {
      const body = request.messages[1].content;
      return reply({ folder: "Karte", notes: body.includes("n2 | n2 | Text n2") ? { n2: "neu" } : { n1: "alt" } });
    });
    const folders = [folder("mathe", "Mathe")];
    await run({ folders, notes: [note("n1", "Mathe")] });
    await run({ folders, notes: [note("n1", "Mathe"), note("n2", "Mathe")] });

    const second = complete.mock.calls[1][0].messages[1].content;
    expect(second).toContain("Neue oder geänderte Notizen (Karte schreiben):\nn2 | n2 | Text n2");
    expect(second).toContain("Unveränderte Notizen (Karte beibehalten):\nn1 | n1 | alt");
  });

  it("builds leaves before parents and feeds the child card into the parent call", async () => {
    const order = [];
    const { run } = setup(async (request) => {
      const name = request.messages[1].content.split("\n")[0];
      order.push(name);
      return reply({ folder: `Karte ${name}`, notes: {} });
    });
    await run({
      folders: [folder("de", "Deutsch"), folder("vor", "Vorleser", "de")],
      notes: [note("a", "Deutsch"), note("b", "Vorleser")],
    });
    expect(order).toEqual(["Ordner: Vorleser", "Ordner: Deutsch"]);
  });

  it("caps calls per run and keeps going after a broken reply", async () => {
    let call = 0;
    const { run, complete } = setup(async () => {
      call += 1;
      return call === 1 ? { message: { content: "kaputt" } } : reply({ folder: "ok", notes: {} });
    });
    const folders = Array.from({ length: MAX_CALLS_PER_RUN + 3 }, (_, i) => folder(`f${i}`, `F${i}`));
    const notes = folders.map((f, i) => note(`n${i}`, f.name));
    const result = await run({ folders, notes });
    expect(complete).toHaveBeenCalledTimes(MAX_CALLS_PER_RUN);
    expect(result.errors).toHaveLength(1);
    expect(result.generated).toHaveLength(MAX_CALLS_PER_RUN - 1);
  });

  it("passes the user's own line as context and never overwrites it", async () => {
    const { run, complete, repository } = setup(async () => reply({ folder: "auto", notes: {} }));
    repository.setManual("mathe", "Nur Klausurstoff");
    await run({ folders: [folder("mathe", "Mathe")], notes: [note("n1", "Mathe")] });
    expect(complete.mock.calls[0][0].messages[1].content).toContain("Nur Klausurstoff");
    expect(cardText(repository.get("mathe"))).toBe("Nur Klausurstoff");
    expect(repository.get("mathe").auto.text).toBe("auto");
  });
});
