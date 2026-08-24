import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useInkPointer from '../src/hooks/useInkPointer.js';

function pointer(pointerId, pointerType, clientX, clientY, currentTarget = undefined) {
  return { pointerId, pointerType, clientX, clientY, currentTarget };
}

function renderInkPointer(overrides = {}) {
  const commitStroke = vi.fn();
  const removeStrokes = vi.fn();
  const options = {
    inputMode: 'stylus',
    tool: 'pen',
    color: '#ffffff',
    width: 3,
    document: { strokes: [] },
    mapPoint: event => ({ pageId: 'p1', x: event.clientX, y: event.clientY }),
    commitStroke,
    removeStrokes,
    ...overrides
  };
  return { ...renderHook(() => useInkPointer(options)), commitStroke, removeStrokes };
}

describe('useInkPointer', () => {
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

  it('discards an incomplete draft when focus mapping returns no page point', () => {
    const mapPoint = vi.fn(event => event.clientX === 3
      ? null
      : { pageId: 'p1', x: event.clientX, y: event.clientY });
    const { result, commitStroke } = renderInkPointer({ mapPoint });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));

    expect(result.current.draftStroke).toBeNull();
    expect(commitStroke).not.toHaveBeenCalled();
  });

  it('discards a draft that crosses onto a different page', () => {
    const mapPoint = vi.fn(event => ({
      pageId: event.clientX < 3 ? 'p1' : 'p2',
      x: event.clientX,
      y: event.clientY
    }));
    const { result, commitStroke } = renderInkPointer({ mapPoint });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));

    expect(result.current.draftStroke).toBeNull();
    expect(commitStroke).not.toHaveBeenCalled();
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

  it('keeps a pixel eraser draft pixel-based when the active mode changes before release', () => {
    const commitStroke = vi.fn();
    const removeStrokes = vi.fn();
    const document = {
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
});
