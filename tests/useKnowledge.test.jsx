import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));
vi.mock("../src/knowledge/documentScan.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanImagesOf: () => [{ id: "p1", src: "data:image/jpeg;base64,AAA" }],
}));

import useKnowledge from "../src/hooks/useKnowledge.js";
import { requestCompletion } from "../src/agent/agentClient.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  vi.clearAllMocks();
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

  it("scannt beim Einhängen automatisch, wenn ein Lauf fällig ist", async () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: true } }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    const { result } = renderHook(() => useKnowledge({ notes, subjects: [] }));

    await waitFor(() => expect(result.current.scanState.notes["note-1"]).toEqual(expect.any(Number)));
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(result.current.scanState.lastRunAt).toEqual(expect.any(Number));
  });

  it("unterdrückt einen automatischen Scan, wenn der aktuelle Slot bereits lief", async () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scanState: { lastRunAt: Date.now(), lastError: null, notes: {} },
        settings: { autoScan: true },
      }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    renderHook(() => useKnowledge({ notes, subjects: [] }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("erzwingt einen Scan trotz aktuellem Slot und Ruhezeit", async () => {
    const now = Date.now();
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scanState: { lastRunAt: now, lastError: null, notes: {} },
        settings: { autoScan: false },
      }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: now }];
    const { result } = renderHook(() => useKnowledge({ notes, subjects: [] }));

    await act(async () => {
      await result.current.scanNow();
    });

    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(result.current.scanState.notes["note-1"]).toEqual(expect.any(Number));
  });

  it("verhindert doppelte automatische Scans bei Rerendern und Strict Mode", async () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: true } }),
    );
    const notes = [{ id: "note-1", title: "A", subject: "Mathe", updatedAt: Date.now() - 5 * HOUR }];
    const { rerender } = renderHook(() => useKnowledge({ notes, subjects: [] }), {
      wrapper: StrictMode,
    });

    await waitFor(() => expect(requestCompletion).toHaveBeenCalledTimes(1));
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestCompletion).toHaveBeenCalledTimes(1);
  });

  it("speichert den erneuerten Plan und spiegelt ihn im Hook-Zustand", async () => {
    let resolveCompletion;
    requestCompletion.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveCompletion = resolve;
      }),
    );
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        events: [
          { id: "a", kind: "homework", title: "X", subject: "Mathe", due: "2030-01-01", done: false },
        ],
        terms: [{ id: "term-1", term: "Ableitung", definition: "Steigung", subject: "Mathe" }],
        settings: { autoScan: false },
      }),
    );
    const { result } = renderHook(() => useKnowledge({ notes: [], subjects: ["Mathe"] }));
    let refresh;
    act(() => {
      refresh = result.current.refreshPlan();
    });

    expect(result.current.isPlanning).toBe(true);
    await act(async () => {
      resolveCompletion({ content: '{"days":{}}' });
      await refresh;
    });

    expect(result.current.isPlanning).toBe(false);
    expect(result.current.plan).toEqual(expect.objectContaining({ days: expect.any(Array) }));
    const persisted = JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY));
    expect(persisted.plan).toEqual(result.current.plan);
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
