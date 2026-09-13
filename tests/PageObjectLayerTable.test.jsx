import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PageObjectLayer from "../src/components/document/PageObjectLayer.jsx";
import { createPageObject } from "../src/ink/pageObjects.js";

describe("PageObjectLayer table element", () => {
  const tableObject = createPageObject({
    id: "table-1",
    pageId: "page-1",
    type: "table",
    x: 50,
    y: 50,
    rows: 2,
    cols: 2,
    cellText: [
      ["A", "B"],
      ["C", "D"],
    ],
  });

  const pageLayout = {
    pageWidth: 800,
    pageHeight: 1100,
    zoom: 1,
    pagePositions: { "page-1": { top: 0, height: 1100 } },
  };

  const mapOrigin = () => ({ x: 0, y: 0 });

  it("renders one real <table> with rows x cols <td> cells, not separate rectangles", () => {
    render(
      <PageObjectLayer
        objects={[tableObject]}
        selectedId="table-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
      />
    );

    expect(screen.getAllByRole("table")).toHaveLength(1);
    const cells = screen.getAllByRole("cell");
    expect(cells).toHaveLength(4);
    expect(cells.map((cell) => cell.textContent)).toEqual(["A", "B", "C", "D"]);
  });

  it("double-click enters edit mode and blurring a cell commits just that cell", () => {
    const onEditingChange = vi.fn();
    const onChange = vi.fn();
    const { rerender } = render(
      <PageObjectLayer
        objects={[tableObject]}
        selectedId="table-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onEditingChange={onEditingChange}
        onChange={onChange}
      />
    );

    fireEvent.doubleClick(screen.getByTestId("object-container"));
    expect(onEditingChange).toHaveBeenCalledWith("table-1");

    rerender(
      <PageObjectLayer
        objects={[tableObject]}
        selectedId="table-1"
        editingId="table-1"
        pageLayout={pageLayout}
        mapOrigin={mapOrigin}
        onEditingChange={onEditingChange}
        onChange={onChange}
      />
    );

    const cells = screen.getAllByRole("cell");
    expect(cells[1]).toHaveAttribute("contenteditable", "true");
    cells[1].textContent = "geändert";
    fireEvent.blur(cells[1]);

    expect(onChange).toHaveBeenCalledWith("table-1", {
      cellText: [
        ["A", "geändert"],
        ["C", "D"],
      ],
    });
  });
});
