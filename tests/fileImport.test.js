import { describe, expect, it } from 'vitest';
import {
  ImportFailure,
  MAX_IMPORT_BYTES,
  titleFromFileName,
  toPageDescriptors,
  validateSingleImport,
} from '../src/documents/fileImport.js';

const file = (name, type, size = 4) => ({ name, type, size });

describe('file import domain', () => {
  it('accepts a PDF whose browser MIME is empty by using its extension', () => {
    expect(validateSingleImport([file('Aufgabe.PDF', '')]).mimeType).toBe('application/pdf');
  });

  it.each([
    { files: [], code: 'single-file-required' },
    { files: [file('a.pdf', 'application/pdf'), file('b.pdf', 'application/pdf')], code: 'single-file-required' },
    { files: [new File([], 'empty.pdf', { type: 'application/pdf' })], code: 'empty-file' },
    { files: [file('movie.gif', 'image/gif')], code: 'unsupported-type' },
    { files: [file('renamed.pdf', 'image/png')], code: 'type-mismatch' },
    { files: [file('large.pdf', 'application/pdf', MAX_IMPORT_BYTES + 1)], code: 'file-too-large' },
  ])('rejects invalid input with ', ({ files, code }) => {
    expect(() => validateSingleImport(files)).toThrowError(expect.objectContaining({ code }));
  });

  it('derives a Unicode title from only the final extension', () => {
    expect(titleFromFileName('  Übung.v2.final.pdf  ')).toBe('Übung.v2.final');
  });

  it('normalizes mixed source sizes to stable page-local descriptors', () => {
    expect(toPageDescriptors('note-a', [
      { width: 600, height: 900 },
      { width: 1200, height: 600 },
    ])).toEqual([
      { id: 'note-a-page-1', index: 0, width: 800, height: 1200 },
      { id: 'note-a-page-2', index: 1, width: 800, height: 400 },
    ]);
  });
});
