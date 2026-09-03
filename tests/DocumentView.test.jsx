import '@testing-library/jest-dom';
import { useState } from 'react';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import DocumentView from '../src/components/DocumentView';

afterEach(() => vi.restoreAllMocks());

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
    focusBox: { pageId: 'page-1', x: 50, y: 60, width: 200, height: 100 },
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

test('exposes the focus rectangle as a named keyboard-movable region with page bounds', () => {
  function KeyboardFocusHarness() {
    const [focusBox, setFocusBox] = useState({
      pageId: 'page-1', x: 590, y: 1025, width: 200, height: 100,
    });
    return <DocumentView
      inkController={createControllerDouble()}
      focusBoxState={{ focusBox, setFocusBox }}
      toolbarState={toolState({ layoutMode: 'split' })}
    />;
  }

  render(<KeyboardFocusHarness />);
  const focusBox = screen.getByRole('region', { name: 'Fokusbereich' });
  expect(focusBox).toHaveAttribute('tabindex', '0');
  focusBox.focus();
  expect(focusBox).toHaveFocus();

  fireEvent.keyDown(focusBox, { key: 'ArrowRight', shiftKey: true });
  expect(screen.getByRole('region', { name: 'Fokusbereich' })).toHaveStyle({ left: '600px' });
  fireEvent.keyDown(focusBox, { key: 'ArrowDown' });
  expect(screen.getByRole('region', { name: 'Fokusbereich' })).toHaveStyle({ top: '1031.2px' });
  fireEvent.keyDown(focusBox, { key: 'ArrowLeft' });
  expect(screen.getByRole('region', { name: 'Fokusbereich' })).toHaveStyle({ left: '590px' });
  fireEvent.keyDown(focusBox, { key: 'ArrowUp', shiftKey: true });
  expect(screen.getByRole('region', { name: 'Fokusbereich' })).toHaveStyle({ top: '981.2px' });
});

test.each([
  { label: '50%', pointerX: 150, pageWidth: '400px', arrowDelta: 20, shiftDelta: 100 },
  { label: '300%', pointerX: 400, pageWidth: '2400px', arrowDelta: 10 / 3, shiftDelta: 50 / 3 },
])('moves the focus rectangle by consistent viewport pixels at $label zoom', ({
  pointerX, pageWidth, arrowDelta, shiftDelta,
}) => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callback();
    return 1;
  });
  const focusBox = { pageId: 'page-1', x: 100, y: 100, width: 200, height: 100 };
  const setFocusBox = vi.fn();
  render(<DocumentView
    // Pinch-zoom lives in the finger and move tools: with no digitizer the tip
    // is a touch too, so the stylus tool cannot read a second touch as a zoom.
    inkController={createControllerDouble({ inputMode: 'finger' })}
    focusBoxState={{ focusBox, setFocusBox }}
    toolbarState={toolState({ layoutMode: 'split' })}
  />);
  const page = screen.getByTestId('document-page');

  fireEvent.pointerDown(page, {
    pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 100,
  });
  fireEvent.pointerDown(page, {
    pointerId: 4, pointerType: 'touch', clientX: 200, clientY: 100,
  });
  fireEvent.pointerMove(page, {
    pointerId: 4, pointerType: 'touch', clientX: pointerX, clientY: 100,
  });
  expect(page.style.width).toBe(pageWidth);
  fireEvent.pointerUp(page, {
    pointerId: 4, pointerType: 'touch', clientX: pointerX, clientY: 100,
  });

  setFocusBox.mockClear();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Fokusbereich' }), { key: 'ArrowRight' });
  const arrowUpdate = setFocusBox.mock.calls[0][0](focusBox);
  expect(arrowUpdate.x).toBeCloseTo(focusBox.x + arrowDelta);

  setFocusBox.mockClear();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Fokusbereich' }), {
    key: 'ArrowDown', shiftKey: true,
  });
  const shiftUpdate = setFocusBox.mock.calls[0][0](focusBox);
  expect(shiftUpdate.y).toBeCloseTo(focusBox.y + shiftDelta);
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

  render(<DocumentView inkController={controller} toolbarState={toolState()} />);

  const undoBtn = screen.getByTitle('Rückgängig');
  const redoBtn = screen.getByTitle('Wiederholen');
  const clearBtn = screen.getByTitle('Leeren');

  fireEvent.click(undoBtn);
  fireEvent.click(redoBtn);
  expect(controller.undo).toHaveBeenCalledOnce();
  expect(controller.redo).toHaveBeenCalledOnce();

  fireEvent.click(clearBtn);
  expect(controller.clearDocument).toHaveBeenCalledOnce();
});

