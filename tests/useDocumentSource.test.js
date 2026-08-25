import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it,
  vi,
} from 'vitest';
import useDocumentSource from '../src/hooks/useDocumentSource.js';

describe('useDocumentSource', () => {
  it('loads file record and opens a PDF handle, disposing on unmount', async () => {
    const dispose = vi.fn(async () => {});
    const handle = { document: { numPages: 2 }, dispose };
    const openPdf = vi.fn(async () => handle);
    const repository = {
      getFile: vi.fn().mockResolvedValue({ id: 'file-1', blob: new Blob(['pdf'], { type: 'application/pdf' }) }),
    };
    const note = { id: 'n-1', kind: 'imported', source: { fileId: 'file-1', type: 'pdf' } };
    const { result, unmount } = renderHook(() => useDocumentSource({ note, repository, openPdf }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sourceHandle).toBe(handle);
    unmount();
    await waitFor(() => expect(dispose).toHaveBeenCalled());
  });

  it('exposes an error state when the repository file is missing', async () => {
    const repository = { getFile: vi.fn().mockRejectedValue(new Error('file-not-found')) };
    const note = { id: 'n-1', kind: 'imported', source: { fileId: 'missing', type: 'image' } };
    const { result } = renderHook(() => useDocumentSource({ note, repository }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatchObject({ message: 'file-not-found' });
    expect(result.current.sourceHandle).toBe(null);
  });

  it('returns idle state when note has no source', () => {
    const { result } = renderHook(() => useDocumentSource({ note: { id: 'blank' } }));
    expect(result.current.loading).toBe(false);
    expect(result.current.sourceHandle).toBe(null);
    expect(result.current.error).toBe(null);
  });
});
