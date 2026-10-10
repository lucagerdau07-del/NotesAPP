import { describe, expect, it, vi } from 'vitest';
import {
  changedInkRegion,
  renderInkDocument,
  renderInkStroke,
  resizeInkCanvas,
} from '../src/ink/renderInk.js';

function createContextDouble() {
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  };
  const states = [];
  context.save = vi.fn(() => states.push({
    globalAlpha: context.globalAlpha,
    globalCompositeOperation: context.globalCompositeOperation,
    strokeStyle: context.strokeStyle,
    lineWidth: context.lineWidth,
    lineCap: context.lineCap,
    lineJoin: context.lineJoin,
  }));
  context.restore = vi.fn(() => Object.assign(context, states.pop()));
  context.setTransform = vi.fn();
  context.clearRect = vi.fn();
  context.beginPath = vi.fn();
  context.moveTo = vi.fn();
  context.lineTo = vi.fn();
  context.drawn = [];
  context.stroke = vi.fn(() => context.drawn.push({
    globalAlpha: context.globalAlpha,
    globalCompositeOperation: context.globalCompositeOperation,
    strokeStyle: context.strokeStyle,
    lineWidth: context.lineWidth,
  }));
  return context;
}

const highlighter = {
  id: 'h', pageId: 'p1', tool: 'highlighter', color: '#ffee00',
  width: 15, opacity: 0.32,
  points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
};

describe('deterministic complete-path ink renderer', () => {
  it('renders a highlighter as one translucent complete path', () => {
    const context = createContextDouble();

    renderInkStroke(context, highlighter, { offsetX: 0, offsetY: 0, scale: 2 });

    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.moveTo).toHaveBeenCalledWith(2, 4);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 10, 12);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(context.globalAlpha).toBe(1);
  });

  it('gives a tap a path with length, since a zero-length one paints nothing', () => {
    // Skia drops a subpath that goes nowhere, round cap and all, so a dot built
    // from two identical points never reached the screen.
    const context = createContextDouble();

    renderInkStroke(
      context,
      { id: 'd', pageId: 'p1', tool: 'pen', color: '#fff', width: 3, opacity: 1,
        points: [{ x: 5, y: 7 }, { x: 5, y: 7 }] },
      { offsetX: 0, offsetY: 0, scale: 1 },
    );

    expect(context.moveTo).toHaveBeenCalledWith(5, 7);
    expect(context.lineTo).toHaveBeenLastCalledWith(5.01, 7);
    expect(context.stroke).toHaveBeenCalledTimes(1);
  });

  it('leaves a stroke that actually travelled untouched', () => {
    const context = createContextDouble();

    renderInkStroke(context, highlighter, { offsetX: 0, offsetY: 0, scale: 1 });

    expect(context.lineTo).toHaveBeenLastCalledWith(5, 6);
  });

  it('uses independent axes when supplied instead of the uniform scale', () => {
    const context = createContextDouble();

    renderInkStroke(context, highlighter, {
      offsetX: 10, offsetY: 20, scale: 99, scaleX: 2, scaleY: 3,
    });

    expect(context.moveTo).toHaveBeenCalledWith(12, 26);
    expect(context.lineTo).toHaveBeenLastCalledWith(20, 38);
    expect(context.drawn[0].lineWidth).toBe(30);
  });

  it('isolates an eraser path state from the surrounding context', () => {
    const context = createContextDouble();
    context.globalAlpha = 0.7;
    context.globalCompositeOperation = 'multiply';
    context.strokeStyle = '#123456';
    context.lineWidth = 9;

    renderInkStroke(context, {
      ...highlighter, tool: 'pixel-eraser', color: '#ffffff', opacity: 1,
    }, { offsetX: 0, offsetY: 0, scale: 1 });

    expect(context.globalAlpha).toBe(0.7);
    expect(context.globalCompositeOperation).toBe('multiply');
    expect(context.strokeStyle).toBe('#123456');
    expect(context.lineWidth).toBe(9);
    expect(context.drawn[0]).toMatchObject({
      globalCompositeOperation: 'destination-out', globalAlpha: 1,
    });
    expect(context.save).toHaveBeenCalledTimes(1);
    expect(context.restore).toHaveBeenCalledTimes(1);
  });

  it('thins a pen run where its samples carry light pressure', () => {
    const context = createContextDouble();

    renderInkStroke(context, {
      id: 'p', pageId: 'p1', tool: 'pen', color: '#000000', width: 8, opacity: 1,
      points: [{ x: 0, y: 0, p: 0.1 }, { x: 1, y: 1, p: 0.1 }, { x: 2, y: 2, p: 0.9 }],
    }, { offsetX: 0, offsetY: 0, scale: 1 });

    expect(context.drawn.map(entry => entry.lineWidth)).toEqual([4, 8]);
  });

  it('never tapers an eraser: a light patch has to wipe full width', () => {
    const context = createContextDouble();

    renderInkStroke(context, {
      ...highlighter, tool: 'pixel-eraser', width: 8,
      points: [{ x: 0, y: 0, p: 0.1 }, { x: 1, y: 1, p: 0.9 }],
    }, { offsetX: 0, offsetY: 0, scale: 1 });

    expect(context.drawn.map(entry => entry.lineWidth)).toEqual([8]);
  });

  it('does not render incomplete strokes', () => {
    const context = createContextDouble();

    renderInkStroke(context, { ...highlighter, points: [{ x: 1, y: 2 }] }, {
      offsetX: 0, offsetY: 0, scale: 1,
    });

    expect(context.beginPath).not.toHaveBeenCalled();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it('clears once and places later pages after their visible gap', () => {
    const context = createContextDouble();
    const document = {
      pages: [{ id: 'p1' }, { id: 'p2' }],
      strokes: [{ ...highlighter, pageId: 'p2', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
    };
    const layout = {
      pageIds: ['p1', 'p2'], pageWidth: 100, pageHeight: 200, pageGap: 30,
      zoom: 2, showPageBreaks: true, cssWidth: 300, cssHeight: 500, dpr: 2,
    };

    renderInkDocument(context, document, layout);

    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 300, 500);
    expect(context.moveTo).toHaveBeenCalledWith(2, 434);
    expect(context.globalAlpha).toBe(1);
  });

  it('resizes only the canvas backing store to DPR dimensions when needed', () => {
    const canvas = { width: 200, height: 100, style: { width: 'old', height: 'old' } };

    resizeInkCanvas(canvas, 100, 50, 2);

    expect(canvas).toMatchObject({ width: 200, height: 100 });
    expect(canvas.style).toEqual({ width: 'old', height: 'old' });
    resizeInkCanvas(canvas, 100.5, 50.5, 2);
    expect(canvas).toMatchObject({ width: 201, height: 101 });
  });

  it('clamps huge dimensions to MAX_CANVAS_DIMENSION to preserve GPU acceleration', () => {
    const canvas = { width: 0, height: 0, style: {} };

    resizeInkCanvas(canvas, 5000, 10000, 2);

    expect(canvas.width).toBeLessThanOrEqual(4096);
    expect(canvas.height).toBeLessThanOrEqual(4096);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_000_000);
  });
});

