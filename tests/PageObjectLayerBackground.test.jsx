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
});
