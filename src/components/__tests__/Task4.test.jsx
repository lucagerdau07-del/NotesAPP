import "@testing-library/jest-dom";
import { act, render, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import WritingZone from "../WritingZone";

describe("Task 4 - WritingZone", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function controller(strokes = []) {
    return {
      document: {
        version: 1,
        documentId: "focus-note",
        pages: [{ id: "page-1" }, { id: "page-2" }],
        strokes,
        updatedAt: 0,
      },
      commitStroke: vi.fn(),
      removeStrokes: vi.fn(),
      inputMode: "stylus",
      eraserMode: "pixel",
    };
  }

  const toolbarState = {
    rawColor: "#ffffff",
    color: "#ffffff",
    tool: "pen",
    rawLineWidth: 3,
    lineWidth: 3,
    eraserWidth: 15,
    isEraser: false,
    paperStyle: "blank",
    showPageBreaks: true,
  };

  it("maps focus viewport points into page-local coordinates and commits through the controller", () => {
    const inkController = controller();
    const focusBoxState = {
      focusBox: { pageId: "page-2", x: 100, y: 50, width: 400, height: 300 },
      setFocusBox: vi.fn(),
    };

    render(
      <WritingZone
        inkController={inkController}
        focusBoxState={focusBoxState}
        toolbarState={toolbarState}
      />,
    );
    const canvas = screen.getByTestId("focus-ink-canvas");
    canvas.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      width: 800,
      height: 600,
    });

    fireEvent.pointerDown(canvas, {
      pointerId: 4,
      pointerType: "pen",
      clientX: 210,
      clientY: 170,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 4,
      pointerType: "pen",
      clientX: 610,
      clientY: 470,
    });
    fireEvent.pointerUp(canvas, {
      pointerId: 4,
      pointerType: "pen",
      clientX: 610,
      clientY: 470,
    });

    expect(inkController.commitStroke).toHaveBeenCalledOnce();
    expect(inkController.commitStroke.mock.calls[0][0]).toMatchObject({
      pageId: "page-2",
      points: [
        { x: 200, y: 125 },
        { x: 400, y: 275 },
      ],
    });
  });

  it("renders only the selected page with focus offsets and redraws on resize", () => {
    const resizeObservers = [];
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        constructor(callback) {
          this.callback = callback;
          this.disconnect = vi.fn();
          resizeObservers.push(this);
        }
        observe(target) {
          this.target = target;
        }
      },
    );
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getBoundingClientRect",
    ).mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });
    const inkController = controller([
      {
        id: "hidden",
        pageId: "page-1",
        tool: "pen",
        color: "#fff",
        width: 3,
        opacity: 1,
        points: [
          { x: 120, y: 70 },
          { x: 140, y: 90 },
        ],
      },
      {
        id: "visible",
        pageId: "page-2",
        tool: "pen",
        color: "#fff",
        width: 3,
        opacity: 1,
        points: [
          { x: 150, y: 75 },
          { x: 200, y: 100 },
        ],
      },
    ]);

    const view = render(
      <WritingZone
        inkController={inkController}
        focusBoxState={{
          focusBox: {
            pageId: "page-2",
            x: 100,
            y: 50,
            width: 400,
            height: 300,
          },
        }}
        toolbarState={toolbarState}
      />,
    );
    const canvas = screen.getByTestId("focus-ink-canvas");
    const context = canvas.getContext("2d");

    expect(context.moveTo).toHaveBeenCalledTimes(1);
    expect(context.moveTo).toHaveBeenCalledWith(100, 50);
    expect(context.lineTo).toHaveBeenCalledWith(200, 100);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);

    context.clearRect.mockClear();
    context.moveTo.mockClear();
    const canvasObserver = resizeObservers.find(
      (observer) => observer.target === canvas,
    );
    act(() => canvasObserver.callback([{ target: canvas }]));

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(context.moveTo).toHaveBeenCalledWith(100, 50);

    view.unmount();
    expect(canvasObserver.disconnect).toHaveBeenCalledOnce();
  });
});
