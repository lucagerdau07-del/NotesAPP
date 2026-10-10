import { describe, expect, it } from "vitest";
import {
  BASE_MINUTES,
  buildPlan,
  dailyBudgets,
  FAR_CAP_MINUTES,
  HOME_BASE_MINUTES,
  isoDate,
  lastWorkDay,
} from "../src/knowledge/studyPlan.js";

// 2026-09-07 is a Monday (Lernzeit-Tag), 2026-09-09 a Wednesday (kein Lernzeit-Tag).
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

  it("uses the reduced home base on a day with school Lernzeit", () => {
    const budgets = dailyBudgets([], { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-10")).toBe(HOME_BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-11")).toBe(HOME_BASE_MINUTES);
  });

  it("gives Wednesday the full home base, since it has no school Lernzeit", () => {
    expect(budgetOn(dailyBudgets([], { today: MONDAY }), WEDNESDAY_DATE)).toBe(BASE_MINUTES);
  });

  it("leaves weekends empty without tasks", () => {
    const budgets = dailyBudgets([], { today: MONDAY });
    expect(budgetOn(budgets, "2026-09-12")).toBe(0);
    expect(budgetOn(budgets, "2026-09-13")).toBe(0);
  });

  it("adds no study time for an appointment", () => {
    const events = [{ kind: "appointment", title: "Zahnarzt", subject: "", due: MONDAY, done: false }];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES);
  });

  it("raises a school day for open homework", () => {
    const events = [{ kind: "homework", title: "Task 1", subject: "Math", due: MONDAY, done: false }];
    // Heute fällig: innerhalb der Kulanzfrist, also ungedeckelt.
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES + 30);
  });

  it("caps far-off demand at one hour, stacked across several tasks", () => {
    const events = Array.from({ length: 3 }, (_, index) => ({
      kind: "exam",
      title: `Klausur ${index}`,
      subject: "Math",
      due: "2026-09-13", // 6 Tage entfernt - für jede Klausur weit weg
      done: false,
    }));
    // Je Klausur 30min/Tag (180min / 6 Lerntage), 3 davon macht 90 - gedeckelt auf 60.
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES + FAR_CAP_MINUTES);
  });

  it("lifts the cap once a task's own deadline is close", () => {
    const events = [
      { kind: "homework", title: "Morgen fällig", subject: "Math", due: "2026-09-08", done: false },
    ];
    // Fällig morgen: heute liegt innerhalb der Kulanzfrist von 2 Tagen, kein Deckel.
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 15);
  });

  it("ignores completed events", () => {
    const events = [{ kind: "homework", title: "Done", subject: "Math", due: MONDAY, done: true }];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES);
  });

  it("spreads an exam across preceding learning days, not its due date", () => {
    const events = [{ kind: "exam", title: "Exam", subject: "Math", due: "2026-09-11", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY });
    // 4 Lerntage vor der Klausur (07.-10.9), 180min verteilt: 45min/Tag, innerhalb
    // der Kulanzfrist von 2 Tagen vor der Klausur also ungedeckelt.
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 45);
    expect(budgetOn(budgets, "2026-09-10")).toBe(HOME_BASE_MINUTES + 45);
    expect(budgetOn(budgets, "2026-09-11")).toBe(HOME_BASE_MINUTES);
  });

  it("limits a distant exam to the last ten learning days and caps it far out", () => {
    const events = [{ kind: "exam", title: "Exam", subject: "Math", due: "2026-09-25", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY, days: 20 });
    // Vor dem 10-Tage-Fenster: keine Nachfrage. Darin (15.-24.9.): 180min/10 Tage.
    expect(budgetOn(budgets, "2026-09-14")).toBe(HOME_BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-15")).toBe(HOME_BASE_MINUTES + 18);
  });

  it("moves an overdue event to today", () => {
    const events = [{ kind: "homework", title: "Forgotten", subject: "Math", due: "2026-09-01", done: false }];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES + 30);
  });

  it("spreads homework evenly through its due date when the deadline is not a morning one", () => {
    const events = [{ kind: "homework", title: "Essay", subject: "German", due: "2026-09-08", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 15);
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES + 15);
  });

  it("excludes the due day itself when the deadline is in the morning", () => {
    const events = [
      { kind: "homework", title: "Vor der 1. Stunde", subject: "German", due: "2026-09-08", time: "07:45", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONDAY });
    // Ganze 30min auf den einzigen echten Arbeitstag (heute), nicht mehr auf den Abgabetag verteilt.
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 30);
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES);
  });

  it("keeps the due day workable for an evening deadline", () => {
    const events = [
      { kind: "homework", title: "Abends fällig", subject: "German", due: "2026-09-08", time: "18:00", done: false },
    ];
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES + 15);
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
        answerFor({ [MONDAY]: [{ subject: "Mathe", task: "Aufgabe 4 rechnen", minutes: 15 }] }),
    });

    expect(plan.generatedFor).toBe(MONDAY);
    const monday = plan.days.find((day) => day.date === MONDAY);
    expect(monday.budgetMinutes).toBe(HOME_BASE_MINUTES + 15);
    expect(monday.blocks[0]).toEqual({ subject: "Mathe", task: "Aufgabe 4 rechnen", minutes: 15 });
  });

  it("kürzt Blöcke, die das Tagesbudget überschreiten", async () => {
    const plan = await buildPlan({
      events: [],
      terms: [],
      subjects: ["Mathe"],
      today: WEDNESDAY_DATE,
      complete: async () =>
        answerFor({
          [WEDNESDAY_DATE]: [
            { subject: "Mathe", task: "Teil 1", minutes: 60 },
            { subject: "Mathe", task: "Teil 2", minutes: 60 },
            { subject: "Mathe", task: "Teil 3", minutes: 60 },
          ],
        }),
    });

    const day = plan.days.find((entry) => entry.date === WEDNESDAY_DATE);
    const sum = day.blocks.reduce((total, block) => total + block.minutes, 0);
    expect(sum).toBe(BASE_MINUTES);
    expect(day.blocks).toHaveLength(2);
    expect(day.blocks[1].minutes).toBe(10);
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
    // Mittwoch statt Montag: voller Zuhause-Grundwert, keine Schul-Lernzeit -
    // sonst reicht das Tagesbudget nicht für alle drei Blöcke plus Wiederholung.
    const plan = await buildPlan({
      events: [
        { kind: "homework", title: "Überfällige Bioaufgabe", subject: "Bio", due: "2026-09-01", done: false },
        { kind: "homework", title: "Überfälliges Bio-Protokoll", subject: "Bio", due: "2026-09-02", done: false },
        { kind: "homework", title: "Matheblatt", subject: "Mathe", due: "2026-09-11", done: false },
      ],
      terms: [],
      subjects: ["Bio", "Mathe"],
      today: WEDNESDAY_DATE,
      complete: async () => {
        throw new Error("Server nicht erreichbar.");
      },
    });

    const today = plan.days.find((day) => day.date === WEDNESDAY_DATE);
    expect(today.blocks[0].task).toContain("Überfällige Bioaufgabe");
    expect(today.blocks.at(-1).subject).toBe("Bio");
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

    // Mittwoch: beide Bio-Termine sind da schon vorbei (dueFromDate schließt sie
    // aus), nur noch Mathe steht an - der volle Grundwert lässt danach Raum für
    // die Wiederholung im insgesamt stärker belasteten Fach Bio.
    const wednesday = plan.days.find((day) => day.date === WEDNESDAY_DATE);
    expect(wednesday.blocks[0].subject).toBe("Mathe");
    expect(wednesday.blocks.at(-1).subject).toBe("Bio");
  });
});

