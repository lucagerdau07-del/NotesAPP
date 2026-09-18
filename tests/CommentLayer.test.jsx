import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CommentLayer from "../src/components/document/CommentLayer.jsx";

const setup = (comments = []) => {
  const props = {
    comments,
    locate: () => ({ pageId: "p1", x: 40, y: 50 }),
    project: (_pageId, x, y) => ({ x, y }),
    onSave: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
  };
  render(<CommentLayer {...props} />);
  return props;
};

describe("CommentLayer", () => {
  it("öffnet bei einem Klick ins Leere das Eingabefenster und speichert den Ort", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByTestId("comment-layer"));
    fireEvent.change(screen.getByLabelText("Kommentartext"), { target: { value: "Nochmal erklären" } });
    fireEvent.click(screen.getByText("Speichern"));

    expect(onSave).toHaveBeenCalledWith({ pageId: "p1", x: 40, y: 50, text: "Nochmal erklären" });
    expect(screen.queryByTestId("comment-popover")).toBeNull();
  });

  it("beendet mit Abbrechen den Kommentar-Modus", () => {
    const { onClose, onSave } = setup();
    fireEvent.click(screen.getByTestId("comment-layer"));
    fireEvent.click(screen.getByText("Abbrechen"));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("speichert keinen leeren Kommentar", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByTestId("comment-layer"));
    expect(screen.getByText("Speichern")).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("bearbeitet und löscht einen bestehenden Kommentar über seinen Marker", () => {
    const existing = { id: "c1", pageId: "p1", x: 10, y: 20, text: "Alt" };
    const { onSave, onRemove } = setup([existing]);

    fireEvent.click(screen.getByTestId("comment-marker"));
    expect(screen.getByLabelText("Kommentartext")).toHaveValue("Alt");
    fireEvent.change(screen.getByLabelText("Kommentartext"), { target: { value: "Neu" } });
    fireEvent.click(screen.getByText("Speichern"));
    expect(onSave).toHaveBeenCalledWith({ ...existing, text: "Neu" });

    fireEvent.click(screen.getByTestId("comment-marker"));
    fireEvent.click(screen.getByText("Löschen"));
    expect(onRemove).toHaveBeenCalledWith("c1");
  });
});
