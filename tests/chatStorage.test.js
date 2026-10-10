import { describe, it, expect, beforeEach } from "vitest";
import { loadSessions, saveSessions } from "../src/hooks/useAgent.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

describe("chat session storage: 30-day expiry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps a fresh session", () => {
    saveSessions("doc1", [{ id: "a", title: "Test", savedAt: Date.now(), messages: [{ role: "user", content: "hi" }] }]);
    expect(loadSessions("doc1")).toEqual([
      { id: "a", title: "Test", savedAt: expect.any(Number), messages: [{ role: "user", content: "hi" }] },
    ]);
  });

  it("drops a session older than 30 days", () => {
    localStorage.setItem(
      "notes.chats.doc2",
      JSON.stringify([{ id: "old", title: "Alt", savedAt: Date.now() - THIRTY_DAYS_MS - 1000, messages: [] }]),
    );
    expect(loadSessions("doc2")).toEqual([]);
  });

  it("keeps fresh sessions and drops only expired ones in the same list", () => {
    localStorage.setItem(
      "notes.chats.doc3",
      JSON.stringify([
        { id: "fresh", title: "Neu", savedAt: Date.now(), messages: [] },
        { id: "old", title: "Alt", savedAt: Date.now() - THIRTY_DAYS_MS - 1000, messages: [] },
      ]),
    );
    const sessions = loadSessions("doc3");
    expect(sessions.map((s) => s.id)).toEqual(["fresh"]);
  });
});
