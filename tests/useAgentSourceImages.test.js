import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const requestCompletion = vi.fn();
vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: (...args) => requestCompletion(...args),
}));
// Rendering a real worksheet page needs canvas and pdf.js, which jsdom lacks;
// what's under test is how useAgent ships the rendered page to the model.
vi.mock("../src/agent/tools.js", async (importOriginal) => ({
  ...(await importOriginal()),
  executeTool: async () => ({
    pages: [{ page: 1, cite: "Arbeitsblatt, PDF-S. 1", src: "data:image/jpeg;base64,AAAA" }],
  }),
}));

const { default: useAgent } = await import("../src/hooks/useAgent.js");

describe("useAgent source images", () => {
  it("sends read_source page images as image parts, with the citation in the tool result", async () => {
    requestCompletion
      .mockResolvedValueOnce({
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              function: {
                name: "read_source",
                arguments: JSON.stringify({ noteId: "n1", page: 1, image: true }),
              },
            },
          ],
        },
        usage: null,
      })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "Die Grafik zeigt ..." }, usage: null })
      .mockResolvedValue({ message: { role: "assistant", content: "Titel" }, usage: null });

    const { result } = renderHook(() => useAgent({ documentId: "library-images" }));
    await act(async () => {
      await result.current.send("Was zeigt die Grafik?");
    });

    const wire = requestCompletion.mock.calls[1][0].messages;
    expect(wire.at(-2)).toMatchObject({
      role: "tool",
      content: "1 Seite(n) als Bild angehängt. Arbeitsblatt, PDF-S. 1",
    });
    expect(wire.at(-1).content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
  });
});
