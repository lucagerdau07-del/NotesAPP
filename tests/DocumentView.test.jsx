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

  render(<DocumentView masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} toolbarState={{ layoutMode: 'split' }} />);

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