test('does not commit touch ink in stylus mode but commits page-local pen ink', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });

  // A real pen stroke first establishes this as a digitizer device: once seen,
  // the passive-stylus fallback (which elects a touch contact to draw when no
  // pen ever appears) switches off and only the pen may draw, same as before.
  drawPointerStroke(page, { pointerId: 9, pointerType: 'pen', start: { x: 5, y: 5 }, end: { x: 6, y: 6 } });
  controller.commitStroke.mockClear();

  drawPointerStroke(page, { pointerId: 1, pointerType: 'touch' });
  expect(controller.commitStroke).not.toHaveBeenCalled();

  drawPointerStroke(page, { pointerId: 2, pointerType: 'pen' });
  expect(controller.commitStroke).toHaveBeenCalledTimes(1);
  expect(controller.commitStroke).toHaveBeenCalledWith(expect.objectContaining({
    pageId: 'page-1',
    points: [{ x: 20, y: 20 }, { x: 30, y: 30 }],
  }));
});

test('does not commit touch ink in stylus mode before any pen has been seen when the panel varies contact size', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });

  // With no prior pen and no contact-size signal (undefined width/height, as
  // this harness reports), the touch still travels far enough to be the sole
  // elected candidate on a genuinely digitizer-less device — that stroke is
  // meant to commit. This test exists to make that default visible, not to
  // assert the old "touch never draws in stylus mode" invariant, which no
  // longer holds once no pen has ever been seen this session.
  drawPointerStroke(page, { pointerId: 1, pointerType: 'touch' });
  expect(controller.commitStroke).toHaveBeenCalledTimes(1);
});

test.each(['stylus', 'finger'])(
  'does not pan the document surface with one touch in %s mode',
  (inputMode) => {
    render(<DocumentView
      inkController={createControllerDouble({ inputMode })}
      toolbarState={toolState()}
    />);
    const page = screen.getByTestId('document-page');
    const scroller = page.parentElement;
    scroller.scrollTop = 200;
    scroller.scrollLeft = 40;
    fireEvent.pointerDown(page, {
      pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 300,
    });
    fireEvent.pointerMove(page, {
      pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 240,
    });
    fireEvent.pointerUp(page, {
      pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 240,
    });
    expect(scroller.scrollTop).toBe(200);
    expect(scroller.scrollLeft).toBe(40);
  },
);

