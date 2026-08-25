import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDocumentRepository } from '../src/storage/documentRepository.js';

const repositories = [];
const repo = () => {
  const repository = createDocumentRepository({ dbName: `test-${crypto.randomUUID()}` });
  repositories.push(repository);
  return repository;
};
const record = (id = 'note-1') => ({
  note: {
    schemaVersion: 1, id, kind: 'imported', title: 'Blatt', subject: 'Chemie',
    createdAt: 10, updatedAt: 10,
    source: { fileId: `file-${id}`, type: 'pdf' },
    pages: [{ id: `${id}-page-1`, index: 0, width: 800, height: 1100 }],
  },
  file: {
    id: `file-${id}`, name: 'blatt.pdf', mimeType: 'application/pdf', size: 3,
    blob: new Blob(['pdf'], { type: 'application/pdf' }), createdAt: 10,
  },
});
	afterEach(async () => Promise.all(repositories.splice(0).map(item => item.close())));

describe('document repository', () => {
  it('saves and reads one complete bundle', async () => {
    const repository = repo();
    await repository.saveImportedDocument(record());
    const bundle = await repository.getDocumentBundle('note-1');
    expect(bundle.note.title).toBe('Blatt');
    expect(await bundle.file.blob.text()).toBe('pdf');
  });

  it('lists newest notes first', async () => {
    const repository = repo();
    await repository.saveImportedDocument(record('old'));
    const newest = record('new');
    newest.note.updatedAt = 20;
    await repository.saveImportedDocument(newest);
    expect((await repository.listImportedNotes()).map(note => note.id)).toEqual(['new', 'old']);
  });

  it('rolls back the file write when the note record is invalid', async () => {
    const repository = repo();
    const value = record('broken');
    delete value.note.id;
    await expect(repository.saveImportedDocument(value)).rejects.toBeDefined();
    expect(await repository.getFile('file-broken')).toBeUndefined();
  });

  it('reports a missing file association with a stable error code', async () => {
    const repository = repo();
    const value = record('missing');
    await repository.saveImportedDocument(value);
    const db = await repository.database();
    await db.delete('files', value.file.id);
    await expect(repository.getDocumentBundle('missing')).rejects.toMatchObject({ code: 'source-missing' });
  });
});
