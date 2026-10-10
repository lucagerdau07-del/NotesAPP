import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// requestCompletion is mocked per-test below so each call's `tools` argument
// can be inspected — that argument is exactly what would go out over the
// wire, which is the thing enable_tools is meant to shrink.
const requestCompletion = vi.fn();
vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: (...args) => requestCompletion(...args),
}));

const { default: useAgent } = await import("../src/hooks/useAgent.js");
const { AGENT_CORE_TOOLS, AGENT_EXTENDED_BY_NAME } = await import("../src/agent/tools.js");

function toolNames(call) {
  return (call.tools || []).map((t) => t.function.name);
}

// A session's opening exchange also fires an un-awaited generateTitle() call
// right as send() wraps up (see useAgent.js) — no `tools` field, so it never
// shows up in a toolNames() check, but it does consume one more queued
// requestCompletion resolution and bumps the call count by one.
const TITLE_CALL = { message: { role: "assistant", content: "Kurzer Titel" }, usage: null };

function fakeController() {
  const document = { pages: [{ id: "p1" }], strokes: [], objects: [] };
  return {
    getDocument: () => document,
    applyCommands: vi.fn(() => document),
    color: "#111111",
    paperStyle: "lined",
    document,
  };
}

describe("useAgent tool activation", () => {
  beforeEach(() => {
    requestCompletion.mockReset();
    globalThis.localStorage?.clear?.();
  });

  it("sends only the core tools (plus enable_tools) on the first call", async () => {
    requestCompletion
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Fertig." }, usage: null })
      .mockResolvedValueOnce(TITLE_CALL);
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-1", noteTitle: "Test", inkControllerRef }),
    );

    await act(async () => {
      await result.current.send("Schreib einen Satz.");
    });

    expect(requestCompletion).toHaveBeenCalledTimes(2); // + the opening chat's title-generation call
    const sent = toolNames(requestCompletion.mock.calls[0][0]);
    expect(sent).toEqual(AGENT_CORE_TOOLS.map((t) => t.function.name));
    expect(sent).toContain("enable_tools");
    expect(sent).not.toContain("insert_table");
    expect(sent).not.toContain("insert_component");
  });

  it("adds a tool's full schema only after the model calls enable_tools for it", async () => {
    requestCompletion
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              function: { name: "enable_tools", arguments: JSON.stringify({ names: ["insert_table"] }) },
            },
          ],
        },
        usage: null,
      })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Fertig." }, usage: null })
      .mockResolvedValueOnce(TITLE_CALL);
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-2", noteTitle: "Test", inkControllerRef }),
    );

    await act(async () => {
      await result.current.send("Füge eine Tabelle ein.");
    });

    expect(requestCompletion).toHaveBeenCalledTimes(3); // + the opening chat's title-generation call
    expect(toolNames(requestCompletion.mock.calls[0][0])).not.toContain("insert_table");
    const secondCallTools = toolNames(requestCompletion.mock.calls[1][0]);
    expect(secondCallTools).toContain("insert_table");
    // Enabling one tool doesn't drag every other extended tool along.
    expect(secondCallTools).not.toContain("insert_diagram");
  });

  it("keeps a tool enabled for the rest of the run once requested", async () => {
    requestCompletion
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              function: { name: "enable_tools", arguments: JSON.stringify({ names: ["insert_diagram"] }) },
            },
          ],
        },
        usage: null,
      })
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call-2", function: { name: "read_document", arguments: "{}" } }],
        },
        usage: null,
      })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Fertig." }, usage: null })
      .mockResolvedValueOnce(TITLE_CALL);
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-3", noteTitle: "Test", inkControllerRef }),
    );

    await act(async () => {
      await result.current.send("Diagramm, dann nachsehen.");
    });

    expect(requestCompletion).toHaveBeenCalledTimes(4); // + the opening chat's title-generation call
    expect(toolNames(requestCompletion.mock.calls[2][0])).toContain("insert_diagram");
  });

  it("names the unknown tool instead of silently ignoring a typo", async () => {
    requestCompletion
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              function: { name: "enable_tools", arguments: JSON.stringify({ names: ["insert_tabel"] }) },
            },
          ],
        },
        usage: null,
      })
      .mockResolvedValueOnce({
        message: { role: "assistant", content: "Fertig." },
        usage: null,
      });
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-4", noteTitle: "Test", inkControllerRef }),
    );

    await act(async () => {
      await result.current.send("Tabelle bitte.");
    });

    expect(toolNames(requestCompletion.mock.calls[1][0])).not.toContain("insert_table");
  });

  it("starts the next run fresh, without tools left enabled from the previous one", async () => {
    requestCompletion
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              function: { name: "enable_tools", arguments: JSON.stringify({ names: ["insert_table"] }) },
            },
          ],
        },
        usage: null,
      })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Fertig." }, usage: null })
      // The first send()'s own opening-chat title call — comes before the
      // second send() below, not part of its tool activation.
      .mockResolvedValueOnce(TITLE_CALL)
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Auch fertig." }, usage: null });
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-5", noteTitle: "Test", inkControllerRef }),
    );

    await act(async () => {
      await result.current.send("Tabelle einfügen.");
    });
    await act(async () => {
      await result.current.send("Noch ein Satz.");
    });

    // Index 0: enable_tools, 1: "Fertig.", 2: title call, 3: the second send().
    expect(requestCompletion).toHaveBeenCalledTimes(4);
    const secondSendTools = toolNames(requestCompletion.mock.calls[3][0]);
    expect(secondSendTools).not.toContain("insert_table");
  });

  it("core tools plus every extended tool cover the whole registered set", () => {
    const coreNames = new Set(AGENT_CORE_TOOLS.map((t) => t.function.name));
    for (const name of AGENT_EXTENDED_BY_NAME.keys()) {
      expect(coreNames.has(name), name).toBe(false);
    }
  });
});

