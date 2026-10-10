import '@testing-library/jest-dom';
import { render, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PdfPageCanvas from '../src/components/document/PdfPageCanvas.jsx';

const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function mockPdf() {
  let releaseRender = () => {};
  const page = {
    getViewport: vi.fn(({ scale }) => ({ width: 400 * scale, height: 600 * scale })),
    render: vi.fn(() => ({
      promise: new Promise((resolve) => { releaseRender = resolve; }),
      cancel: vi.fn(),
    })),
    cleanup: vi.fn(),
  };
  return {
    page,
    release: () => releaseRender(),
    sourceHandle: { document: { getPage: vi.fn().mockResolvedValue(page) } },
  };
}

describe('PdfPageCanvas Scaling', () => {
  it('scales PDF viewport to map native width to zoomed canonical width', async () => {
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const pdf = mockPdf();

    // canonical width is 800, so at zoom 1.5 the visual width is 1200
    // native width is 400 at scale 1, dpr is 1
    // scale = (800 * 1.5 * 1) / 400 = 3
    render(<PdfPageCanvas page={page} sourceHandle={pdf.sourceHandle} zoom={1.5} dpr={1} />);
    await flush();

    expect(pdf.page.getViewport).toHaveBeenCalledWith({ scale: 1 });
    expect(pdf.page.getViewport).toHaveBeenCalledWith(
      expect.objectContaining({ scale: 3 }),
    );
  });

  it('renders only the windowed slice, at the same scale and offset into the page', async () => {
    // Zoomed in, a whole-page canvas costs zoom² pixels and is mostly off
    // screen. The window keeps the scale — text stays as sharp — and moves the
    // origin, so only what is on screen is allocated and rasterised.
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const pdf = mockPdf();

    const { container } = render(
      <PdfPageCanvas
        page={page}
        sourceHandle={pdf.sourceHandle}
        zoom={2}
        dpr={1}
        canvasWindow={{ left: 400, top: 900, width: 800, height: 600 }}
      />,
    );
    await flush();
    pdf.release();
    await flush();

    expect(pdf.page.getViewport).toHaveBeenCalledWith({
      scale: 4, // (800 * 2 * 1) / 400 — unchanged by the window
      offsetX: -400,
      offsetY: -900,
    });
    const canvas = container.querySelector('canvas:last-of-type');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(canvas.style.left).toBe('400px');
    expect(canvas.style.top).toBe('900px');
  });

  it('never clears the on-screen canvas while the new zoom level renders', async () => {
    // Assigning width/height clears a canvas, and pdf.js needs 100-400ms to
    // refill one at these sizes. Doing it to the live canvas showed whatever
    // is behind it for the whole gap: the flash on every pinch.
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const pdf = mockPdf();

    const { container, rerender } = render(
      <PdfPageCanvas page={page} sourceHandle={pdf.sourceHandle} zoom={1} dpr={1} />
    );
    await flush(); // getPage resolves, render() starts
    pdf.release();
    await flush(); // first paint lands in the live canvas

    const canvas = container.querySelector('canvas');
    expect(canvas.width).toBe(800);

    // Zoom in: the re-render is in flight and must not have touched it yet.
    rerender(<PdfPageCanvas page={page} sourceHandle={pdf.sourceHandle} zoom={2} dpr={1} />);
    await flush();
    expect(canvas.width).toBe(800);
    expect(canvas.style.width).toBe('1600px'); // box already follows the zoom

    pdf.release();
    await flush();
    expect(canvas.width).toBe(1600);
  });
});
