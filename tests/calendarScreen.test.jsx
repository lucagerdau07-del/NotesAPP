import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"days":{}}' })),
}));
vi.mock("../src/knowledge/iservSync.js", () => ({
  syncIserv: vi.fn(async () => 0),
  openIservAttachment: vi.fn(async () => {}),
}));

import CalendarScreen from "../src/components/CalendarScreen.jsx";
import { requestCompletion } from "../src/agent/agentClient.js";
import { openIservAttachment, syncIserv } from "../src/knowledge/iservSync.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";
import { isoDate, PLAN_RULES_VERSION, planInputsKey } from "../src/knowledge/studyPlan.js";

const today = isoDate(Date.now());
const available = { filename: "Blatt 3.pdf", path: "u/h/Blatt_3.pdf", size_bytes: 3 };
const missing = { filename: "Gross.pdf", path: null, size_bytes: 0 };
const iservEvent = {
  id: "e1",
  kind: "homework",
  title: "Blatt 3",
  subject: "Mathe",
  due: today,
  done: false,
  sourceNoteId: "iserv",
  iservId: "https://iserv/ex/1",
  description: "Löse Seite 10",
  attachments: [available, missing],
};

// Ein Plan von heute zu genau diesen Aufgaben: der Bildschirm soll ihn nicht neu berechnen.
const currentPlan = (events, days = []) => ({
  generatedFor: today,
  rules: PLAN_RULES_VERSION,
  inputs: planInputsKey(events),
  days,
});

function seed({ events = [iservEvent], plan } = {}) {
  globalThis.localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      events,
      terms: [],
      plan: plan === undefined ? currentPlan(events) : plan,
      settings: { autoScan: false },
    }),
  );
}

const stored = () => JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY));

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

describe("CalendarScreen", () => {
  it("zeigt den nächsten Eintrag mit Beschreibung in den Details", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    expect(screen.getByTestId("cal-entry-event:e1")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Blatt 3" })).toBeInTheDocument();
    expect(screen.getByText("Löse Seite 10")).toBeInTheDocument();
  });

  it("zeigt Lernplan-Blöcke als Einträge", () => {
    seed({
      events: [],
      plan: currentPlan([], [{ date: today, budgetMinutes: 70, blocks: [{ subject: "Mathe", task: "Aufgabe 4", minutes: 70 }] }]),
    });
    render(<CalendarScreen onBack={() => {}} />);
    expect(screen.getAllByText("Aufgabe 4").length).toBeGreaterThan(0);
    expect(screen.getByText(/70 min · Lernzeit · Mathe/)).toBeInTheDocument();
  });

  it("öffnet einen verfügbaren Anhang und deaktiviert einen ohne Pfad", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Blatt 3.pdf"));
    expect(openIservAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment: available }));
    expect(screen.getByText("Gross.pdf (nicht verfügbar)").closest("button")).toBeDisabled();
  });

  it("meldet, wenn ein Anhang nicht geöffnet werden konnte", async () => {
    openIservAttachment.mockRejectedValueOnce(new Error("offline"));
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Blatt 3.pdf"));
    expect(await screen.findByText("Anhang konnte nicht geöffnet werden.")).toBeInTheDocument();
  });

  it("hakt einen Eintrag ab und öffnet ihn wieder", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Erledigt" }));
    expect(stored().events[0].done).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Wieder öffnen" }));
    expect(stored().events[0].done).toBe(false);
  });

  it("legt einen eigenen Termin an und löscht ihn wieder", () => {
    seed({ events: [] });
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Neuer Eintrag" }));
    expect(screen.getByRole("button", { name: "Hinzufügen" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Zahnarzt" } });
    fireEvent.change(screen.getByLabelText("Uhrzeit"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    const [event] = stored().events;
    expect(event).toMatchObject({ kind: "appointment", title: "Zahnarzt", due: today, time: "14:30", sourceNoteId: "manual" });
    expect(screen.getByRole("heading", { level: 2, name: "Zahnarzt" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(stored().events).toEqual([]);
  });

  it("blättert in den nächsten Monat", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Nächster Monat" }));
    expect(screen.queryByTestId("cal-entry-event:e1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Heute" }));
    expect(screen.getByTestId("cal-entry-event:e1")).toBeInTheDocument();
  });

  it("meldet einen nicht erreichbaren IServ-Sync", async () => {
    syncIserv.mockRejectedValueOnce(new Error("offline"));
    seed({ events: [] });
    render(<CalendarScreen onBack={() => {}} />);
    expect(await screen.findByText(/IServ nicht erreichbar/)).toBeInTheDocument();
  });

  it("meldet den Zurück-Knopf", () => {
    const onBack = vi.fn();
    seed();
    render(<CalendarScreen onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Zurück zur Bibliothek" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("aktualisiert einen fehlenden Plan bei Schreibfehler genau einmal", async () => {
    seed({ events: [], plan: null });
    const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Speicher gesperrt");
    });
    try {
      render(
        <StrictMode>
          <CalendarScreen onBack={() => {}} />
        </StrictMode>,
      );
      await waitFor(() => expect(screen.getByTestId("plan-refresh")).not.toBeDisabled());
      expect(requestCompletion).toHaveBeenCalledTimes(1);
    } finally {
      storageWrite.mockRestore();
    }
  });

  it("berechnet einen heutigen Plan nach älteren Regeln sofort neu", async () => {
    seed({ events: [], plan: { ...currentPlan([]), rules: PLAN_RULES_VERSION - 1 } });
    render(<CalendarScreen onBack={() => {}} />);
    await waitFor(() => expect(stored().plan.rules).toBe(PLAN_RULES_VERSION));
    expect(requestCompletion).toHaveBeenCalledTimes(1);
  });

  it("berechnet den Plan neu, wenn sich eine Frist geändert hat", async () => {
    const withTime = { ...iservEvent, time: "07:45" };
    seed({ events: [withTime], plan: currentPlan([iservEvent]) });
    render(<CalendarScreen onBack={() => {}} />);
    await waitFor(() => expect(stored().plan.inputs).toBe(planInputsKey([withTime])));
    expect(requestCompletion).toHaveBeenCalledTimes(1);
  });

  it("lässt einen aktuellen Plan stehen, fragt aber IServ nach Neuem", async () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    await waitFor(() => expect(syncIserv).toHaveBeenCalledTimes(1));
    expect(requestCompletion).not.toHaveBeenCalled();
  });
});
