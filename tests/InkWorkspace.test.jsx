import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentView from '../src/components/DocumentView.jsx';
import SplitLayout from '../src/components/SplitLayout.jsx';

function controllerWithPages(pageIds) {
  return {
    document: {
      version: 1,
      documentId: 'workspace-note',
      pages: pageIds.map(id => ({ id })),
      strokes: [],
      updatedAt: 0,
    },
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    clearDocument: vi.fn(),
    addPage: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    inputMode: 'stylus',
    setInputMode: vi.fn(),
    eraserMode: 'pixel',
    setEraserMode: vi.fn(),
  };
}

const toolbarState = {
  rawColor: '#ffffff',
  color: '#ffffff',
  tool: 'pen',
  rawLineWidth: 3,
  lineWidth: 3,
  eraserWidth: 15,
  isEraser: false,
  isSelectMode: false,
  paperStyle: 'blank',
  showPageBreaks: true,
  layoutMode: 'full',
};

function fireStroke(target, y1, y2) {
  fireEvent.pointerDown(target, {
    pointerId: 8, pointerType: 'pen', clientX: 40, clientY: y1,
  });
  fireEvent.pointerMove(target, {
    pointerId: 8, pointerType: 'pen', clientX: 50, clientY: y2,
  });
  fireEvent.pointerUp(target, {
    pointerId: 8, pointerType: 'pen', clientX: 50, clientY: y2,
  });
}

function mockRect(target, rect) {
  target.getBoundingClientRect = () => ({
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    ...rect,
  });
}

function drawPointerStroke(target, { pointerId, pointerType }) {
  fireEvent.pointerDown(target, {
    pointerId, pointerType, clientX: 40, clientY: 40,
  });
  fireEvent.pointerMove(target, {
    pointerId, pointerType, clientX: 80, clientY: 80,
  });
  fireEvent.pointerUp(target, {
    pointerId, pointerType, clientX: 80, clientY: 80,
  });
}

