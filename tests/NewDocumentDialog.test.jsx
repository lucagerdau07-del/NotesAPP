import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NewDocumentDialog from '../src/components/NewDocumentDialog.jsx';

describe('NewDocumentDialog', () => {
  it('renders nothing when closed', () => {
    render(<NewDocumentDialog open={false} onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('new-document-dialog')).not.toBeInTheDocument();
  });

  it('submits sensible defaults matching the current app-wide look', () => {
    const onCreate = vi.fn();
    render(<NewDocumentDialog open onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Neue Notiz',
      subject: '',
      pageKind: 'page',
      format: 'a4-portrait',
      background: 'dark',
      ruling: 'lined',
    });
  });

  it('prefills the title from a selected subject', () => {
    render(<NewDocumentDialog open subject="Mathe" onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText('Neue Mathe-Notiz')).toBeInTheDocument();
  });

  it('hides format/background/ruling once whiteboard is chosen', () => {
    render(<NewDocumentDialog open onCreate={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('new-doc-kind-whiteboard'));
    expect(screen.queryByTestId('new-doc-format-square')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-doc-background-white')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-doc-ruling-grid')).not.toBeInTheDocument();
  });

  it('submits the chosen options', () => {
    const onCreate = vi.fn();
    render(<NewDocumentDialog open onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('new-doc-title-input'), { target: { value: 'Physik Kapitel 3' } });
    fireEvent.click(screen.getByTestId('new-doc-format-square'));
    fireEvent.click(screen.getByTestId('new-doc-background-white'));
    fireEvent.click(screen.getByTestId('new-doc-ruling-grid'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Physik Kapitel 3',
      subject: '',
      pageKind: 'page',
      format: 'square',
      background: 'white',
      ruling: 'grid',
    });
  });

  it('closes on backdrop click and cancel button', () => {
    const onClose = vi.fn();
    render(<NewDocumentDialog open onCreate={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('new-doc-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('new-document-dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
