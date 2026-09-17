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
    const touch = (timeStamp) => ({ pointerId: 9, pointerType: 'touch', timeStamp });
    expect(result.current.shouldBlockTouch(touch(1_010))).toBe(true);
    act(() => result.current.onPointerUp({ ...pointer(7, 'pen', 1, 2), timeStamp: 1_100 }));
    // The pen was last seen at 1_100, so the hover guard outlasts the pen-up guard.
    expect(result.current.shouldBlockTouch(touch(1_699))).toBe(true);
    expect(result.current.shouldBlockTouch(touch(1_700))).toBe(false);
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

  it('appends coalesced samples and reports the appended range without re-rendering', () => {
    const onDraftAppend = vi.fn();
    const { result } = renderInkPointer({ onDraftAppend });

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    const draftAfterDown = result.current.draftStroke;

    const move = pointer(7, 'pen', 9, 9);
    move.nativeEvent = {
      getCoalescedEvents: () => [pointer(7, 'pen', 3, 4), pointer(7, 'pen', 5, 6), pointer(7, 'pen', 7, 8)],
    };
    act(() => result.current.onPointerMove(move));

    expect(onDraftAppend).toHaveBeenCalledOnce();
    const [draft, appendedFrom] = onDraftAppend.mock.calls[0];
    expect(appendedFrom).toBe(1);
    expect(draft.points).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }, { x: 7, y: 8 }]);
    // Same live object, so React never re-renders mid-stroke.
    expect(result.current.draftStroke).toBe(draftAfterDown);
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

  it('commits a tap as a dot: a zero-length two-point stroke', () => {
    const { result, commitStroke } = renderInkPointer();

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
    act(() => result.current.onPointerUp(pointer(7, 'pen', 1, 2)));

    expect(commitStroke).toHaveBeenCalledOnce();
    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 1, y: 2 }, { x: 1, y: 2 }],
    }));
  });

  it('dots a quick touch tap but drops a long graze', () => {
    const graze = renderInkPointer();
    act(() => graze.result.current.onPointerDown(pointer(7, 'touch', 1, 2, undefined, 0)));
    act(() => graze.result.current.onPointerUp(pointer(7, 'touch', 1, 2, undefined, 900)));
    expect(graze.commitStroke).not.toHaveBeenCalled();

    const tap = renderInkPointer();
    act(() => tap.result.current.onPointerDown(pointer(8, 'touch', 1, 2, undefined, 0)));
    act(() => tap.result.current.onPointerUp(pointer(8, 'touch', 1, 2, undefined, 60)));
    expect(tap.commitStroke).toHaveBeenCalledOnce();
  });

  // Regression: a passive capacitive stylus tip reads far fatter than a real
  // digitizer pen (and contactClassifier's own notes clock a single contact
  // swinging 1-34px on the tablet this was measured on) — so gating the tap on
  // contact size rejected real taps from that stylus outright. Duration alone
  // decides now; a wide but quick contact still has to dot.
  it('dots a quick tap even from a fat capacitive-stylus contact', () => {
    const { result, commitStroke } = renderInkPointer();
    const fat = { ...pointer(9, 'touch', 1, 2, undefined, 0), width: 32, height: 32 };
    act(() => result.current.onPointerDown(fat));
    act(() => result.current.onPointerUp({ ...fat, timeStamp: 60 }));
    expect(commitStroke).toHaveBeenCalledOnce();
  });

  it('records pen pressure per sample and leaves flat readings out', () => {
    const { result, commitStroke } = renderInkPointer();
    const withPressure = (clientX, pressure) =>
      ({ ...pointer(7, 'pen', clientX, 2), pressure });

    act(() => result.current.onPointerDown(withPressure(1, 0.2)));
    act(() => result.current.onPointerMove(withPressure(2, 0.8)));
    act(() => result.current.onPointerMove(withPressure(3, 1)));
    act(() => result.current.onPointerUp(withPressure(3, 1)));

    expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 1, y: 2, p: 0.2 }, { x: 2, y: 2, p: 0.8 }, { x: 3, y: 2 }],
    }));
  });

  it('does not re-render when a stroke starts', () => {
    let renders = 0;
    const options = {
      inputMode: 'stylus',
      tool: 'pen',
      color: '#ffffff',
      width: 3,
      document: { documentId: 'doc-1', pages: [{ id: 'p1' }], strokes: [] },
      mapPoint: event => ({ pageId: 'p1', x: event.clientX, y: event.clientY }),
    };
    const { result } = renderHook(() => {
      renders += 1;
      return useInkPointer(options);
    });
    const before = renders;

    act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));

    expect(renders).toBe(before);
    expect(result.current.draftStroke).toEqual(expect.objectContaining({ points: [{ x: 1, y: 2 }] }));
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

