import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SplitLayout from '../src/components/SplitLayout';

describe('SplitLayout', () => {
  it('renders DocumentView full-page by default, with WritingZone available via the split toggle', () => {
    render(<SplitLayout activeTab="smartCanvas" />);
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.queryByTestId('writing-zone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('layout-mode-btn'));
    expect(screen.getByTestId('writing-zone')).toBeInTheDocument();
  });

  it('renders TBD placeholder in delegation mode', () => {
    render(<SplitLayout activeTab="delegation" />);
    expect(screen.getByText('Delegation Mode (TBD)')).toBeInTheDocument();
  });

  it('exposes stylus input and pixel eraser as controller defaults to both views', () => {
    render(<SplitLayout activeTab="smartCanvas" documentId="note-1" />);

    expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', 'note-1');
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-input-mode', 'stylus');
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-eraser-mode', 'pixel');

    fireEvent.click(screen.getByTestId('layout-mode-btn'));
    expect(screen.getByTestId('writing-zone')).toHaveAttribute('data-document-id', 'note-1');
    expect(screen.getByTestId('writing-zone')).toHaveAttribute('data-input-mode', 'stylus');
    expect(screen.getByTestId('writing-zone')).toHaveAttribute('data-eraser-mode', 'pixel');
  });

  it('propagates note metadata to document view', () => {
    const note = {
      id: 'imported-layout', kind: 'imported', title: 'Blatt', subject: 'Mathe',
      source: { fileId: 'file-1', type: 'pdf' },
      pages: [
        { id: 'imported-layout-page-1', index: 0, width: 800, height: 1200 },
        { id: 'imported-layout-page-2', index: 1, width: 800, height: 400 },
      ],
    };
    render(<SplitLayout activeTab="smartCanvas" note={note} />);
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-kind', 'imported');
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-page-count', '2');
  });

  it('seeds the ruling toggle from the document instead of always defaulting to lined', () => {
    const note = { id: 'styled-3', title: 'Blatt', subject: '', ruling: 'grid' };
    const { container } = render(<SplitLayout activeTab="smartCanvas" note={note} />);
    // paperStyle flows into DocumentView's className as `paper-style-${paperStyle}`.
    expect(container.querySelector('.paper-style-grid')).toBeTruthy();
  });
});
