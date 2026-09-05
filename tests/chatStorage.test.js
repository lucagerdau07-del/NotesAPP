import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadChat, saveChat } from "../src/hooks/useAgent.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe("chat storage 30-day expiry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps a fresh chat", () => {
    saveChat("doc1", [{ role: "user", content: "hi" }]);
    expect(loadChat("doc1")).toEqual([{ role: "user", content: "hi" }]);
  });

  it("drops a chat older than 30 days", () => {
    localStorage.setItem(
      "notes.chat.doc2",
      JSON.stringify({ savedAt: Date.now() - THIRTY_DAYS_MS - 1000, messages: [{ role: "user", content: "old" }] }),
    );
    expect(loadChat("doc2")).toEqual([]);
    expect(localStorage.getItem("notes.chat.doc2")).toBeNull();
  });

  it("keeps a legacy plain-array chat (no timestamp yet)", () => {
    localStorage.setItem("notes.chat.doc3", JSON.stringify([{ role: "user", content: "legacy" }]));
    expect(loadChat("doc3")).toEqual([{ role: "user", content: "legacy" }]);
  });
});