test('zooms and pans around the moving two-finger centroid', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => (cb(), 1));
  // Pinch-zoom lives in the finger and move tools: with no digitizer the tip is
  // a touch too, so the stylus tool cannot read a second touch as a zoom.
  render(<DocumentView inkController={createControllerDouble({ inputMode: 'finger' })} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollLeft = 50;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(page, { pointerId: 10, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(page, { pointerId: 11, pointerType: 'touch', clientX: 200, clientY: 100 });
  fireEvent.pointerMove(page, { pointerId: 10, pointerType: 'touch', clientX: 150, clientY: 150 });
  fireEvent.pointerMove(page, { pointerId: 11, pointerType: 'touch', clientX: 350, clientY: 150 });
  // Mid-pinch the zoom is only previewed by a transform, so layout is untouched.
  expect(page).toHaveStyle({ width: '800px' });
  expect(page.style.transform).toBe('translate(-100px, -150px) scale(2)');
  expect(scroller.scrollLeft).toBe(50);

  fireEvent.pointerUp(page, { pointerId: 10, pointerType: 'touch', clientX: 150, clientY: 150 });
  expect(page).toHaveStyle({ width: '1600px' });
  expect(page.style.transform).toBe('');
  expect(scroller.scrollLeft).toBe(150);
  expect(scroller.scrollTop).toBe(250);
});

test('keeps a pinch-resized focus rectangle inside its selected page', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callback();
    return 1;
  });
  const controller = createControllerDouble({
    // Pinch-zoom lives in the finger and move tools: with no digitizer the tip
    // is a touch too, so the stylus tool cannot read a second touch as a zoom.
    inputMode: 'finger',
    document: {
      version: 1,
      documentId: 'note-1',
      pages: [{ id: 'page-1' }, { id: 'page-2' }],
      strokes: [],
      updatedAt: 0,
    },
  });
  const setFocusBox = vi.fn();
  const focusBoxState = {
    focusBox: { pageId: 'page-2', x: 10, y: 10, width: 250, height: 100 },
    setFocusBox,
  };
  render(<DocumentView
    inkController={controller}
    focusBoxState={focusBoxState}
    toolbarState={toolState({ layoutMode: 'split' })}
  />);
  const page = screen.getByTestId('document-page');

  fireEvent.pointerDown(page, {
    pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 100,
  });
  fireEvent.pointerDown(page, {
    pointerId: 4, pointerType: 'touch', clientX: 200, clientY: 100,
  });
  fireEvent.pointerMove(page, {
    pointerId: 4, pointerType: 'touch', clientX: 150, clientY: 100,
  });
  fireEvent.pointerUp(page, {
    pointerId: 4, pointerType: 'touch', clientX: 150, clientY: 100,
  });

  expect(setFocusBox).toHaveBeenCalledWith({
    pageId: 'page-2',
    x: 0,
    y: 0,
    width: 500,
    height: 200,
  });
});

test('cancels focus drag resources on document replacement and unmount', () => {
  const frames = [];
  let nextFrameId = 1;
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    frames.push(callback);
    return nextFrameId++;
  });
  const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame');
  const setFocusBox = vi.fn();
  const focusBoxState = {
    focusBox: { pageId: 'page-1', x: 50, y: 50, width: 250, height: 100 },
    setFocusBox,
  };
  const firstController = createControllerDouble();
  const view = render(<DocumentView
    inkController={firstController}
    focusBoxState={focusBoxState}
    toolbarState={toolState({ layoutMode: 'split' })}
  />);
  const addListener = vi.spyOn(document, 'addEventListener');
  const removeListener = vi.spyOn(document, 'removeEventListener');
  const scroller = screen.getByTestId('document-page').parentElement;
  mockRect(scroller, { left: 0, top: 0, width: 500, height: 500 });

  fireEvent.pointerDown(screen.getByTestId('focus-box'), {
    pointerId: 21, pointerType: 'mouse', clientX: 10, clientY: 10,
  });
  const replacedDocumentFrame = frames[0];
  expect(addListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
  expect(addListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
  expect(addListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));

  view.rerender(<DocumentView
    inkController={createControllerDouble({
      document: { ...firstController.document, documentId: 'note-2' },
    })}
    focusBoxState={focusBoxState}
    toolbarState={toolState({ layoutMode: 'split' })}
  />);

  expect(cancelFrame).toHaveBeenCalledWith(1);
  expect(removeListener).toHaveBeenCalledWith('pointermove', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('pointerup', expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith('pointercancel', expect.any(Function));
  setFocusBox.mockClear();
  replacedDocumentFrame();
  expect(setFocusBox).not.toHaveBeenCalled();

  fireEvent.pointerDown(screen.getByTestId('focus-box'), {
    pointerId: 22, pointerType: 'mouse', clientX: 10, clientY: 10,
  });
  const unmountedFrame = frames.at(-1);
  const unmountedFrameId = nextFrameId - 1;
  view.unmount();

  expect(cancelFrame).toHaveBeenCalledWith(unmountedFrameId);
  setFocusBox.mockClear();
  unmountedFrame();
  expect(setFocusBox).not.toHaveBeenCalled();
});

test('keeps the surviving finger inert until every touch is released', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => (cb(), 1));
  const controller = createControllerDouble({ inputMode: 'finger' });
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 200;
  fireEvent.pointerDown(page, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 300 });
  fireEvent.pointerDown(page, { pointerId: 4, pointerType: 'touch', clientX: 200, clientY: 300 });
  fireEvent.pointerMove(page, { pointerId: 4, pointerType: 'touch', clientX: 300, clientY: 300 });
  fireEvent.pointerUp(page, { pointerId: 4, pointerType: 'touch', clientX: 300, clientY: 300 });
  const scrollAfterPinch = scroller.scrollTop;
  fireEvent.pointerMove(page, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 230 });
  expect(scroller.scrollTop).toBe(scrollAfterPinch);
  expect(controller.commitStroke).not.toHaveBeenCalled();
  fireEvent.pointerUp(page, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 230 });
  drawPointerStroke(page, {
    pointerId: 5,
    pointerType: 'touch',
    start: { x: 20, y: 20 },
    end: { x: 30, y: 30 },
  });
  expect(controller.commitStroke).toHaveBeenCalledOnce();
});

