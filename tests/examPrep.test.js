import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCompletion } from "../src/agent/agentClient.js";
import { buildCalendarEntries } from "../src/knowledge/calendarEntries.js";
import { buildExamPrep, examMemory, loadExamMaterial } from "../src/knowledge/examPrep.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";
import { activePrep, buildPlan, examSlots, planInputsKey } from "../src/knowledge/studyPlan.js";
import { buildSchoolContext, runSchoolTool } from "../src/agent/schoolContext.js";

const TODAY = "2026-10-12"; // Montag

const exam = { id: "ex1", kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-16", done: false };
const homework = { id: "h1", kind: "homework", title: "Blatt 3", subject: "Mathe", due: "2026-10-13", done: false };
const prep = { due: exam.due, topic: "Kettenregel", at: 5, blocks: [{ date: TODAY, task: "Ableitungsregeln aufschreiben", minutes: 45 }] };

const reply = (days) => ({ message: { role: "assistant", content: JSON.stringify({ days }) }, usage: null });

afterEach(() => vi.unstubAllGlobals());

describe("model reply shape", () => {
  it("buildPlan reads what the real requestCompletion returns, not only a bare message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({ days: { [TODAY]: [{ ref: "A1", task: "Kettenregel: fünf Ableitungen üben", minutes: 20 }] } }),
              },
            },
          ],
        }),
      })),
    );
    const plan = await buildPlan({
      events: [{ ...homework, due: TODAY }],
      today: TODAY,
      complete: (args) => requestCompletion({ ...args, config: { baseUrl: "http://proxy.test" } }),
    });
    expect(plan.days[0].blocks).toEqual([{ subject: "", task: "Kettenregel: fünf Ableitungen üben", minutes: 20 }]);
  });
});

describe("examSlots", () => {
  it("spreads the exam budget over the days before it, minutes taken from the daily budget", () => {
    // Klausur Fr: letzter Lerntag Do, also Mo-Do mit 180 / 4 Minuten.
    const slots = examSlots([exam], exam, TODAY);
    expect(slots.map((slot) => slot.minutes)).toEqual([60, 60, 75, 75]);
  });

  it("is empty for a finished or past exam", () => {
    expect(examSlots([{ ...exam, done: true }], { ...exam, done: true }, TODAY)).toEqual([]);
  });
});

describe("buildExamPrep", () => {
  it("sends topic, terms, notes and memory, and keeps only slot days within their minutes", async () => {
    const complete = vi.fn(async () =>
      reply({
        "2026-10-12": [
          { task: "Ableitungsregeln aufschreiben", minutes: 40 },
          { task: "Fünf Aufgaben rechnen", minutes: 30 },
        ],
        "2026-10-16": [{ task: "Am Klausurtag", minutes: 10 }],
        "2026-10-13": [{ task: "", minutes: 20 }],
      }),
    );
    const result = await buildExamPrep({
      event: exam,
      events: [exam],
      terms: [
        { subject: "Mathe", term: "Kettenregel", definition: "Ableitung verketteter Funktionen" },
        { subject: "Deutsch", term: "Parabel", definition: "Lehrdichtung" },
      ],
      topic: "  Kettenregel\nund Produktregel ",
      material: "- Heft Analysis, S. 4: f(g(x))' = f'(g(x)) · g'(x)",
      memory: examMemory([{ id: 1, text: "Mathe: verwechselt Ketten- und Produktregel" }]),
      today: TODAY,
      complete,
      now: 7,
    });

    expect(result).toEqual({
      due: "2026-10-16",
      topic: "Kettenregel und Produktregel",
      at: 7,
      blocks: [
        { date: "2026-10-12", task: "Ableitungsregeln aufschreiben", minutes: 40 },
        { date: "2026-10-12", task: "Fünf Aufgaben rechnen", minutes: 20 },
      ],
    });

    const user = complete.mock.calls[0][0].messages[1].content;
    expect(user).toContain("Thema vom Schüler: Kettenregel und Produktregel");
    expect(user).toContain("- 2026-10-12 (Mo): bis 60 Min");
    expect(user).toContain("Kettenregel: Ableitung verketteter Funktionen");
    expect(user).not.toContain("Parabel");
    expect(user).toContain("Aus eigenen Notizen:\n- Heft Analysis, S. 4");
    expect(user).toContain("verwechselt Ketten- und Produktregel");
  });

  it("fails with a message instead of storing nothing or something generic", async () => {
    const base = { event: exam, events: [exam], today: TODAY };
    await expect(buildExamPrep({ ...base, complete: async () => ({ message: { content: "kein JSON" } }) })).rejects.toThrow(
      /keinen Lernplan/,
    );
    await expect(
      buildExamPrep({ ...base, event: { ...exam, done: true }, events: [{ ...exam, done: true }], complete: vi.fn() }),
    ).rejects.toThrow(/kein freier Lerntag/);
  });
});

