import { describe, expect, it } from "vitest";
import {
  BASE_MINUTES,
  buildPlan,
  dailyBudgets,
  examSchedule,
  FAR_CAP_MINUTES,
  HOME_BASE_MINUTES,
  estimatedMinutes,
  isoDate,
  isPlanDoneOnlyChange,
  lastWorkDay,
  PLAN_RULES_VERSION,
  planInputsKey,
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
    const events = Array.from({ length: 15 }, (_, index) => ({
      kind: "homework",
      title: `Aufgabe ${index}`,
      subject: "Math",
      due: "2026-09-13", // 6 Tage entfernt - für jede Aufgabe weit weg
      done: false,
    }));
    // Je Aufgabe 30min / 7 Tage, 15 davon macht rund 64 - gedeckelt auf 60.
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES + FAR_CAP_MINUTES);
  });

  it("lifts the cap once a task's own deadline is close", () => {
    const events = [
      { kind: "homework", title: "Morgen fällig", subject: "Math", due: "2026-09-08", done: false },
    ];
    // Fällig morgen: heute liegt innerhalb der Kulanzfrist von 2 Tagen, kein Deckel.
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 30);
  });

  it("ignores completed events", () => {
    const events = [{ kind: "homework", title: "Done", subject: "Math", due: MONDAY, done: true }];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES);
  });

  it("spreads an exam across preceding learning days, not its due date", () => {
    const events = [{ kind: "exam", title: "Exam", subject: "Math", due: "2026-09-11", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY });
    // 4 Lerntage vor der Klausur (07.-10.9), 300min Standardbedarf: 60min/Tag
    // (Tageslimit), in der Kulanzfrist von 2 Tagen vor der Klausur 75min.
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 60);
    expect(budgetOn(budgets, "2026-09-10")).toBe(HOME_BASE_MINUTES + 75);
    expect(budgetOn(budgets, "2026-09-11")).toBe(HOME_BASE_MINUTES);
  });

  it("starts a distant exam late enough: half-hour blocks on the last ten days", () => {
    const events = [{ kind: "exam", title: "Exam", subject: "Math", due: "2026-09-25", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY, days: 20 });
    // Vorbereitung bis Do 24.9.; 300 min in Blöcken zu 30 min sind zehn Tage.
    expect(budgetOn(budgets, "2026-09-14")).toBe(HOME_BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-15")).toBe(HOME_BASE_MINUTES + 30);
    expect(budgetOn(budgets, "2026-09-19")).toBe(30); // Sa, keine Grundlast
    expect(budgetOn(budgets, "2026-09-23")).toBe(BASE_MINUTES + 30);
    expect(budgetOn(budgets, "2026-09-25")).toBe(HOME_BASE_MINUTES);
  });

  it("moves an overdue event to today", () => {
    const events = [{ kind: "homework", title: "Forgotten", subject: "Math", due: "2026-09-01", done: false }];
    expect(budgetOn(dailyBudgets(events, { today: MONDAY }), MONDAY)).toBe(HOME_BASE_MINUTES + 30);
  });

  it("spreads an overdue backlog over the week instead of piling it on today", () => {
    const events = Array.from({ length: 11 }, (_, index) => ({
      kind: "homework",
      title: `Alt ${index}`,
      subject: "Math",
      due: "2026-08-25", // Wochen überfällig
      done: false,
    }));
    const budgets = dailyBudgets(events, { today: MONDAY });
    // 11 x 30 min lagen früher alle auf heute (330 min); jetzt Deckel je Tag.
    for (const day of budgets) expect(day.budgetMinutes).toBeLessThanOrEqual(BASE_MINUTES + FAR_CAP_MINUTES);
    expect(budgetOn(budgets, MONDAY)).toBeLessThanOrEqual(HOME_BASE_MINUTES + FAR_CAP_MINUTES);
    expect(budgets.filter((day) => day.budgetMinutes > 0).length).toBeGreaterThan(4);
  });

  it("does a task that fits one block in one block on one day, not spread out", () => {
    const events = [{ kind: "homework", title: "Essay", subject: "German", due: "2026-09-08", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 30);
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES);
  });

  it("balances several small tasks over the days before their deadline", () => {
    const events = ["a", "b", "c"].map((id) => ({ kind: "homework", title: id, subject: "x", due: "2026-09-10", done: false }));
    const budgets = dailyBudgets(events, { today: MONDAY });
    // Mo, Di, Mi je eine Aufgabe, der Donnerstag (Abgabetag, ohne Uhrzeit) bleibt frei.
    expect([MONDAY, "2026-09-08"].map((d) => budgetOn(budgets, d))).toEqual([HOME_BASE_MINUTES + 30, HOME_BASE_MINUTES + 30]);
    expect(budgetOn(budgets, WEDNESDAY_DATE)).toBe(BASE_MINUTES + 30);
    expect(budgetOn(budgets, "2026-09-10")).toBe(HOME_BASE_MINUTES);
  });

  it("splits only a task larger than one block, one part per day", () => {
    const events = [{ kind: "homework", title: "Projekt", subject: "x", due: "2026-09-10", description: "ca. 2 Stunden", done: false }];
    const budgets = dailyBudgets(events, { today: MONDAY });
    // 120 Minuten sind zwei Blöcke à 60 auf zwei Tage.
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 60);
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES + 60);
    expect(budgetOn(budgets, WEDNESDAY_DATE)).toBe(BASE_MINUTES);
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
    // Zwei Aufgaben bis Di abends: die zweite kommt auf den Abgabetag, er ist nutzbar.
    const second = [...events, { ...events[0], title: "Zweite" }];
    const budgets = dailyBudgets(second, { today: MONDAY });
    expect(budgetOn(budgets, MONDAY)).toBe(HOME_BASE_MINUTES + 30);
    expect(budgetOn(budgets, "2026-09-08")).toBe(HOME_BASE_MINUTES + 30);
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
    expect(monday.budgetMinutes).toBe(HOME_BASE_MINUTES + 30);
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

  it("plant überfällige offene Termine im Rückfallplan über die nächsten Tage ein", async () => {
    // Mittwoch statt Montag: voller Zuhause-Grundwert, keine Schul-Lernzeit.
    // Die Aufgabe mit naher Frist belegt heute, die überfälligen verteilen sich
    // auf die folgenden Tage, statt sich alle auf heute zu legen.
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
    const planned = plan.days.flatMap((day) => day.blocks.map((block) => block.task));
    expect(planned).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Überfällige Bioaufgabe"),
        expect.stringContaining("Überfälliges Bio-Protokoll"),
      ]),
    );
    expect(today.blocks.filter((block) => block.task.includes("Überfällig"))).toHaveLength(0);
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

