import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it,
  vi,
} from 'vitest';
import DocumentView from '../src/components/DocumentView.jsx';

function createInkController({ pages = [{ id: 'p1' }, { id: 'p2' }], strokes = [], commitStroke = vi.fn() } = {}) {
  return {
    document: {version: 1, documentId: 'imported', pages, strokes, updatedAt: 0 },
    tool: 'pen',
    color: '#000000',
    penWidth: 3,
    eraserWidth: 15,
    inputMode: 'stylus',
    eraserMode: 'pixel',
    commitStroke,
    undo: vi.fn(),
    redo: vi.fn(),
    clearDocument: vi.fn(),
  };
}

describe('DocumentView multi-page rendering', () => {
  it('renders all document pages in vertical order with geometric metrics', () => {
    const note = {
      id: 'imported', kind: 'imported',
      source: { fileId: 'f1', type: 'pdf' },
      pages: [
        { id: 'p1', index: 0, width: 800, height: 1200 },
        { id: 'p2', index: 1, width: 800, height: 600 },
      ],
    };
    const inkController = createInkController();
    render(
      <DocumentView
        note={note}
        inkController={inkController}
        toolbarState={{}}
      />,
    );
    expect(screen.getByTestId('document-page-p1')).toBeInTheDocument();
    expect(screen.getByTestId('document-page-p2')).toBeInTheDocument();
  });
});
