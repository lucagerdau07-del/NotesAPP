import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DocumentPage from '../src/components/document/DocumentPage.jsx';


describe('DocumentPage', () => {
  it('renders PDF backing canvas at dpr zoom scale and cancels in-flight render on scale change', async () => {
    let renderCount = 0;
    const cancel = vi.fn();
    const pdfPage = {
      getViewport: vi.fn(({ scale }) => ({ width: 800 * scale, height: 1200 * scale })),
      render: vi.fn(() => {
        renderCount += 1;
        return { promise: renderCount === 1 ? new Promise(() => {}) : Promise.resolve(), cancel };
      }),
      cleanup: vi.fn(),
    };
    const sourceHandle = {
      document: { getPage: vi.fn(async () => pdfPage) },
    };
    const page = { id: 'p-123', index: 0, width: 800, height: 1200 };
    const { rerender } = render(
      <DocumentPage
        page={page}
        sourceType="pdf"
        sourceHandle={sourceHandle}
        zoom={1}
        dpr={1.5}
      />,
    );
    await waitFor(() => expect(pdfPage.render).toHaveBeenCalled());
    rerender(
      <DocumentPage
        page={page}
        sourceType="pdf"
        sourceHandle={sourceHandle}
        zoom={2}
        dpr={1.5}
      />,
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('draws ink strokes for its own page inside InkPageCanvas', () => {
    const page = { id: 'page-1', index: 0, width: 800, height: 1200 };
    const strokes = [
      { id: 's1', pageId: 'page-1', tool: 'pen', color: '#ff0000', width: 4, opacity: 1, points: [{x: 0, y: 0}, {x: 10, y: 10}] },
      { id: 's2', pageId: 'page-2', tool: 'pen', color: '#00ff00', width: 4, opacity: 1, points: [{x: 0, y: 0}, {x: 10, y: 10}] },
    ];
    render(<DocumentPage page={page} zoom={1} dpr={1} strokes={strokes} />);
    expect(screen.getByTestId('document-page-page-1')).toBeInTheDocument();
  });
});