describe("core set only holds what nearly every task needs", () => {
  it("no longer treats add_shape/draw/erase/delete_objects as always-on", () => {
    const coreNames = new Set(AGENT_CORE_TOOLS.map((t) => t.function.name));
    for (const name of ["add_shape", "draw", "erase", "delete_objects"]) {
      expect(coreNames.has(name), name).toBe(false);
      expect(AGENT_EXTENDED_BY_NAME.has(name), name).toBe(true);
    }
  });

  it("keeps see_document and add_page core (their need surfaces one turn late)", () => {
    const coreNames = new Set(AGENT_CORE_TOOLS.map((t) => t.function.name));
    expect(coreNames.has("see_document")).toBe(true);
    expect(coreNames.has("add_page")).toBe(true);
  });
});

describe("enable_tools bundled with another call in the same turn", () => {
  it("unlocks a deferred tool without a dedicated round trip when the model asks for it upfront", async () => {
    requestCompletion
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              function: { name: "enable_tools", arguments: JSON.stringify({ names: ["delete_objects"] }) },
            },
            { id: "call-2", function: { name: "read_document", arguments: "{}" } },
          ],
        },
        usage: null,
      })
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call-3", function: { name: "delete_objects", arguments: JSON.stringify({ ids: ["x"] }) } }],
        },
        usage: null,
      })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Fertig." }, usage: null })
      .mockResolvedValueOnce(TITLE_CALL);
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-6", noteTitle: "Test", inkControllerRef }),
    );

    await act(async () => {
      await result.current.send("Lösche den Absatz über X.");
    });

    // Turn 1 already batched enable_tools + read_document (delete_objects not
    // sent yet, it isn't unlocked until the *next* request); turn 2 has it.
    expect(toolNames(requestCompletion.mock.calls[0][0])).not.toContain("delete_objects");
    expect(toolNames(requestCompletion.mock.calls[1][0])).toContain("delete_objects");
    // Exactly one extra request for the actual delete_objects call, not a
    // dedicated round trip just to unlock it - 4 total: batched enable+read,
    // the delete, the closing "Fertig.", and the title call.
    expect(requestCompletion).toHaveBeenCalledTimes(4);
  });
});
