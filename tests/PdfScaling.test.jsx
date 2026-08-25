import '@testing-library/jest-dom';
import { render, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PdfPageCanvas from '../src/components/document/PdfPageCanvas.jsx';
import { MAX_PAGE_CANVAS_PIXELS } from '../src/documents/fileImport.js';

describe('PdfPageCanvas Scaling', () => {
  it('scales PDF viewport to map native width to zoomed canonical width', async () => {
    const page = { id: 'p1', index: 0, width: 800, height: 1200 };
    const mockPdfPage = {
      getViewport: vi.fn(({ scale }) => ({ width: 400 * scale, height: 600 * scale })),
      render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
      cleanup: vi.fn(),
    };
    const sourceHandle = { document: { getPage: vi.fn().mockResolvedValue(mockPdfPage) } };
    
    // Render with zoom 1.5 and dpr 2
    // canonical width is 800, so visual width is 1200
    // dpr is 2, so backing width should be 2400
    // native width is 400 at scale 1.
    // scaleToCanonical = (800 * 1.5) / 400 = 1200 / 400 = 3
    // scale = scaleToCanonical * dpr = 3 * 2 = 6
    
    render(<PdfPageCanvas page={page} sourceHandle={sourceHandle} zoom={1.5} dpr={2} />);
    
    // Wait for async effect
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockPdfPage.getViewport).toHaveBeenCalledWith({ scale: 1 });
    expect(mockPdfPage.getViewport).toHaveBeenCalledWith({ scale: 6 });
  });
});
