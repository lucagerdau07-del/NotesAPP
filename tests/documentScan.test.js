import { describe, expect, it } from "vitest";
import {
  extractJson,
  MAX_EVENTS_PER_NOTE,
  MAX_TERMS_PER_NOTE,
  scanNote,
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

  it("verwirft auch ein kürzlich vergangenes Datum", () => {
    const { events } = validateFindings(
      { homework: [{ title: "Schon vorbei", due: "2026-09-03" }] },
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

describe("scanNote", () => {
  const note = { id: "note-1", title: "Ableitungsregeln", subject: "Mathe" };
  const comments = [{ id: "c1", pageId: "p1", x: 200, y: 300, text: "Nochmal erklären lassen" }];
  const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 600 };
  const pages = [
    { id: "p1", src: "data:image/jpeg;base64,AAA", bounds },
    { id: "p2", src: "data:image/jpeg;base64,BBB", bounds },
  ];
  const answer = JSON.stringify({
    homework: [],
    exams: [],
    review: [{ title: "Ableitung", subject: "Mathe", due: "2026-09-06" }],
    terms: [],
  });
  const isTriage = (payload) => payload.messages[0].content.includes("entscheidest");
  const triage = (needsPage) => ({ content: JSON.stringify({ comments: [{ n: 1, needsPage }] }) });

  // Beantwortet den Triage-Aufruf anders als die Auswertung und merkt sich Letztere.
  const modelFor = (needsPage, sent) => async (payload) => {
    if (isTriage(payload)) return triage(needsPage);
    sent.push(payload);
    return { content: answer };
  };

  it("schickt die kommentierte Seite samt Ort als Bild, wenn der Kommentar sie braucht", async () => {
    const sent = [];
    const result = await scanNote(note, comments, {
      renderPages: () => pages,
      complete: modelFor(true, sent),
      today,
    });

    const parts = sent[0].messages[1].content;
    expect(parts[0].text).toContain("2026-09-04");
    expect(parts[0].text).toContain("Nochmal erklären lassen");
    expect(parts[0].text).toContain("50 % von links, 50 % von oben");
    // Nur die Seite mit Kommentar, nicht p2.
    expect(parts.filter((part) => part.type === "image_url")).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
    ]);
    expect(result.events).toEqual([
      { kind: "review", title: "Ableitung", subject: "Mathe", due: "2026-09-06" },
    ]);
  });

  it("rendert und schickt keine Seite, wenn der Text allein reicht", async () => {
    const sent = [];
    let rendered = false;
    await scanNote(note, comments, {
      renderPages: () => {
        rendered = true;
        return pages;
      },
      complete: modelFor(false, sent),
      today,
    });

    expect(rendered).toBe(false);
    expect(typeof sent[0].messages[1].content).toBe("string");
    expect(sent[0].models).toBeUndefined();
  });

  it("nimmt bei unlesbarer Triage-Antwort die Seite dazu", async () => {
    const sent = [];
    await scanNote(note, comments, {
      renderPages: () => pages,
      complete: async (payload) => {
        if (isTriage(payload)) return { content: "hä?" };
        sent.push(payload);
        return { content: answer };
      },
      today,
    });
    expect(sent[0].messages[1].content.some((part) => part.type === "image_url")).toBe(true);
  });

  it("schickt höchstens acht Seiten", async () => {
    const sent = [];
    const many = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, src: `data:,${index}`, bounds }));
    await scanNote(
      note,
      many.map((page) => ({ id: page.id, pageId: page.id, x: 1, y: 1, text: "x" })),
      {
        renderPages: () => many,
        complete: async (payload) => {
          if (isTriage(payload)) return { content: "{}" };
          sent.push(payload);
          return { content: answer };
        },
        today,
      },
    );
    expect(sent[0].messages[1].content.filter((part) => part.type === "image_url")).toHaveLength(8);
  });

  it("wirft bei einer Antwort ohne brauchbares JSON", async () => {
    await expect(
      scanNote(note, comments, {
        renderPages: () => pages,
        complete: async (payload) =>
          isTriage(payload) ? triage(true) : { content: "Ich kann das Bild nicht lesen." },
        today,
      }),
    ).rejects.toThrow(/JSON/);
  });
});
