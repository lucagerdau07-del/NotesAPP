import { describe, expect, it } from "vitest";
import {
  BASE_MINUTES,
  buildPlan,
  dailyBudgets,
  isoDate,
  MAX_MINUTES,
} from "../src/knowledge/studyPlan.js";

// 2026-09-07 is a Monday, 2026-09-09 a Wednesday.
const MONDAY = "2026-09-07";
const WEDNESDAY_DATE = "2026-09-09";

const budgetOn = (budgets, date) => budgets.find((day) => day.date === date).budgetMinutes;

describe("isoDate", () => {
  it("formats in local time", () => {
    expect(isoDate(new Date(2026, 8, 7, 23, 30))).toBe("2026-09-07");
  });
});

describe("dailyBudgets", () => {
  it("returns seven days beginning today", () => {
    const budgets = dailyBudgets([], { today: MONDAY });
    expect(budgets).toHaveLength(7);
    expect(budgets[0].date).toBe(MONDAY);
    expect(budgets[6].date).toBe("2026-09-13");
  });

  it("uses the 70-minute base on school days without tasks", () => {
    const budgets = dailyBudgets([], { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-08")).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-10")).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-11")).toBe(BASE_MINUTES);
  });

  it("keeps Wednesday at zero", () => {
    expect(budgetOn(dailyBudgets([], { today: MONDAY }), WEDNESDAY_DATE)).toBe(0);
  });

  it("keeps Wednesday at zero even under exam pressure", () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      kind: "exam",
      title: `Exam ${index}`,
      subject: "Math",
      due: "2026-09-11",
      done: false,
    }));
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), WEDNESDAY_DATE)).toBe(0);
  });

  it("leaves weekends empty without tasks", () => {
    const budgets = dailyBudgets([], { today: MONDAY });
    expect(budgetOn(budgets, "2026-09-12")).toBe(0);
    expect(budgetOn(budgets, "2026-09-13")).toBe(0);
  });

  it("raises a school day for open homework", () => {
    const events = [
      { kind: "homework", title: "Task 1", subject: "Math", due: MONDAY, done: false },
    ];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(BASE_MINUTES + 30);
  });

  it("never exceeds 120 minutes", () => {
    const events = Array.from({ length: 12 }, (_, index) => ({
      kind: "homework",
      title: `Task ${index}`,
      subject: "Math",
      due: MONDAY,
      done: false,
    }));
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(MAX_MINUTES);
  });

  it("ignores completed events", () => {
    const events = [
      { kind: "homework", title: "Done", subject: "Math", due: MONDAY, done: true },
    ];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(BASE_MINUTES);
  });

  it("spreads an exam across preceding learning days, not its due date", () => {
    const events = [
      { kind: "exam", title: "Exam", subject: "Math", due: "2026-09-11", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(MAX_MINUTES);
    expect(budgetOn(budgets, "2026-09-08")).toBe(MAX_MINUTES);
    expect(budgetOn(budgets, "2026-09-10")).toBe(MAX_MINUTES);
    expect(budgetOn(budgets, "2026-09-11")).toBe(BASE_MINUTES);
  });

  it("limits a distant exam to the last ten learning days", () => {
    const events = [
      { kind: "exam", title: "Exam", subject: "Math", due: "2026-09-25", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-13")).toBe(18);
  });

  it("moves an overdue event to today", () => {
    const events = [
      { kind: "homework", title: "Forgotten", subject: "Math", due: "2026-09-01", done: false },
    ];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(BASE_MINUTES + 30);
  });

  it("spreads homework evenly through its due date", () => {
    const events = [
      { kind: "homework", title: "Essay", subject: "German", due: "2026-09-08", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(BASE_MINUTES + 15);
    expect(budgetOn(budgets, "2026-09-08")).toBe(BASE_MINUTES + 15);
  });
});

describe("buildPlan", () => {
  const events = [
    { kind: "homework", title: "Aufgabe 4", subject: "Mathe", due: "2026-09-08", done: false },
  ];

  const answerFor = (blocksByDate) => ({
    content: JSON.stringify({ days: blocksByDate }),
  });

  it("übernimmt die Blöcke des Modells und behält die berechneten Budgets", async () => {
    const plan = await buildPlan({
      events,
      terms: [],
      subjects: ["Mathe"],
      today: MONDAY,
      complete: async () =>
        answerFor({ [MONDAY]: [{ subject: "Mathe", task: "Aufgabe 4 rechnen", minutes: 40 }] }),
    });

    expect(plan.generatedFor).toBe(MONDAY);
    const monday = plan.days.find((day) => day.date === MONDAY);
    expect(monday.budgetMinutes).toBe(BASE_MINUTES + 15);
    expect(monday.blocks[0]).toEqual({ subject: "Mathe", task: "Aufgabe 4 rechnen", minutes: 40 });
  });

  it("kürzt Blöcke, die das Tagesbudget überschreiten", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONDAY,
      complete: async () =>
        answerFor({
          [MONDAY]: [
            { subject: "Mathe", task: "Teil 1", minutes: 60 },
            { subject: "Mathe", task: "Teil 2", minutes: 60 },
            { subject: "Mathe", task: "Teil 3", minutes: 60 },
          ],
        }),
    });

    const monday = plan.days.find((day) => day.date === MONDAY);
    const sum = monday.blocks.reduce((total, block) => total + block.minutes, 0);
    expect(sum).toBe(BASE_MINUTES);
    expect(monday.blocks).toHaveLength(2);
    expect(monday.blocks[1].minutes).toBe(10);
  });

  it("lässt den Mittwoch leer, auch wenn das Modell Blöcke liefert", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONDAY,
      complete: async () =>
        answerFor({ [WEDNESDAY_DATE]: [{ subject: "Mathe", task: "Trotzdem lernen", minutes: 60 }] }),
    });

    expect(plan.days.find((day) => day.date === WEDNESDAY_DATE).blocks).toEqual([]);
  });

  it("baut ohne Modell einen Rückfallplan aus den offenen Terminen", async () => {
    const plan = await buildPlan({
      events,
      terms: [],
      subjects: ["Mathe"],
      today: MONDAY,
      complete: async () => {
        throw new Error("Server nicht erreichbar.");
      },
    });

    const monday = plan.days.find((day) => day.date === MONDAY);
    expect(monday.blocks.length).toBeGreaterThan(0);
    expect(monday.blocks[0].task).toContain("Aufgabe 4");
    const sum = monday.blocks.reduce((total, block) => total + block.minutes, 0);
    expect(sum).toBeLessThanOrEqual(monday.budgetMinutes);
  });

  it("verwirft Blöcke ohne Aufgabentext", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONDAY,
      complete: async () =>
        answerFor({ [MONDAY]: [{ subject: "Mathe", task: "   ", minutes: 30 }] }),
    });

    expect(plan.days.find((day) => day.date === MONDAY).blocks).toEqual([]);
  });

  it.each([
    ["null", 0],
    ["negativ", -15],
    ["nicht numerisch", "viel"],
  ])("verwirft %s Modellminuten", async (_label, minutes) => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: MONDAY,
      complete: async () =>
        answerFor({ [MONDAY]: [{ subject: "Mathe", task: "Ungültiger Block", minutes }] }),
    });

    expect(plan.days.find((day) => day.date === MONDAY).blocks).toEqual([]);
  });

  it("plant überfällige offene Termine im Rückfallplan für heute ein", async () => {
    const plan = await buildPlan({
      events: [
        { kind: "homework", title: "Überfällige Bioaufgabe", subject: "Bio", due: "2026-09-01", done: false },
        { kind: "homework", title: "Überfälliges Bio-Protokoll", subject: "Bio", due: "2026-09-02", done: false },
        { kind: "homework", title: "Matheblatt", subject: "Mathe", due: "2026-09-11", done: false },
      ],
      terms: [],
      subjects: ["Bio", "Mathe"],
      today: MONDAY,
      complete: async () => {
        throw new Error("Server nicht erreichbar.");
      },
    });

    const monday = plan.days.find((day) => day.date === MONDAY);
    expect(monday.blocks[0].task).toContain("Überfällige Bioaufgabe");
    expect(monday.blocks.at(-1).subject).toBe("Bio");
  });

  it("wählt das Wiederholungsfach aus allen offenen Terminen", async () => {
    const plan = await buildPlan({
      events: [
        { kind: "homework", title: "Bioaufgabe", subject: "Bio", due: MONDAY, done: false },
        { kind: "homework", title: "Bioprotokoll", subject: "Bio", due: "2026-09-08", done: false },
        { kind: "homework", title: "Matheblatt", subject: "Mathe", due: "2026-09-11", done: false },
      ],
      terms: [],
      subjects: ["Bio", "Mathe"],
      today: MONDAY,
      complete: async () => {
        throw new Error("Server nicht erreichbar.");
      },
    });

    const thursday = plan.days.find((day) => day.date === "2026-09-10");
    expect(thursday.blocks[0].subject).toBe("Mathe");
    expect(thursday.blocks.at(-1).subject).toBe("Bio");
  });
});
