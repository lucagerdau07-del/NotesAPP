import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: "{}" })),
}));

import GlossaryScreen from "../src/components/GlossaryScreen.jsx";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      events: [],
      terms: [
        { id: "t1", term: "Ableitung", definition: "Steigung einer Funktion", subject: "Mathe" },
        { id: "t2", term: "Katalysator", definition: "senkt die Aktivierungsenergie", subject: "Chemie" },
      ],
      settings: { autoScan: false },
    }),
  );
});

describe("GlossaryScreen", () => {
  it("listet die Begriffe", () => {
    render(<GlossaryScreen onBack={() => {}} />);
    expect(screen.getByText("Ableitung")).toBeInTheDocument();
    expect(screen.getByText("Katalysator")).toBeInTheDocument();
  });

  it("filtert über die Suche", () => {
    render(<GlossaryScreen onBack={() => {}} />);
    fireEvent.change(screen.getByTestId("glossary-search"), { target: { value: "kata" } });
    expect(screen.getByText("Katalysator")).toBeInTheDocument();
    expect(screen.queryByText("Ableitung")).not.toBeInTheDocument();
  });

  it("filtert nach Fach", () => {
    render(<GlossaryScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Chemie" }));
    expect(screen.queryByText("Ableitung")).not.toBeInTheDocument();
  });

  it("meldet den Zurück-Knopf", () => {
    const onBack = vi.fn();
    render(<GlossaryScreen onBack={onBack} />);
    fireEvent.click(screen.getByTitle("Zurück"));
    expect(onBack).toHaveBeenCalled();
  });
});
