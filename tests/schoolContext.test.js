import { describe, expect, it, vi } from "vitest";
import {
  buildSchoolContext,
  loadSchoolContext,
  runSchoolTool,
  SCHOOL_MAX_CHARS,
} from "../src/agent/schoolContext.js";
import { buildSystemPrompt } from "../src/agent/systemPrompt.js";
import { AGENT_CORE_TOOLS, AGENT_LIBRARY_TOOLS } from "../src/agent/tools.js";
import { createKnowledgeRepository, KNOWLEDGE_CHANGED } from "../src/knowledge/knowledgeRepository.js";

const TODAY = "2026-10-10"; // Samstag

const event = (id, patch) => ({ id: `0000-${id}`, kind: "homework", title: id, subject: "", due: TODAY, ...patch });
const lesson = (date, startTime, name, patch = {}) => ({
  id: `${date}-${startTime}`,
  date,
  startTime,
  su: [{ name, longname: name }],
  te: [{ id: 1, name: "XY" }],
  ro: [{ id: 1, name: "R1" }],
  ...patch,
});

function repoWith(events) {
  const data = {};
  const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
  const repository = createKnowledgeRepository(storage);
  storage.setItem("notes.knowledge.v1", JSON.stringify({ ...repository.read(), events }));
  return repository;
}

describe("buildSchoolContext", () => {
  it("lists open tasks by date with weekday, short id and an overdue mark", () => {
    const text = buildSchoolContext({
      today: TODAY,
      events: [
        event("klausur", { kind: "exam", title: "Der Vorleser", subject: "Deutsch", due: "2026-10-15", time: "08:00" }),
        event("mathe1", { title: "S. 42 Nr. 3", subject: "Mathe", due: "2026-10-12" }),
        event("spaet1", { title: "Essay", subject: "Englisch", due: "2026-10-08" }),
        event("fertig", { due: "2026-10-12", done: true }),
        event("uralt1", { due: "2026-09-01" }),
        event("vorbei", { kind: "exam", due: "2026-10-09" }),
        event("fern01", { due: "2026-11-30" }),
      ],
    });
    expect(text.split("\n")).toEqual([
      "Schule. Offen (id, fällig, Art, Fach: Titel):",
      "spaet1 überfällig Do 8.10. HA Englisch: Essay",
      "mathe1 Mo 12.10. HA Mathe: S. 42 Nr. 3",
      "lausur Do 15.10. 08:00 Klausur Deutsch: Der Vorleser",
    ]);
  });

  it("adds today's plan and the timetable of today and the next school day", () => {
    const text = buildSchoolContext({
      today: "2026-10-09", // Freitag
      plan: { days: [{ date: "2026-10-09", blocks: [{ subject: "Mathe", minutes: 30, task: "Kurvendiskussion üben" }] }] },
      lessons: [
        lesson(20261009, 745, "Mathe"),
        lesson(20261009, 835, "Mathe"),
        lesson(20261009, 940, "Deutsch", { code: "cancelled" }),
        lesson(20261012, 745, "Englisch"),
        lesson(20261013, 745, "Sport"),
      ],
    });
    expect(text).toContain("nichts in den nächsten 14 Tagen");
    expect(text).toContain("Lernplan heute: Mathe 30 Min Kurvendiskussion üben");
    // Die Doppelstunde ist eine Angabe, der Ausfall steht dabei.
    expect(text).toContain("Stundenplan heute: 07:45 Mathe, 09:40 Deutsch entfällt");
    expect(text).toContain("Stundenplan Mo 12.10.: 07:45 Englisch");
    expect(text).not.toContain("Sport");
  });

  it("stays inside its budget: timetable and plan go first, then tasks", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      event(`task${String(i).padStart(2, "0")}`, { title: "Sehr lange Aufgabe ".repeat(6), due: "2026-10-12" }),
    );
    const lessons = [lesson(20261010, 745, "Mathe"), lesson(20261012, 745, "Englisch")];
    const full = buildSchoolContext({ today: TODAY, events, lessons });
    expect(full.length).toBeLessThanOrEqual(SCHOOL_MAX_CHARS);
    expect(full).toContain("+4 weitere über list_tasks");

    const tight = buildSchoolContext({ today: TODAY, events, lessons }, { maxChars: 260 });
    expect(tight.length).toBeLessThanOrEqual(260);
    expect(tight).not.toContain("Stundenplan");
    expect(tight).toMatch(/\+\d+ weitere über list_tasks/);
  });

  it("loads from the repository and the archived weeks, and never throws", () => {
    const text = loadSchoolContext({
      repository: repoWith([event("mathe1", { due: "2026-10-12" })]),
      loadWeek: () => [lesson(20261012, 745, "Englisch")],
      now: new Date("2026-10-10T09:00:00"),
    });
    expect(text).toContain("mathe1 Mo 12.10. HA mathe1");
    expect(text).toContain("Stundenplan Mo 12.10.: 07:45 Englisch");
    expect(loadSchoolContext({ repository: { read: () => { throw new Error("kaputt"); } } })).toBe("");
  });
});

