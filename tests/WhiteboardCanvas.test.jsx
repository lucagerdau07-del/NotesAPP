// tests/WhiteboardCanvas.test.jsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WhiteboardCanvas from '../src/components/document/WhiteboardCanvas.jsx';
import * as renderInk from '../src/ink/renderInk.js';

afterEach(() => vi.restoreAllMocks());

function stubContext() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  return ctx;
}

describe('WhiteboardCanvas', () => {
  it('sizes the canvas backing store to the viewport at the given dpr', () => {
    stubContext();
    const { getByTestId } = render(
      <WhiteboardCanvas pageId="p1" strokes={[]} camera={{ x: 0, y: 0, scale: 1 }} width={400} height={300} dpr={2} />,
    );
    const canvas = getByTestId('whiteboard-canvas');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('draws only strokes belonging to this page, transformed by the camera', () => {
    stubContext();
    const spy = vi.spyOn(renderInk, 'renderInkStroke');
    const strokes = [
      { id: 's1', pageId: 'p1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { id: 's2', pageId: 'other-page', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ];
    render(
      <WhiteboardCanvas
        pageId="p1"
        strokes={strokes}
        camera={{ x: 50, y: 20, scale: 2 }}
        width={400}
        height={300}
        dpr={1}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      strokes[0],
      { offsetX: -100, offsetY: -40, scaleX: 2, scaleY: 2 },
    );
  });

  it('also draws the live draft stroke when present', () => {
    stubContext();
    const spy = vi.spyOn(renderInk, 'renderInkStroke');
    const draftStroke = { id: 'draft', pageId: 'p1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    render(
      <WhiteboardCanvas
        pageId="p1"
        strokes={[]}
        draftStroke={draftStroke}
        camera={{ x: 0, y: 0, scale: 1 }}
        width={400}
        height={300}
        dpr={1}
      />,
    );
    expect(spy).toHaveBeenCalledWith(expect.anything(), draftStroke, expect.anything());
  });
});