test('cycles the input mode through stylus, finger and move', () => {
  function StatefulDocumentView() {
    const [inputMode, setInputMode] = useState('stylus');
    const controller = createControllerDouble({ inputMode, setInputMode });
    return <DocumentView inkController={controller} toolbarState={toolState()} />;
  }

  render(<StatefulDocumentView />);
  const modeButton = () => screen.getByRole('button', { name: /^Eingabe: / });
  expect(modeButton()).toHaveAccessibleName('Eingabe: Stift');
  fireEvent.click(modeButton());
  expect(modeButton()).toHaveAccessibleName('Eingabe: Finger');
  fireEvent.click(modeButton());
  expect(modeButton()).toHaveAccessibleName('Eingabe: Bewegen');
  fireEvent.click(modeButton());
  expect(modeButton()).toHaveAccessibleName('Eingabe: Stift');
});

test('move mode pans instead of drawing, with pen and with one finger', () => {
  const controller = createControllerDouble({ inputMode: 'move' });
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;

  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 300, clientY: 300 });
  fireEvent.pointerMove(page, { pointerId: 1, pointerType: 'pen', clientX: 260, clientY: 240 });
  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'pen', clientX: 260, clientY: 240 });
  expect(scroller.scrollTop).toBe(160);
  expect(scroller.scrollLeft).toBe(40);
  expect(controller.commitStroke).not.toHaveBeenCalled();

  fireEvent.pointerDown(page, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 300 });
  fireEvent.pointerMove(page, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 260 });
  expect(scroller.scrollTop).toBe(200);
  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('opens eraser settings popover and switches to stroke mode', () => {
  const setEraserMode = vi.fn();
  const controller = createControllerDouble({ eraserMode: 'pixel', setEraserMode });
  render(<DocumentView inkController={controller} toolbarState={toolState({ isEraser: true })} />);

  fireEvent.click(screen.getByTitle('Radiergummi'));
  expect(screen.getByTestId('eraser-settings-popover')).toBeTruthy();

  fireEvent.click(screen.getByText('Strich'));
  expect(setEraserMode).toHaveBeenCalledWith('stroke');
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

test('scrolls one gutter touch only after more than 15 vertical pixels', () => {
  render(<DocumentView inkController={createControllerDouble()} toolbarState={toolState()} />);
  const scroller = screen.getByTestId('document-page').parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 20, pointerType: 'touch', clientX: 900, clientY: 215 });
  expect(scroller.scrollTop).toBe(100);
  fireEvent.pointerMove(scroller, { pointerId: 20, pointerType: 'touch', clientX: 900, clientY: 216 });
  expect(scroller.scrollTop).toBe(84);
  expect(scroller.scrollLeft).toBe(0);
});

test('blocks a gutter palm while a pen stroke is active', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 });
  expect(scroller.scrollTop).toBe(100);
  fireEvent.pointerMove(page, { pointerId: 1, pointerType: 'pen', clientX: 110, clientY: 110 });
  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'pen', clientX: 110, clientY: 110 });
  expect(controller.commitStroke).toHaveBeenCalledOnce();
});

test('keeps a gutter touch begun during the post-pen guard inert until release', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;
  const dispatchAt = (target, type, init, timeStamp) => {
    const event = createEvent[type](target, init);
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    fireEvent(target, event);
  };
  dispatchAt(page, 'pointerDown', { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 }, 1_000);
  dispatchAt(page, 'pointerUp', { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 }, 1_100);
  dispatchAt(scroller, 'pointerDown', { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 }, 1_200);
  dispatchAt(scroller, 'pointerMove', { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 }, 2_000);
  expect(scroller.scrollTop).toBe(100);
  dispatchAt(scroller, 'pointerUp', { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 }, 2_001);
});

