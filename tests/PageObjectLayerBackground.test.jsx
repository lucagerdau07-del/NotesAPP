import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PageObjectLayer from "../src/components/document/PageObjectLayer.jsx";

describe("PageObjectLayer image background toolbar", () => {
  const mockImageObject = {
    id: "img-1",
    pageId: "page-1",
    type: "image",
    src: "data:image/png;base64,aaa",
    x: 50,
    y: 50,
    width: 200,
    height: 150,
  };

  const pageLayout = {
    pageWidth: 800,
    pageHeight: 1100,
    zoom: 1,
    pagePositions: { "page-1": { top: 0, height: 1100 } },
  };

  const mapOrigin = () => ({ x: 0, y: 0 });

  it("renders 'Hintergrund entfernen' button when an image is selected", () => {
    const onRemoveBackground = vi.fn();
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onRemoveBackground={onRemoveBackground}
      />
    );

    const wandBtn = screen.getByTitle("Hintergrund entfernen");
    expect(wandBtn).toBeInTheDocument();
    fireEvent.click(wandBtn);
    expect(onRemoveBackground).toHaveBeenCalledWith(mockImageObject);
  });

  it("renders 'Original wiederherstellen' button when image has originalSrc", () => {
    const onRestoreBackground = vi.fn();
    const objectWithOriginal = { ...mockImageObject, originalSrc: "data:image/jpeg;base64,bbb" };
    render(
      <PageObjectLayer
        objects={[objectWithOriginal]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onRestoreBackground={onRestoreBackground}
      />
    );

    const restoreBtn = screen.getByTitle("Original wiederherstellen");
    expect(restoreBtn).toBeInTheDocument();
    fireEvent.click(restoreBtn);
    expect(onRestoreBackground).toHaveBeenCalledWith(objectWithOriginal);
  });

  it("displays loading spinner and disables button when processing", () => {
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        processingObjectId="img-1"
      />
    );

    const wandBtn = screen.getByTitle("Hintergrund wird entfernt...");
    expect(wandBtn).toBeInTheDocument();
    expect(wandBtn).toBeDisabled();
  });

  it("renders rotation handle when 2D element is selected", () => {
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
      />
    );

    const rotateHandle = screen.getByTestId("rotate-handle");
    expect(rotateHandle).toBeInTheDocument();
  });

  it("updates object rotation when dragging rotate handle", () => {
    const onChange = vi.fn();
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onChange={onChange}
      />
    );

    const layer = screen.getByTestId("page-object-layer");
    const rotateHandle = screen.getByTestId("rotate-handle");

    // Center of mockImageObject (x: 50, y: 50, w: 200, h: 150) is (150, 125)
    fireEvent.pointerDown(rotateHandle, { clientX: 150, clientY: 40, pointerId: 1 });
    // Drag to right of center (e.g. clientX: 250, clientY: 125) -> should be 90 degrees
    fireEvent.pointerMove(layer, { clientX: 250, clientY: 125, pointerId: 1 });
    fireEvent.pointerUp(layer, { clientX: 250, clientY: 125, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith("img-1", expect.objectContaining({ rotation: expect.any(Number) }));
  });

  it("does not render an object if hidden: true", () => {
    const hiddenObject = { ...mockImageObject, id: "hidden-1", hidden: true };
    render(
      <PageObjectLayer
        objects={[hiddenObject]}
        selectedId={null}
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
      />
    );
    expect(screen.queryByTestId("object-container")).toBeNull();
  });

  it("renders lock badge and suppresses handles when object is locked", () => {
    const onToggleLock = vi.fn();
    const lockedObject = { ...mockImageObject, locked: true };
    render(
      <PageObjectLayer
        objects={[lockedObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onToggleLock={onToggleLock}
      />
    );

    // Handles must not be rendered
    expect(screen.queryByTestId("rotate-handle")).toBeNull();

    // Lock badge should be visible on top-right
    const lockBadge = screen.getByTestId("lock-badge-btn");
    expect(lockBadge).toBeInTheDocument();

    fireEvent.click(lockBadge);
    expect(onToggleLock).toHaveBeenCalledWith("object", "img-1", false);
  });

  it("renders layers menu in toolbar and triggers shift order commands", () => {
    const onShiftOrder = vi.fn();
    const onOpenLayers = vi.fn();
    render(
      <PageObjectLayer
        objects={[mockImageObject]}
        selectedId="img-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onShiftOrder={onShiftOrder}
        onOpenLayers={onOpenLayers}
      />
    );

    const layersBtn = screen.getByTitle("Ebene anordnen");
    expect(layersBtn).toBeInTheDocument();
    fireEvent.click(layersBtn);

    // Dropdown popover should show layer order actions
    const frontBtn = screen.getByText("Ganz nach vorne");
    fireEvent.click(frontBtn);
    expect(onShiftOrder).toHaveBeenCalledWith("img-1", "front");

    // Re-open and test open layers panel
    fireEvent.click(screen.getByTitle("Ebene anordnen"));
    const openPanelBtn = screen.getByText(/ebenen-panel öffnen/i);
    fireEvent.click(openPanelBtn);
    expect(onOpenLayers).toHaveBeenCalled();
  });
});

