import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it,
  vi,
} from 'vitest';
import Library from '../src/components/Library.jsx';

vi.mock('../src/hooks/useLiquidGlass.js', () => ({ default: vi.fn() }));

function documentLibraryOptions({ notes = [], importFiles = vi.fn() } = {}) {
  return {
    repository: { listImportedNotes: vi.fn(async () => notes) },
    importer: { importFiles },
  };
}

describe('Library file import', () => {
  it('opens a PDF from the accessible picker and forwards the active subject', async () => {
    const note = { id: 'import-1', kind: 'imported', title: 'Blatt', subject: 'Chemie', pages: [] };
    const importFiles = vi.fn(async () => note);
    const onOpenNote = vi.fn();
    render(<Library onOpenNote={onOpenNote} documentLibraryOptions={documentLibraryOptions({ importFiles })} />);
    fireEvent.click(screen.getByTestId('subject-tile-chemie'));
    const input = screen.getByTestId('file-import-input');
    fireEvent.change(input, { target: { files: [new File(['pdf'], 'blatt.pdf', { type: 'application/pdf' })] } });
    await waitFor(() => expect(importFiles).toHaveBeenCalledWith(expect.anything(), { subject: 'Chemie' }));
    expect(importFiles.mock.calls[0][0][0].name).toBe('blatt.pdf');
    expect(onOpenNote).toHaveBeenCalledWith(note);
  });

  it('shows a stable drop overlay through nested drag events and imports on drop', async () => {
    const importFiles = vi.fn(async () => ({ id: 'drop' }));
    render(<Library documentLibraryOptions={documentLibraryOptions({ importFiles })} />);
    const root = screen.getByTestId('liquid-glass-root');
    fireEvent.dragEnter(root);
    fireEvent.dragEnter(root.firstElementChild);
    expect(screen.getByText('Datei hier ablegen')).toBeInTheDocument();
    fireEvent.dragLeave(root.firstElementChild);
    expect(screen.getByText('Datei hier ablegen')).toBeInTheDocument();
    fireEvent.drop(root, { dataTransfer: { files: [new File(['png'], 'scan.png', { type: 'image/png' })] } });
    await waitFor(() => expect(importFiles).toHaveBeenCalled());
    expect(screen.queryByText('Datei hier ablegen')).not.toBeInTheDocument();
  });

  it('renders import errors and disables re-entry while busy', async () => {
    let rejectImport;
    const importFiles = vi.fn(() => new Promise((resolve, reject) => { rejectImport = reject; }));
    render(<Library documentLibraryOptions={documentLibraryOptions({ importFiles })} />);
    fireEvent.change(screen.getByTestId('file-import-input'), {
      target: { files: [new File(['pdf'], 'blatt.pdf', { type: 'application/pdf' })] },
    });
    expect(screen.getByRole('button', { name: 'Datei wird importiert' })).toBeDisabled();
    rejectImport(new Error('Datei zu groß'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Datei zu groß'));
  });
});
