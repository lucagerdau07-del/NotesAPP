import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(),
}));
vi.mock("../src/knowledge/iservSync.js", () => ({
  syncIserv: vi.fn(async () => 0),
  openIservAttachment: vi.fn(async () => {}),
}));

import CalendarScreen from "../src/components/CalendarScreen.jsx";
import { StepList } from "../src/components/AiChatPanel";
import { requestCompletion } from "../src/agent/agentClient.js";
import { KNOWLEDGE_STORAGE_KEY } from "../src/knowledge/knowledgeRepository.js";
import { normalizeStudy } from "../src/knowledge/examStudy.js";
import { isoDate, PLAN_RULES_VERSION, planInputsKey } from "../src/knowledge/studyPlan.js";

const today = isoDate(Date.now());
const tomorrow = isoDate(Date.now() + 86400000);

const study = normalizeStudy(
  {
    topics: ["Kettenregel"],
    cards: [{ topic: "Kettenregel", front: "Äußere Ableitung?", back: "f'(g(x))" }],
    quiz: [{ topic: "Kettenregel", q: "Was ist innen?", opts: ["g(x)", "f(x)"], right: 0, why: "Innen steht g." }],
    sheet: [{ title: "Kettenregel", text: "f'(g)·g'" }],
  },
  null,
  "add",
  1000,
);

const exam = { id: "e-exam", kind: "exam", title: "Klausur 2", subject: "Mathe", due: tomorrow, done: false, sourceNoteId: "manual", study };

function seed(events) {
  globalThis.localStorage.setItem(
    KNOWLEDGE_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      events,
      terms: [],
      plan: { generatedFor: today, rules: PLAN_RULES_VERSION, inputs: planInputsKey(events), days: [] },
      settings: { autoScan: false },
    }),
  );
}
const stored = () => JSON.parse(globalThis.localStorage.getItem(KNOWLEDGE_STORAGE_KEY)).events[0];

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
});

describe("Klausur-Dashboard im Kalender", () => {
  it("opens at the focused exam and shows the dashboard", () => {
    seed([exam]);
    render(<CalendarScreen onBack={() => {}} focusEventId="e-exam" />);
    expect(screen.getByRole("heading", { level: 2, name: "Klausur 2" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByTestId("dash-ready")).toHaveTextContent("Noch nichts bewertet");
  });

  it("cycles a topic level and persists it", () => {
    seed([exam]);
    render(<CalendarScreen onBack={() => {}} focusEventId="e-exam" />);
    fireEvent.click(screen.getByRole("button", { name: /Kettenregel: nicht eingestuft/ }));
    expect(stored().study.topics[0].level).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /Kettenregel: Weiß ich nicht/ }));
    expect(stored().study.topics[0].level).toBe(1);
  });

  it("flips a card, rates it and raises the box", () => {
    seed([exam]);
    render(<CalendarScreen onBack={() => {}} focusEventId="e-exam" />);
    fireEvent.click(screen.getByRole("button", { name: "Rückseite zeigen" }));
    expect(screen.getByText("f'(g(x))")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Gewusst/ }));
    expect(stored().study.cards[0].box).toBe(1);
    expect(screen.getByText("Heute nichts fällig.")).toBeInTheDocument();
  });

  it("answers a quiz question with feedback and counts the try", () => {
    seed([exam]);
    render(<CalendarScreen onBack={() => {}} focusEventId="e-exam" />);
    fireEvent.click(screen.getByRole("button", { name: "f(x)" }));
    expect(screen.getByText(/Nicht ganz\./)).toBeInTheDocument();
    expect(screen.getByText(/Innen steht g\./)).toBeInTheDocument();
    expect(stored().study.quiz[0]).toMatchObject({ tries: 1, hits: 0 });
  });

  it("builds a dashboard on the button with the subagent and shows it", async () => {
    seed([{ ...exam, study: undefined }]);
    requestCompletion.mockResolvedValue({
      message: {
        role: "assistant",
        content: JSON.stringify({ topics: ["Integral"], cards: [{ topic: "Integral", front: "F?", back: "Stammfunktion" }] }),
      },
    });
    render(<CalendarScreen onBack={() => {}} focusEventId="e-exam" />);
    expect(screen.getByText(/Noch kein Dashboard/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Wunsch für das Dashboard"), { target: { value: "Integrale" } });
    fireEvent.click(screen.getByRole("button", { name: "Dashboard erstellen" }));
    await waitFor(() => expect(stored().study?.cards).toHaveLength(1));
    const request = requestCompletion.mock.calls[0][0];
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[1].content).toContain("Wunsch: Integrale");
    expect(request.tools.map((tool) => tool.function.name).sort()).toEqual(["list_notes", "read_source", "search_sources"]);
    expect(await screen.findByRole("button", { name: "Dashboard ergänzen" })).toBeInTheDocument();
  });

  it("shows an error and keeps the data when the build fails", async () => {
    seed([exam]);
    requestCompletion.mockRejectedValue(new Error("Server nicht erreichbar."));
    render(<CalendarScreen onBack={() => {}} focusEventId="e-exam" />);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard ergänzen" }));
    expect(await screen.findByText("Server nicht erreichbar.")).toBeInTheDocument();
    expect(stored().study).toEqual(study);
  });
});

describe("Karte im Chat", () => {
  it("opens the exam in the calendar", () => {
    const onOpenExam = vi.fn();
    const card = { kind: "exam", title: "Klausur 2", sub: "Dashboard Mathe Mi 14.10.: 1 Themen", eventId: "e-exam" };
    render(
      <StepList
        steps={[{ id: "1", name: "build_exam_dashboard", label: "Klausur-Dashboard bauen", state: "done", card }]}
        elapsedMs={4000}
        onOpenExam={onOpenExam}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Klausur 2/ }));
    expect(onOpenExam).toHaveBeenCalledWith("e-exam");
  });
});