describe("school tools", () => {
  const events = [
    event("mathe1", { title: "S. 42 Nr. 3", subject: "Mathe", due: "2026-10-12", description: "Bearbeite  die\nAufgaben 3 bis 5.", attachments: [{ filename: "blatt.pdf" }] }),
    event("alt001", { title: "Vokabeln", subject: "Englisch", due: "2026-09-01", done: true }),
  ];

  it("list_tasks shows open tasks with their full text, a query also finds old ones", () => {
    const repository = repoWith(events);
    const open = runSchoolTool("list_tasks", {}, { repository, today: TODAY });
    expect(open).toContain("mathe1 | 2026-10-12 | HA | Mathe | S. 42 Nr. 3");
    expect(open).toContain("Bearbeite die Aufgaben 3 bis 5.");
    expect(open).toContain("Anhänge: blatt.pdf");
    expect(open).not.toContain("Vokabeln");
    expect(runSchoolTool("list_tasks", { query: "englisch" }, { repository, today: TODAY })).toContain(
      "Vokabeln (erledigt)",
    );
    expect(runSchoolTool("list_tasks", { query: "chemie" }, { repository, today: TODAY })).toMatch(/^Kein Eintrag/);
  });

  it("add_task validates, stores and tells the UI", () => {
    const repository = repoWith([]);
    const heard = vi.fn();
    globalThis.addEventListener(KNOWLEDGE_CHANGED, heard);
    expect(runSchoolTool("add_task", { title: "x", due: "12.10." }, { repository })).toMatch(/^Fehler: due/);
    expect(runSchoolTool("add_task", { title: "x", due: "2026-02-31" }, { repository })).toMatch(/^Fehler: due/);
    expect(runSchoolTool("add_task", { title: "x", due: "2026-10-12", time: "8 Uhr" }, { repository })).toMatch(/^Fehler: time/);
    expect(heard).not.toHaveBeenCalled();
    const result = runSchoolTool(
      "add_task",
      { kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-20", time: "08:00" },
      { repository },
    );
    globalThis.removeEventListener(KNOWLEDGE_CHANGED, heard);
    expect(result).toMatch(/^Eingetragen: Klausur Di 20\.10\. "Analysis" \(id .{6}\)$/);
    expect(repository.read().events[0]).toMatchObject({ kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-20", time: "08:00", done: false });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("set_task_done resolves the short id and refuses an ambiguous one", () => {
    const repository = repoWith([...events, event("zwei01"), { ...event("zwei01"), id: "1111-zwei01" }]);
    expect(runSchoolTool("set_task_done", { id: "mathe1" }, { repository })).toBe("Erledigt: S. 42 Nr. 3");
    expect(repository.read().events[0].done).toBe(true);
    expect(runSchoolTool("set_task_done", { id: "mathe1", done: false }, { repository })).toBe("Wieder offen: S. 42 Nr. 3");
    expect(runSchoolTool("set_task_done", { id: "zwei01" }, { repository })).toMatch(/mehrdeutig/);
    expect(runSchoolTool("set_task_done", { id: "gibtsnicht" }, { repository })).toMatch(/^Fehler: Eintrag/);
  });

  it("is sent on the start page only", () => {
    const names = (tools) => tools.map((tool) => tool.function.name);
    expect(names(AGENT_LIBRARY_TOOLS)).toEqual(expect.arrayContaining(["list_tasks", "add_task", "set_task_done", "remember"]));
    expect(names(AGENT_CORE_TOOLS)).toContain("remember");
    expect(names(AGENT_CORE_TOOLS)).not.toContain("list_tasks");
  });
});

describe("system prompt with school and memory", () => {
  const base = { canEdit: true, canRead: true, library: true, libraryOverview: "KARTEN" };

  it("orders rule, cards, memory, school block and volatile context for the cache", () => {
    const prompt = buildSystemPrompt({ ...base, memory: "GEDAECHTNIS", schoolContext: "SCHULBLOCK" });
    const order = ['"Schule" unten zeigt', "KARTEN", "GEDAECHTNIS", "SCHULBLOCK", "Aktueller Kontext:"].map((needle) =>
      prompt.indexOf(needle),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("carries no school rule or block where none is passed (the editor chat)", () => {
    const prompt = buildSystemPrompt({ ...base, library: false });
    expect(prompt).not.toContain("list_tasks");
    expect(prompt).not.toContain("Über den Nutzer");
  });
});