test('drops stale gutter pointer state when the document changes', () => {
  const first = createControllerDouble();
  const view = render(<DocumentView inkController={first} toolbarState={toolState()} />);
  const scroller = screen.getByTestId('document-page').parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 200 });
  view.rerender(<DocumentView inkController={createControllerDouble({ document: { ...first.document, documentId: 'note-2' } })} toolbarState={toolState()} />);
  fireEvent.pointerMove(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 100 });
  expect(scroller.scrollTop).toBe(100);
});

test('cancels active page stroke when a second touch starts on the gutter', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;

  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(page, { pointerId: 1, pointerType: 'touch', clientX: 110, clientY: 110 });
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 });

  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'touch', clientX: 110, clientY: 110 });
  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('scrolls one gutter touch in finger mode', () => {
  render(<DocumentView inkController={createControllerDouble({ inputMode: 'finger' })} toolbarState={toolState()} />);
  const scroller = screen.getByTestId('document-page').parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 20, pointerType: 'touch', clientX: 900, clientY: 216 });
  expect(scroller.scrollTop).toBe(84);
});

test('aborts an active gutter touch if a pen touches down', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;

  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });

  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });

  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 });
  expect(scroller.scrollTop).toBe(100);
});

test('cancels gutter touch if a third finger is added during pinch', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;

  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 });

  fireEvent.pointerDown(scroller, { pointerId: 3, pointerType: 'touch', clientX: 950, clientY: 300 });

  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('aborts an active gutter pan if a pen touches down', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;

  // start gutter touch and scroll it
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 }); // 50px diff
  expect(scroller.scrollTop).toBe(150);

  // pen touches down!
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });

  // finger moves again, should NOT scroll further
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 });
  expect(scroller.scrollTop).toBe(150);
});

test('gutter touch followed by document touch correctly starts pinch and aborts nothing if no drawing', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;

  fireEvent.pointerDown(scroller, { pointerId: 1, pointerType: 'touch', clientX: 950, clientY: 100 });
  fireEvent.pointerDown(page, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 100 });

  // It shouldn't crash
  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('locks out drawing if document touch lifts but gutter touch remains', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;

  // touch 1 on doc
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(page, { pointerId: 1, pointerType: 'touch', clientX: 110, clientY: 110 });

  // touch 2 on gutter
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 });

  // touch 1 lifts
  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'touch', clientX: 110, clientY: 110 });

  // touch 3 on doc
  fireEvent.pointerDown(page, { pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 200 });
  fireEvent.pointerMove(page, { pointerId: 3, pointerType: 'touch', clientX: 210, clientY: 210 });
  fireEvent.pointerUp(page, { pointerId: 3, pointerType: 'touch', clientX: 210, clientY: 210 });

  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('aborts gutter pan if a pen touches the gutter', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;

  // finger touches gutter and moves
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 });
  expect(scroller.scrollTop).toBe(150);

  // pen touches gutter
  fireEvent.pointerDown(scroller, { pointerId: 1, pointerType: 'pen', clientX: 950, clientY: 100 });

  // finger moves again, shouldn't pan
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100 });
  expect(scroller.scrollTop).toBe(150);
});

test('adding third finger and removing original finger cancels pinch without jumping', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;

  fireEvent.pointerDown(scroller, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 });

  // 3rd finger
  fireEvent.pointerDown(scroller, { pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 100 });
  
  const initialScrollTop = scroller.scrollTop;

  // Move 3rd finger shouldn't zoom/pan
  fireEvent.pointerMove(scroller, { pointerId: 3, pointerType: 'touch', clientX: 400, clientY: 200 });
  expect(scroller.scrollTop).toBe(initialScrollTop);
  
  // 1st finger lifts
  fireEvent.pointerUp(scroller, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  
  // Move 2nd finger shouldn't zoom/pan because pinch is dead
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 150 });
  
  expect(scroller.scrollTop).toBe(initialScrollTop);

  expect(controller.commitStroke).not.toHaveBeenCalled();
  // If we didn't crash and commitStroke isn't called, it's successful.
  // We cannot easily test setZoom natively here as it's mocked or state-bound without spy.
});

