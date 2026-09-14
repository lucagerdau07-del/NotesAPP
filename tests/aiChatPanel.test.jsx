import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AiChatPanel from "../src/components/AiChatPanel";
import { createInkDocument, createInkHistory, executeInkCommands } from "../src/ink/inkDocument";
import { pageObjectsOf } from "../src/ink/pageObjects";

function completion(message) {
  return {
    ok: true,
    json: async () => ({ choices: [{ message }] }),
    text: async () => "",
  };
}

function inkRef() {
  let history = createInkHistory(createInkDocument("note-1"));
  return {
    current: {
      getDocument: () => history.present,
      applyCommands: (commands) => {
        history = executeInkCommands(history, commands);
        return history.present;
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.localStorage?.clear();
});

describe("AiChatPanel", () => {
  it("renders a markdown answer", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completion({ role: "assistant", content: "# Titel\n\n- **eins**\n- zwei" }),
    );

    render(<AiChatPanel documentId="note-1" noteTitle="Bio" inkControllerRef={inkRef()} />);
    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Fasse zusammen" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    expect(await screen.findByText("Titel")).toBeInTheDocument();
    expect(screen.getByText("eins").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("runs tool calls against the document and ends on done", async () => {
    const ref = inkRef();
    const pageId = ref.current.getDocument().pages[0].id;
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        completion({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-1",
              function: {
                name: "write_text",
                arguments: JSON.stringify({
                  pageId,
                  x: 64,
                  y: 64,
                  width: 672,
                  text: "Zusammenfassung",
                }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        completion({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-2",
              function: { name: "done", arguments: JSON.stringify({ summary: "Erledigt." }) },
            },
          ],
        }),
      );

    render(<AiChatPanel documentId="note-1" inkControllerRef={ref} />);
    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Schreib eine Zusammenfassung" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    expect(await screen.findByText("Erledigt.")).toBeInTheDocument();
    await waitFor(() =>
      expect(pageObjectsOf(ref.current.getDocument())[0]).toMatchObject({
        type: "text",
        text: "Zusammenfassung",
      }),
    );
  });

  it("shows a backend failure instead of silently doing nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    render(<AiChatPanel documentId="note-1" inkControllerRef={inkRef()} />);
    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Hallo" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    expect(await screen.findByText(/nicht erreichbar/i)).toBeInTheDocument();
  });

  it("displays model dropdown with Gemini 3.8 Flash, Gemini 3.5 Flash lite, and DeepSeek V4 Flash", async () => {
    render(<AiChatPanel documentId="note-1" inkControllerRef={inkRef()} />);

    const modelBtn = screen.getByTitle("KI-Modell auswählen");
    expect(modelBtn).toBeInTheDocument();
    expect(modelBtn).toHaveTextContent("Gemini 3.8 Flash");

    fireEvent.click(modelBtn);

    expect(screen.getByRole("option", { name: /Gemini 3.8 Flash/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Gemini 3.5 Flash lite/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /DeepSeek V4 Flash/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /DeepSeek V4 Flash/i }));
    expect(modelBtn).toHaveTextContent("DeepSeek V4 Flash");
  });

  it("passes the selected model and fallback chain in completion requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completion({ role: "assistant", content: "Antwort" }),
    );

    render(<AiChatPanel documentId="note-1" inkControllerRef={inkRef()} />);

    // Default model is Gemini 3.8 Flash
    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Erkläre mir das" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(requestBody.model).toBe("google/gemini-3.8-flash");
    expect(requestBody.models).toEqual([
      "google/gemini-3.8-flash",
      "google/gemini-3.7-flash",
      "google/gemini-3.6-flash",
      "deepseek/deepseek-v4-flash",
    ]);
  });

  it("automatically falls back to next model on 429 rate limit or error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      })
      .mockResolvedValueOnce(
        completion({ role: "assistant", content: "Antwort von Fallback Modell" }),
      );

    render(<AiChatPanel documentId="note-1" inkControllerRef={inkRef()} />);

    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Teste Fallback" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    expect(await screen.findByText("Antwort von Fallback Modell")).toBeInTheDocument();
    // 2 calls for completion failover + 1 call for auto title generation on opening exchange
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // First attempt: Gemini 3.8 Flash
    const firstCallBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(firstCallBody.model).toBe("google/gemini-3.8-flash");

    // Second attempt: Gemini 3.7 Flash
    const secondCallBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(secondCallBody.model).toBe("google/gemini-3.7-flash");
  });

  it("passes Gemini 3.5 Flash lite fallback chain (3.1 flash lite, deepseek v4)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completion({ role: "assistant", content: "Antwort Lite" }),
    );

    render(<AiChatPanel documentId="note-1" inkControllerRef={inkRef()} />);

    // Select Gemini 3.5 Flash lite
    fireEvent.click(screen.getByTitle("KI-Modell auswählen"));
    fireEvent.click(screen.getByRole("option", { name: /Gemini 3.5 Flash lite/i }));

    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Lite Test" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(requestBody.model).toBe("google/gemini-3.5-flash-lite");
    expect(requestBody.models).toEqual([
      "google/gemini-3.5-flash-lite",
      "google/gemini-3.1-flash-lite",
      "deepseek/deepseek-v4-flash",
    ]);
  });
});
