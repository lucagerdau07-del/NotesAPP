import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useInkPointer from '../src/hooks/useInkPointer.js';

function pointer(pointerId, pointerType, clientX, clientY, currentTarget = undefined, timeStamp = 0) {
  return { pointerId, pointerType, clientX, clientY, currentTarget, timeStamp };
}

function renderInkPointer(overrides = {}) {
  const commitStroke = vi.fn();
  const removeStrokes = vi.fn();
  const options = {
    inputMode: 'stylus',
    tool: 'pen',
    color: '#ffffff',
    width: 3,
    document: { documentId: 'doc-1', pages: [{ id: 'p1' }], strokes: [] },
    mapPoint: event => ({ pageId: 'p1', x: event.clientX, y: event.clientY }),
    commitStroke,
    removeStrokes,
    ...overrides
  };
  return { ...renderHook(() => useInkPointer(options)), commitStroke, removeStrokes };
}

function renderChangingInkPointer(initialProps = {}) {
  const commitStroke = vi.fn();
  const removeStrokes = vi.fn();
  const baseOptions = {
    inputMode: 'stylus',
    tool: 'pen',
    color: '#ffffff',
    width: 3,
    document: { documentId: 'doc-1', pages: [{ id: 'p1' }], strokes: [] },
    mapPoint: event => ({ pageId: 'p1', x: event.clientX, y: event.clientY }),
  };
  const hook = renderHook(props => useInkPointer({
    ...baseOptions,
    ...props,
    commitStroke,
    removeStrokes,
  }), { initialProps });
  return { ...hook, commitStroke, removeStrokes };
}

