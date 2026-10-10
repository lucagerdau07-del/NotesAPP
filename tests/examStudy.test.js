import { describe, expect, it } from "vitest";
import {
  LIMITS,
  answerQuestion,
  cycleLevel,
  dueCards,
  normalizeStudy,
  rateCard,
  readiness,
  setLevel,
  studyHint,
  studyStatus,
  weakTopics,
} from "../src/knowledge/examStudy.js";

const NOW = Date.parse("2026-10-10T10:00:00");
const DAY = 86400000;

const input = {
  topics: ["Kettenregel", { title: "Produktregel" }],
  cards: [
    { topic: "Kettenregel", front: "Äußere Ableitung?", back: "f'(g(x))" },
    { topic: "kettenregel", front: "Innere Ableitung?", back: "g'(x)" },
    { topic: "Unbekannt", front: "Ohne Thema", back: "ok" },
    { front: "Leer", back: "" },
  ],
  quiz: [
    { topic: "Produktregel", q: "Ableitung von x*sin x?", opts: ["a", "b", "c"], right: 1, why: "Produktregel" },
    { q: "Kaputt", opts: ["a", "b"], right: 5 },
    { q: "Eine Option", opts: ["a"], right: 0 },
  ],
  sheet: [{ title: "Kettenregel", text: "f'(g)·g'" }],
};

describe("normalizeStudy", () => {
  it("assigns ids, maps topics by folded title and drops invalid entries", () => {
    const study = normalizeStudy(input, null, "add", NOW);
    expect(study.topics.map((t) => [t.id, t.title, t.level])).toEqual([
      ["t1", "Kettenregel", null],
      ["t2", "Produktregel", null],
    ]);
    expect(study.cards.map((c) => [c.id, c.topic])).toEqual([
      ["c1", "t1"],
      ["c2", "t1"],
      ["c3", null],
    ]);
    expect(study.quiz).toHaveLength(1);
    expect(study.quiz[0]).toMatchObject({ id: "q1", topic: "t2", right: 1, tries: 0, hits: 0 });
    expect(study.sheet).toHaveLength(1);
  });

  it("clips long text and caps the entries per call", () => {
    const study = normalizeStudy(
      {
        topics: Array.from({ length: 30 }, (_, i) => `Thema ${i}`),
        cards: Array.from({ length: 80 }, (_, i) => ({ front: `F${i}`, back: "x".repeat(900) })),
      },
      null,
      "add",
      NOW,
    );
    expect(study.topics).toHaveLength(LIMITS.call.topics);
    expect(study.cards).toHaveLength(LIMITS.call.cards);
    expect(study.cards[0].back).toHaveLength(LIMITS.chars.back);
  });

  it("add skips duplicates and keeps progress, total cap holds", () => {
    let study = normalizeStudy(input, null, "add", NOW);
    study = rateCard(study, "c1", true, NOW);
    const again = normalizeStudy(
      { cards: [{ front: "äußere ableitung?", back: "neu" }, { front: "Neu", back: "ja" }] },
      study,
      "add",
      NOW,
    );
    expect(again.cards.map((c) => c.front)).toEqual(["Äußere Ableitung?", "Innere Ableitung?", "Ohne Thema", "Neu"]);
    expect(again.cards[0].box).toBe(1);
    expect(again.cards[3].id).toBe("c4");

    let full = again;
    for (let i = 0; i < 4; i += 1) {
      full = normalizeStudy(
        { cards: Array.from({ length: 30 }, (_, j) => ({ front: `K${i}-${j}`, back: "b" })) },
        full,
        "add",
        NOW,
      );
    }
    expect(full.cards).toHaveLength(LIMITS.total.cards);
  });

  it("replace swaps the content but keeps progress of matching entries", () => {
    let study = normalizeStudy(input, null, "add", NOW);
    study = setLevel(study, "t1", 2, NOW);
    study = rateCard(study, "c1", true, NOW);
    study = answerQuestion(study, "q1", 1, NOW).study;
    const next = normalizeStudy(
      {
        topics: ["Kettenregel", "Quotientenregel"],
        cards: [{ front: "Äußere Ableitung?", back: "überarbeitet" }, { front: "Brandneu", back: "x" }],
        quiz: [{ q: "Ableitung von x*sin x?", opts: ["a", "b"], right: 0 }],
      },
      study,
      "replace",
      NOW,
    );
    expect(next.topics.map((t) => [t.title, t.level])).toEqual([["Kettenregel", 2], ["Quotientenregel", null]]);
    expect(next.cards.map((c) => [c.front, c.box])).toEqual([["Äußere Ableitung?", 1], ["Brandneu", 0]]);
    expect(next.cards[0].back).toBe("überarbeitet");
    expect(next.quiz[0]).toMatchObject({ tries: 1, hits: 1 });
    expect(next.sheet).toEqual([]);
  });
});

describe("progress", () => {
  const base = () => normalizeStudy(input, null, "add", NOW);

  it("is null without any rating", () => {
    expect(readiness(base())).toBeNull();
    expect(studyStatus(base())).toBe("noch nicht begonnen");
    expect(studyHint(base())).toBe("");
  });

  it("weights topics 40, cards 30, quiz 30 and renormalizes missing parts", () => {
    let study = setLevel(base(), "t1", 3, NOW);
    expect(readiness(study)).toBe(100);
    study = rateCard(study, "c1", false, NOW); // seen, box 0
    expect(readiness(study)).toBe(Math.round((0.4 * 1 + 0.3 * 0) / 0.7 * 100));
    study = answerQuestion(study, "q1", 1, NOW).study; // 1/1
    expect(readiness(study)).toBe(Math.round((0.4 + 0 + 0.3) * 100));
  });

  it("lists weak topics worst first", () => {
    let study = base();
    study = setLevel(study, "t1", 1, NOW);
    study = setLevel(study, "t2", 0, NOW);
    expect(weakTopics(study)).toEqual(["Produktregel", "Kettenregel"]);
    study = setLevel(study, "t1", 3, NOW);
    study = answerQuestion(study, "q1", 0, NOW).study; // wrong -> t2 quote 0
    expect(weakTopics(study, 1)).toEqual(["Produktregel"]);
    expect(studyStatus(study)).toMatch(/^\d+%, schwach: Produktregel$/);
  });

  it("answerQuestion counts tries and hits, unknown id changes nothing", () => {
    const study = base();
    const right = answerQuestion(study, "q1", 1, NOW);
    expect(right.correct).toBe(true);
    expect(right.study.quiz[0]).toMatchObject({ tries: 1, hits: 1 });
    expect(answerQuestion(study, "nope", 0, NOW)).toEqual({ study, correct: null });
  });

  it("cycles levels through unrated", () => {
    expect([null, 0, 1, 2, 3].map(cycleLevel)).toEqual([0, 1, 2, 3, null]);
  });

  it("dueCards: unseen and box 0 now, higher boxes after 1, 3, 7 days", () => {
    let study = base();
    const day = (offset) => new Date(NOW + offset * DAY).toISOString().slice(0, 10).replace(/./, (c) => c);
    const today = "2026-10-10";
    expect(dueCards(study, today)).toHaveLength(3);
    study = rateCard(study, "c1", true, NOW); // box 1
    expect(dueCards(study, today).map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(dueCards(study, "2026-10-11").map((c) => c.id)).toContain("c1");
    study = rateCard(study, "c1", true, NOW); // box 2
    expect(dueCards(study, "2026-10-12").map((c) => c.id)).not.toContain("c1");
    expect(dueCards(study, "2026-10-13").map((c) => c.id)).toContain("c1");
  });
});
