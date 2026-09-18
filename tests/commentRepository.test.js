import { describe, expect, it } from "vitest";
import { createCommentRepository } from "../src/knowledge/commentRepository.js";

const make = () => {
  const values = new Map();
  let time = 1000;
  return createCommentRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => (time += 10) },
  );
};

describe("commentRepository", () => {
  it("legt Kommentare je Dokument an, bearbeitet und löscht sie", () => {
    const repo = make();
    const { id } = repo.add("doc", { pageId: "p1", x: 5, y: 6, text: "  Erklären  " });
    repo.add("other", { pageId: "p1", x: 1, y: 1, text: "X" });

    expect(repo.list("doc")).toMatchObject([{ id, pageId: "p1", x: 5, y: 6, text: "Erklären" }]);
    repo.edit("doc", id, "Neu");
    expect(repo.list("doc")[0].text).toBe("Neu");
    repo.remove("doc", id);
    expect(repo.list("doc")).toEqual([]);
    expect(repo.list("other")).toHaveLength(1);
  });

  it("meldet nur neue oder seither bearbeitete Kommentare als offen", () => {
    const repo = make();
    const { id } = repo.add("doc", { pageId: "p1", x: 0, y: 0, text: "A" });
    expect(repo.pending().doc).toHaveLength(1);

    repo.markProcessed("doc", [id], 1015); // nach dem Anlegen (1010)
    expect(repo.pending()).toEqual({});

    repo.edit("doc", id, "B"); // updatedAt liegt nach processedAt
    expect(repo.pending().doc).toHaveLength(1);
  });
});
