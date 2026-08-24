import '@testing-library/jest-dom';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import DocumentView from '../src/components/DocumentView';

function createControllerDouble(overrides = {}) {
  return {
    document: {
      version: 1,
      documentId: 'note-1',
      pages: [{ id: 'page-1' }],
      strokes: [],
      updatedAt: 0,
    },
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    clearDocument: vi.fn(),
    addPage: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: true,
    canRedo: true,
    inputMode: 'stylus',
    setInputMode: vi.fn(),
    eraserMode: 'pixel',
    setEraserMode: vi.fn(),
    ...overrides,
  };
}

function toolState(overrides = {}) {
  return {
    color: '#EFECE4',
    rawColor: '#EFECE4',
    tool: 'pen',
    rawLineWidth: 3,
    lineWidth: 3,
    eraserWidth: 15,
    isEraser: false,
    isSelectMode: false,
    paperStyle: 'lined',
    showPageBreaks: true,
    layoutMode: 'full',
    ...overrides,
  };
}

function mockRect(element, rect) {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    ...rect,
  });
}

function drawPointerStroke(element, {
  pointerId = 1,
  pointerType = 'pen',
  start = { x: 20, y: 20 },
  end = { x: 30, y: 30 },
} = {}) {
  fireEvent.pointerDown(element, {
    pointerId, pointerType, clientX: start.x, clientY: start.y,
  });
  fireEvent.pointerMove(element, {
    pointerId, pointerType, clientX: end.x, clientY: end.y,
  });
  fireEvent.pointerUp(element, {
    pointerId, pointerType, clientX: end.x, clientY: end.y,
  });
}

test('renders DocumentView with ink canvas and focus box', () => {
  const handleDrag = vi.fn();
  const focusBoxState = {
    focusBox: { x: 50, y: 60, width: 200, height: 100 },
    handleDrag
  };

  render(<DocumentView inkController={createControllerDouble()} focusBoxState={focusBoxState} toolbarState={{ layoutMode: 'split' }} />);

  const canvas = screen.getByTestId('ink-canvas');
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

  const container = screen.getByTestId('document-page');
  
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

test('routes undo, redo, and clear only to the shared controller', () => {
  const controller = createControllerDouble();
  const padActionsRef = { current: { undo: vi.fn(), clearCanvas: vi.fn() } };

  render(<DocumentView inkController={controller} padActionsRef={padActionsRef} toolbarState={toolState()} />);

  const undoBtn = screen.getByTitle('Rückgängig');
  const redoBtn = screen.getByTitle('Wiederholen');
  const clearBtn = screen.getByTitle('Leeren');

  fireEvent.click(undoBtn);
  fireEvent.click(redoBtn);
  expect(controller.undo).toHaveBeenCalledOnce();
  expect(controller.redo).toHaveBeenCalledOnce();
  expect(padActionsRef.current.undo).not.toHaveBeenCalled();

  fireEvent.click(clearBtn);
  expect(controller.clearDocument).toHaveBeenCalledOnce();
  expect(padActionsRef.current.clearCanvas).not.toHaveBeenCalled();
});

test('does not commit touch ink in stylus mode but commits page-local pen ink', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });

  drawPointerStroke(page, { pointerId: 1, pointerType: 'touch' });
  expect(controller.commitStroke).not.toHaveBeenCalled();

  drawPointerStroke(page, { pointerId: 2, pointerType: 'pen' });
  expect(controller.commitStroke).toHaveBeenCalledTimes(1);
  expect(controller.commitStroke).toHaveBeenCalledWith(expect.objectContaining({
    pageId: 'page-1',
    points: [{ x: 20, y: 20 }, { x: 30, y: 30 }],
  }));
});

test('toggles finger and stroke-eraser modes with accessible pressed state', () => {
  function StatefulDocumentView() {
    const [inputMode, setInputMode] = useState('stylus');
    const [eraserMode, setEraserMode] = useState('pixel');
    const controller = createControllerDouble({
      inputMode,
      setInputMode,
      eraserMode,
      setEraserMode,
    });
    return <DocumentView inkController={controller} toolbarState={toolState()} />;
  }

  render(<StatefulDocumentView />);
  const fingerButton = screen.getByRole('button', { name: 'Fingermodus' });
  expect(fingerButton).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(fingerButton);
  expect(screen.getByRole('button', { name: 'Fingermodus' })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Radiermodus: Pixel' }));
  expect(screen.getByRole('button', { name: 'Radiermodus: Strich' })).toHaveAttribute('aria-pressed', 'true');
});

test('opens and interacts with pen settings popover', () => {
  const setTool = vi.fn();
  const setLineWidth = vi.fn();
  const toolbarState = {
    tool: 'pen',
    setTool,
    rawLineWidth: 3,
    setLineWidth,
    isEraser: false,
    color: '#EFECE4'
  };

  render(<DocumentView toolbarState={toolbarState} />);

  // Click pen button to open settings
  const penBtn = screen.getByTestId('pen-tool-btn');
  fireEvent.click(penBtn);

  const popover = screen.getByTestId('pen-settings-popover');
  expect(popover).toBeTruthy();
  expect(screen.getByText('Stift-Einstellungen')).toBeTruthy();

  // Switch to Füller
  const fountainBtn = screen.getByText('Füller');
  fireEvent.click(fountainBtn);
  expect(setTool).toHaveBeenCalledWith('fountain');

  // Click a thickness preset (e.g. 5px)
  const presetBtn = screen.getByTitle('5px');
  fireEvent.click(presetBtn);
  expect(setLineWidth).toHaveBeenCalledWith(5);
});

test('opens color wheel popover and updates color', () => {
  const setColor = vi.fn();
  const toolbarState = {
    color: '#EFECE4',
    rawColor: '#EFECE4',
    setColor,
    isEraser: false
  };

  render(<DocumentView toolbarState={toolbarState} />);

  // Click the active first color slot to open the color popover
  const colorSlots = document.querySelectorAll('.rail-color-wrapper');
  expect(colorSlots.length).toBe(5);

  fireEvent.click(colorSlots[0]);

  const colorPopover = screen.getByTestId('color-wheel-popover');
  expect(colorPopover).toBeTruthy();
  expect(screen.getByText('Farbrad & Palette')).toBeTruthy();

  // Click a preset color in the palette
  const preset = screen.getByTitle('#3E7BD8');
  fireEvent.click(preset);
  expect(setColor).toHaveBeenCalledWith('#3E7BD8');
});

test('cycles paper style on click and triggers setPaperStyle', () => {
  const setPaperStyle = vi.fn();
  const toolbarState = {
    paperStyle: 'lined',
    setPaperStyle
  };

  render(<DocumentView toolbarState={toolbarState} />);

  const paperBtn = screen.getByTestId('paper-style-btn');
  fireEvent.click(paperBtn);

  expect(setPaperStyle).toHaveBeenCalledWith('grid');
  expect(screen.getByTestId('paper-toast')).toBeTruthy();
  expect(screen.getByText('Papierstil: Kariert')).toBeTruthy();
});
