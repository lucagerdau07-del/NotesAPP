import { beforeEach, describe, expect, it } from "vitest";
import { runScan } from "../src/knowledge/documentScan.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const today = "2026-09-04";
const now = new Date(2026, 8, 4, 16, 0, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

const answer = JSON.stringify({
  homework: [{ title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" }],
  exams: [],
  terms: [],
});

let repository;

beforeEach(() => {
  const values = new Map();
  repository = createKnowledgeRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => now },
  );
});

const renderPages = () => [{ id: "p1", src: "data:image/jpeg;base64,AAA" }];

describe("runScan", () => {
  it("scannt fällige Notizen und hält Zustand fest", async () => {
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }];
    const result = await runScan({
      notes,
      repository,
      renderPages,
      complete: async () => ({ content: answer }),
      now,
      today,
    });

    expect(result).toMatchObject({ scanned: 1, skipped: false, error: null });
    const state = repository.read();
    expect(state.events).toHaveLength(1);
    expect(state.scanState.notes["note-1"]).toBe(now);
    expect(state.scanState.lastRunAt).toBe(now);
  });

  it("überspringt den Lauf, wenn der Slot schon bedient ist", async () => {
    repository.finishRun({ at: now - 30 * 60 * 1000, error: null });
    let called = false;
    const result = await runScan({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }],
      repository,
      renderPages,
      complete: async () => {
        called = true;
        return { content: answer };
      },
      now,
      today,
    });

    expect(result.skipped).toBe(true);
    expect(called).toBe(false);
  });

  it("läuft mit force trotz bedientem Slot", async () => {
    repository.finishRun({ at: now - 30 * 60 * 1000, error: null });
    const result = await runScan({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 60 * 1000 }],
      repository,
      renderPages,
      complete: async () => ({ content: answer }),
      now,
      today,
      force: true,
    });

    expect(result).toMatchObject({ scanned: 1, skipped: false });
  });

  it("macht nach einem Fehler mit der nächsten Notiz weiter", async () => {
    const notes = [
      { id: "kaputt", title: "A", subject: "Mathe", updatedAt: now - 9 * HOUR },
      { id: "gut", title: "B", subject: "Mathe", updatedAt: now - 3 * HOUR },
    ];
    const result = await runScan({
      notes,
      repository,
      renderPages,
      complete: async (payload) =>
        payload.messages[1].content[0].text.includes('"A"')
          ? { content: "kein json" }
          : { content: answer },
      now,
      today,
    });

    expect(result.scanned).toBe(1);
    expect(result.error).toMatch(/JSON/);
    const state = repository.read();
    expect(state.scanState.notes.kaputt).toBeUndefined();
    expect(state.scanState.notes.gut).toBe(now);
  });

  it("meldet einen Netzwerkfehler und speichert nichts", async () => {
    const result = await runScan({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }],
      repository,
      renderPages,
      complete: async () => {
        throw new Error("Server nicht erreichbar. Verbindung prüfen.");
      },
      now,
      today,
    });

    expect(result.scanned).toBe(0);
    expect(result.error).toBe("Server nicht erreichbar. Verbindung prüfen.");
    expect(repository.read().events).toEqual([]);
  });

  it("verdoppelt bei einem zweiten Lauf nichts", async () => {
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now - 3 * HOUR }];
    const options = { notes, repository, renderPages, complete: async () => ({ content: answer }), today };
    await runScan({ ...options, now });
    notes[0].updatedAt = now + 4 * HOUR;
    await runScan({ ...options, now: now + 7 * HOUR });
    expect(repository.read().events).toHaveLength(1);
  });
});
