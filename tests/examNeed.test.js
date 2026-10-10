import { describe, expect, it, vi } from "vitest";
import { estimateExamNeeds, needsEstimate } from "../src/knowledge/examNeed.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const TODAY = "2026-10-12";
const exam = { id: "e1", kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-20", done: false };
const reply = (exams) => ({ message: { content: JSON.stringify({ exams }) } });

describe("examNeed", () => {
  it("schätzt jede Klausur einzeln mit Zeit und Inhalt und begrenzt die Werte", async () => {
    const other = { ...exam, id: "e2", title: "Vorleser", subject: "Deutsch", topic: "Kapitel 1-5" };
    const complete = vi.fn(async () =>
      reply({
        E1: { minutes: 240, content: ["Kettenregel", " Produktregel ", ""] },
        E2: { minutes: 5000, content: Array.from({ length: 12 }, (_, i) => `Punkt ${i}`) },
      }),
    );
    const result = await estimateExamNeeds({
      exams: [exam, other],
      terms: [{ subject: "Mathe", term: "Ableitung", definition: "x" }],
      memory: "Über den Schüler: Mathe schwach",
      materials: { e1: "- Heft S. 4: Kettenregel" },
      today: TODAY,
      complete,
      now: 9,
    });

    expect(result[0]).toEqual({
      id: "e1",
      need: { minutes: 240, content: ["Kettenregel", "Produktregel"], topic: "", due: "2026-10-20", at: 9 },
    });
    expect(result[1].need).toMatchObject({ minutes: 900, topic: "Kapitel 1-5" });
    expect(result[1].need.content).toHaveLength(8);
    const user = complete.mock.calls[0][0].messages[1].content;
    expect(user).toContain("E1 · Mathe · Analysis · 2026-10-20");
    expect(user).toContain("Begriffe: Ableitung");
    expect(user).toContain("Aus Notizen:");
    expect(user).toContain("- Heft S. 4: Kettenregel");
    expect(user).toContain("Mathe schwach");
  });

  it("liefert nichts bei unlesbarer Antwort, damit der Standardbedarf gilt", async () => {
    const result = await estimateExamNeeds({ exams: [exam], today: TODAY, complete: async () => ({ message: { content: "?" } }) });
    expect(result).toEqual([]);
  });

  it("braucht eine Schätzung nur für offene Klausuren ohne gültige Schätzung oder Plan", () => {
    const need = { minutes: 100, content: [], topic: "", due: exam.due, at: 1 };
    expect(needsEstimate(exam, TODAY)).toBe(true);
    expect(needsEstimate({ ...exam, need }, TODAY)).toBe(false);
    expect(needsEstimate({ ...exam, need, topic: "neu" }, TODAY)).toBe(true);
    expect(needsEstimate({ ...exam, prep: { due: exam.due, blocks: [] } }, TODAY)).toBe(false);
    expect(needsEstimate({ ...exam, done: true }, TODAY)).toBe(false);
    expect(needsEstimate({ ...exam, due: "2026-10-01" }, TODAY)).toBe(false);
    expect(needsEstimate({ ...exam, kind: "homework" }, TODAY)).toBe(false);
  });

  it("bleibt bei einem IServ-Abgleich erhalten", () => {
    const data = {};
    const repository = createKnowledgeRepository({ getItem: (k) => data[k] ?? null, setItem: (k, v) => (data[k] = v) });
    const found = { kind: "exam", title: "Analysis", subject: "Mathe", due: "2026-10-20", iservId: "i1" };
    repository.mergeFindings({ events: [found] });
    const [event] = repository.read().events;
    repository.setExamNeed(event.id, { minutes: 120, content: ["a"], topic: "", due: found.due, at: 1 });
    repository.mergeFindings({ events: [{ ...found, description: "neu" }] });
    expect(repository.read().events[0].need.minutes).toBe(120);
  });
});
