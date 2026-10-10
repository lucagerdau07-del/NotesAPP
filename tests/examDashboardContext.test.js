import { describe, expect, it } from "vitest";
import { buildSchoolContext, runSchoolTool, SCHOOL_MAX_CHARS } from "../src/agent/schoolContext.js";
import { buildSystemPrompt } from "../src/agent/systemPrompt.js";
import { buildExamPrep } from "../src/knowledge/examPrep.js";
import { estimateExamNeeds } from "../src/knowledge/examNeed.js";
import { normalizeStudy, rateCard, setLevel } from "../src/knowledge/examStudy.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const TODAY = "2026-10-10";
const NOW = Date.parse("2026-10-10T10:00:00");

const study = (() => {
  let value = normalizeStudy(
    {
      topics: ["Kettenregel", "Produktregel"],
      cards: [{ topic: "Kettenregel", front: "Äußere?", back: "f'(g)" }],
    },
    null,
    "add",
    NOW,
  );
  value = setLevel(value, "t1", 1, NOW);
  value = setLevel(value, "t2", 3, NOW);
  return value;
})();

const exam = (patch = {}) => ({
  id: "0000-klausur",
  kind: "exam",
  title: "Klausur 2",
  subject: "Mathe",
  due: "2026-10-14",
  ...patch,
});

describe("Lernstand im Schul-Block", () => {
  it("adds one line per upcoming exam with a dashboard, after the plan line", () => {
    const text = buildSchoolContext({
      today: TODAY,
      events: [exam({ study }), exam({ id: "0000-andere", subject: "Bio", due: "2026-10-20" })],
      plan: { days: [{ date: TODAY, blocks: [{ subject: "Mathe", minutes: 30, task: "Üben" }] }] },
    });
    const lines = text.split("\n");
    const planAt = lines.findIndex((line) => line.startsWith("Lernplan heute"));
    const studyAt = lines.findIndex((line) => line.startsWith("Lernstand"));
    expect(lines[studyAt]).toBe("Lernstand Mathe Mi 14.10.: 67%, schwach: Kettenregel");
    expect(studyAt).toBe(planAt + 1);
    expect(lines.filter((line) => line.startsWith("Lernstand"))).toHaveLength(1);
  });

  it("says so when nothing is rated and ignores exams without dashboard or in the past", () => {
    const fresh = normalizeStudy({ topics: ["A"] }, null, "add", NOW);
    const text = buildSchoolContext({
      today: TODAY,
      events: [exam({ study: fresh }), exam({ id: "0000-alt", due: "2026-10-01", study })],
    });
    expect(text).toContain("Lernstand Mathe Mi 14.10.: noch nicht begonnen");
    expect(text.match(/Lernstand/g)).toHaveLength(1);
  });

  it("drops the study line before the open tasks when the budget is tight", () => {
    const events = [exam({ study }), ...Array.from({ length: 6 }, (_, i) => ({ id: `0000-hw${i}`, kind: "homework", title: `Aufgabe ${i}`, subject: "Mathe", due: "2026-10-12" }))];
    const text = buildSchoolContext({ today: TODAY, events }, { maxChars: 400 });
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toContain("Aufgabe 0");
    expect(buildSchoolContext({ today: TODAY, events }).length).toBeLessThanOrEqual(SCHOOL_MAX_CHARS);
  });

  it("list_tasks shows the dashboard detail for a narrow selection", () => {
    const rated = rateCard(study, "c1", true, NOW);
    const repository = createKnowledgeRepository({ getItem: () => JSON.stringify({ version: 1, events: [exam({ study: rated })] }), setItem() {} });
    const text = runSchoolTool("list_tasks", { query: "Klausur" }, { repository, today: TODAY });
    expect(text).toContain("Dashboard: 52%, schwach: Kettenregel");
    expect(text).toContain("Themen: Kettenregel 1/3, Produktregel 3/3");
    expect(text).toContain("Karten: 0/1 sicher");
  });
});

describe("Lernstand für die Planer", () => {
  it("is part of the exam prep and need requests", async () => {
    const seen = [];
    const complete = async ({ messages }) => {
      seen.push(messages[1].content);
      return { content: '{"days":{"2026-10-11":[{"task":"Üben","minutes":30}]},"exams":{}}' };
    };
    await buildExamPrep({
      event: exam({ study }),
      events: [exam({ study })],
      today: TODAY,
      complete,
    }).catch(() => {});
    await estimateExamNeeds({ exams: [exam({ study })], today: TODAY, complete });
    expect(seen).toHaveLength(2);
    for (const request of seen) expect(request).toContain("Lernstand: 67 % bereit, schwach: Kettenregel");
  });
});

describe("Systemprompt", () => {
  it("names the dashboard tool only together with the school block", () => {
    const base = { canEdit: true, canRead: true, library: true };
    expect(buildSystemPrompt({ ...base, schoolContext: "SCHULBLOCK" })).toContain("build_exam_dashboard");
    expect(buildSystemPrompt(base)).not.toContain("build_exam_dashboard");
    const prompt = buildSystemPrompt({ ...base, schoolContext: "SCHULBLOCK" });
    expect(prompt.indexOf("build_exam_dashboard")).toBeLessThan(prompt.indexOf("Aktueller Kontext:"));
  });
});

describe("Repository", () => {
  it("keeps study over an IServ merge and updateStudy changes it in place", () => {
    const data = {};
    const storage = { getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
    const repository = createKnowledgeRepository(storage, { now: () => NOW });
    const first = repository.mergeFindings({
      events: [{ kind: "exam", title: "Klausur", subject: "Mathe", due: "2026-10-14", iservId: "iserv-1", url: "u", description: "", attachments: [] }],
    });
    expect(first.addedEvents).toBe(1);
    const { id } = repository.read().events[0];
    repository.setExamStudy(id, study);
    repository.mergeFindings({
      events: [{ kind: "exam", title: "Klausur neu", subject: "Mathe", due: "2026-10-14", iservId: "iserv-1", url: "u", description: "x", attachments: [] }],
    });
    expect(repository.read().events[0]).toMatchObject({ title: "Klausur neu", study });

    repository.updateStudy(id, (current) => setLevel(current, "t1", 3, NOW));
    expect(repository.read().events[0].study.topics[0].level).toBe(3);
    repository.updateStudy(id, () => null);
    expect(repository.read().events[0].study.topics[0].level).toBe(3);
    repository.updateStudy("fehlt", () => study);
    expect(repository.read().events).toHaveLength(1);
  });
});