describe('hold-to-convert', () => {
  function rectPoints(x, y, w, h, step = 4) {
    const points = [];
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    for (let i = 0; i < corners.length - 1; i += 1) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[i + 1];
      const segLen = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.round(segLen / step));
      for (let s = 0; s < steps; s += 1) points.push({ x: ax + (bx - ax) * (s / steps), y: ay + (by - ay) * (s / steps) });
    }
    points.push({ x, y });
    return points;
  }

  function drawPoints(result, points) {
    act(() => result.current.onPointerDown(pointer(7, 'pen', points[0].x, points[0].y)));
    for (const p of points.slice(1)) {
      act(() => result.current.onPointerMove(pointer(7, 'pen', p.x, p.y)));
    }
  }

  function rectSideStrokes(x, y, w, h, step = 4) {
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
    const sides = [];
    for (let i = 0; i < corners.length - 1; i += 1) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[i + 1];
      const segLen = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.round(segLen / step));
      const points = [];
      for (let s = 0; s <= steps; s += 1) points.push({ x: ax + (bx - ax) * (s / steps), y: ay + (by - ay) * (s / steps) });
      sides.push(points);
    }
    return sides;
  }

  it('turns a held rectangle-shaped draft into a shape object instead of ink', () => {
    vi.useFakeTimers();
    try {
      const addObject = vi.fn();
      const { result, commitStroke } = renderInkPointer({ addObject });
      const points = rectPoints(0, 0, 100, 60);

      drawPoints(result, points);
      act(() => vi.advanceTimersByTime(500));

      expect(addObject).toHaveBeenCalledWith(expect.objectContaining({
        type: 'rect', x: 0, y: 0, width: 100, height: 60,
      }));
      expect(result.current.draftStroke).toBeNull();

      act(() => result.current.onPointerUp(pointer(7, 'pen', points[points.length - 1].x, points[points.length - 1].y)));
      expect(commitStroke).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges a rectangle drawn as four separate held strokes into one shape object', () => {
    vi.useFakeTimers();
    try {
      const addObject = vi.fn();
      const { result, commitStroke, removeStrokes } = renderInkPointer({ addObject });
      const [top, right, bottom, left] = rectSideStrokes(0, 0, 100, 60);

      for (const side of [top, right, bottom]) {
        drawPoints(result, side);
        act(() => result.current.onPointerUp(pointer(7, 'pen', side[side.length - 1].x, side[side.length - 1].y)));
      }
      expect(commitStroke).toHaveBeenCalledTimes(3);
      const mergedIds = commitStroke.mock.calls.map((call) => call[0].id);

      drawPoints(result, left);
      act(() => vi.advanceTimersByTime(500));

      expect(addObject).toHaveBeenCalledWith(expect.objectContaining({ type: 'rect' }));
      expect(commitStroke).toHaveBeenCalledTimes(3);
      expect(removeStrokes).toHaveBeenCalledWith(expect.arrayContaining(mergedIds));
      expect(result.current.draftStroke).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits a rectangle-shaped draft as plain ink when lifted before the hold delay', () => {
    const addObject = vi.fn();
    const { result, commitStroke } = renderInkPointer({ addObject });
    const points = rectPoints(0, 0, 100, 60);

    drawPoints(result, points);
    act(() => result.current.onPointerUp(pointer(7, 'pen', points[points.length - 1].x, points[points.length - 1].y)));

    expect(addObject).not.toHaveBeenCalled();
    expect(commitStroke).toHaveBeenCalledOnce();
  });

  it('offers a held non-shape draft to onHoldWithoutShape once it commits as ink', () => {
    vi.useFakeTimers();
    try {
      const onHoldWithoutShape = vi.fn();
      const { result, commitStroke } = renderInkPointer({ onHoldWithoutShape, addObject: vi.fn() });
      const points = [
        { x: 0, y: 0 }, { x: 10, y: 30 }, { x: 20, y: 5 }, { x: 30, y: 35 },
        { x: 40, y: 0 }, { x: 50, y: 30 }, { x: 60, y: 5 },
      ];

      drawPoints(result, points);
      act(() => vi.advanceTimersByTime(500));
      expect(onHoldWithoutShape).not.toHaveBeenCalled();

      act(() => result.current.onPointerUp(pointer(7, 'pen', points[points.length - 1].x, points[points.length - 1].y)));

      expect(commitStroke).toHaveBeenCalledOnce();
      expect(onHoldWithoutShape).toHaveBeenCalledWith(commitStroke.mock.calls[0][0]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('retroactive palm removal', () => {
  it('removes a committed touch stroke once its contact turns out to be a palm', () => {
    const { result, commitStroke, removeStrokes } = renderInkPointer();

    act(() => {
      result.current.onPointerDown(pointer(1, 'touch', 10, 10, undefined, 1_000));
      result.current.onPointerMove(pointer(1, 'touch', 40, 40, undefined, 1_020));
      result.current.onPointerUp(pointer(1, 'touch', 40, 40, undefined, 1_040));
    });
    expect(commitStroke).toHaveBeenCalledTimes(1);
    const strokeId = commitStroke.mock.calls[0][0].id;

    act(() => {
      result.current.markPalm(1, 1_100);
    });
    expect(removeStrokes).toHaveBeenCalledWith([strokeId]);
  });

  it('does not remove a touch stroke older than the retroactive window', () => {
    const { result, commitStroke, removeStrokes } = renderInkPointer({ inputMode: 'finger' });

    act(() => {
      result.current.onPointerDown(pointer(1, 'touch', 10, 10, undefined, 1_000));
      result.current.onPointerMove(pointer(1, 'touch', 40, 40, undefined, 1_020));
      result.current.onPointerUp(pointer(1, 'touch', 40, 40, undefined, 1_040));
    });
    expect(commitStroke).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.markPalm(1, 1_040 + 5_000);
    });
    expect(removeStrokes).not.toHaveBeenCalled();
  });

  it('keeps ink from a finished contact when the platform hands its id to the next one', () => {
    // Reported from the device: write first, then rest the hand, and the
    // writing disappears. A pointerId names a contact only while that contact
    // is on the glass — the platform reissues the number to whatever lands
    // next. The hand inherits the tip's id, is recognised as a palm, and the
    // revocation buffer hands back the tip's stroke on its behalf.
    const { result, commitStroke, removeStrokes } = renderInkPointer();

    act(() => {
      result.current.onPointerDown(pointer(1, 'touch', 10, 10, undefined, 0));
      result.current.onPointerMove(pointer(1, 'touch', 60, 10, undefined, 16));
      result.current.onPointerUp(pointer(1, 'touch', 60, 10, undefined, 32));
    });
    expect(commitStroke).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onPointerDown(pointer(1, 'touch', 700, 900, undefined, 100));
      for (let step = 0; step < 6; step += 1) {
        result.current.onPointerMove(pointer(1, 'touch', 700, 900, undefined, 150 + step * 100));
      }
    });
    expect(removeStrokes).not.toHaveBeenCalled();
  });
});