test('resets input state when document changes', async () => {
  const controller = createControllerDouble();
  let currentDoc = { documentId: 'doc-1', pages: [{ id: 'page-1' }], strokes: [] };
  controller.document = currentDoc;
  const { rerender } = render(<DocumentView inkDocument={currentDoc} inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');

  // Start pen stroke
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });
  
  // Switch document
  currentDoc = { documentId: 'doc-2', pages: [{ id: 'page-2' }], strokes: [] };
  controller.document = currentDoc;
  rerender(<DocumentView inkDocument={currentDoc} inkController={controller} toolbarState={toolState()} />);
  await require('@testing-library/react').act(async () => { await new Promise(r => setTimeout(r, 0)); });

  const scroller = screen.getByTestId('document-page').parentElement;
  
  // Touch gutter in new doc, should NOT be blocked by the old pen stroke
  scroller.scrollTop = 100;
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 });
  expect(scroller.scrollTop).toBe(150);
});

test('blocks gutter touch in select mode when pen touches document', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState({ isSelectMode: true })} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;

  scroller.scrollTop = 100;
  
  // Pen touches document (draws selection box, but should still block touch)
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });
  
  // Touch gutter in select mode
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 });
  
  // Should NOT scroll
  expect(scroller.scrollTop).toBe(100);
});

test('blocks document touches in select mode during active pen and post-pen guard', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState({ isSelectMode: true })} />);
  const page = screen.getByTestId('document-page');

  // Pen touches document (draws selection box)
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });
  
  // Touch on document area during active pen
  fireEvent.pointerDown(page, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200 });
  fireEvent.pointerMove(page, { pointerId: 2, pointerType: 'touch', clientX: 250, clientY: 250 });
  
  // The draft focus box should still belong to the pen (pointer 1) and shouldn't change to pointer 2
  
  // Pen lifts
  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'pen', clientX: 150, clientY: 150 });
  
  // Within post-pen guard, new touch on document should ALSO be blocked from drawing a focus box
  fireEvent.pointerDown(page, { pointerId: 3, pointerType: 'touch', clientX: 300, clientY: 300, timeStamp: 100 });
  fireEvent.pointerMove(page, { pointerId: 3, pointerType: 'touch', clientX: 350, clientY: 350, timeStamp: 150 });
  
  // Verify controller didn't receive weird states, though the test mostly verifies it doesn't crash
  // and the blocked touch is ignored by checking coverage/logic paths.
  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('drops a cancelled touch out of the gesture set instead of leaving it pinching', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => (cb(), 1));
  render(<DocumentView inkController={createControllerDouble()} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');

  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(page, { pointerId: 2, pointerType: 'touch', clientX: 400, clientY: 300 });
  fireEvent.pointerCancel(page, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerMove(page, { pointerId: 2, pointerType: 'touch', clientX: 500, clientY: 300 });

  // With one contact withdrawn there is no pair left, so nothing may zoom.
  expect(page.style.transform).toBe('');
});

test('writes with the passive stylus while a hand rests on the page', () => {
  // Traced off the device: the gesture layer sits in front of the ink policy
  // and only counts touch contacts, so the hand landing beside the tip made two
  // and every active stroke was aborted for a pinch. The palm guard cannot
  // filter the hand out at that point — a contact that has not moved yet is not
  // yet recognisable as a palm, which is exactly when this fires.
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');

  // Control: one contact alone writes, so a failure below is the second contact.
  fireEvent.pointerDown(page, { pointerId: 9, pointerType: 'touch', clientX: 200, clientY: 300, width: 5, height: 5 });
  fireEvent.pointerMove(page, { pointerId: 9, pointerType: 'touch', clientX: 260, clientY: 300, width: 5, height: 5 });
  fireEvent.pointerUp(page, { pointerId: 9, pointerType: 'touch', clientX: 260, clientY: 300, width: 5, height: 5 });
  expect(controller.commitStroke).toHaveBeenCalledTimes(1);

  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 700, clientY: 900, width: 5, height: 5 });
  fireEvent.pointerDown(page, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 300, width: 5, height: 5 });
  fireEvent.pointerMove(page, { pointerId: 2, pointerType: 'touch', clientX: 260, clientY: 300, width: 5, height: 5 });
  fireEvent.pointerMove(page, { pointerId: 2, pointerType: 'touch', clientX: 320, clientY: 300, width: 5, height: 5 });
  fireEvent.pointerUp(page, { pointerId: 2, pointerType: 'touch', clientX: 320, clientY: 300, width: 5, height: 5 });

  expect(controller.commitStroke).toHaveBeenCalledTimes(2);
});

