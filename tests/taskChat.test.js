import { describe, expect, it, vi } from "vitest";
import { CONTEXT_MAX_CHARS } from "../src/agent/examAgent.js";
import { START_PROMPT, buildTaskContext, generateStartMessage, taskForEntry } from "../src/agent/taskChat.js";
import { buildSystemPrompt } from "../src/agent/systemPrompt.js";
import { AGENT_TASK_TOOLS, describeToolCall, executeTool } from "../src/agent/tools.js";

const homework = (patch = {}) => ({
  id: "event-hw-0001",
  kind: "homework",
  title: "Referat Architektur",
  subject: "Kunst",
  due: "2026-10-14",
  description: "Präsentation zu einem Bauwerk",
  attachments: [{ filename: "Aufgabe.pdf", path: "/iserv/fs/1" }, { filename: "Kaputt.docx" }],
  ...patch,
});

describe("taskForEntry", () => {
  it("gives homework and exams their own chat keyed by the event", () => {
    const event = homework();
    expect(taskForEntry({ event, type: "homework" }, [event])).toMatchObject({
      key: event.id,
      event,
      others: [],
      done: false,
    });
    expect(taskForEntry({ event: { ...event, kind: "exam" } }, [])).not.toBeNull();
  });

  it("gives appointments, lessons and notes no chat", () => {
    expect(taskForEntry({ event: homework({ kind: "appointment" }) }, [])).toBeNull();
    expect(taskForEntry({ type: "lesson", lesson: {} }, [])).toBeNull();
    expect(taskForEntry({ type: "note", note: {} }, [])).toBeNull();
    expect(taskForEntry(null, [])).toBeNull();
  });

  it("lets a study block share the chat of its first open task", () => {
    const done = homework({ id: "a-done", done: true });
    const open = homework({ id: "b-open" });
    const more = homework({ id: "c-open", title: "Zweite" });
    const task = taskForEntry({ type: "study", id: "study:1", eventIds: ["a-done", "b-open", "c-open"] }, [
      done,
      open,
      more,
    ]);
    expect(task.key).toBe("b-open");
    expect(task.others.map((event) => event.id)).toEqual(["c-open"]);
    expect(task.done).toBe(false);
  });

  it("marks a block whose tasks are all done as done", () => {
    const done = homework({ done: true });
    expect(taskForEntry({ type: "study", id: "study:1", eventIds: [done.id] }, [done]).done).toBe(true);
  });

  it("gives a block without a task its own chat from title, subject and date", () => {
    const task = taskForEntry(
      { type: "study", id: "study:2026-10-10:0", title: "Lernzeit PGW", subject: "PGW", date: "2026-10-10", eventIds: [] },
      [],
    );
    expect(task.key).toBe("study:2026-10-10:0");
    expect(task.event).toMatchObject({ kind: "study", title: "Lernzeit PGW", subject: "PGW", due: "2026-10-10" });
  });
});

describe("buildTaskContext", () => {
  const deps = {
    repository: { read: () => ({ terms: [] }) },
    memory: () => [],
    folders: () => [{ id: "kunst", name: "Kunst" }],
  };

  it("names the task, numbers the attachments and marks missing ones", () => {
    const text = buildTaskContext({ event: homework(), others: [] }, deps);
    expect(text).toContain("Hausaufgabe: Kunst · Referat Architektur, 2026-10-14.");
    expect(text).toContain("0: Aufgabe.pdf");
    expect(text).toContain("1: Kaputt.docx (nicht verfügbar)");
    expect(text).toContain("Ordner: Kunst (folderId kunst)");
    expect(text).not.toContain("Thema:");
  });

  it("names other tasks the same study block covers", () => {
    const others = [homework({ id: "x", title: "Vokabeln", due: "2026-10-15" })];
    expect(buildTaskContext({ event: homework(), others }, deps)).toContain("Vokabeln (2026-10-15)");
  });

  it("stays within the cap", () => {
    const long = "x".repeat(900);
    const text = buildTaskContext(
      { event: homework({ description: long }), others: [] },
      { ...deps, memory: () => [{ id: 1, text: `Kunst: ${long}` }] },
    );
    expect(text.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    expect(text).toContain("Hausaufgabe: Kunst");
  });
});

describe("generateStartMessage", () => {
  it("asks once without tools, with the task as context", async () => {
    const complete = vi.fn(async () => ({ message: { content: " Ich kann dir helfen. " } }));
    const text = await generateStartMessage({ context: "Hausaufgabe: X", model: "m", complete });
    expect(text).toBe("Ich kann dir helfen.");
    const call = complete.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
    expect(call.messages).toEqual([
      { role: "system", content: START_PROMPT },
      { role: "user", content: "Hausaufgabe: X" },
    ]);
  });

  it("throws on an empty answer", async () => {
    await expect(
      generateStartMessage({ context: "x", complete: async () => ({ message: { content: " " } }) }),
    ).rejects.toThrow();
  });

  it("offers only, never does", () => {
    expect(START_PROMPT).toContain("Biete nur an");
  });
});

describe("task mode prompt and tools", () => {
  it("replaces the note rules with the task rules and carries the task block", () => {
    const prompt = buildSystemPrompt({ canEdit: false, taskContext: "Hausaufgabe: Kunst" });
    expect(prompt).toContain("genau einer Aufgabe");
    expect(prompt).toContain("read_attachment");
    expect(prompt).toContain("Aufgabe:\nHausaufgabe: Kunst");
    expect(prompt).not.toContain("Es ist keine Notiz geöffnet");
  });

  it("sends only read tools plus attachment and image search", () => {
    const names = AGENT_TASK_TOOLS.map((tool) => tool.function.name);
    expect(names).toEqual(
      expect.arrayContaining(["read_attachment", "search_images", "search_sources", "read_source", "create_file"]),
    );
    expect(names).not.toContain("write_text");
    expect(names).not.toContain("create_note");
    expect(names).not.toContain("add_task");
  });

  it("routes read_attachment through the api and refuses it elsewhere", async () => {
    const readAttachment = vi.fn(async () => "Text");
    await expect(executeTool("read_attachment", { index: 0 }, { readAttachment })).resolves.toBe("Text");
    expect(readAttachment).toHaveBeenCalledWith({ index: 0 });
    await expect(executeTool("read_attachment", { index: 0 }, {})).resolves.toMatch(/^Fehler/);
  });

  it("describes both new calls for the step list", () => {
    expect(describeToolCall("read_attachment", { index: 0 })).toBe("Anhang 1 lesen");
    expect(describeToolCall("search_images", { query: "Bauhaus" })).toBe("Bilder suchen: Bauhaus");
  });

  it("keeps the extra tool schemas small", () => {
    const extra = AGENT_TASK_TOOLS.filter((tool) => ["read_attachment", "search_images"].includes(tool.function.name));
    expect(JSON.stringify(extra).length).toBeLessThan(900);
  });
});
