import { describe, expect, it, vi } from "vitest";
import {
  CONTEXT_MAX_CHARS,
  MAX_STEPS,
  RESULT_CHARS,
  SUBAGENT_TOOLS,
  SYSTEM_PROMPT,
  buildContext,
  buildExamDashboard,
  runExamAgent,
} from "../src/agent/examAgent.js";
import { AGENT_LIBRARY_TOOLS, executeTool, runExamDashboard } from "../src/agent/tools.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const NOW = Date.parse("2026-10-10T10:00:00");
const TOOLS = [
  { type: "function", function: { name: "search_sources" } },
  { type: "function", function: { name: "read_source" } },
];

const exam = (patch = {}) => ({
  id: "event-aaaa-1234",
  kind: "exam",
  title: "Klausur 2",
  subject: "Mathe",
  due: "2026-10-14",
  time: "08:00",
  topic: "Kettenregel und Produktregel",
  ...patch,
});

function repoWith(events) {
  const data = {
    "notes.knowledge.v1": JSON.stringify({
      version: 1,
      events,
      terms: [{ subject: "Mathe", term: "Ableitung", definition: "..." }],
    }),
  };
  const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
  return createKnowledgeRepository(storage, { now: () => NOW });
}

const answer = (object) => ({ message: { role: "assistant", content: JSON.stringify(object) } });
const toolCall = (name, args, id = "c1") => ({
  message: {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  },
});
const CONTENT = {
  topics: ["Kettenregel"],
  cards: [{ topic: "Kettenregel", front: "Äußere?", back: "f'(g)" }],
  quiz: [{ topic: "Kettenregel", q: "Wer ist innen?", opts: ["g", "f"], right: 0, why: "innen" }],
  sheet: [],
};

