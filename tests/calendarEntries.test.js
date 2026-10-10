import { describe, expect, it } from "vitest";
import {
  buildCalendarEntries,
  groupByWeek,
  mondaysOfMonth,
  nearestEntry,
  weeksOfMonth,
} from "../src/knowledge/calendarEntries.js";

const lesson = (overrides) => ({
  id: 1,
  date: 20260924,
  startTime: 800,
  endTime: 930,
  su: [{ name: "M", longname: "Mathe" }],
  te: [{ id: 5, name: "Mül" }],
  ro: [{ id: 7, name: "A12" }],
  ...overrides,
});

describe("buildCalendarEntries", () => {
  it("führt Termine, Lernplan, Stundenplan-Änderungen und Notizen zusammen", () => {
    const entries = buildCalendarEntries({
      events: [{ id: "e1", kind: "exam", title: "Klausur Analysis", subject: "Mathe", due: "2026-09-24" }],
      plan: { days: [{ date: "2026-09-24", blocks: [{ task: "Kapitel 3", subject: "Mathe", minutes: 30 }] }] },
      lessons: [lesson({ code: "cancelled" }), lesson({ id: 2, startTime: 1000 })],
      notes: [{ id: "n1", title: "Mitschrift", createdAt: new Date("2026-09-24T10:00:00").getTime() }],
    });
    // Mit Uhrzeit zuerst, danach nach Art: Klausur vor Lernzeit vor Notiz.
    expect(entries.map((entry) => entry.type)).toEqual(["lesson", "exam", "study", "note"]);
    expect(entries[0].title).toBe("Mathe entfällt");
  });

  it("zeigt reguläre Stunden nicht als Eintrag", () => {
    expect(buildCalendarEntries({ lessons: [lesson({})] })).toEqual([]);
  });

  it("behandelt unbekannte Arten wie Hausaufgaben", () => {
    const [entry] = buildCalendarEntries({ events: [{ id: "e", kind: "?", title: "x", due: "2026-09-01" }] });
    expect(entry.type).toBe("homework");
  });
});

describe("Wochen eines Monats", () => {
  it("schneidet die Wochen auf den Monat zu, Wochenbeginn Montag", () => {
    const weeks = weeksOfMonth(2026, 8); // September 2026 beginnt an einem Dienstag
    expect(weeks[0][0]).toBe("2026-09-01");
    expect(weeks[0].at(-1)).toBe("2026-09-06");
    expect(weeks[1][0]).toBe("2026-09-07");
    expect(weeks.at(-1).at(-1)).toBe("2026-09-30");
  });

  it("liefert für die erste Woche den Montag davor", () => {
    expect(mondaysOfMonth(2026, 8)[0].getDate()).toBe(31);
  });

  it("gruppiert Einträge in ihre Woche und lässt leere Wochen stehen", () => {
    const entries = buildCalendarEntries({
      events: [{ id: "e", kind: "homework", title: "Blatt 3", due: "2026-09-10" }],
    });
    const weeks = groupByWeek(entries, 2026, 8);
    expect(weeks[0].days).toEqual([]);
    expect(weeks[1].days[0].date).toBe("2026-09-10");
  });
});

describe("nearestEntry", () => {
  const entries = [{ date: "2026-09-01" }, { date: "2026-09-20" }];
  it("wählt den nächsten ab heute", () => expect(nearestEntry(entries, "2026-09-10")).toBe(entries[1]));
  it("fällt auf den letzten zurück", () => expect(nearestEntry(entries, "2026-09-25")).toBe(entries[1]));
});
