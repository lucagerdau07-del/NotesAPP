import { beforeEach, describe, expect, it } from "vitest";
import {
  createKnowledgeRepository,
  KNOWLEDGE_STORAGE_KEY,
} from "../src/knowledge/knowledgeRepository.js";

let values;
let storage;

beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
});

const repo = (now = () => 1000) => createKnowledgeRepository(storage, { now });

const hausaufgabe = {
  kind: "homework",
  title: "Aufgabe 4a-c",
  subject: "Mathe",
  due: "2026-09-08",
};

describe("knowledge repository", () => {
  it("liefert einen leeren Zustand ohne gespeicherte Daten", () => {
    const state = repo().read();
    expect(state.events).toEqual([]);
    expect(state.terms).toEqual([]);
    expect(state.scanState).toEqual({ lastRunAt: null, lastError: null, notes: {} });
    expect(state.plan).toBeNull();
    expect(state.settings.autoScan).toBe(true);
  });

  it("erholt sich von kaputtem Speicher", () => {
    values.set(KNOWLEDGE_STORAGE_KEY, "kein-json");
    expect(repo().read().events).toEqual([]);
  });

  it("legt Termine und Begriffe an und vergibt Quelle und Zeitstempel", () => {
    const repository = repo();
    const result = repository.mergeFindings({
      events: [hausaufgabe],
      terms: [{ term: "Ableitung", definition: "Steigung", subject: "Mathe" }],
      sourceNoteId: "note-1",
    });
    expect(result).toEqual({ addedEvents: 1, addedTerms: 1 });
    const [event] = repository.read().events;
    expect(event).toMatchObject({
      kind: "homework",
      title: "Aufgabe 4a-c",
      sourceNoteId: "note-1",
      done: false,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(event.id).toBeTruthy();
  });

  it("verdoppelt einen erneut gefundenen Termin nicht", () => {
    const repository = repo();
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    expect(repository.read().events).toHaveLength(1);
  });

  it("erkennt denselben Termin trotz Groß-/Kleinschreibung und Satzzeichen", () => {
    const repository = repo();
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    repository.mergeFindings({
      events: [{ ...hausaufgabe, title: "  aufgabe 4a-c.  " }],
      terms: [],
      sourceNoteId: "note-1",
    });
    expect(repository.read().events).toHaveLength(1);
  });

  it("behält den Abhak-Zustand bei einem erneuten Scan", () => {
    let time = 1000;
    const repository = repo(() => time);
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    const { id, createdAt } = repository.read().events[0];
    repository.setEventDone(id, true);

    time = 5000;
    repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" });
    const [event] = repository.read().events;
    expect(event.done).toBe(true);
    expect(event.id).toBe(id);
    expect(event.createdAt).toBe(createdAt);
    expect(event.updatedAt).toBe(5000);
  });

  it("aktualisiert die Definition eines bereits bekannten Begriffs", () => {
    const repository = repo();
    repository.mergeFindings({
      events: [],
      terms: [{ term: "Ableitung", definition: "kurz", subject: "Mathe" }],
      sourceNoteId: "note-1",
    });
    repository.mergeFindings({
      events: [],
      terms: [{ term: "Ableitung", definition: "die Steigung einer Funktion", subject: "Mathe" }],
      sourceNoteId: "note-2",
    });
    const terms = repository.read().terms;
    expect(terms).toHaveLength(1);
    expect(terms[0].definition).toBe("die Steigung einer Funktion");
  });

  it("hält gleichnamige Begriffe verschiedener Fächer auseinander", () => {
    const repository = repo();
    repository.mergeFindings({
      events: [],
      terms: [
        { term: "Wurzel", definition: "Umkehrung des Quadrats", subject: "Mathe" },
        { term: "Wurzel", definition: "Organ der Pflanze", subject: "Chemie" },
      ],
      sourceNoteId: "note-1",
    });
    expect(repository.read().terms).toHaveLength(2);
  });

  it("hält Scanzustand und Fehler fest", () => {
    const repository = repo();
    repository.markNoteScanned("note-1", 4200);
    repository.finishRun({ at: 4300, error: "Server nicht erreichbar." });
    expect(repository.read().scanState).toEqual({
      lastRunAt: 4300,
      lastError: "Server nicht erreichbar.",
      notes: { "note-1": 4200 },
    });
  });

  it("speichert Plan und Automatik-Einstellung", () => {
    const repository = repo();
    repository.savePlan({ generatedFor: "2026-09-04", days: [] });
    repository.setAutoScan(false);
    const state = repository.read();
    expect(state.plan.generatedFor).toBe("2026-09-04");
    expect(state.settings.autoScan).toBe(false);
  });

  it("wirft nicht, wenn der Speicher schreibgeschützt ist", () => {
    const blocked = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const repository = createKnowledgeRepository(blocked, { now: () => 1000 });
    expect(() =>
      repository.mergeFindings({ events: [hausaufgabe], terms: [], sourceNoteId: "note-1" }),
    ).not.toThrow();
  });
});
