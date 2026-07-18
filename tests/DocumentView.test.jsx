import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import DocumentView from '../src/components/DocumentView';

test('renders DocumentView with master canvas and focus box', () => {
  const masterCanvasRef = { current: document.createElement('canvas') };
  const masterCanvasState = {
    masterCanvasRef
  };

  const handleDrag = vi.fn();
  const focusBoxState = {
    focusBox: { x: 50, y: 60, width: 200, height: 100 },
    handleDrag
  };

  render(<DocumentView masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />);

  // Check master canvas
  const canvas = screen.getByTestId('master-canvas');
  expect(canvas).toBeTruthy();
  expect(canvas.classList.contains('master-canvas')).toBe(true);

  // Check focus box
  const focusBox = screen.getByTestId('focus-box');
  expect(focusBox).toBeTruthy();
  expect(focusBox.classList.contains('focus-box')).toBe(true);
  expect(focusBox.style.left).toBe('50px');
  expect(focusBox.style.top).toBe('60px');
  expect(focusBox.style.width).toBe('200px');
  expect(focusBox.style.height).toBe('100px');

  // Check drag interaction
  fireEvent.pointerDown(focusBox, { clientX: 55, clientY: 65 });
  expect(handleDrag).toHaveBeenCalled();
});

test('renders DocumentView without crashing when states are missing', () => {
  render(<DocumentView />);
  const documentView = screen.getByTestId('document-view');
  expect(documentView).toBeTruthy();
});

test('select mode draws draft focus box and updates focus box state', () => {
  const setFocusBox = vi.fn();
  const setIsSelectMode = vi.fn();
  const focusBoxState = { focusBox: null, setFocusBox };
  const toolbarState = { isSelectMode: true, setIsSelectMode };

  render(<DocumentView focusBoxState={focusBoxState} toolbarState={toolbarState} />);

  const container = screen.getByTestId('document-view');
  
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });

  fireEvent.pointerDown(container, { clientX: 100, clientY: 100 });
  
  let draftBox = screen.queryByTestId('draft-focus-box');
  expect(draftBox).toBeTruthy();

  fireEvent.pointerMove(container, { clientX: 200, clientY: 250 });
  fireEvent.pointerUp(container, { clientX: 200, clientY: 250 });

  expect(setFocusBox).toHaveBeenCalledWith(expect.objectContaining({
    x: 100, y: 100, width: 100, height: 150
  }));
  expect(setIsSelectMode).toHaveBeenCalledWith(false);
});

test('synced undo and clear canvas', () => {
  const clearCanvas = vi.fn();
  const undo = vi.fn();
  const masterCanvasState = { clearCanvas, undo, canUndo: true };
  const padActionsRef = { current: { undo: vi.fn(), clearCanvas: vi.fn() } };

  render(<DocumentView masterCanvasState={masterCanvasState} padActionsRef={padActionsRef} />);

  const undoBtn = screen.getByTitle('Rückgängig');
  const clearBtn = screen.getByTitle('Leeren');

  fireEvent.click(undoBtn);
  expect(undo).toHaveBeenCalled();
  expect(padActionsRef.current.undo).toHaveBeenCalled();

  fireEvent.click(clearBtn);
  expect(clearCanvas).toHaveBeenCalled();
  expect(padActionsRef.current.clearCanvas).toHaveBeenCalled();
});
