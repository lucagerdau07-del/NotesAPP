import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useDocumentLibrary from '../src/hooks/useDocumentLibrary.js';

describe('useDocumentLibrary thumbnails', () => {
  it('renders and stores a preview once for imports that lack one', async () => {
    const notes = [
      { id: 'a', source: { fileId: 'fa', type: 'pdf' } },
      { id: 'b', source: { fileId: 'fb', type: 'image' }, thumbnail: 'data:old' },
    ];
    const repository = {
      listImportedNotes: vi.fn(async () => notes),
      getFile: vi.fn(async () => ({ blob: 'blob' })),
      saveImportedThumbnail: vi.fn(async () => {}),
    };
    const thumbnailer = vi.fn(async () => 'data:new');
    const indexSources = vi.fn();
    const options = { repository, importer: {}, indexSources, thumbnailer };
    const { result } = renderHook(() => useDocumentLibrary(options));
    await waitFor(() => expect(result.current.importedNotes[0].thumbnail).toBe('data:new'));
    expect(thumbnailer).toHaveBeenCalledTimes(1);
    expect(thumbnailer).toHaveBeenCalledWith('blob', 'pdf');
    expect(repository.saveImportedThumbnail).toHaveBeenCalledWith('a', 'data:new');
    expect(result.current.importedNotes[1].thumbnail).toBe('data:old');
  });
});
