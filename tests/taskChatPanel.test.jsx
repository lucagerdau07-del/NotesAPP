import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ message: { role: "assistant", content: "**Ich helfe** gern." } })),
}));

import TaskChat, { START_DELAY_MS } from "../src/components/TaskChat.jsx";
import { requestCompletion } from "../src/agent/agentClient.js";

const event = { id: "hw-1", kind: "homework", title: "Referat", subject: "Kunst", due: "2026-10-14" };
const task = (patch = {}) => ({ key: "hw-1", event, others: [], done: false, ...patch });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const settle = (ms) => act(async () => vi.advanceTimersByTimeAsync(ms));

describe("TaskChat Startnachricht", () => {
  it("entsteht erst nach der Wartezeit, genau einmal, ohne Werkzeuge", async () => {
    render(<TaskChat task={task()} />);
    await settle(START_DELAY_MS - 100);
    expect(requestCompletion).not.toHaveBeenCalled();

    await settle(200);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(requestCompletion.mock.calls[0][0].tools).toBeUndefined();
    expect(requestCompletion.mock.calls[0][0].messages[1].content).toContain("Hausaufgabe: Kunst · Referat");
    expect(screen.getByText("Ich helfe")).toBeInTheDocument();

    await settle(START_DELAY_MS * 3);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
  });

  it("wird gespeichert und beim Wiederöffnen nicht neu erzeugt", async () => {
    const first = render(<TaskChat task={task()} />);
    await settle(START_DELAY_MS + 100);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(globalThis.localStorage.getItem("notes.chats.task:hw-1"));
    expect(saved[0].messages[0]).toMatchObject({ role: "assistant", content: "**Ich helfe** gern." });

    first.unmount();
    render(<TaskChat task={task()} />);
    await settle(START_DELAY_MS * 2);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ich helfe")).toBeInTheDocument();
  });

  it("verbrennt nichts beim Durchblättern", async () => {
    const view = render(<TaskChat key="a" task={task()} />);
    await settle(500);
    view.rerender(<TaskChat key="b" task={task({ key: "hw-2" })} />);
    await settle(500);
    view.unmount();
    await settle(START_DELAY_MS * 2);
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("fehlt bei erledigter Aufgabe, der Chat bleibt benutzbar", async () => {
    render(<TaskChat task={task({ done: true })} />);
    await settle(START_DELAY_MS * 2);
    expect(requestCompletion).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nachricht an den Agenten")).toBeInTheDocument();
  });

  it("zeigt einen Fehler mit Nochmal-Knopf und speichert nichts", async () => {
    requestCompletion.mockRejectedValueOnce(new Error("Server nicht erreichbar."));
    render(<TaskChat task={task()} />);
    await settle(START_DELAY_MS + 100);
    expect(screen.getByText("Server nicht erreichbar.")).toBeInTheDocument();
    expect(globalThis.localStorage.getItem("notes.chats.task:hw-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Nochmal versuchen" }));
    await settle(START_DELAY_MS + 100);
    expect(requestCompletion).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ich helfe")).toBeInTheDocument();
  });

  it("sendet mit Aufgaben-Prompt und Aufgaben-Werkzeugen, ohne Notiz-Werkzeuge", async () => {
    render(<TaskChat task={task({ done: true, event: { ...event, attachments: [{ filename: "A.pdf", path: "/p" }] } })} />);
    const input = screen.getByLabelText("Nachricht an den Agenten");
    fireEvent.change(input, { target: { value: "Lies den Anhang" } });
    await act(async () => {
      fireEvent.submit(input.closest("form"));
    });
    await settle(50);
    const { messages, tools } = requestCompletion.mock.calls[0][0];
    const names = tools.map((tool) => tool.function.name);
    expect(names).toContain("read_attachment");
    expect(names).not.toContain("write_text");
    expect(messages[0].content).toContain("Aufgabe:\nHausaufgabe: Kunst · Referat");
    expect(messages[0].content).toContain("0: A.pdf");
    expect(messages.at(-1)).toMatchObject({ role: "user", content: "Lies den Anhang" });
  });
});