describe("loadExamMaterial", () => {
  it("turns search hits into short cited lines and never throws", async () => {
    const search = vi.fn(async () => ({
      hits: [{ cite: "Heft, S. 4", excerpt: "Kettenregel:\n  innere mal äußere Ableitung" }],
    }));
    const text = await loadExamMaterial({ event: exam, topic: "Kettenregel", notes: () => [], imported: () => [], search });
    expect(search.mock.calls[0][0]).toBe("Kettenregel Analysis Mathe");
    expect(text).toBe("- Heft, S. 4: Kettenregel: innere mal äußere Ableitung");

    const broken = await loadExamMaterial({ event: exam, search: async () => { throw new Error("kaputt"); }, notes: () => [], imported: () => [] });
    expect(broken).toBe("");
  });
});

describe("exam plan in the daily plan", () => {
  const withPrep = { ...exam, topic: "Kettenregel", prep };

  it("reserves the planned minutes and no longer offers the exam to the model", async () => {
    const complete = vi.fn(async () => reply({}));
    const plan = await buildPlan({ events: [withPrep, homework], today: TODAY, complete });
    const prompt = complete.mock.calls[0][0].messages[1].content;
    // Mo: 5 Grundlast + 45 Klausur + 30 Hausaufgabe (ganz am Montag), davon 45 fest vergeben.
    expect(prompt).toContain("- 2026-10-12: 35 Min");
    expect(prompt).not.toContain("Analysis");
    expect(prompt).toContain("Blatt 3");
    expect(plan.days[0].budgetMinutes).toBe(35);
    expect(plan.days[0].blocks.map((block) => block.task)).not.toContain("Vorbereitung: Analysis");
  });

  it("ignores a plan made for another date and rebuilds when a plan arrives", () => {
    expect(activePrep(withPrep)).toBe(prep);
    expect(activePrep({ ...withPrep, due: "2026-10-19" })).toBeNull();
    expect(activePrep({ ...withPrep, done: true })).toBeNull();
    expect(planInputsKey([withPrep])).not.toBe(planInputsKey([exam]));
  });

  it("shows the blocks as study entries of the calendar, tied to their exam", () => {
    const entries = buildCalendarEntries({ events: [withPrep] });
    expect(entries.find((entry) => entry.id === "prep:ex1:0")).toMatchObject({
      type: "study",
      date: TODAY,
      title: "Ableitungsregeln aufschreiben",
      subject: "Mathe",
      minutes: 45,
    });
  });
});

describe("exam plan storage and agent view", () => {
  const storage = () => {
    const data = {};
    return { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
  };

  it("keeps topic and plan through an IServ sync of the same exam", () => {
    const repository = createKnowledgeRepository(storage());
    const found = { kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-16", iservId: "i1", description: "alt" };
    repository.mergeFindings({ events: [found] });
    const [event] = repository.read().events;
    repository.setExamPrep(event.id, { topic: " Kettenregel ", prep });
    repository.mergeFindings({ events: [{ ...found, description: "neu" }] });

    const [after] = repository.read().events;
    expect(after).toMatchObject({ id: event.id, description: "neu", topic: "Kettenregel", prep });
  });

  it("keeps an existing plan when only the topic is saved", () => {
    const repository = createKnowledgeRepository(storage());
    const event = repository.addEvent({ kind: "exam", title: "Analysis", due: "2026-10-16" });
    repository.setExamPrep(event.id, { topic: "a", prep });
    repository.setExamPrep(event.id, { topic: "b" });
    expect(repository.read().events[0]).toMatchObject({ topic: "b", prep });
  });

  it("puts today's exam blocks into the school block and the topic into list_tasks", () => {
    const withPrep = { ...exam, id: "0000-exam01", topic: "Kettenregel und Produktregel", prep };
    expect(buildSchoolContext({ today: TODAY, events: [withPrep] })).toContain(
      "Lernplan heute: Mathe 45 Min Ableitungsregeln aufschreiben",
    );

    const repository = createKnowledgeRepository(storage());
    repository.addEvent({ kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-16" });
    const [stored] = repository.read().events;
    repository.setExamPrep(stored.id, { topic: "Kettenregel", prep: { ...prep, due: "2026-10-16" } });
    const listed = runSchoolTool("list_tasks", { query: "analysis" }, { repository, today: TODAY });
    expect(listed).toContain("  Thema: Kettenregel");
    expect(listed).toContain("  Lernplan: Mo 12.10. 45 Min Ableitungsregeln aufschreiben");
  });
});
