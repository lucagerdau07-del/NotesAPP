import { describe, expect, it } from "vitest";
import {
  BASE_MINUTES,
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
