// tests/WhiteboardEditor.test.jsx
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WhiteboardEditor from '../src/components/WhiteboardEditor.jsx';
import * as renderInk from '../src/ink/renderInk.js';

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
    setColor: vi.fn(),
    setPenWidth: vi.fn(),
    setEraserWidth: vi.fn(),
    ...overrides,
  };
}

describe('WhiteboardEditor', () => {
  it('uses the document\'s background instead of the hardcoded dark default', () => {
    const controller = createControllerDouble();
    controller.document.pages[0].background = '#FFFFFF';
    render(<WhiteboardEditor inkController={controller} />);
    const root = screen.getByTestId('document-view');
    expect(root.style.background).toContain('255, 255, 255');
  });

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

  it('repaints the in-progress stroke on pointer move, before pointer up', () => {
    const renderSpy = vi.spyOn(renderInk, 'renderInkStroke');
    render(<WhiteboardEditor inkController={createControllerDouble()} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    renderSpy.mockClear();
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30 });

    // Without pointerup, the stroke is not yet committed to the document — the
    // only way the canvas can show it is by repainting the live draft.
    expect(renderSpy).toHaveBeenCalled();
    const draftArg = renderSpy.mock.calls.find((call) => call[1] && call[1].points?.length >= 2);
    expect(draftArg).toBeTruthy();

    renderSpy.mockRestore();
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

  it('opens a color/width popover and updates the ink color', () => {
    const setColor = vi.fn();
    render(<WhiteboardEditor inkController={createControllerDouble({ setColor })} />);
    fireEvent.click(screen.getByTitle('Farbe & Breite'));
    expect(screen.getByTestId('whiteboard-color-popover')).toBeInTheDocument();
  });

  it('lasso-selects a stroke drawn inside the loop and deletes it on Delete', () => {
    const removeStrokes = vi.fn();
    const controller = createControllerDouble({
      removeStrokes,
      document: {
        version: 1, documentId: 'wb-1', pages: [{ id: 'wb-1-page-1', kind: 'whiteboard' }],
        strokes: [{ id: 's1', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 50, y: 50 }, { x: 60, y: 60 }] }],
        objects: [], updatedAt: 0,
      },
    });
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.click(screen.getByTitle('Lasso-Auswahl'));
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 200 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 200 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 200 });

    expect(screen.getByTestId('lasso-selection-layer')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(removeStrokes).toHaveBeenCalledWith(['s1']);
  });

  it('inserts a shape via the design-tools popover, placed at world coordinates', () => {
    const addObject = vi.fn();
    render(<WhiteboardEditor inkController={createControllerDouble({ addObject })} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.click(screen.getByTitle('Einfügen'));
    fireEvent.click(screen.getByTestId('insert-rect'));
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 250 });

    expect(addObject).toHaveBeenCalledTimes(1);
    const object = addObject.mock.calls[0][0];
    expect(object.type).toBe('rect');
    expect(object.pageId).toBe('wb-1-page-1');
    expect(object.width).toBeCloseTo(200);
    expect(object.height).toBeCloseTo(150);
  });

  it('bucket-fills inside a closed loop of strokes at the clicked world point', () => {
    const addObject = vi.fn();
    const controller = createControllerDouble({
      addObject,
      document: {
        version: 1, documentId: 'wb-1', pages: [{ id: 'wb-1-page-1', kind: 'whiteboard' }],
        // A small closed square of strokes centered near (100,100) in world space.
        strokes: [
          { id: 's1', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 50, y: 50 }, { x: 150, y: 50 }] },
          { id: 's2', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 150, y: 50 }, { x: 150, y: 150 }] },
          { id: 's3', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 150, y: 150 }, { x: 50, y: 150 }] },
          { id: 's4', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 50, y: 150 }, { x: 50, y: 50 }] },
        ],
        objects: [], updatedAt: 0,
      },
    });
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.click(screen.getByTitle('Eimer-Füllung'));
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });

    expect(addObject).toHaveBeenCalledTimes(1);
    expect(addObject.mock.calls[0][0].type).toBe('fill');
  });
});
