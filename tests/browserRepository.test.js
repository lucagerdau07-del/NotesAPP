import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserRepository } from "../src/browser/browserRepository.js";

const DAY = 24 * 60 * 60 * 1000;
let values;
let storage;

beforeEach(() => {
  values = new Map();
  storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
});

describe("browser repository", () => {
  it("creates, edits, reorders, and deletes shortcuts", () => {
    const repo = createBrowserRepository(storage, { now: () => 1000 });
    const a = repo.saveShortcut({
      title: "Google",
      url: "https://google.com",
    });
    const b = repo.saveShortcut({
      title: "Wikipedia",
      url: "https://wikipedia.org",
    });

    repo.saveShortcut({ id: a.id, title: "Google Suche", url: a.url });
    repo.reorderShortcuts([b.id, a.id]);
    expect(repo.listShortcuts().map((item) => item.title)).toEqual([
      "Wikipedia",
      "Google Suche",
    ]);

    repo.removeShortcut(b.id);
    expect(repo.listShortcuts()).toHaveLength(1);
  });

  it("keeps the exact boundary and prunes anything older than 30 days", () => {
    const now = 40 * DAY;
    const repo = createBrowserRepository(storage, { now: () => now });
    repo.recordVisit({
      title: "boundary",
      url: "https://boundary.test",
      visitedAt: 10 * DAY,
    });
    repo.recordVisit({
      title: "old",
      url: "https://old.test",
      visitedAt: 10 * DAY - 1,
    });

    expect(repo.listHistory().map((item) => item.title)).toEqual([
      "boundary",
    ]);
  });

  it("merges only an immediately repeated destination", () => {
    let now = 1000;
    const repo = createBrowserRepository(storage, { now: () => now });
    repo.recordVisit({ title: "One", url: "https://one.test" });
    now += 1;
    repo.recordVisit({ title: "One newer", url: "https://one.test" });
    expect(repo.listHistory()).toHaveLength(1);
    expect(repo.listHistory()[0].title).toBe("One newer");

    now += 1;
    repo.recordVisit({ title: "Two", url: "https://two.test" });
    now += 1;
    repo.recordVisit({ title: "One again", url: "https://one.test" });
    expect(repo.listHistory()).toHaveLength(3);
  });

  it("filters and clears history without touching shortcuts", () => {
    const repo = createBrowserRepository(storage, { now: () => 40 * DAY });
    repo.saveShortcut({ title: "Docs", url: "https://docs.example" });
    repo.recordVisit({
      title: "Biologie",
      url: "https://school.example/bio",
    });

    expect(repo.listHistory("BIO")).toHaveLength(1);
    repo.clearHistory();
    expect(repo.listHistory()).toEqual([]);
    expect(repo.listShortcuts()).toHaveLength(1);
  });

  it("recovers from malformed storage and rejects unsafe URLs", () => {
    values.set("notes.browser.v1", "not-json");
    const repo = createBrowserRepository(storage, { now: () => 1000 });
    expect(repo.listShortcuts()).toEqual([]);
    expect(() =>
      repo.saveShortcut({ title: "Unsafe", url: "javascript:alert(1)" }),
    ).toThrow(/HTTP/);
  });
});