describe('partial ink redraw', () => {
  const stroke = (id, x, y) => ({
    id, pageId: 'p1', tool: 'pen', color: '#fff', width: 4, opacity: 1,
    points: [{ x, y }, { x: x + 10, y: y + 10 }],
  });
  const layout = {
    pageIds: ['p1'], pageLayouts: [{ id: 'p1', top: 0 }], zoom: 2, cssWidth: 1600, cssHeight: 2262,
  };

  it('finds only what changed, and redraws just the strokes touching it', () => {
    const near = stroke('near', 100, 100);
    const far = stroke('far', 600, 900);
    const before = [near, far];
    const added = stroke('added', 104, 104);
    const after = [...before, added];
    const document = { pages: [{ id: 'p1' }], strokes: after };

    expect(changedInkRegion(before, before, document, layout)).toBeNull();
    // A draft painted live but never committed still has to be repaired.
    expect(changedInkRegion(before, before, document, layout, [stroke('palm', 300, 300)])).toMatchObject({ minX: 594, maxX: 626 });

    const region = changedInkRegion(before, after, document, layout);
    // Page units x zoom 2, padded by half the width (4 x 2 / 2) plus 2px of
    // anti-aliasing: 104 * 2 - 6 ... 114 * 2 + 6.
    expect(region).toEqual({ minX: 202, minY: 202, maxX: 234, maxY: 234 });

    const context = createContextDouble();
    context.canvas = { width: 2400, height: 3393 };
    context.rect = vi.fn();
    context.clip = vi.fn();
    renderInkDocument(context, document, layout, region);

    // Snapped out to whole device pixels (canvas px per CSS px = 1.5).
    expect(context.rect).toHaveBeenCalledWith(303, 303, 48, 48);
    expect(context.clearRect).toHaveBeenCalledWith(303, 303, 48, 48);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    // near and added overlap the region, far does not.
    expect(context.stroke).toHaveBeenCalledTimes(2);
  });
});
