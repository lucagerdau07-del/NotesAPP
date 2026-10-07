import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PageObjectLayer from "../src/components/document/PageObjectLayer.jsx";
import { createPageObject } from "../src/ink/pageObjects.js";

describe("PageObjectLayer text box handles", () => {
  const text = createPageObject({
    id: "text-1",
    pageId: "page-1",
    type: "text",
    x: 50,
    y: 50,
    width: 100,
    height: 40,
    fontSize: 20,
    text: "Hallo",
  });
  const pageLayout = { pageWidth: 800, pageHeight: 1100, zoom: 1, pagePositions: { "page-1": { top: 0, height: 1100 } } };

  const drag = (handle, dx, dy) => {
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: dx, clientY: dy });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: dx, clientY: dy });
  };

  const setup = () => {
    const onChange = vi.fn();
    render(
      <PageObjectLayer objects={[text]} selectedId="text-1" pageLayout={pageLayout} mapOrigin={() => ({ x: 0, y: 0 })} onChange={onChange} />,
    );
    return onChange;
  };

  it("a corner scales the font with the box and keeps the opposite corner", () => {
    const onChange = setup();
    // Top-left corner pulled out along the diagonal by half the box.
    drag(screen.getAllByTestId("text-corner-handle")[0], -50, -20);
    const patch = onChange.mock.calls.find(([, p]) => "fontSize" in p)[1];
    expect(patch.fontSize).toBe(30);
    expect(patch.x).toBe(0);
    expect(patch.y).toBe(30);
    expect(patch.autoWidth).toBeUndefined();
  });

  it("a side sets the width by hand and leaves the font alone", () => {
    const onChange = setup();
    drag(screen.getByTestId("text-edge-e"), 60, 0);
    const patch = onChange.mock.calls.find(([, p]) => "fontSize" in p)[1];
    expect(patch).toMatchObject({ x: 50, width: 160, fontSize: 20, autoWidth: false });
  });
});
