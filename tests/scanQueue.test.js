import { describe, expect, it } from "vitest";
import { dueNotes, isRunDue, MAX_NOTES_PER_RUN } from "../src/knowledge/scanQueue.js";

// Lokale Zeit, damit die Slotgrenzen (15:00/21:00 Ortszeit) getroffen werden.
const at = (day, hour, minute = 0) =>
  new Date(2026, 8, day, hour, minute, 0, 0).getTime();

const HOUR = 60 * 60 * 1000;

describe("isRunDue", () => {
  it("läuft, wenn noch nie gelaufen", () => {
    expect(isRunDue({ now: at(7, 16), scanState: { lastRunAt: null, notes: {} } })).toBe(true);
  });

  it("läuft nach 15:00, wenn der letzte Lauf davor war", () => {
    expect(isRunDue({ now: at(7, 16), scanState: { lastRunAt: at(7, 14), notes: {} } })).toBe(true);
  });

  it("läuft nicht ein zweites Mal am selben Nachmittag", () => {
    expect(isRunDue({ now: at(7, 18), scanState: { lastRunAt: at(7, 15, 30), notes: {} } })).toBe(false);
  });

  it("läuft abends erneut, wenn der letzte Lauf am Nachmittag war", () => {
    expect(isRunDue({ now: at(7, 21, 5), scanState: { lastRunAt: at(7, 16), notes: {} } })).toBe(true);
  });

  it("läuft morgens nicht, wenn der Abendlauf schon erledigt ist", () => {
    expect(isRunDue({ now: at(8, 7), scanState: { lastRunAt: at(7, 22), notes: {} } })).toBe(false);
  });

  it("läuft morgens, wenn der letzte Lauf vor dem gestrigen Abendslot war", () => {
    expect(isRunDue({ now: at(8, 7), scanState: { lastRunAt: at(7, 16), notes: {} } })).toBe(true);
  });
});

describe("dueNotes", () => {
  const now = at(7, 16);

  it("nimmt eine unberührte, lang genug ruhende Notiz", () => {
    const notes = [{ id: "a", updatedAt: now - 3 * HOUR }];
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toHaveLength(1);
  });

  it("überspringt eine Notiz, die vor weniger als zwei Stunden bearbeitet wurde", () => {
    const notes = [{ id: "a", updatedAt: now - HOUR }];
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toEqual([]);
  });

  it("überspringt eine seit dem letzten Scan unveränderte Notiz", () => {
    const notes = [{ id: "a", updatedAt: now - 5 * HOUR }];
    const scanState = { notes: { a: now - 4 * HOUR } };
    expect(dueNotes({ now, notes, scanState })).toEqual([]);
  });

  it("nimmt eine nach dem letzten Scan ergänzte Notiz erneut", () => {
    const notes = [{ id: "a", updatedAt: now - 3 * HOUR }];
    const scanState = { notes: { a: now - 5 * HOUR } };
    expect(dueNotes({ now, notes, scanState })).toHaveLength(1);
  });

  it("sortiert nach ältester Bearbeitung zuerst", () => {
    const notes = [
      { id: "neu", updatedAt: now - 3 * HOUR },
      { id: "alt", updatedAt: now - 9 * HOUR },
    ];
    expect(dueNotes({ now, notes, scanState: { notes: {} } }).map((n) => n.id)).toEqual(["alt", "neu"]);
  });

  it("deckelt bei zehn Notizen je Lauf", () => {
    const notes = Array.from({ length: 14 }, (_, index) => ({
      id: `n${index}`,
      updatedAt: now - (3 + index) * HOUR,
    }));
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toHaveLength(MAX_NOTES_PER_RUN);
  });

  it("ignoriert die Ruhezeit, wenn quietPeriodMs 0 ist", () => {
    const notes = [{ id: "a", updatedAt: now - 60 * 1000 }];
    expect(dueNotes({ now, notes, scanState: { notes: {} }, quietPeriodMs: 0 })).toHaveLength(1);
  });

  it("ignoriert Notizen ohne brauchbares updatedAt", () => {
    const notes = [{ id: "a" }, { id: "b", updatedAt: "gestern" }];
    expect(dueNotes({ now, notes, scanState: { notes: {} } })).toEqual([]);
  });
});
