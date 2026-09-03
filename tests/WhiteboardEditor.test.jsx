// tests/WhiteboardEditor.test.jsx
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WhiteboardEditor from '../src/components/WhiteboardEditor.jsx';
import * as renderInk from '../src/ink/renderInk.js';

afterEach(() => vi.restoreAllMocks());

function createControllerDouble(overrides = {}) {
  return {
    document: {
      version: 1,
      documentId: 'wb-1',
      pages: [{ id: 'wb-1-page-1', kind: 'whiteboard' }],
      strokes: [],
      objects: [],
      updatedAt: 0,
    },
    tool: 'pen',
    color: '#EFECE4',
    penWidth: 3,
    eraserWidth: 15,
    eraserMode: 'pixel',
    inputMode: 'stylus',
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    ...overrides,
  };
}

describe('WhiteboardEditor', () => {
  it('renders a whiteboard canvas for the document\'s single page', () => {
    render(<WhiteboardEditor inkController={createControllerDouble()} />);
    expect(screen.getByTestId('whiteboard-canvas')).toBeInTheDocument();
  });

  it('draws a stroke on mouse drag and commits it on release', () => {
    const commitStroke = vi.fn();
    render(<WhiteboardEditor inkController={createControllerDouble({ commitStroke })} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30 });

    expect(commitStroke).toHaveBeenCalledTimes(1);
    const stroke = commitStroke.mock.calls[0][0];
    expect(stroke.pageId).toBe('wb-1-page-1');
    expect(stroke.points.length).toBeGreaterThanOrEqual(2);
  });

  it('does not redraw committed ink when a new draft starts', () => {
    const renderSpy = vi.spyOn(renderInk, 'renderInkStroke');
    const controller = createControllerDouble();
    controller.document = {
      ...controller.document,
      strokes: [{
        id: 'committed',
        pageId: 'wb-1-page-1',
        tool: 'pen',
        color: '#EFECE4',
        width: 3,
        opacity: 1,
        points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      }],
    };
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
    renderSpy.mockClear();

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });

    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('paints only the newly appended draft segment on pointer move', () => {
    const renderSpy = vi.spyOn(renderInk, 'renderInkStroke');
    const committedStroke = {
      id: 'committed',
      pageId: 'wb-1-page-1',
      tool: 'pen',
      color: '#EFECE4',
      width: 3,
      opacity: 1,
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
    };
    const controller = createControllerDouble();
    controller.document = { ...controller.document, strokes: [committedStroke] };
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    renderSpy.mockClear();
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30 });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy.mock.calls[0][1]).toMatchObject({
      pageId: 'wb-1-page-1',
      points: [{ x: 10, y: 10 }, { x: 40, y: 30 }],
    });
    expect(renderSpy.mock.calls[0][1].id).not.toBe('committed');

    renderSpy.mockRestore();
  });

  it('previews pinch zoom without redrawing committed ink on every touch move', () => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0);
      return 1;
    });
    const renderSpy = vi.spyOn(renderInk, 'renderInkStroke');
    const controller = createControllerDouble();
    controller.document = {
      ...controller.document,
      strokes: [{
        id: 'committed',
        pageId: 'wb-1-page-1',
        tool: 'pen',
        color: '#EFECE4',
        width: 3,
        opacity: 1,
        points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      }],
    };
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    const canvas = screen.getByTestId('whiteboard-canvas');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    renderSpy.mockClear();

    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'touch', clientX: 75, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 2, pointerType: 'touch', clientX: 225, clientY: 100 });

    expect(renderSpy).not.toHaveBeenCalled();
    expect(canvas.style.transform).toContain('scale(1.5)');
  });

  it('commits the latest pinch position when a finger lifts before the queued frame', () => {
    const queuedFrames = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    const renderSpy = vi.spyOn(renderInk, 'renderInkStroke');
    const controller = createControllerDouble();
    controller.document = {
      ...controller.document,
      strokes: [{
        id: 'committed',
        pageId: 'wb-1-page-1',
        tool: 'pen',
        color: '#EFECE4',
        width: 3,
        opacity: 1,
        points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      }],
    };
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    fireEvent.pointerDown(surface, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });
    renderSpy.mockClear();
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'touch', clientX: 75, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 2, pointerType: 'touch', clientX: 225, clientY: 100 });
    expect(queuedFrames).toHaveLength(1);

    fireEvent.pointerUp(surface, { pointerId: 2, pointerType: 'touch', clientX: 225, clientY: 100 });

    expect(renderSpy).toHaveBeenCalled();
    expect(renderSpy.mock.calls.every((call) => (
      call[2].scaleX === 1.5 && call[2].scaleY === 1.5
    ))).toBe(true);
    expect(screen.getByTestId('whiteboard-canvas').style.transform).toBe('');
  });

  it('wires undo/redo buttons to the controller', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    render(
      <WhiteboardEditor
        inkController={createControllerDouble({ undo, redo, canUndo: true, canRedo: true })}
      />,
    );
    fireEvent.click(screen.getByTitle('Rückgängig'));
    fireEvent.click(screen.getByTitle('Wiederholen'));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('toggles eraser on and off', () => {
    render(<WhiteboardEditor inkController={createControllerDouble()} />);
    const eraserBtn = screen.getByTitle('Radierer');
    expect(eraserBtn).not.toHaveClass('active');
    fireEvent.click(eraserBtn);
    expect(eraserBtn.className).toContain('active');
  });
});
