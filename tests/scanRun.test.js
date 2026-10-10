import { beforeEach, describe, expect, it } from "vitest";
import { runScan } from "../src/knowledge/documentScan.js";
import { createCommentRepository } from "../src/knowledge/commentRepository.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const today = "2026-09-04";
const now = new Date(2026, 8, 4, 16, 0, 0, 0).getTime();

const answer = JSON.stringify({
  homework: [{ title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" }],
  exams: [],
  terms: [],
});
const noPage = '{"comments":[{"n":1,"needsPage":false}]}';
const isTriage = (payload) => payload.messages[0].content.includes("entscheidest");

let repository;
let comments;
let commentClock;

beforeEach(() => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  repository = createKnowledgeRepository(storage, { now: () => now });
  commentClock = now - 1000;
  comments = createCommentRepository(storage, { now: () => commentClock });
});

const run = (options) =>
  runScan({ repository, commentRepository: comments, renderPages: () => [], now, today, ...options });

const model = async (payload) => ({ content: isTriage(payload) ? noPage : answer });

describe("runScan", () => {
  it("wertet Notizen mit neuen Kommentaren aus und markiert sie erledigt", async () => {
    comments.add("note-1", { pageId: "p1", x: 1, y: 1, text: "Aufgabe 4 bis Montag" });
    const result = await run({ notes: [{ id: "note-1", title: "A", subject: "Mathe" }], complete: model });

    expect(result).toEqual({ scanned: 1, error: null });
    expect(repository.read().events).toHaveLength(1);
    expect(repository.read().scanState.notes["note-1"]).toBe(now);
    expect(comments.pending()).toEqual({});
  });

  it("ruft das Modell nicht auf, wenn nichts kommentiert ist", async () => {
    let calls = 0;
    const result = await run({
      notes: [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: 1 }],
      complete: async (payload) => {
        calls += 1;
        return model(payload);
      },
    });
    expect(result.scanned).toBe(0);
    expect(calls).toBe(0);
  });

  it("wertet einen Kommentar nur einmal aus, bis er bearbeitet wird", async () => {
    const { id } = comments.add("note-1", { pageId: "p1", x: 1, y: 1, text: "Aufgabe 4" });
    const notes = [{ id: "note-1", title: "A", subject: "Mathe" }];
    let calls = 0;
    const counting = async (payload) => {
      calls += 1;
      return model(payload);
    };
    await run({ notes, complete: counting });
    await run({ notes, complete: counting });
    expect(calls).toBe(2); // Triage + Auswertung des ersten Laufs, sonst nichts

    commentClock = now + 1000;
    comments.edit("note-1", id, "Aufgabe 5");
    expect(Object.keys(comments.pending())).toEqual(["note-1"]);
  });

  it("macht nach einem Fehler mit der nächsten Notiz weiter und lässt den Kommentar offen", async () => {
    comments.add("kaputt", { pageId: "p1", x: 1, y: 1, text: "A" });
    comments.add("gut", { pageId: "p1", x: 1, y: 1, text: "B" });
    const result = await run({
      notes: [
        { id: "kaputt", title: "A" },
        { id: "gut", title: "B", subject: "Mathe" },
      ],
      complete: async (payload) =>
        String(payload.messages[1].content).includes('"A"') && !isTriage(payload)
          ? { content: "kein json" }
          : model(payload),
    });

    expect(result.scanned).toBe(1);
    expect(result.error).toMatch(/JSON/);
    expect(Object.keys(comments.pending())).toEqual(["kaputt"]);
  });

  it("meldet einen Netzwerkfehler und speichert nichts", async () => {
    comments.add("note-1", { pageId: "p1", x: 1, y: 1, text: "A" });
    const result = await run({
      notes: [{ id: "note-1", title: "A" }],
      complete: async () => {
        throw new Error("Server nicht erreichbar. Verbindung prüfen.");
      },
    });

    expect(result).toEqual({ scanned: 0, error: "Server nicht erreichbar. Verbindung prüfen." });
    expect(repository.read().events).toEqual([]);
    expect(Object.keys(comments.pending())).toEqual(["note-1"]);
  });
});
