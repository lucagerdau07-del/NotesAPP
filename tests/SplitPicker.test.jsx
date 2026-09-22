import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SplitPicker from '../src/components/SplitPicker.jsx';
import { browserNoteRepository } from '../src/storage/noteRepository.js';

function documentLibraryOptions(notes = []) {
  return { repository: { listImportedNotes: vi.fn(async () => notes) } };
}

describe('SplitPicker', () => {
  it('lists created and imported notes, excluding ones already open', async () => {
    browserNoteRepository.saveNote({ id: 'note-a', title: 'Ableitungsregeln', subject: 'Mathe' });
    browserNoteRepository.saveNote({ id: 'note-b', title: 'Titrationskurve', subject: 'Chemie' });
    const imported = { id: 'import-1', kind: 'imported', title: 'Eingescanntes Blatt', subject: 'Kunst' };

    render(
      <SplitPicker
        excludeIds={['note-b']}
        onPick={vi.fn()}
        onClose={vi.fn()}
        documentLibraryOptions={documentLibraryOptions([imported])}
      />,
    );

    expect(await screen.findByText('Ableitungsregeln')).toBeInTheDocument();
    expect(await screen.findByText('Eingescanntes Blatt')).toBeInTheDocument();
    expect(screen.queryByText('Titrationskurve')).not.toBeInTheDocument();
  });

  it('filters by search query across title and subject', async () => {
    browserNoteRepository.saveNote({ id: 'note-a', title: 'Ableitungsregeln', subject: 'Mathe' });
    browserNoteRepository.saveNote({ id: 'note-b', title: 'Titrationskurve', subject: 'Chemie' });

    render(
      <SplitPicker
        onPick={vi.fn()}
        onClose={vi.fn()}
        documentLibraryOptions={documentLibraryOptions()}
      />,
    );

    await screen.findByText('Ableitungsregeln');
    fireEvent.change(screen.getByLabelText('Notizen durchsuchen'), { target: { value: 'chemie' } });

    expect(screen.queryByText('Ableitungsregeln')).not.toBeInTheDocument();
    expect(screen.getByText('Titrationskurve')).toBeInTheDocument();
  });

  it('calls onPick with the chosen note and onClose from the close button', async () => {
    browserNoteRepository.saveNote({ id: 'note-a', title: 'Ableitungsregeln', subject: 'Mathe' });
    const onPick = vi.fn();
    const onClose = vi.fn();

    render(
      <SplitPicker
        onPick={onPick}
        onClose={onClose}
        documentLibraryOptions={documentLibraryOptions()}
      />,
    );

    fireEvent.click(await screen.findByText('Ableitungsregeln'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-a', title: 'Ableitungsregeln' }));

    fireEvent.click(screen.getByTestId('split-picker-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an empty state when nothing else is available', async () => {
    render(
      <SplitPicker
        onPick={vi.fn()}
        onClose={vi.fn()}
        documentLibraryOptions={documentLibraryOptions()}
      />,
    );

    expect(await screen.findByText('Keine weiteren Dokumente gefunden.')).toBeInTheDocument();
  });
});
