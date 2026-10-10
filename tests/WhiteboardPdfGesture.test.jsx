// tests/WhiteboardPdfGesture.test.jsx
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WhiteboardEditor from '../src/components/WhiteboardEditor.jsx';

afterEach(() => vi.restoreAllMocks());

// An opened PDF is a locked image at the bottom of the board. Two fingers
// landing on it must still pinch/pan the board, in every input mode.
function controllerWithPdf(inputMode, locked = true) {
  return {
    document: {
      version: 1,
      documentId: 'wb-pdf',
      pages: [{ id: 'wb-pdf-page-1', kind: 'whiteboard' }],
      strokes: [],
      objects: [{
        id: 'pdf-page-1',
        pageId: 'wb-pdf-page-1',
        type: 'image',
        src: 'data:image/png;base64,AAAA',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        locked,
      }],
      updatedAt: 0,
    },
    tool: 'pen',
    color: '#EFECE4',
    penWidth: 3,
    eraserWidth: 15,
    eraserMode: 'pixel',
    inputMode,
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    setColor: vi.fn(),
    setPenWidth: vi.fn(),
    setEraserWidth: vi.fn(),
  };
}

describe('WhiteboardEditor gestures over a PDF', () => {
  it.each([
    ['stylus', true],
    ['finger', true],
    ['move', true],
    ['stylus', false],
    ['move', false],
  ])('pinches when both fingers land on the PDF (%s mode, locked: %s)', (inputMode, locked) => {
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<WhiteboardEditor inkController={controllerWithPdf(inputMode, locked)} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
    const pdf = screen.getAllByTestId('object-container').find((el) => el.dataset.objectId === 'pdf-page-1');
    pdf.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(pdf, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(pdf, { pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(pdf, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 75, clientY: 100 });
    fireEvent.pointerMove(pdf, { pointerId: 2, pointerType: 'touch', isPrimary: false, clientX: 225, clientY: 100 });

    expect(screen.getByTestId('whiteboard-canvas').style.transform).toContain('scale(1.5)');
  });
});
