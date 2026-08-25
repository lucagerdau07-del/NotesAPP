import { describe, expect, it, vi } from 'vitest';
import { createDocumentImporter } from '../src/documents/documentImporter.js';

const pdfFile = () => new File(['pdf'], '  Analysis.Blatt.PDF ', { type: 'application/pdf' });
const dependencies = (overrides = {}) => ({
  repository: { saveImportedDocument: vi.fn(async value => value.note) },
  inspectPdf: vi.fn(async () => [{ width: 600, height: 900 }, { width: 900, height: 600 }]),
  inspectImage: vi.fn(),
  uuid: vi.fn().mockReturnValueOnce('note-id').mockReturnValueOnce('file-id'),
  now: vi.fn(() => 1234),
  ...overrides,
});

describe('document importer', () => {
  it('inspects, maps, atomically saves, and returns a PDF note', async () => {
    const deps = dependencies();
    const importer = createDocumentImporter(deps);
    const note = await importer.importFiles([pdfFile()], { subject: 'Mathe' });
    expect(note).toMatchObject({
      id: 'note-id', title: 'Analysis.Blatt', subject: 'Mathe',
      source: { fileId: 'file-id', type: 'pdf' },
    });
    expect(note.pages.map(page => page.height)).toEqual([1200, 800 * 600 / 900]);
    expect(deps.repository.saveImportedDocument).toHaveBeenCalledWith({
      note,
      file: expect.objectContaining({ id: 'file-id', mimeType: 'application/pdf', blob: expect.any(Blob) }),
    });
  });

  it('maps password errors and writes nothing', async () => {
    const deps = dependencies({ inspectPdf: vi.fn(async () => { throw Object.assign(new Error('password'), { name: 'PasswordException' }); }) });
    await expect(createDocumentImporter(deps).importFiles([pdfFile()], { subject: '' }))
      .rejects.toMatchObject({ code: 'password-protected' });
    expect(deps.repository.saveImportedDocument).not.toHaveBeenCalled();
  });

  it('rejects an oversized decoded image before persistence', async () => {
    const deps = dependencies({ inspectImage: vi.fn(async () => [{ width: 10_000, height: 5_000 }]) });
    const image = new File(['png'], 'scan.png', { type: 'image/png' });
    await expect(createDocumentImporter(deps).importFiles([image], { subject: 'Kunst' }))
      .rejects.toMatchObject({ code: 'image-too-large' });
    expect(deps.repository.saveImportedDocument).not.toHaveBeenCalled();
  });
});
