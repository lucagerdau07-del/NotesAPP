import { beforeEach, describe, expect, it } from "vitest";
import { createNoteRepository } from "../src/storage/noteRepository.js";

let values;
let storage;

beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
});

describe("note repository", () => {
  it("creates and updates a note, keeping createdAt and bumping updatedAt", () => {
    let now = 1000;
    const repo = createNoteRepository(storage, { now: () => now });
    const note = repo.saveNote({ id: "a", title: "Ableitungsregeln", subject: "Mathe" });
    expect(note.createdAt).toBe(1000);
    expect(note.updatedAt).toBe(1000);

    now = 2000;
    repo.saveNote({ id: "a", title: "Ableitungsregeln 2" });
    const [updated] = repo.listNotes();
    expect(updated.title).toBe("Ableitungsregeln 2");
    expect(updated.subject).toBe("Mathe");
    expect(updated.createdAt).toBe(1000);
    expect(updated.updatedAt).toBe(2000);
  });

  it("touches a note's updatedAt without changing its other fields", () => {
    let now = 1000;
    const repo = createNoteRepository(storage, { now: () => now });
    repo.saveNote({ id: "a", title: "Note A" });
    now = 5000;
    repo.touchNote("a");
    expect(repo.listNotes()[0]).toMatchObject({ title: "Note A", updatedAt: 5000 });
  });

  it("ignores touchNote for an unknown id", () => {
    const repo = createNoteRepository(storage, { now: () => 1000 });
    repo.touchNote("missing");
    expect(repo.listNotes()).toEqual([]);
  });

  it("recovers from malformed storage", () => {
    values.set("notes.notes.v1", "not-json");
    const repo = createNoteRepository(storage, { now: () => 1000 });
    expect(repo.listNotes()).toEqual([]);
  });
});
