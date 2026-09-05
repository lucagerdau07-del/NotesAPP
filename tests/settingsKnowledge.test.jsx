import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));

import Settings from "../src/components/Settings.jsx";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";

beforeEach(() => {
  globalThis.localStorage.clear();
});

function openNetwork() {
  render(<Settings onBack={() => {}} />);
  fireEvent.click(screen.getByText("KI & Netzwerk"));
}

describe("Settings — Auswertung", () => {
  it("zeigt einen zugänglichen Schalter für die automatische Auswertung", () => {
    openNetwork();
    const toggle = screen.getByTestId("auto-scan-switch");
    expect(toggle).toHaveRole("button", { name: "Notizen automatisch auswerten" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("schaltet die Automatik um und speichert das", () => {
    openNetwork();
    fireEvent.click(screen.getByTestId("auto-scan-switch"));
    const stored = JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY));
    expect(stored.settings.autoScan).toBe(false);
  });

  it("bietet die manuelle Auswertung als Aktion an", () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({ version: 1, settings: { autoScan: false } }),
    );
    openNetwork();
    expect(screen.getByRole("button", { name: "Starten" })).toBeEnabled();
  });

  it("zeigt eine gespeicherte Fehlermeldung an", () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scanState: { lastRunAt: Date.now(), lastError: "Server nicht erreichbar.", notes: {} },
        settings: { autoScan: false },
      }),
    );
    openNetwork();
    expect(screen.getByText(/Server nicht erreichbar\./)).toBeInTheDocument();
  });

  it("zeigt Zeitpunkt und Anzahl bereits ausgewerteter Notizen", () => {
    globalThis.localStorage.setItem(
      KNOWLEDGE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scanState: {
          lastRunAt: new Date(2026, 8, 4, 15, 30).getTime(),
          lastError: null,
          notes: { "note-1": 1, "note-2": 2 },
        },
        settings: { autoScan: false },
      }),
    );
    openNetwork();
    expect(screen.getByText(/Zuletzt:/)).toBeInTheDocument();
    expect(screen.getByText(/2 Notizen ausgewertet/)).toBeInTheDocument();
  });

  it("meldet, wenn noch nie ausgewertet wurde", () => {
    openNetwork();
    expect(screen.getByText("Noch nicht ausgewertet.")).toBeInTheDocument();
  });
});
