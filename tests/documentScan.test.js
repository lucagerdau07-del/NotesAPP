import { describe, expect, it } from "vitest";
import {
  extractJson,
  MAX_EVENTS_PER_NOTE,
  MAX_TERMS_PER_NOTE,
  validateFindings,
} from "../src/knowledge/documentScan.js";

const today = "2026-09-04";

describe("extractJson", () => {
  it("liest reines JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("liest JSON aus einem Codeblock", () => {
    expect(extractJson('Hier:\n```json\n{"a":1}\n```\nFertig.')).toEqual({ a: 1 });
  });

  it("liest JSON aus einem Codeblock ohne Sprachangabe", () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("liest JSON mit umgebendem Fließtext", () => {
    expect(extractJson('Ich habe gefunden: {"a":1} — das war alles.')).toEqual({ a: 1 });
  });

  it("gibt null bei kaputtem JSON", () => {
    expect(extractJson("{ das ist kein json")).toBeNull();
  });

  it("gibt null bei einer Antwort ohne JSON", () => {
    expect(extractJson("Ich konnte nichts finden.")).toBeNull();
  });

  it("gibt null bei einem Array auf oberster Ebene", () => {
    expect(extractJson("[1,2,3]")).toBeNull();
  });

  it("gibt null bei leerer Eingabe", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson(undefined)).toBeNull();
  });
});

describe("validateFindings", () => {
  it("übernimmt Hausaufgaben und Klausuren mit dem richtigen kind", () => {
    const { events } = validateFindings(
      {
        homework: [{ title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" }],
        exams: [{ title: "Klausur Analysis", subject: "Mathe", due: "2026-09-19" }],
      },
      { today, fallbackSubject: "" },
    );
    expect(events).toEqual([
      { kind: "homework", title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08" },
      { kind: "exam", title: "Klausur Analysis", subject: "Mathe", due: "2026-09-19" },
    ]);
  });

  it("verwirft einen Termin ohne Titel", () => {
    const { events } = validateFindings(
      { homework: [{ title: "   ", subject: "Mathe", due: "2026-09-08" }] },
      { today, fallbackSubject: "" },
    );
    expect(events).toEqual([]);
  });

  it("verwirft ein Datum im falschen Format", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Aufgabe", due: "8.9.2026" }] },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toEqual([]);
  });

  it("verwirft ein unmögliches Datum", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Aufgabe", due: "2026-02-30" }] },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toEqual([]);
  });

  it("verwirft ein Datum mehr als ein Jahr entfernt", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Weit weg", due: "2028-01-01" }, { title: "Lange her", due: "2019-05-05" }] },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toEqual([]);
  });

  it("nimmt das Fach der Notiz, wenn das Modell keines nennt", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Aufgabe", due: "2026-09-08" }] },
      { today, fallbackSubject: "Chemie" },
    );
    expect(events[0].subject).toBe("Chemie");
  });

  it("kürzt zu lange Titel und Definitionen", () => {
    const { events, terms } = validateFindings(
      { homework: [{ title: "x".repeat(400), due: "2026-09-08" }], terms: [{ term: "Begriff", definition: "y".repeat(900) }] },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events[0].title).toHaveLength(200);
    expect(terms[0].definition).toHaveLength(500);
  });

  it("deckelt die Anzahl der Termine und Begriffe", () => {
    const { events, terms } = validateFindings(
      { homework: Array.from({ length: 30 }, (_, i) => ({ title: `A${i}`, due: "2026-09-08" })), exams: Array.from({ length: 30 }, (_, i) => ({ title: `K${i}`, due: "2026-09-19" })), terms: Array.from({ length: 60 }, (_, i) => ({ term: `B${i}`, definition: "x" })) },
      { today, fallbackSubject: "Mathe" },
    );
    expect(events).toHaveLength(MAX_EVENTS_PER_NOTE);
    expect(terms).toHaveLength(MAX_TERMS_PER_NOTE);
  });

  it("verträgt fehlende und falsch getypte Felder", () => {
    expect(validateFindings({}, { today, fallbackSubject: "" })).toEqual({ events: [], terms: [] });
    expect(validateFindings({ homework: "nein", terms: 5 }, { today, fallbackSubject: "" })).toEqual({ events: [], terms: [] });
  });

  it("übernimmt einen Begriff auch ohne Definition", () => {
    const { terms } = validateFindings({ terms: [{ term: "Katalysator", subject: "Chemie" }] }, { today, fallbackSubject: "Chemie" });
    expect(terms).toEqual([{ term: "Katalysator", definition: "", subject: "Chemie" }]);
  });
});
