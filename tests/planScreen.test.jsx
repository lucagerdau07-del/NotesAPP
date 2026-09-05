import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"days":{}}' })),
}));

import PlanScreen from "../src/components/PlanScreen.jsx";
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
      scanState: { lastRunAt: Date.now(), lastError: null, notes: {} },
      plan: {
        generatedFor: "2026-09-07",
        days: [
          { date: "2026-09-07", budgetMinutes: 70, blocks: [{ subject: "Mathe", task: "Aufgabe 4", minutes: 70 }] },
          { date: "2026-09-09", budgetMinutes: 0, blocks: [] },
        ],
      },
      settings: { autoScan: false },
    }),
  );
});

describe("PlanScreen", () => {
  it("zeigt die Blöcke eines geplanten Tages", () => {
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Aufgabe 4")).toBeInTheDocument();
    expect(screen.getByText("70 min")).toBeInTheDocument();
  });

  it("erklärt den Mittwoch statt ihn leer zu lassen", () => {
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Freier Tag — Lernzeit in der Schule")).toBeInTheDocument();
  });

  it("listet die Glossarbegriffe", () => {
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Ableitung")).toBeInTheDocument();
    expect(screen.getByText("Katalysator")).toBeInTheDocument();
  });

  it("filtert das Glossar über die Suche", () => {
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.change(screen.getByTestId("glossary-search"), { target: { value: "kata" } });
    expect(screen.getByText("Katalysator")).toBeInTheDocument();
    expect(screen.queryByText("Ableitung")).not.toBeInTheDocument();
  });

  it("meldet den Zurück-Knopf", () => {
    const onBack = vi.fn();
    render(<PlanScreen onBack={onBack} />);
    fireEvent.click(screen.getByTitle("Zurück"));
    expect(onBack).toHaveBeenCalled();
  });
});
