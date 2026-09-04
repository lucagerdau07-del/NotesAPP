import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LayerDrawer from "../../src/components/document/LayerDrawer.jsx";

describe("LayerDrawer Component", () => {
  const objects = [
    { id: "obj-1", type: "image", text: "Stempel", locked: false, hidden: false },
    { id: "obj-2", type: "text", text: "Notiz", locked: false, hidden: false },
  ];

  it("renders list items in reverse visual order (top-most first)", () => {
    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        strokeCount={5}
        onClose={() => {}}
      />
    );
    const items = screen.getAllByTestId("layer-item");
    // Top-most is obj-2, followed by Ink layer, followed by obj-1
    expect(items[0]).toHaveTextContent("Notiz");
    expect(items[1]).toHaveTextContent("Handschrift & Striche");
    expect(items[2]).toHaveTextContent("Stempel");
  });

  it("calls onToggleLock and onToggleVisibility when action buttons are clicked", () => {
    const onToggleLock = vi.fn();
    const onToggleVisibility = vi.fn();

    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        onToggleLock={onToggleLock}
        onToggleVisibility={onToggleVisibility}
        onClose={() => {}}
      />
    );

    const lockBtns = screen.getAllByTitle(/sperren/i);
    fireEvent.click(lockBtns[0]);
    expect(onToggleLock).toHaveBeenCalled();

    const eyeBtns = screen.getAllByTitle(/ausblenden|einblenden/i);
    fireEvent.click(eyeBtns[0]);
    expect(onToggleVisibility).toHaveBeenCalled();
  });

  it("calls onSelect when clicking a layer card", () => {
    const onSelect = vi.fn();
    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        onSelect={onSelect}
        onClose={() => {}}
      />
    );

    const items = screen.getAllByTestId("layer-item");
    fireEvent.click(items[0]);
    expect(onSelect).toHaveBeenCalledWith("obj-2");
  });

  it("calls onReorder when clicking step up / down buttons", () => {
    const onReorder = vi.fn();
    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        onReorder={onReorder}
        onClose={() => {}}
      />
    );

    // items: [obj-2, __ink__, obj-1]
    // Clicking "Ebene nach unten" on items[0] (obj-2) moves it down (swaps with ink)
    const downBtns = screen.getAllByTitle("Ebene nach unten");
    fireEvent.click(downBtns[0]);
    expect(onReorder).toHaveBeenCalledWith(["obj-1", "obj-2"], 2);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByTitle(/schließen/i);
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
