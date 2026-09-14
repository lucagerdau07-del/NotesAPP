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

  it("passes the selected model in completion requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      completion({ role: "assistant", content: "Antwort von DeepSeek" }),
    );

    render(<AiChatPanel documentId="note-1" inkControllerRef={inkRef()} />);

    // Switch model to DeepSeek
    fireEvent.click(screen.getByTitle("KI-Modell auswählen"));
    fireEvent.click(screen.getByRole("option", { name: /DeepSeek V4 Flash/i }));

    fireEvent.change(screen.getByLabelText("Nachricht an den KI-Assistenten"), {
      target: { value: "Erkläre mir das" },
    });
    fireEvent.click(screen.getByTitle("Senden"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(requestBody.model).toBe("deepseek/deepseek-v4-flash");
  });
});