describe("examSchedule: Lernblöcke je Klausur", () => {
  const exam = (id, due, patch = {}) => ({ id, kind: "exam", title: `Klausur ${id}`, subject: "Mathe", due, done: false, ...patch });
  const homework = (id, due) => ({ id, kind: "homework", title: `HA ${id}`, subject: "Mathe", due, done: false });
  // "TT.MM. Klausur Minuten", nach Datum sortiert, mehrere Klausuren eines Tages mit +.
  const rows = (schedule) =>
    [...schedule]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, entries]) => `${date.slice(8)}.${date.slice(5, 7)}. ${entries.map((e) => `${e.id}${e.minutes}`).join("+")}`);

  it("plant eine Klausur in zehn Tagen als halbstündige Blöcke, bis 300 Minuten erreicht sind", () => {
    // Do 17.9.: letzter Lerntag Mi 16.9., zehn Tage ab heute für 300 Minuten.
    const rowsOf = rows(examSchedule([exam("A", "2026-09-17")], MONDAY));
    expect(rowsOf).toHaveLength(10);
    expect(rowsOf[0]).toBe("07.09. A30");
    expect(rowsOf[9]).toBe("16.09. A30");
  });

  it("macht die Blöcke länger, wenn nur wenige Tage bleiben, und lockert das Limit kurz vor der Klausur", () => {
    // Fr 11.9.: Lerntage Mo-Do. Mo/Di im Tageslimit (60), Mi/Do ohne Limit (75).
    expect(rows(examSchedule([exam("A", "2026-09-11")], MONDAY))).toEqual([
      "07.09. A60",
      "08.09. A60",
      "09.09. A75",
      "10.09. A75",
    ]);
  });

  it("gibt nahen Klausuren zuerst eigene Tage und teilt erst dann", () => {
    const schedule = examSchedule([exam("A", "2026-09-10"), exam("B", "2026-09-11")], MONDAY);
    expect(rows(schedule)).toEqual(["07.09. A60", "08.09. B60+A30", "09.09. A90", "10.09. B75"]);
  });

  it("gibt an einem geteilten Tag keiner Klausur einen Schnipsel unter einer halben Stunde", () => {
    const schedule = examSchedule([exam("A", "2026-09-10"), exam("B", "2026-09-11")], MONDAY);
    const shared = [...schedule.values()].filter((entries) => entries.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    for (const entries of shared) for (const entry of entries) expect(entry.minutes).toBeGreaterThanOrEqual(30);
  });

  it("lässt Tage aus, die von Hausaufgaben voll sind", () => {
    // Neun Aufgaben bis Fr 11.9. verlangen an Mo-Do je 54 Minuten: kein Platz für einen Block.
    const tasks = Array.from({ length: 9 }, (_, index) => homework(`h${index}`, "2026-09-11"));
    const schedule = examSchedule([...tasks, exam("A", "2026-09-14")], MONDAY);
    // 9 Aufgaben à 30 auf Mo-Fr: Mo-Do je 60 (voll), Fr nur 30, daher dort ein halber Block.
    expect(rows(schedule)).toEqual(["11.09. A30", "12.09. A90", "13.09. A90"]);
  });

  it("verplant keine erledigte Klausur und hält die Tage einer Klausur mit eigenem Lernplan fest", () => {
    expect(examSchedule([exam("A", "2026-09-11", { done: true })], MONDAY).size).toBe(0);

    const planned = exam("A", "2026-09-11", { prep: { due: "2026-09-11", at: 1, blocks: [{ date: "2026-09-10", task: "x", minutes: 60 }] } });
    const schedule = examSchedule([planned, exam("B", "2026-09-11")], MONDAY);
    expect(schedule.get("2026-09-10")[0]).toEqual({ id: "A", minutes: 60 });
    const daysOfB = [...schedule].filter(([, entries]) => entries.some((e) => e.id === "B"));
    expect(daysOfB.length).toBeGreaterThan(1);
  });

  it("verlangt Hausaufgaben und Lernzeitaufgaben auch an Lerntagen voll", () => {
    const [today] = dailyBudgets([exam("A", "2026-09-11"), homework("h", MONDAY)], { today: MONDAY });
    // Die heute fällige Aufgabe behält ihre 30, der Klausurblock bekommt den Rest des Limits.
    expect(today.budgetMinutes).toBe(HOME_BASE_MINUTES + 30 + 30);
  });

  it("liest die vorgesehene Bearbeitungszeit aus der Beschreibung", () => {
    const task = (description) => ({ kind: "homework", title: "x", due: MONDAY, description });
    expect(estimatedMinutes(task("Bearbeitungszeit: ca. 45 Minuten"))).toBe(45);
    expect(estimatedMinutes(task("etwa 20-30 min"))).toBe(30);
    expect(estimatedMinutes(task("ca. 1,5 Stunden"))).toBe(90);
    expect(estimatedMinutes(task("2 Std."))).toBe(120);
    expect(estimatedMinutes(task("Seite 12, Nr. 3"))).toBeNull();
    expect(estimatedMinutes(task("5 Hausaufgaben"))).toBeNull();
  });

  it("plant eine große Aufgabe mit Zeitangabe in Blöcken auf die letzten Tage vor der Frist", () => {
    const task = { kind: "homework", title: "Lernzeit Bio", subject: "Bio", due: "2026-09-30", description: "ca. 70 Minuten", done: false };
    const budgets = dailyBudgets([task], { today: MONDAY, days: 24 });
    // 70 Minuten sind zwei Blöcke à 35, im Fenster der letzten sieben Tage (24.-30.9.).
    expect(budgetOn(budgets, "2026-09-10")).toBe(HOME_BASE_MINUTES);
    expect(budgetOn(budgets, "2026-09-24")).toBe(HOME_BASE_MINUTES + 35);
    expect(budgetOn(budgets, "2026-09-25")).toBe(HOME_BASE_MINUTES + 35);
    expect(budgetOn(budgets, "2026-09-28")).toBe(HOME_BASE_MINUTES);
  });

  it("nimmt den geschätzten Bedarf einer Klausur, solange er zu Thema und Termin passt", () => {
    const need = { minutes: 90, content: ["a"], topic: "", due: "2026-09-11", at: 1 };
    const total = (event) =>
      [...examSchedule([event], MONDAY)].flatMap(([, entries]) => entries).reduce((sum, entry) => sum + entry.minutes, 0);
    expect(total(exam("A", "2026-09-11", { need }))).toBe(90);
    expect(total(exam("A", "2026-09-11", { need: { ...need, topic: "alt" } }))).toBe(270);
    expect(total(exam("A", "2026-09-11", { need: { ...need, minutes: 600 } }))).toBe(300);
  });
});