describe("lastWorkDay", () => {
  const homework = (due, time) => ({ kind: "homework", title: "x", due, ...(time ? { time } : {}) });

  it("ends the day before a morning or midnight deadline", () => {
    expect(lastWorkDay(homework("2026-09-10", "00:00"), MONDAY)).toBe(WEDNESDAY_DATE);
    expect(lastWorkDay(homework("2026-09-10", "07:45"), MONDAY)).toBe(WEDNESDAY_DATE);
  });

  it("keeps the due day for an afternoon deadline or none at all", () => {
    expect(lastWorkDay(homework("2026-09-10", "18:00"), MONDAY)).toBe("2026-09-10");
    expect(lastWorkDay(homework("2026-09-10"), MONDAY)).toBe("2026-09-10");
  });

  it("never plans exam preparation on the exam day", () => {
    expect(lastWorkDay({ kind: "exam", title: "x", due: "2026-09-10" }, MONDAY)).toBe(WEDNESDAY_DATE);
  });

  it("puts overdue and due-this-morning work on today", () => {
    expect(lastWorkDay(homework("2026-09-01"), MONDAY)).toBe(MONDAY);
    expect(lastWorkDay(homework(MONDAY, "07:45"), MONDAY)).toBe(MONDAY);
  });
});

describe("buildPlan hält Abgabefristen hart ein", () => {
  // Wie die Philo-Lernzeit: Abgabe Donnerstag 00:00, also nur bis Mittwoch machbar.
  const THURSDAY = "2026-09-10";
  const FRIDAY = "2026-09-11";
  const philo = { kind: "homework", title: "Lernzeit Philosophie", subject: "Philosophie", due: THURSDAY, time: "00:00", done: false };
  const answerFor = (blocksByDate) => ({ content: JSON.stringify({ days: blocksByDate }) });
  const dayOf = (plan, date) => plan.days.find((day) => day.date === date);

  it("verwirft Modellblöcke mit Kennung am oder nach dem Abgabetag", async () => {
    const block = { ref: "A1", subject: "Philosophie", task: "Philo bearbeiten", minutes: 20 };
    const plan = await buildPlan({
      events: [philo],
      today: MONDAY,
      complete: async () => answerFor({ [WEDNESDAY_DATE]: [block], [THURSDAY]: [block], [FRIDAY]: [block] }),
    });

    expect(dayOf(plan, WEDNESDAY_DATE).blocks).toHaveLength(1);
    expect(dayOf(plan, THURSDAY).blocks).toEqual([]);
    expect(dayOf(plan, FRIDAY).blocks).toEqual([]);
  });

  it("verwirft Blöcke ohne Kennung, die eine abgelaufene Aufgabe beim Namen nennen", async () => {
    const plan = await buildPlan({
      events: [philo],
      today: MONDAY,
      complete: async () =>
        answerFor({
          [THURSDAY]: [
            { subject: "Philosophie", task: "Lernzeit Philosophie fertig machen", minutes: 20 },
            { ref: "", subject: "Philosophie", task: "Begriffe wiederholen", minutes: 10 },
          ],
        }),
    });

    expect(dayOf(plan, THURSDAY).blocks.map((block) => block.task)).toEqual(["Begriffe wiederholen"]);
  });

  it("plant die Aufgabe im Rückfallplan nicht am Abgabetag ein", async () => {
    const plan = await buildPlan({
      events: [philo],
      today: MONDAY,
      complete: async () => {
        throw new Error("offline");
      },
    });

    expect(dayOf(plan, WEDNESDAY_DATE).blocks[0].task).toBe("Lernzeit Philosophie");
    expect(dayOf(plan, THURSDAY).blocks.some((block) => block.task === "Lernzeit Philosophie")).toBe(false);
  });

  it("sagt dem Modell je Tag, welche Aufgaben noch möglich sind", async () => {
    let request = "";
    await buildPlan({
      events: [philo],
      today: MONDAY,
      complete: async ({ messages }) => {
        request = messages[1].content;
        return answerFor({});
      },
    });

    expect(request).toContain(`${WEDNESDAY_DATE}: ${BASE_MINUTES + 10} Min · möglich: A1`);
    expect(request).toMatch(new RegExp(`${THURSDAY}: \\d+ Min · möglich: nur Wiederholung`));
  });
});
