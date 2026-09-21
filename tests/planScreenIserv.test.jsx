import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"days":{}}' })),
}));
vi.mock("../src/knowledge/iservSync.js", () => ({
  syncIserv: vi.fn(async () => 0),
  openIservAttachment: vi.fn(async () => {}),
}));

import PlanScreen from "../src/components/PlanScreen.jsx";
import { openIservAttachment, syncIserv } from "../src/knowledge/iservSync.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";
import { isoDate } from "../src/knowledge/studyPlan.js";

const available = { filename: "Blatt 3.pdf", path: "u/h/Blatt_3.pdf", size_bytes: 3 };
const missing = { filename: "Gross.pdf", path: null, size_bytes: 0 };
const iservEvent = {
  id: "e1",
  kind: "homework",
  title: "Blatt 3",
  subject: "Mathe",
  due: "2099-09-24",
  done: false,
  sourceNoteId: "iserv",
  iservId: "https://iserv/ex/1",
  description: "Löse Seite 10",
  attachments: [available, missing],
};

function seed(events) {
  globalThis.localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      events,
      terms: [],
      // Ein Plan von heute: der Bildschirm soll ihn nicht neu berechnen.
      plan: { generatedFor: isoDate(Date.now()), days: [] },
      settings: { autoScan: false },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

describe("PlanScreen — IServ-Aufgaben", () => {
  it("zeigt offene IServ-Aufgaben mit Fach und Beschreibung", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("IServ-Aufgaben")).toBeInTheDocument();
    expect(screen.getByText("Blatt 3")).toBeInTheDocument();
    expect(screen.getByText(/^Mathe · /)).toBeInTheDocument();
    expect(screen.getByText("Löse Seite 10")).toBeInTheDocument();
  });

  it("zeigt keine Aufgaben, die nicht aus IServ kommen", () => {
    seed([{ ...iservEvent, id: "e2", title: "Aus dem Scan", iservId: undefined, sourceNoteId: "note-1" }]);
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.queryByText("Aus dem Scan")).not.toBeInTheDocument();
  });

  it("öffnet einen verfügbaren Anhang über das Teilen-Menü", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Blatt 3.pdf"));
    expect(openIservAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment: available }));
  });

  it("deaktiviert einen Anhang ohne Pfad", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    expect(screen.getByText("Gross.pdf (nicht verfügbar)")).toBeDisabled();
  });

  it("meldet, wenn ein Anhang nicht geöffnet werden konnte", async () => {
    openIservAttachment.mockRejectedValueOnce(new Error("offline"));
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Blatt 3.pdf"));
    expect(await screen.findByText("Anhang konnte nicht geöffnet werden.")).toBeInTheDocument();
  });

  it("hakt eine Aufgabe ab und blendet sie aus", () => {
    seed([iservEvent]);
    render(<PlanScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Erledigt"));
    expect(screen.queryByText("Blatt 3")).not.toBeInTheDocument();
    const stored = JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY));
    expect(stored.events[0].done).toBe(true);
  });

  it("meldet einen nicht erreichbaren Sync", async () => {
    syncIserv.mockRejectedValueOnce(new Error("offline"));
    seed([]);
    render(<PlanScreen onBack={() => {}} />);
    expect(await screen.findByText("IServ-Sync nicht erreichbar.")).toBeInTheDocument();
  });

  it("blendet den Abschnitt ohne Aufgaben und ohne Fehler aus", async () => {
    seed([]);
    render(<PlanScreen onBack={() => {}} />);
    await waitFor(() => expect(syncIserv).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("IServ-Aufgaben")).not.toBeInTheDocument();
  });
});