describe('useInkPointer', () => {
  it('discards finger ink and starts pen ink when the pen takes priority', () => {
    const { result, commitStroke } = renderInkPointer({ inputMode: 'finger' });
    act(() => result.current.onPointerDown(pointer(1, 'touch', 10, 10)));
    act(() => result.current.onPointerMove(pointer(1, 'touch', 20, 20)));
    act(() => result.current.onPointerDown(pointer(2, 'pen', 30, 30)));
    act(() => result.current.onPointerMove(pointer(2, 'pen', 40, 40)));
    act(() => result.current.onPointerUp(pointer(2, 'pen', 40, 40)));
    expect(commitStroke).toHaveBeenCalledOnce();
    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 30, y: 30 }, { x: 40, y: 40 }],
    }));
  });

  it('exposes active and recent pen blocking without mutating policy state', () => {
    const { result } = renderInkPointer();
    act(() => result.current.onPointerDown({ ...pointer(7, 'pen', 1, 2), timeStamp: 1_000 }));
    expect(result.current.shouldBlockTouch(1_010, 9)).toBe(true);
    act(() => result.current.onPointerUp({ ...pointer(7, 'pen', 1, 2), timeStamp: 1_100 }));
    expect(result.current.shouldBlockTouch(1_399, 9)).toBe(true);
    expect(result.current.shouldBlockTouch(1_400, 9)).toBe(false);
  });

  it('commits one pen stroke and ignores palm move and up events', () => {
    const { result, commitStroke } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerMove(pointer(9, 'touch', 50, 60)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
    act(() => result.current.onPointerUp(pointer(9, 'touch', 50, 60)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));

    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'p1',
      tool: 'pen',
      color: '#ffffff',
      width: 3,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    }));
  });

  it('captures only the pointer that starts a draft and exposes its rapid move points', () => {
    const target = { setPointerCapture: vi.fn() };
    const { result } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 5, 6, target)));

    expect(target.setPointerCapture).toHaveBeenCalledOnce();
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    expect(result.current.draftStroke).toEqual(expect.objectContaining({
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]
    }));
  });

  it.each([
    ['pen', undefined, 'pen'],
    ['highlighter', undefined, 'highlighter'],
    ['eraser', 'pixel', 'pixel-eraser'],
  ])('finalizes a valid %s/%s draft at its last same-page sample before a gap', (tool, eraserMode, storedTool) => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const mapPoint = vi.fn(event => event.clientX >= 4
      ? null
      : { pageId: 'p1', x: event.clientX, y: event.clientY });
    const { result, commitStroke } = renderInkPointer({ tool, eraserMode, mapPoint });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 4, 5, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 5, 6, target)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 5, 6, target)));

    expect(commitStroke).toHaveBeenCalledOnce();
    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'p1',
      tool: storedTool,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    }));
    expect(result.current.draftStroke).toBeNull();
    expect(target.releasePointerCapture).toHaveBeenCalledOnce();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);

    act(() => result.current.onPointerDown(pointer(8, 'pen', 1, 7, target)));
    act(() => result.current.onPointerMove(pointer(8, 'pen', 3, 8, target)));
    act(() => result.current.onPointerUp(pointer(8, 'pen', 3, 8, target)));
    expect(commitStroke).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['pen', undefined, 'pen'],
    ['highlighter', undefined, 'highlighter'],
    ['eraser', 'pixel', 'pixel-eraser'],
  ])('finalizes a valid %s/%s draft without switching it onto another page', (tool, eraserMode, storedTool) => {
    const mapPoint = vi.fn(event => ({
      pageId: event.clientX >= 4 ? 'p2' : 'p1',
      x: event.clientX,
      y: event.clientY
    }));
    const { result, commitStroke } = renderInkPointer({ tool, eraserMode, mapPoint });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 4, 5)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 5, 6)));

    expect(commitStroke).toHaveBeenCalledOnce();
    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 'p1',
      tool: storedTool,
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    }));
    expect(result.current.draftStroke).toBeNull();
  });

  it('finishes a stroke eraser hit-test at the last valid sample before a gap', () => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const document = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }],
      strokes: [{
        id: 'line', pageId: 'p1', tool: 'pen', color: '#000000', width: 3, opacity: 1,
        points: [{ x: 0, y: 10 }, { x: 100, y: 10 }]
      }]
    };
    const { result, commitStroke, removeStrokes } = renderInkPointer({
      tool: 'eraser', eraserMode: 'stroke', width: 8, document,
      mapPoint: event => event.clientX >= 53
        ? null
        : { pageId: 'p1', x: event.clientX, y: event.clientY },
    });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 50, 13, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 52, 13, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 53, 13, target)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 54, 13, target)));

    expect(removeStrokes).toHaveBeenCalledOnce();
    expect(removeStrokes).toHaveBeenCalledWith(['line']);
    expect(commitStroke).not.toHaveBeenCalled();
    expect(result.current.draftStroke).toBeNull();
    expect(target.releasePointerCapture).toHaveBeenCalledOnce();
  });

  it('discards a draft when input policy cancels its owning pointer', () => {
    const { result, commitStroke } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerCancel(pointer(7, 'pen', 3, 4)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));

    expect(result.current.draftStroke).toBeNull();
    expect(commitStroke).not.toHaveBeenCalled();
  });

  it('does not commit a one-point draft when its owner lifts', () => {
    const { result, commitStroke } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 1, 2)));

    expect(commitStroke).not.toHaveBeenCalled();
  });

  it('commits pixel erasing as a destination-out stroke', () => {
    const { result, commitStroke } = renderInkPointer({ tool: 'eraser', eraserMode: 'pixel' });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));

    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'pixel-eraser',
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    }));
  });

  it('removes strokes intersected by a stroke eraser instead of committing an ink stroke', () => {
    const document = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }],
      strokes: [{
        id: 'line', pageId: 'p1', tool: 'pen', color: '#000000', width: 3, opacity: 1,
        points: [{ x: 0, y: 10 }, { x: 100, y: 10 }]
      }]
    };
    const { result, commitStroke, removeStrokes } = renderInkPointer({
      tool: 'eraser', eraserMode: 'stroke', width: 8, document
    });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 50, 13)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 52, 13)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 52, 13)));

    expect(removeStrokes).toHaveBeenCalledWith(['line']);
    expect(commitStroke).not.toHaveBeenCalled();
  });

  it('treats the stroke-eraser integration tool as a hit-test command, never an ink stroke', () => {
    const document = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }],
      strokes: [{
        id: 'line', pageId: 'p1', tool: 'pen', color: '#000000', width: 3, opacity: 1,
        points: [{ x: 0, y: 10 }, { x: 100, y: 10 }]
      }]
    };
    const { result, commitStroke, removeStrokes } = renderInkPointer({
      tool: 'stroke-eraser', width: 8, document
    });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 50, 13)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 52, 13)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 52, 13)));

    expect(removeStrokes).toHaveBeenCalledOnce();
    expect(removeStrokes).toHaveBeenCalledWith(['line']);
    expect(commitStroke).not.toHaveBeenCalled();
  });

  it('keeps a boundary-finished first finger as navigation when a second finger goes down', () => {
    const mapPoint = event => event.pointerId === 1 && event.clientX >= 3
      ? null
      : { pageId: 'p1', x: event.clientX, y: event.clientY };
    const { result, commitStroke } = renderInkPointer({ inputMode: 'finger', mapPoint });

    act(() => result.current.onPointerDown(pointer(1, 'touch', 1, 2)));
    act(() => result.current.onPointerMove(pointer(1, 'touch', 2, 3)));
    act(() => result.current.onPointerMove(pointer(1, 'touch', 3, 4)));
    act(() => result.current.onPointerDown(pointer(2, 'touch', 5, 6)));
    act(() => result.current.onPointerMove(pointer(2, 'touch', 7, 8)));
    act(() => result.current.onPointerUp(pointer(2, 'touch', 7, 8)));
    act(() => result.current.onPointerUp(pointer(1, 'touch', 3, 4)));

    expect(result.current.draftStroke).toBeNull();
    expect(commitStroke).toHaveBeenCalledOnce();
    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 1, y: 2 }, { x: 2, y: 3 }],
    }));
  });

  it('releases pointer capture when its owner finishes', () => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const { result } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4, target)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4, target)));

    expect(target.releasePointerCapture).toHaveBeenCalledOnce();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('releases pointer capture when input policy cancels its owner', () => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const { result } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2, target)));
    act(() => result.current.onPointerCancel(pointer(7, 'pen', 3, 4, target)));

    expect(target.releasePointerCapture).toHaveBeenCalledOnce();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('cancels and releases a finger draft when a second finger starts', () => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const { result, commitStroke } = renderInkPointer({ inputMode: 'finger' });

    act(() => result.current.onPointerDown(pointer(1, 'touch', 1, 2, target)));
    act(() => result.current.onPointerDown(pointer(2, 'touch', 3, 4)));

    expect(result.current.draftStroke).toBeNull();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(commitStroke).not.toHaveBeenCalled();
  });

  it('keeps a pixel eraser draft pixel-based when the active mode changes before release', () => {
    const commitStroke = vi.fn();
    const removeStrokes = vi.fn();
    const document = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }],
      strokes: [{
        id: 'line', pageId: 'p1', tool: 'pen', color: '#000000', width: 3, opacity: 1,
        points: [{ x: 0, y: 10 }, { x: 100, y: 10 }]
      }]
    };
    const { result, rerender } = renderHook(({ eraserMode }) => useInkPointer({
      inputMode: 'stylus', tool: 'eraser', eraserMode, color: '#ffffff', width: 8,
      document, commitStroke, removeStrokes,
      mapPoint: event => ({ pageId: 'p1', x: event.clientX, y: event.clientY })
    }), { initialProps: { eraserMode: 'pixel' } });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 50, 13)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 52, 13)));
    rerender({ eraserMode: 'stroke' });
    act(() => result.current.onPointerUp(pointer(7, 'pen', 52, 13)));

    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({ tool: 'pixel-eraser' }));
    expect(removeStrokes).not.toHaveBeenCalled();
  });

  it.each([
    ['pen', undefined],
    ['eraser', 'pixel'],
    ['eraser', 'stroke'],
  ])('discards an active %s/%s draft when its page is removed before release', (tool, eraserMode) => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const document = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }, { id: 'p2' }],
      strokes: [{
        id: 'line', pageId: 'p2', tool: 'pen', color: '#000000', width: 3, opacity: 1,
        points: [{ x: 0, y: 10 }, { x: 100, y: 10 }]
      }]
    };
    const { result, rerender, commitStroke, removeStrokes } = renderChangingInkPointer({
      tool,
      eraserMode,
      width: 8,
      document,
      mapPoint: event => ({ pageId: 'p2', x: event.clientX, y: event.clientY }),
    });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 50, 13, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 52, 13, target)));
    rerender({
      tool,
      eraserMode,
      width: 8,
      document: { ...document, pages: [{ id: 'p1' }] },
      mapPoint: event => ({ pageId: 'p2', x: event.clientX, y: event.clientY }),
    });
    act(() => result.current.onPointerUp(pointer(7, 'pen', 52, 13, target)));

    expect(commitStroke).not.toHaveBeenCalled();
    expect(removeStrokes).not.toHaveBeenCalled();
    expect(result.current.draftStroke).toBeNull();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it.each([
    ['pen', undefined],
    ['eraser', 'pixel'],
    ['eraser', 'stroke'],
  ])('discards an active %s/%s draft when the document changes before release', (tool, eraserMode) => {
    const target = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const firstDocument = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }],
      strokes: [{
        id: 'line', pageId: 'p1', tool: 'pen', color: '#000000', width: 3, opacity: 1,
        points: [{ x: 0, y: 10 }, { x: 100, y: 10 }]
      }]
    };
    const { result, rerender, commitStroke, removeStrokes } = renderChangingInkPointer({
      tool, eraserMode, width: 8, document: firstDocument,
    });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 50, 13, target)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 52, 13, target)));
    rerender({
      tool,
      eraserMode,
      width: 8,
      document: { ...firstDocument, documentId: 'doc-2' },
    });
    act(() => result.current.onPointerUp(pointer(7, 'pen', 52, 13, target)));

    expect(commitStroke).not.toHaveBeenCalled();
    expect(removeStrokes).not.toHaveBeenCalled();
    expect(result.current.draftStroke).toBeNull();
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('commits a valid draft across immutable updates to the same document', () => {
    const firstDocument = {
      documentId: 'doc-1',
      pages: [{ id: 'p1' }],
      strokes: [],
      updatedAt: 1,
    };
    const { result, rerender, commitStroke } = renderChangingInkPointer({ document: firstDocument });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
    rerender({ document: { ...firstDocument, updatedAt: 2 } });
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));

    expect(commitStroke).toHaveBeenCalledOnce();
  });
});
