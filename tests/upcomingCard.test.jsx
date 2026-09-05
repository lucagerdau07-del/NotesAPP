import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import UpcomingCard from "../src/components/UpcomingCard.jsx";

const events = [
  { id: "a", kind: "homework", title: "Aufgabe 4a-c", subject: "Mathe", due: "2026-09-08", done: false },
  { id: "b", kind: "exam", title: "Klausur Analysis", subject: "Mathe", due: "2026-09-19", done: false },
];

describe("UpcomingCard", () => {
  it("zeigt eine leere Meldung ohne Termine", () => {
    render(<UpcomingCard events={[]} onToggle={() => {}} />);
    expect(screen.getByText("Nichts Offenes gefunden.")).toBeInTheDocument();
  });

  it("listet Termine mit Fach und Datum", () => {
    render(<UpcomingCard events={events} onToggle={() => {}} />);
    expect(screen.getByText("Aufgabe 4a-c")).toBeInTheDocument();
    expect(screen.getByText("Klausur Analysis")).toBeInTheDocument();
    expect(screen.getAllByText(/Mathe/)).not.toHaveLength(0);
  });

  it("kennzeichnet Klausuren als solche", () => {
    render(<UpcomingCard events={events} onToggle={() => {}} />);
    expect(screen.getByTestId("upcoming-b")).toHaveAttribute("data-kind", "exam");
  });

  it("zeigt die Quellnotiz und den vollständigen Termin-Kontext", () => {
    render(
      <UpcomingCard
        events={[{ ...events[0], sourceNoteId: "note-1" }]}
        sourceNoteTitles={{ "note-1": "Ableitungsregeln" }}
        onToggle={() => {}}
      />,
    );

    const event = screen.getByTestId("upcoming-a");
    expect(event).toHaveTextContent("Hausaufgabe · Mathe · Di 8.9.");
    expect(event).toHaveTextContent("Quelle: Ableitungsregeln");
    expect(event).toHaveAccessibleName(
      /Hausaufgabe.*Aufgabe 4a-c.*Mathe.*Di 8\.9\..*Ableitungsregeln.*als erledigt abhaken/i,
    );
  });

  it("meldet einen Klick als Abhaken", () => {
    const onToggle = vi.fn();
    render(<UpcomingCard events={events} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("upcoming-a"));
    expect(onToggle).toHaveBeenCalledWith("a", true);
  });
});