describe("buildContext", () => {
  const long = "x".repeat(900);

  it("names exam, folder, terms, subject memory and wish, but nothing else", () => {
    const text = buildContext({
      event: exam({ description: "Aufgabenstellung" }),
      terms: [
        { subject: "Mathe", term: "Ableitung" },
        { subject: "Englisch", term: "Verb" },
      ],
      memory: [
        { id: 1, text: "Mathe: Kettenregel unsicher" },
        { id: 2, text: "Englisch: Vokabeln schwach" },
      ],
      folders: [
        { id: "mathe", name: "Mathe" },
        { id: "bio", name: "Bio" },
      ],
      wish: "mehr Karten",
    });
    expect(text).toContain("Klausur: Mathe · Klausur 2, 2026-10-14 08:00.");
    expect(text).toContain("Thema: Kettenregel und Produktregel");
    expect(text).toContain("Ordner: Mathe (folderId mathe)");
    expect(text).toContain("Begriffe: Ableitung");
    expect(text).not.toContain("Verb");
    expect(text).toContain("Mathe: Kettenregel unsicher");
    expect(text).not.toContain("Vokabeln");
    expect(text).toContain("Wunsch: mehr Karten");
  });

  it("stays within the cap and drops from the back first", () => {
    const text = buildContext({
      event: exam({ description: long }),
      terms: Array.from({ length: 20 }, (_, i) => ({ subject: "Mathe", term: `Begriff${i}${long}` })),
      memory: [{ id: 1, text: `Mathe: ${long}` }],
      folders: [{ id: "mathe", name: "Mathe" }],
      wish: long,
    });
    expect(text.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    expect(text).toContain("Klausur: Mathe");
    expect(text).not.toContain("Wunsch:");
  });

  it("is a fraction of the main agent: prompt + three tools + context", () => {
    const tools = AGENT_LIBRARY_TOOLS.filter((tool) => SUBAGENT_TOOLS.includes(tool.function.name));
    expect(tools).toHaveLength(3);
    expect(SYSTEM_PROMPT.length).toBeLessThan(1700);
    expect(SYSTEM_PROMPT.length + JSON.stringify(tools).length + CONTEXT_MAX_CHARS).toBeLessThan(6000);
  });
});

describe("runExamAgent", () => {
  const base = { event: exam(), terms: [], memory: [], folders: [], tools: TOOLS };

  it("runs tools, then returns the JSON answer", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall("search_sources", { query: "Kettenregel" }))
      .mockResolvedValueOnce(answer(CONTENT));
    const execute = vi.fn().mockResolvedValue("x".repeat(RESULT_CHARS + 500));
    const content = await runExamAgent({ ...base, complete, execute });
    expect(content.cards).toHaveLength(1);
    expect(execute).toHaveBeenCalledWith("search_sources", { query: "Kettenregel" });
    const second = complete.mock.calls[1][0].messages;
    expect(second.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(second.at(-1).content).toHaveLength(RESULT_CHARS);
    expect(second[0].content).toBe(SYSTEM_PROMPT);
  });

  it("refuses tools outside the three without executing", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(toolCall("create_note", {}))
      .mockResolvedValueOnce(answer(CONTENT));
    const execute = vi.fn();
    await runExamAgent({ ...base, complete, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(complete.mock.calls[1][0].messages.at(-1).content).toMatch(/nicht verfügbar/);
  });

  it("repairs a non-JSON reply once, then throws", async () => {
    const text = { message: { role: "assistant", content: "Hier ist dein Dashboard!" } };
    const repaired = vi.fn().mockResolvedValueOnce(text).mockResolvedValueOnce(answer(CONTENT));
    await expect(runExamAgent({ ...base, complete: repaired, execute: vi.fn() })).resolves.toBeTruthy();
    expect(repaired).toHaveBeenCalledTimes(2);

    const hopeless = vi.fn().mockResolvedValue(text);
    await expect(runExamAgent({ ...base, complete: hopeless, execute: vi.fn() })).rejects.toThrow(/kein Dashboard/);
    expect(hopeless).toHaveBeenCalledTimes(2);
  });

  it("stops at maxSteps and withholds tools on the last step", async () => {
    const complete = vi.fn().mockResolvedValue(toolCall("search_sources", { query: "x" }));
    await expect(runExamAgent({ ...base, complete, execute: vi.fn().mockResolvedValue("ok") })).rejects.toThrow();
    expect(complete).toHaveBeenCalledTimes(MAX_STEPS);
    expect(complete.mock.calls.at(-1)[0].tools).toBeUndefined();
    expect(complete.mock.calls[0][0].tools).toBe(TOOLS);
  });
});

describe("buildExamDashboard", () => {
  const options = (repository, complete, extra = {}) => ({
    repository,
    complete,
    execute: vi.fn(),
    tools: TOOLS,
    folders: () => [],
    memory: () => [],
    now: NOW,
    ...extra,
  });

  it("stores the normalized dashboard on the exam and returns one line", async () => {
    const repository = repoWith([exam()]);
    const result = await buildExamDashboard({
      id: "1234",
      ...options(repository, vi.fn().mockResolvedValue(answer(CONTENT))),
    });
    expect(result.line).toBe("Dashboard Mathe Mi 14.10.: 1 Themen, 1 Karten, 1 Fragen");
    const stored = repository.read().events[0].study;
    expect(stored.cards[0]).toMatchObject({ id: "c1", front: "Äußere?", box: 0 });
    expect(stored.at).toBe(NOW);
  });

  it("errors cleanly for unknown, ambiguous and non-exam ids", async () => {
    const repository = repoWith([
      exam(),
      exam({ id: "event-bbbb-1234" }),
      exam({ id: "event-cccc-9999", kind: "homework" }),
    ]);
    const complete = vi.fn();
    await expect(buildExamDashboard({ id: "xx", ...options(repository, complete) })).rejects.toThrow(/id fehlt/);
    await expect(buildExamDashboard({ id: "0000", ...options(repository, complete) })).rejects.toThrow(/gibt es nicht/);
    await expect(buildExamDashboard({ id: "1234", ...options(repository, complete) })).rejects.toThrow(/mehrdeutig/);
    await expect(buildExamDashboard({ id: "9999", ...options(repository, complete) })).rejects.toThrow(/keine Klausur/);
    expect(complete).not.toHaveBeenCalled();
  });

  it("leaves an existing dashboard untouched when the call fails", async () => {
    const study = {
      v: 1,
      at: 1,
      topics: [],
      cards: [{ id: "c1", front: "A", back: "B", box: 2, seenAt: 5 }],
      quiz: [],
      sheet: [],
    };
    const repository = repoWith([exam({ study })]);
    const failing = vi.fn().mockRejectedValue(new Error("Server nicht erreichbar."));
    await expect(buildExamDashboard({ id: "1234", ...options(repository, failing) })).rejects.toThrow(/Server/);
    expect(repository.read().events[0].study).toEqual(study);
  });
});

describe("wiring", () => {
  it("is a library tool with a short schema and runs through executeTool", async () => {
    const tool = AGENT_LIBRARY_TOOLS.find((entry) => entry.function.name === "build_exam_dashboard");
    expect(tool).toBeTruthy();
    expect(JSON.stringify(tool).length).toBeLessThan(700);
    const result = await executeTool("build_exam_dashboard", { id: "nope-nope" });
    expect(result).toMatch(/^Fehler:/);
    expect(typeof runExamDashboard).toBe("function");
  });
});