describe('full-document ink workspace', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects ink in a visual gap and maps the next page to local coordinates', () => {
    const controller = controllerWithPages(['page-1', 'page-2']);
    render(<DocumentView inkController={controller} toolbarState={toolbarState} />);
    const page = screen.getByTestId('document-page');
    page.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 2300 });

    fireStroke(page, 1140, 1145);
    expect(controller.commitStroke).not.toHaveBeenCalled();

    fireStroke(page, 1170, 1180);
    const stroke = controller.commitStroke.mock.calls[0][0];
    expect(stroke.pageId).toBe('page-2');
    expect(stroke.points[0]).toEqual({ x: 40, y: expect.closeTo(10.8) });
    expect(stroke.points[1]).toEqual({ x: 50, y: expect.closeTo(20.8) });
  });

  it('adds pages only through the shared controller', () => {
    const controller = controllerWithPages(['page-1']);
    render(<DocumentView inkController={controller} toolbarState={toolbarState} />);

    fireEvent.click(screen.getByTestId('add-page-btn'));

    expect(controller.addPage).toHaveBeenCalledOnce();
  });

  it('redraws stored vectors deterministically when the canvas resize observer fires', () => {
    const resizeObservers = [];
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      constructor(callback) {
        this.callback = callback;
        resizeObservers.push(this);
      }
      observe(target) { this.target = target; }
      disconnect() {}
    });
    const controller = controllerWithPages(['page-1']);
    controller.document.strokes = [{
      id: 'line-1',
      pageId: 'page-1',
      tool: 'pen',
      color: '#ffffff',
      width: 3,
      opacity: 1,
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    }];

    render(<DocumentView inkController={controller} toolbarState={toolbarState} />);
    const canvas = screen.getByTestId('ink-canvas');
    const context = canvas.getContext('2d');
    const canvasObserver = resizeObservers.find(observer => observer.target === canvas);
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    context.clearRect.mockClear();
    context.moveTo.mockClear();

    vi.stubGlobal('devicePixelRatio', 2);
    act(() => canvasObserver.callback([{ target: canvas }]));

    expect(canvas.width).toBe(1600);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 1131.2);
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
  });

  it('redraws for a DPR-only media-query change and removes the active listener on cleanup', () => {
    const mediaQueries = [];
    const matchMedia = vi.fn(query => {
      const listeners = new Set();
      const mediaQuery = {
        media: query,
        matches: true,
        addEventListener: vi.fn((type, listener) => {
          if (type === 'change') listeners.add(listener);
        }),
        removeEventListener: vi.fn((type, listener) => {
          if (type === 'change') listeners.delete(listener);
        }),
        dispatchChange() {
          listeners.forEach(listener => listener({ matches: false, media: query }));
        },
      };
      mediaQueries.push(mediaQuery);
      return mediaQuery;
    });
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('devicePixelRatio', 1);
    const controller = controllerWithPages(['page-1']);
    controller.document.strokes = [{
      id: 'line-1',
      pageId: 'page-1',
      tool: 'pen',
      color: '#ffffff',
      width: 3,
      opacity: 1,
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    }];

    const view = render(<DocumentView inkController={controller} toolbarState={toolbarState} />);
    const canvas = screen.getByTestId('ink-canvas');
    const context = canvas.getContext('2d');
    expect(matchMedia).toHaveBeenCalledWith('(resolution: 1dppx)');
    context.clearRect.mockClear();
    context.moveTo.mockClear();

    vi.stubGlobal('devicePixelRatio', 2);
    act(() => mediaQueries[0].dispatchChange());

    expect(canvas.width).toBe(1600);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 800, 1131.2);
    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(matchMedia).toHaveBeenLastCalledWith('(resolution: 2dppx)');

    const activeMediaQuery = mediaQueries.at(-1);
    view.unmount();
    expect(activeMediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('never paints a stroke-eraser draft into the persistent canvas projection', () => {
    const controller = controllerWithPages(['page-1']);
    controller.eraserMode = 'stroke';
    controller.document.strokes = [{
      id: 'line-1',
      pageId: 'page-1',
      tool: 'pen',
      color: '#ffffff',
      width: 3,
      opacity: 1,
      points: [{ x: 10, y: 20 }, { x: 100, y: 20 }],
    }];
    render(<DocumentView
      inkController={controller}
      toolbarState={{ ...toolbarState, isEraser: true }}
    />);
    const page = screen.getByTestId('document-page');
    page.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 1131.2 });
    const context = screen.getByTestId('ink-canvas').getContext('2d');
    context.drawn.length = 0;

    fireEvent.pointerDown(page, {
      pointerId: 9, pointerType: 'pen', clientX: 30, clientY: 20,
    });
    fireEvent.pointerMove(page, {
      pointerId: 9, pointerType: 'pen', clientX: 40, clientY: 20,
    });
    fireEvent.pointerUp(page, {
      pointerId: 9, pointerType: 'pen', clientX: 40, clientY: 20,
    });

    expect(controller.removeStrokes).toHaveBeenCalledWith(['line-1']);
    expect(controller.commitStroke).not.toHaveBeenCalled();
    expect(context.drawn.length).toBeGreaterThan(0);
    expect(context.drawn.every(path => path.globalCompositeOperation === 'source-over')).toBe(true);
  });

  it('reloads ink from the matching note save key without leaking it to another note', async () => {
    const first = render(<SplitLayout activeTab="smartCanvas" documentId="saved-note" />);
    const page = screen.getByTestId('document-page');
    page.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 1131.2 });
    fireStroke(page, 20, 30);
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '1');

    await waitFor(() => expect(localStorage.getItem('notes-app:ink:saved-note')).not.toBeNull());
    first.unmount();

    const restored = render(<SplitLayout activeTab="smartCanvas" documentId="saved-note" />);
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '1');
    restored.unmount();

    render(<SplitLayout activeTab="smartCanvas" documentId="other-note" />);
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '0');
  });

  it('commits focus ink into the same controller and one undo removes it everywhere', () => {
    render(<SplitLayout activeTab="smartCanvas" documentId="shared-note" />);
    fireEvent.click(screen.getByTestId('layout-mode-btn'));
    const focusCanvas = screen.getByTestId('focus-ink-canvas');
    mockRect(focusCanvas, { left: 0, top: 0, width: 500, height: 200 });

    drawPointerStroke(focusCanvas, { pointerId: 4, pointerType: 'pen' });

    expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '1');
    fireEvent.click(screen.getByTitle('Rückgängig'));
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '0');
  });

  it('creates and displays a second-page focus rectangle in page-local coordinates', () => {
    const controller = controllerWithPages(['page-1', 'page-2']);
    const focusBoxState = {
      focusBox: { pageId: 'page-2', x: 100, y: 50, width: 250, height: 100 },
      setFocusBox: vi.fn(),
    };
    const selectToolbarState = {
      ...toolbarState,
      layoutMode: 'split',
      isSelectMode: true,
      setIsSelectMode: vi.fn(),
    };
    const view = render(<DocumentView
      inkController={controller}
      focusBoxState={focusBoxState}
      toolbarState={selectToolbarState}
    />);

    expect(screen.getByTestId('focus-box')).toHaveStyle({ top: '1209.2px' });

    const page = screen.getByTestId('document-page');
    mockRect(page, { left: 0, top: 0, width: 800, height: 2300 });
    fireEvent.pointerDown(page, {
      pointerId: 12, pointerType: 'mouse', clientX: 100, clientY: 1170,
    });
    fireEvent.pointerMove(page, {
      pointerId: 12, pointerType: 'mouse', clientX: 300, clientY: 1270,
    });
    fireEvent.pointerUp(page, {
      pointerId: 12, pointerType: 'mouse', clientX: 300, clientY: 1270,
    });

    expect(focusBoxState.setFocusBox).toHaveBeenCalledWith({
      pageId: 'page-2',
      x: 100,
      y: expect.closeTo(10.8),
      width: 200,
      height: 100,
    });
    view.unmount();
  });

  it('reconciles a removed focus page before focus ink can create an orphan stroke', async () => {
    render(<SplitLayout activeTab="smartCanvas" documentId="orphan-note" />);
    const page = screen.getByTestId('document-page');
    page.parentElement.scrollTo = vi.fn();
    fireEvent.click(screen.getByTestId('add-page-btn'));
    fireEvent.click(screen.getByTestId('layout-mode-btn'));
    fireEvent.click(screen.getByTestId('select-mode-btn'));

    mockRect(page, { left: 0, top: 0, width: 800, height: 2300 });
    fireEvent.pointerDown(page, {
      pointerId: 13, pointerType: 'mouse', clientX: 100, clientY: 1170,
    });
    fireEvent.pointerMove(page, {
      pointerId: 13, pointerType: 'mouse', clientX: 300, clientY: 1270,
    });
    fireEvent.pointerUp(page, {
      pointerId: 13, pointerType: 'mouse', clientX: 300, clientY: 1270,
    });

    fireEvent.click(screen.getByTitle('Rückgängig'));
    const focusCanvas = screen.getByTestId('focus-ink-canvas');
    mockRect(focusCanvas, { left: 0, top: 0, width: 500, height: 200 });
    drawPointerStroke(focusCanvas, { pointerId: 14, pointerType: 'pen' });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('notes-app:ink:orphan-note'));
      expect(saved.present.pages).toEqual([{ id: 'orphan-note-page-1' }]);
      expect(saved.present.strokes).toHaveLength(1);
      expect(saved.present.strokes[0].pageId).toBe('orphan-note-page-1');
    });
  });
});