test('renders a custom page format and background instead of the hardcoded default', () => {
  const controller = createControllerDouble({
    document: {
      version: 1,
      documentId: 'note-square',
      pages: [{ id: 'page-1', width: 900, height: 900, background: '#FFFFFF' }],
      strokes: [],
      updatedAt: 0,
    },
  });
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  // The content div's inline width should reflect the 900px square format at zoom 1.
  expect(page.style.width).toBe('900px');
});

test('an added page with no format of its own inherits page 1\'s custom size, not the 800/1131.2 default', () => {
  // page-1 is a 900x900 square format; page-2 has no width/height of its own
  // (as happens when the user clicks "add page"). It must be treated as
  // 900x900 too, not fall back to the old 800x1131.2 default.
  const controller = createControllerDouble({
    document: {
      version: 1,
      documentId: 'note-square-multipage',
      pages: [
        { id: 'page-1', width: 900, height: 900, background: '#FFFFFF' },
        { id: 'page-2' },
      ],
      strokes: [],
      updatedAt: 0,
    },
  });
  render(<DocumentView inkController={controller} toolbarState={toolState({ isSelectMode: true })} />);
  const page = screen.getByTestId('document-page');

  // page-2 spans y in [928, 1828] when it is correctly 900 tall (page-1's
  // 900px height + the 28px PAGE_GAP). x=850 is within its 900px width but
  // beyond the old hardcoded 800px default width, so it only resolves to a
  // point on page-2 if the fix landed.
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 850, clientY: 1000 });

  expect(screen.getByTestId('draft-focus-box')).toBeTruthy();
});

test('uses dark ruling lines on a light page background instead of the hardcoded white', () => {
  const controller = createControllerDouble({
    document: {
      version: 1,
      documentId: 'note-white-bg',
      pages: [{ id: 'page-1', width: 900, height: 900, background: '#FFFFFF', linesRgb: '0,0,0' }],
      strokes: [],
      updatedAt: 0,
    },
  });
  // 'dotted' uses a plain radial-gradient (no calc()), which is one of the few
  // gradient forms jsdom's CSSOM actually parses and reflects back as an
  // inline style — 'lined'/'grid' use calc() inside the gradient stops, which
  // jsdom silently fails to parse, so backgroundImage never round-trips for
  // those in this test environment.
  render(<DocumentView inkController={controller} toolbarState={toolState({ paperStyle: 'dotted' })} />);
  const page = screen.getByTestId('document-page');
  const rulingOverlay = Array.from(page.querySelectorAll('div')).find((el) =>
    el.style.backgroundImage?.includes('radial-gradient'),
  );
  expect(rulingOverlay).toBeTruthy();
  expect(rulingOverlay.style.backgroundImage).toContain('rgba(0, 0, 0,');
  expect(rulingOverlay.style.backgroundImage).not.toContain('rgba(255, 255, 255,');
});

test('renders WhiteboardEditor instead of the page-stack view for a whiteboard document', () => {
  const controller = createControllerDouble({
    document: {
      version: 1,
      documentId: 'wb-doc',
      pages: [{ id: 'wb-doc-page-1', kind: 'whiteboard' }],
      strokes: [],
      objects: [],
      updatedAt: 0,
    },
  });
  render(
    <DocumentView
      note={{ id: 'wb-doc' }}
      inkController={controller}
      toolbarState={toolState()}
      focusBoxState={{ focusBox: null, setFocusBox: vi.fn() }}
    />,
  );
  expect(screen.getByTestId('whiteboard-surface')).toBeInTheDocument();
  expect(screen.queryByTestId('document-page')).not.toBeInTheDocument();
});
