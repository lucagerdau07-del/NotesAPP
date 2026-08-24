import { describe, expect, it, vi } from 'vitest';
import {
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
});
