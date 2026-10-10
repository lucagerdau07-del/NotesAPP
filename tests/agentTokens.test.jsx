import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { formatTokens } from "../src/components/AiChatPanel.jsx";

const requestCompletion = vi.fn();
vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: (...args) => requestCompletion(...args),
}));

const { default: useAgent } = await import("../src/hooks/useAgent.js");

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

describe("formatTokens", () => {
  it("formats small numbers as plain string", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(500)).toBe("500");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands with k and decimal precision without trailing zeros", () => {
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1200)).toBe("1.2k");
    expect(formatTokens(2240)).toBe("2.2k");
    expect(formatTokens(3100)).toBe("3.1k");
    expect(formatTokens(12450)).toBe("12.5k");
  });

  it("formats millions with M", () => {
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
});

describe("useAgent token tracking", () => {
  beforeEach(() => {
    requestCompletion.mockReset();
    globalThis.localStorage?.clear?.();
  });

  it("updates tokens to the current step context size rather than accumulating prompts across steps", async () => {
    const inkControllerRef = { current: fakeController() };
    const { result } = renderHook(() =>
      useAgent({ documentId: "doc-token-test", noteTitle: "Token Test", inkControllerRef }),
    );

    // Step 1: Tool call with 2,100 prompt + 50 completion = 2,150 total tokens
    requestCompletion.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_current_page", arguments: "{}" },
          },
        ],
      },
      usage: { prompt_tokens: 2100, completion_tokens: 50, total_tokens: 2150 },
    });

    // Step 2: Final reply with 2,300 prompt + 200 completion = 2,500 total tokens
    requestCompletion.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: "Hier ist das Ergebnis.",
      },
      usage: { prompt_tokens: 2300, completion_tokens: 200, total_tokens: 2500 },
    });

    // Opening chat title generation call
    requestCompletion.mockResolvedValueOnce({
      message: { role: "assistant", content: "Titel" },
      usage: null,
    });

    await act(async () => {
      await result.current.send("Wie viele Seiten?");
    });

    // Should reflect the final active context size (2500), NOT 2150 + 2500 = 4650
    expect(result.current.tokens).toBe(2500);
  });
});
