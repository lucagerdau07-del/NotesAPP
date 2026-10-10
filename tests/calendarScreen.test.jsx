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

  it("erstellt im Fenster der Klausur einen Lernplan aus dem Thema", async () => {
    const exam = { id: "k1", kind: "exam", title: "Analysis", subject: "Mathe", due: today, done: false, sourceNoteId: "manual" };
    seed({ events: [exam] });
    requestCompletion.mockResolvedValueOnce({
      message: {
        role: "assistant",
        content: JSON.stringify({ days: { [today]: [{ task: "Kettenregel: fünf Ableitungen üben", minutes: 30 }] } }),
      },
      usage: null,
    });
    render(<CalendarScreen onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText("Thema der Klausur"), { target: { value: "Kettenregel, Produktregel" } });
    fireEvent.click(screen.getByRole("button", { name: "Lernplan erstellen" }));

    expect(await screen.findByRole("list", { name: "Lernplan zur Klausur" })).toHaveTextContent(
      "Kettenregel: fünf Ableitungen üben",
    );
    const [event] = stored().events;
    expect(event.topic).toBe("Kettenregel, Produktregel");
    expect(event.prep).toMatchObject({ due: today, blocks: [{ date: today, minutes: 30 }] });
    expect(requestCompletion.mock.calls[0][0].messages[1].content).toContain("Thema vom Schüler: Kettenregel, Produktregel");
    expect(screen.getByRole("button", { name: "Lernplan neu erstellen" })).toBeInTheDocument();
  });

  it("meldet einen fehlgeschlagenen Klausurplan und behält das Thema", async () => {
    const exam = { id: "k1", kind: "exam", title: "Analysis", subject: "Mathe", due: today, done: false, sourceNoteId: "manual" };
    seed({ events: [exam] });
    requestCompletion.mockRejectedValueOnce(new Error("Server nicht erreichbar. Verbindung prüfen."));
    render(<CalendarScreen onBack={() => {}} />);

    fireEvent.change(screen.getByLabelText("Thema der Klausur"), { target: { value: "Integrale" } });
    fireEvent.click(screen.getByRole("button", { name: "Lernplan erstellen" }));

    expect(await screen.findByText("Server nicht erreichbar. Verbindung prüfen.")).toBeInTheDocument();
    expect(stored().events[0]).toMatchObject({ topic: "Integrale" });
    expect(stored().events[0].prep).toBeUndefined();
  });

  it("lässt einen aktuellen Plan stehen, fragt aber IServ nach Neuem", async () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    await waitFor(() => expect(syncIserv).toHaveBeenCalledTimes(1));
    expect(requestCompletion).not.toHaveBeenCalled();
  });
});

const drag = (element, dx, dy = 0) => {
  const at = (type, x, y) =>
    fireEvent(element, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  at("pointerdown", 100, 100);
  at("pointermove", 100 + dx, 100 + dy);
  at("pointerup", 100 + dx, 100 + dy);
};

describe("CalendarScreen Aufgaben-Chat", () => {
  it("zeigt bei einer Hausaufgabe den Chat neben den Details", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    expect(screen.getByTestId("task-chat")).toBeInTheDocument();
    expect(screen.getByLabelText("Details")).toHaveAttribute("data-chat", "true");
  });

  it("zeigt bei einem Termin keinen Chat", () => {
    seed({ events: [{ ...iservEvent, kind: "appointment", iservId: undefined, sourceNoteId: "manual" }] });
    render(<CalendarScreen onBack={() => {}} />);
    expect(screen.queryByTestId("task-chat")).toBeNull();
    expect(screen.getByLabelText("Details")).toHaveAttribute("data-chat", "false");
  });

  it("gibt einem Lernblock den Chat seiner Aufgabe", () => {
    const events = [iservEvent];
    seed({
      events,
      plan: currentPlan(events, [
        { date: today, budgetMinutes: 30, blocks: [{ subject: "Mathe", task: "Blatt 3 üben", minutes: 30, eventIds: ["e1"] }] },
      ]),
    });
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByTestId(`cal-entry-study:${today}:0`));
    expect(screen.getByRole("heading", { level: 2, name: "Blatt 3 üben" })).toBeInTheDocument();
    expect(screen.getByTestId("task-chat")).toBeInTheDocument();
  });

  it("blendet den Chat beim Anlegen eines neuen Eintrags aus", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    fireEvent.click(screen.getByText("Neuer Eintrag"));
    expect(screen.queryByTestId("task-chat")).toBeNull();
  });
});

describe("CalendarScreen Wischen zum Abhaken", () => {
  it("hakt eine Aufgabe per Wischen nach rechts ab und öffnet sie beim nächsten wieder", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    const row = screen.getByTestId("cal-entry-event:e1").closest(".cal-swipe");
    drag(row, 90);
    expect(stored().events[0].done).toBe(true);
    drag(row, 90);
    expect(stored().events[0].done).toBe(false);
  });

  it("ignoriert kurzes, senkrechtes und nach links gerichtetes Ziehen", () => {
    seed();
    render(<CalendarScreen onBack={() => {}} />);
    const row = screen.getByTestId("cal-entry-event:e1").closest(".cal-swipe");
    drag(row, 30);
    drag(row, 90, 120);
    drag(row, -90);
    expect(stored().events[0].done).toBe(false);
  });

  it("vermerkt einen abgehakten Lernblock an der Aufgabe", () => {
    const events = [{ ...iservEvent, due: "2099-01-01" }];
    seed({
      events,
      plan: currentPlan(events, [
        { date: today, budgetMinutes: 70, blocks: [{ subject: "Mathe", task: "Blatt 3 lösen", minutes: 30, eventIds: ["e1"] }] },
      ]),
    });
    render(<CalendarScreen onBack={() => {}} />);
    drag(screen.getByTestId(`cal-entry-study:${today}:0`).closest(".cal-swipe"), 90);
    expect(stored().events[0].work).toEqual({ [today]: 30 });
    expect(stored().events[0].done).toBe(true);
  });
});