describe("buildPlan mit Klausurblöcken", () => {
  const exam = (id, due) => ({ id, kind: "exam", title: `Klausur ${id}`, subject: "Mathe", due, done: false });
  const iserv = { id: "i1", kind: "homework", title: "Lernzeit Philosophie", subject: "Philosophie", due: "2026-09-10", iservId: "u1", description: "ca. 40 Minuten", done: false };
  const answerFor = (blocksByDate) => ({ content: JSON.stringify({ days: blocksByDate }) });
  const dayOf = (plan, date) => plan.days.find((day) => day.date === date);

  it("nennt dem Modell je Tag die erlaubten Klausuren mit Minuten und die vorgesehene Zeit der Aufgaben", async () => {
    let request = "";
    await buildPlan({
      events: [exam("A", "2026-09-10"), exam("B", "2026-09-11"), iserv],
      today: MONDAY,
      complete: async ({ messages }) => {
        request = messages[1].content;
        return answerFor({});
      },
    });

    // Klausuren stehen als A1/A2, die Lernzeitaufgabe als A3. Montag gehört A,
    // Dienstag B mit einem Rest von A.
    expect(request).toMatch(/2026-09-07: \d+ Min · möglich: A1, A3 · vorgesehen: A3 40 Min · Klausur: A1 \d+ Min\n/);
    expect(request).toMatch(/2026-09-08: \d+ Min · möglich: A1, A2, A3 · Klausur: A2 \d+ Min, A1 \d+ Min/);
    expect(request).toContain("A3 · fällig 2026-09-10 · Aufgabe · Philosophie · Lernzeit Philosophie · ca. 40 Min");
    expect(request).toContain("Klausur · Mathe · Klausur A");
  });

  it("lässt einen Block mehrere Aufgaben tragen und prüft jede Kennung", async () => {
    const tasks = [
      { id: "h1", kind: "homework", title: "Vokabeln", subject: "Englisch", due: "2026-09-08", done: false },
      { id: "h2", kind: "homework", title: "Blatt 2", subject: "Mathe", due: "2026-09-07", done: false },
    ];
    const plan = await buildPlan({
      events: tasks,
      today: MONDAY,
      complete: async () =>
        answerFor({
          "2026-09-07": [{ refs: ["A1", "A2"], subject: "", task: "Vokabeln lernen, Blatt 2 rechnen", minutes: 20 }],
          // A2 ist ab Dienstag vorbei, ein Block mit ihr ist nicht zulässig.
          "2026-09-08": [{ refs: ["A1", "A2"], subject: "", task: "Beides", minutes: 20 }],
        }),
    });
    expect(dayOf(plan, "2026-09-07").blocks).toHaveLength(1);
    expect(dayOf(plan, "2026-09-08").blocks).toEqual([]);
  });

  it("verwirft Klausurblöcke an Tagen, an denen die Klausur nicht vorgesehen ist, auch ohne Kennung", async () => {
    const plan = await buildPlan({
      events: [exam("A", "2026-09-10"), exam("B", "2026-09-11")],
      today: MONDAY,
      complete: async () =>
        answerFor({
          // Montag ist nur für A vorgesehen.
          "2026-09-07": [
            { ref: "A2", subject: "Mathe", task: "Klausur B üben", minutes: 20 },
            { ref: "", subject: "Mathe", task: "Aufgaben für Klausur B rechnen", minutes: 10 },
            { ref: "A1", subject: "Mathe", task: "Klausur A üben", minutes: 30 },
          ],
        }),
    });

    expect(dayOf(plan, "2026-09-07").blocks.map((block) => block.task)).toEqual(["Klausur A üben"]);
  });

  it("plant im Rückfallplan die Klausur nur an ihren Tagen, mit den Minuten des Blocks", async () => {
    const plan = await buildPlan({
      events: [exam("A", "2026-09-10"), exam("B", "2026-09-11")],
      today: MONDAY,
      complete: async () => {
        throw new Error("offline");
      },
    });

    expect(dayOf(plan, "2026-09-07").blocks[0]).toMatchObject({ task: "Vorbereitung: Klausur A", minutes: 60 });
    const tuesday = dayOf(plan, "2026-09-08").blocks.map((block) => `${block.task} ${block.minutes}`);
    expect(tuesday).toEqual(expect.arrayContaining(["Vorbereitung: Klausur B 60", "Vorbereitung: Klausur A 30"]));
    const allTasks = plan.days.flatMap((day) => day.blocks.map((block) => block.task));
    expect(allTasks.filter((task) => task === "Vorbereitung: Klausur B")).toHaveLength(2);
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

  it("puts due-this-morning work on today", () => {
    expect(lastWorkDay(homework(MONDAY, "07:45"), MONDAY)).toBe(MONDAY);
  });

  it("gives overdue work a week to spread over, not just today", () => {
    expect(lastWorkDay(homework("2026-09-01"), MONDAY)).toBe("2026-09-13");
  });

  it("keeps an overdue exam on today", () => {
    expect(lastWorkDay({ kind: "exam", title: "x", due: "2026-09-01" }, MONDAY)).toBe(MONDAY);
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

    // Eine kleine Aufgabe kommt an einem Tag in einem Block, vor ihrem Abgabetag.
    expect(dayOf(plan, MONDAY).blocks[0].task).toBe("Lernzeit Philosophie");
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

    expect(request).toContain(`${WEDNESDAY_DATE}: ${BASE_MINUTES} Min · möglich: A1`);
    expect(request).toMatch(new RegExp(`${THURSDAY}: \\d+ Min · möglich: nur Wiederholung`));
  });
});

describe("abgehakte Lernblöcke", () => {
  const task = { id: "t1", kind: "homework", title: "Blatt 3", due: "2026-09-11", description: "ca. 60 Minuten" };
  const demand = (events) =>
    dailyBudgets(events, { today: MONDAY }).reduce((sum, day) => sum + day.budgetMinutes, 0);

  it("verteilt nur die Restminuten", () => {
    const worked = { ...task, work: { [MONDAY]: 30 } };
    expect(demand([worked])).toBeLessThan(demand([task]));
  });

  it("macht den Plan veraltet, sobald gearbeitet wurde, sonst nicht", () => {
    expect(planInputsKey([{ ...task, work: {} }])).toBe(planInputsKey([task]));
    expect(planInputsKey([{ ...task, work: { [MONDAY]: 30 } }])).not.toBe(planInputsKey([task]));
  });

  it("behält die Aufgaben-Kennung der Blöcke", async () => {
    const plan = await buildPlan({
      events: [task],
      today: MONDAY,
      complete: async () => ({ content: JSON.stringify({ days: { [MONDAY]: [{ refs: ["A1"], task: "Blatt 3 lösen", minutes: 30 }] } }) }),
    });
    expect(plan.days[0].blocks[0].eventIds).toEqual(["t1"]);
  });
});

describe("Blöcke erledigter Aufgaben", () => {
  const done = { id: "t1", kind: "homework", title: "Blatt 3", due: "2026-09-11", done: true };
  const previous = { days: [{ date: MONDAY, blocks: [{ task: "Blatt 3", minutes: 30, eventIds: ["t1"] }] }] };
  const run = (events) => buildPlan({ events, today: MONDAY, previous, complete: async () => ({ content: '{"days":{}}' }) });

  it("bleiben im neuen Plan stehen, damit der Kalender sie ausgegraut zeigt", async () => {
    const plan = await run([done]);
    expect(plan.days[0].blocks).toContainEqual({ task: "Blatt 3", minutes: 30, eventIds: ["t1"] });
  });

  it("entfallen an einem Tag, an dem die Aufgabe abgehakt wurde (dort steht der erledigte Eintrag)", async () => {
    const worked = await run([{ ...done, work: { [MONDAY]: 30 } }]);
    expect(worked.days[0].blocks.some((block) => block.eventIds?.includes("t1"))).toBe(false);
  });
});

describe("isPlanDoneOnlyChange", () => {
  const TODAY = "2026-09-07";
  const task = { id: "t1", kind: "homework", title: "Blatt", due: "2026-09-14", subject: "Mathe" };
  const plan = (events, doneIds = [], works = {}) => ({
    generatedFor: TODAY,
    rules: PLAN_RULES_VERSION,
    inputs: planInputsKey(events),
    doneIds,
    works,
    days: [],
  });

  it("is true when only a task was checked off since the plan", () => {
    expect(isPlanDoneOnlyChange(plan([task]), [{ ...task, done: true }], TODAY)).toBe(true);
  });

  it("is true when only studied minutes were checked off since the plan", () => {
    expect(isPlanDoneOnlyChange(plan([task]), [{ ...task, work: { [TODAY]: 30 } }], TODAY)).toBe(true);
    expect(
      isPlanDoneOnlyChange(plan([{ ...task, work: { [TODAY]: 30 } }], [], { t1: { [TODAY]: 30 } }), [task], TODAY),
    ).toBe(true);
  });

  it("is false when a task was added or its due date changed", () => {
    expect(isPlanDoneOnlyChange(plan([task]), [task, { ...task, id: "t2" }], TODAY)).toBe(false);
    expect(isPlanDoneOnlyChange(plan([task]), [{ ...task, due: "2026-09-20" }], TODAY)).toBe(false);
  });

  it("is true again when a checked-off task is reopened", () => {
    expect(isPlanDoneOnlyChange(plan([{ ...task, done: true }], ["t1"]), [task], TODAY)).toBe(true);
  });

  it("is false for another day or an older rule set", () => {
    expect(isPlanDoneOnlyChange(plan([task]), [{ ...task, done: true }], "2026-09-08")).toBe(false);
    expect(isPlanDoneOnlyChange({ ...plan([task]), rules: 1 }, [{ ...task, done: true }], TODAY)).toBe(false);
  });
});
