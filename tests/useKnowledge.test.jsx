import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));
vi.mock("../src/knowledge/documentScan.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanImagesOf: () => [{ id: "p1", src: "data:image/jpeg;base64,AAA" }],
}));

import useKnowledge from "../src/hooks/useKnowledge.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  globalThis.localStorage.clear();
});

const HOUR = 60 * 60 * 1000;

describe("useKnowledge", () => {
  it("liefert offene Termine sortiert und ohne abgehakte", async () => {
    const today = new Date();
    const iso = (offsetDays) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offsetDays);
      return date.toISOString().slice(0, 10);
    };
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        events: [
          { id: "e", kind: "homework", title: "Vergangen", subject: "Mathe", due: iso(-1), done: false },
          { id: "b", kind: "homework", title: "Später", subject: "Mathe", due: iso(5), done: false },
          { id: "a", kind: "homework", title: "Früher", subject: "Mathe", due: iso(1), done: false },
          { id: "c", kind: "homework", title: "Fertig", subject: "Mathe", due: iso(2), done: true },
          { id: "d", kind: "exam", title: "Weit weg", subject: "Mathe", due: iso(40), done: false },
        ],
        terms: [],
        scanState: { lastRunAt: Date.now(), lastError: null, notes: {} },
        plan: null,
        settings: { autoScan: false },
      }),
    );

    const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [] }));
    expect(result.current.openEvents.map((event) => event.id)).toEqual(["a", "b"]);
  });

  it("scannt beim Einhängen nicht, wenn die Automatik aus ist", async () => {
    const { requestCompletion } = await import("../src/agent/agentClient.js");
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: false } }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    renderHook(() => useKnowledge({ notes, subjects: [] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("scannt auf Knopfdruck auch bei ausgeschalteter Automatik", async () => {
    const { requestCompletion } = await import("../src/agent/agentClient.js");
    requestCompletion.mockClear();
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: false } }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    const { result } = renderHook(() => useKnowledge({ notes, subjects: [] }));

    await act(async () => {
      await result.current.scanNow();
    });
    expect(requestCompletion).toHaveBeenCalled();
    await waitFor(() => expect(result.current.isScanning).toBe(false));
  });

  it("hakt einen Termin ab und behält das über einen Neu-Render", async () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        events: [
          { id: "a", kind: "homework", title: "X", subject: "Mathe", due: "2030-01-01", done: false },
        ],
        settings: { autoScan: false },
      }),
    );
    const { result } = renderHook(() => useKnowledge({ notes: [], subjects: [] }));
    act(() => {
      result.current.setEventDone("a", true);
    });
    await waitFor(() => expect(result.current.events[0].done).toBe(true));
  });
});
