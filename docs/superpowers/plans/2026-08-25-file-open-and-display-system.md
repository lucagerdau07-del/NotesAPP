# File Open and Display System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import one PDF/PNG/JPEG from the Library, persist it offline, render mixed-size pages efficiently, and keep the existing page-local ink and Focus Box aligned with the source.

**Architecture:** Store each imported note and its original `Blob` atomically in IndexedDB. Parse sources behind PDF/image runtime boundaries, render only near-viewport page layers, and reuse the existing shared ink controller with stable imported page IDs. Variable page frames replace the uniform master-document geometry while compatibility adapters keep blank notes working during the migration.

**Tech Stack:** React 19, Vite 8, JavaScript ES modules, Canvas 2D, IndexedDB via `idb` 8, `pdfjs-dist` 5, `fake-indexeddb` 6, Vitest 4, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-25-file-open-and-display-system-design.md`

## Global Constraints

- Import exactly one file at a time; accept only PDF, PNG, JPG, and JPEG.
- Reject empty files, files over `100 * 1024 * 1024` bytes, and decoded images over `40_000_000` pixels.
- Use canonical logical page width `800` and the existing visual page gap `28` px.
- Cap one background canvas backing store at `16_000_000` pixels.
- Bundle the pdf.js worker locally with Vite; no CDN or network fallback.
- Store the original source as a `Blob` and commit file plus note metadata in one IndexedDB transaction.
- Keep existing ink history/preferences in `localStorage`; do not introduce an unrelated migration.
- Imported documents have fixed pages and cannot switch to infinite paper or append blank pages.
- Preserve current uncommitted user changes, especially in `src/components/Library.jsx` and `src/styles/main.css`; patch narrowly instead of replacing either file.
- Execution must begin with `superpowers:using-git-worktrees`. If the current uncommitted `Library.jsx`/`main.css` work is required as the base, stop and have it committed or transferred into the isolated worktree before Tasks 4 or 9; never stage unrelated user hunks.
- Every production change begins with a failing focused test, then passes that test and the relevant regression tests.

## Planned File Structure

- `src/documents/fileImport.js` — validation, MIME normalization, title and canonical page helpers.
- `src/documents/documentImporter.js` — orchestration from one selected file to an atomic persisted note.
- `src/documents/pdfRuntime.js` — local worker setup, PDF inspection, and open-document lifecycle.
- `src/documents/imageRuntime.js` — image inspection/open lifecycle with `ImageBitmap` fallback.
- `src/storage/documentRepository.js` — the only IndexedDB access boundary.
- `src/hooks/useDocumentLibrary.js` — imported-note loading and import request state.
- `src/hooks/useDocumentSource.js` — editor loading/retry/disposal state for persisted sources.
- `src/hooks/useNearViewport.js` — reusable `IntersectionObserver` activation policy.
- `src/components/document/DocumentPage.jsx` — one positioned page frame and its layers.
- `src/components/document/PdfPageCanvas.jsx` — cancellable pdf.js raster task.
- `src/components/document/ImagePageCanvas.jsx` — single image raster layer.
- `src/components/document/InkPageCanvas.jsx` — page-filtered vector ink projection.
- Existing `App`, `Library`, `SplitLayout`, `DocumentView`, ink model, coordinate mapper, renderer, tests, and CSS receive focused integration edits.

---

### Task 1: Import Domain Primitives and Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/documents/fileImport.js`
- Create: `tests/fileImport.test.js`

**Interfaces:**
- Consumes: browser `File`/`Blob` values.
- Produces: `ImportFailure`, `validateSingleImport(files)`, `titleFromFileName(name)`, `toPageDescriptors(noteId, sourcePages)`, and shared limits.

- [ ] **Step 1: Install the storage, PDF, and IndexedDB test dependencies**

Run:

```powershell
npm install idb@8 pdfjs-dist@5
npm install --save-dev fake-indexeddb@6
```

Expected: `package.json` and `package-lock.json` contain the three packages and install without peer-dependency errors on Node 24.

- [ ] **Step 2: Write failing validation tests**

```js
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
  ])('rejects invalid input with $code', ({ files, code }) => {
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
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- tests/fileImport.test.js`

Expected: FAIL because `src/documents/fileImport.js` does not exist.

- [ ] **Step 4: Implement the import primitives**

```js
export const CANONICAL_PAGE_WIDTH = 800;
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_PAGE_CANVAS_PIXELS = 16_000_000;

const MIME_BY_EXTENSION = new Map([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
]);
const SUPPORTED_MIME = new Set(MIME_BY_EXTENSION.values());

export class ImportFailure extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'ImportFailure';
    this.code = code;
  }
}

export function titleFromFileName(name) {
  const trimmed = String(name || '').trim();
  const dot = trimmed.lastIndexOf('.');
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim() || 'Importiertes Dokument';
}

export function normalizeImportMime(file) {
  const declared = String(file?.type || '').toLowerCase();
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  const fromExtension = MIME_BY_EXTENSION.get(extension) || null;
  if (SUPPORTED_MIME.has(declared) && fromExtension && declared !== fromExtension) {
    throw new ImportFailure('type-mismatch', 'Dateiendung und Dateityp widersprechen sich.');
  }
  return SUPPORTED_MIME.has(declared) ? declared : fromExtension;
}

export function validateSingleImport(files) {
  const values = Array.from(files || []);
  if (values.length !== 1) throw new ImportFailure('single-file-required', 'Bitte jeweils nur eine Datei importieren.');
  const selected = values[0];
  const mimeType = normalizeImportMime(selected);
  if (!mimeType) throw new ImportFailure('unsupported-type', 'Unterstützt werden PDF-, PNG- und JPEG-Dateien.');
  if (selected.size === 0) throw new ImportFailure('empty-file', 'Die Datei ist leer.');
  if (selected.size > MAX_IMPORT_BYTES) throw new ImportFailure('file-too-large', 'Die Datei ist größer als 100 MB.');
  return { file: selected, mimeType, type: mimeType === 'application/pdf' ? 'pdf' : 'image' };
}

export function toPageDescriptors(noteId, sourcePages) {
  if (!Array.isArray(sourcePages) || sourcePages.length === 0) {
    throw new ImportFailure('no-pages', 'Das Dokument enthält keine darstellbare Seite.');
  }
  return sourcePages.map(({ width, height }, index) => {
    if (!(width > 0) || !(height > 0)) throw new ImportFailure('invalid-page-size', 'Eine Seite hat ungültige Abmessungen.');
    return {
      id: `${noteId}-page-${index + 1}`,
      index,
      width: CANONICAL_PAGE_WIDTH,
      height: CANONICAL_PAGE_WIDTH * height / width,
    };
  });
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/fileImport.test.js`

Expected: PASS.

```powershell
git add package.json package-lock.json src/documents/fileImport.js tests/fileImport.test.js
git -c safe.directory=* commit -m "feat: add file import domain primitives"
```

### Task 2: Atomic IndexedDB Repository

**Files:**
- Create: `src/storage/documentRepository.js`
- Create: `tests/documentRepository.test.js`

**Interfaces:**
- Consumes: `{ note: ImportedNoteRecord, file: FileRecord }`.
- Produces: `createDocumentRepository({ dbName })` with `saveImportedDocument`, `listImportedNotes`, `getFile`, `getDocumentBundle`, and `close`.

- [ ] **Step 1: Write failing repository tests**

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/documentRepository.test.js`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Implement the repository and one transaction boundary**

```js
import { openDB } from 'idb';

export const DOCUMENT_DB_NAME = 'notes-app-db';
export const DOCUMENT_DB_VERSION = 1;

export class DocumentRepositoryError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'DocumentRepositoryError';
    this.code = code;
  }
}

export function createDocumentRepository({ dbName = DOCUMENT_DB_NAME } = {}) {
  let dbPromise;
  const database = () => {
    dbPromise ||= openDB(dbName, DOCUMENT_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('importedNotes')) {
          const notes = db.createObjectStore('importedNotes', { keyPath: 'id' });
          notes.createIndex('by-updated-at', 'updatedAt');
          notes.createIndex('by-subject', 'subject');
        }
      },
    });
    return dbPromise;
  };

  return {
    database,
    async saveImportedDocument({ note, file }) {
      const db = await database();
      const transaction = db.transaction(['files', 'importedNotes'], 'readwrite');
      await Promise.all([
        transaction.objectStore('files').put(file),
        transaction.objectStore('importedNotes').put(note),
        transaction.done,
      ]);
      return note;
    },
    async listImportedNotes() {
      const db = await database();
      return (await db.getAllFromIndex('importedNotes', 'by-updated-at')).reverse();
    },
    async getFile(fileId) {
      return (await database()).get('files', fileId);
    },
    async getDocumentBundle(noteId) {
      const db = await database();
      const note = await db.get('importedNotes', noteId);
      if (!note) throw new DocumentRepositoryError('note-missing', 'Das importierte Dokument wurde nicht gefunden.');
      const file = await db.get('files', note.source?.fileId);
      if (!file) throw new DocumentRepositoryError('source-missing', 'Die Quelldatei wurde nicht gefunden.');
      return { note, file };
    },
    async close() {
      if (dbPromise) (await dbPromise).close();
    },
  };
}

export const browserDocumentRepository = createDocumentRepository();
```

- [ ] **Step 4: Run repository and regression tests**

Run: `npm test -- tests/documentRepository.test.js tests/inkRepository.test.js`

Expected: PASS; the new IndexedDB repository does not change ink `localStorage` behavior.

- [ ] **Step 5: Commit**

```powershell
git add src/storage/documentRepository.js tests/documentRepository.test.js
git -c safe.directory=* commit -m "feat: persist imported documents atomically"
```

### Task 3: PDF/Image Runtimes and Import Orchestrator

**Files:**
- Create: `src/documents/pdfRuntime.js`
- Create: `src/documents/imageRuntime.js`
- Create: `src/documents/documentImporter.js`
- Create: `tests/documentImporter.test.js`

**Interfaces:**
- Consumes: validated browser file, subject string, repository.
- Produces: `inspectPdf(blob)`, `openPdf(blob)`, `inspectImage(blob)`, `openImage(blob)`, and `createDocumentImporter(dependencies).importFiles(files, { subject })`.

- [ ] **Step 1: Write failing orchestration tests with decoder boundaries mocked**

```js
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/documentImporter.test.js`

Expected: FAIL because the runtime/importer modules do not exist.

- [ ] **Step 3: Implement the locally bundled PDF runtime**

```js
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function openPdf(blob) {
  const loadingTask = getDocument({ data: await bytes(blob) });
  const document = await loadingTask.promise;
  return {
    document,
    async dispose() {
      await loadingTask.destroy();
    },
  };
}

export async function inspectPdf(blob) {
  const opened = await openPdf(blob);
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= opened.document.numPages; pageNumber += 1) {
      const page = await opened.document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    return pages;
  } finally {
    await opened.dispose();
  }
}
```

- [ ] **Step 4: Implement image lifecycle and the importer**

```js
export async function openImage(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('image-decode-failed'));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function inspectImage(blob) {
  const opened = await openImage(blob);
  try {
    return [{ width: opened.width, height: opened.height }];
  } finally {
    opened.dispose();
  }
}
```

```js
import { browserDocumentRepository } from '../storage/documentRepository.js';
import {
  ImportFailure, MAX_IMAGE_PIXELS, titleFromFileName, toPageDescriptors, validateSingleImport,
} from './fileImport.js';
import { inspectPdf as inspectPdfDefault } from './pdfRuntime.js';
import { inspectImage as inspectImageDefault } from './imageRuntime.js';

function stableUuid() {
  return globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDocumentImporter({
  repository = browserDocumentRepository,
  inspectPdf = inspectPdfDefault,
  inspectImage = inspectImageDefault,
  uuid = stableUuid,
  now = Date.now,
} = {}) {
  return {
    async importFiles(files, { subject = '' } = {}) {
      const { file, mimeType, type } = validateSingleImport(files);
      let sourcePages;
      try {
        sourcePages = type === 'pdf' ? await inspectPdf(file) : await inspectImage(file);
      } catch (error) {
        if (error?.name === 'PasswordException') {
          throw new ImportFailure('password-protected', 'Passwortgeschützte PDFs werden noch nicht unterstützt.', error);
        }
        throw new ImportFailure('decode-failed', 'Die Datei konnte nicht gelesen werden.', error);
      }
      if (type === 'image' && sourcePages[0].width * sourcePages[0].height > MAX_IMAGE_PIXELS) {
        throw new ImportFailure('image-too-large', 'Das Bild ist für die Verarbeitung auf diesem Gerät zu groß.');
      }
      const noteId = uuid();
      const fileId = uuid();
      const timestamp = now();
      const note = {
        schemaVersion: 1,
        id: noteId,
        kind: 'imported',
        title: titleFromFileName(file.name),
        subject: String(subject || ''),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: { fileId, type },
        pages: toPageDescriptors(noteId, sourcePages),
      };
      const fileRecord = {
        id: fileId,
        name: file.name.trim(),
        mimeType,
        size: file.size,
        blob: file.slice(0, file.size, mimeType),
        createdAt: timestamp,
      };
      await repository.saveImportedDocument({ note, file: fileRecord });
      return note;
    },
  };
}

export const browserDocumentImporter = createDocumentImporter();
```

- [ ] **Step 5: Run focused tests and production build**

Run: `npm test -- tests/documentImporter.test.js tests/fileImport.test.js`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `dist/assets` contains a locally emitted pdf worker asset; no worker URL points at HTTP.

- [ ] **Step 6: Commit**

```powershell
git add src/documents/pdfRuntime.js src/documents/imageRuntime.js src/documents/documentImporter.js tests/documentImporter.test.js
git -c safe.directory=* commit -m "feat: inspect PDF and image imports offline"
```

### Task 4: Persistent Library Import Flow

**Files:**
- Create: `src/hooks/useDocumentLibrary.js`
- Create: `tests/LibraryImport.test.jsx`
- Modify: `src/components/Library.jsx:1-18, 964-1285`
- Modify: `src/styles/main.css`
- Modify: `tests/setup.js`
- Modify: `tests/App.test.jsx`

**Interfaces:**
- Consumes: `browserDocumentRepository`, `browserDocumentImporter`, selected subject, `onOpenNote(note)`.
- Produces: `useDocumentLibrary()` returning `{ importedNotes, isLoading, isImporting, error, clearError, importFiles }`; accessible picker/drop UI.

- [ ] **Step 1: Write failing Library behavior tests**

```jsx
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/LibraryImport.test.jsx`

Expected: FAIL because the Library has no document-library integration or file input.

- [ ] **Step 3: Implement the loading/import hook**

```js
import { useCallback, useEffect, useState } from 'react';
import { browserDocumentImporter } from '../documents/documentImporter.js';
import { browserDocumentRepository } from '../storage/documentRepository.js';

export default function useDocumentLibrary({
  repository = browserDocumentRepository,
  importer = browserDocumentImporter,
} = {}) {
  const [importedNotes, setImportedNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;
    repository.listImportedNotes()
      .then(notes => { if (!disposed) setImportedNotes(notes); })
      .catch(cause => { if (!disposed) setError(cause); })
      .finally(() => { if (!disposed) setIsLoading(false); });
    return () => { disposed = true; };
  }, [repository]);

  const importFiles = useCallback(async (files, subject) => {
    if (isImporting) return null;
    setIsImporting(true);
    setError(null);
    try {
      const note = await importer.importFiles(files, { subject });
      setImportedNotes(current => [note, ...current.filter(item => item.id !== note.id)]);
      return note;
    } catch (cause) {
      setError(cause);
      return null;
    } finally {
      setIsImporting(false);
    }
  }, [importer, isImporting]);

  return { importedNotes, isLoading, isImporting, error, clearError: () => setError(null), importFiles };
}
```

- [ ] **Step 4: Integrate the picker, imported cards, and drag-depth overlay narrowly**

In `Library`, use an injectable hook result for tests without changing current call sites:

```jsx
export default function Library({ onOpenNote, onOpenSettings, documentLibraryOptions }) {
  const documentLibrary = useDocumentLibrary(documentLibraryOptions);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);

  const runImport = async files => {
    const note = await documentLibrary.importFiles(files, selectedSubject?.name || '');
    if (note) onOpenNote?.(note);
  };
```

Add a real button and labelled hidden input; reset `event.target.value` after each selection so the same file can be retried:

```jsx
<button
  type="button"
  className="liquid-glass-pill lib-file-open"
  onClick={() => fileInputRef.current?.click()}
  disabled={documentLibrary.isImporting}
  aria-label={documentLibrary.isImporting ? 'Datei wird importiert' : 'Datei öffnen'}
>
  <FileUp size={17} />
  <span>{documentLibrary.isImporting ? 'Wird importiert…' : 'Datei öffnen'}</span>
</button>
<input
  ref={fileInputRef}
  className="visually-hidden"
  type="file"
  aria-label="Datei öffnen"
  data-testid="file-import-input"
  accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
  onChange={async event => {
    await runImport(event.target.files);
    event.target.value = '';
  }}
/>
```

Attach `onDragEnter`, `onDragOver`, `onDragLeave`, and `onDrop` to the existing Library root. Increment/decrement `dragDepthRef`; reset it to zero on drop. Render the overlay only when active and render `documentLibrary.error?.message` in a dismissible `role="alert"`.

Map imported notes before the existing filtering/sorting code:

```js
const importedCards = documentLibrary.importedNotes.map(note => ({
  ...note,
  type: 'imported-document',
  dot: '#8AD4FF',
  when: 'importiert',
  body: `${note.pages.length} ${note.pages.length === 1 ? 'Seite' : 'Seiten'} · ${note.source.type === 'pdf' ? 'PDF' : 'Bild'}`,
}));
const allNotes = [...importedCards, ...RECENT];
```

Use `allNotes` instead of `RECENT` for filtering. Add one compact `imported-document` branch to `RecentCard` using the existing `TileWrap`; do not restructure the other card variants. Append only the new `.lib-file-open`, `.library-file-drop-overlay`, `.library-import-alert`, and `.visually-hidden` rules to `main.css`.

Add `import 'fake-indexeddb/auto';` once in `tests/setup.js` so App/Library tests exercise the same asynchronous repository path instead of failing because JSDOM has no IndexedDB implementation.

- [ ] **Step 5: Run Library and App regressions**

Run: `npm test -- tests/LibraryImport.test.jsx tests/App.test.jsx`

Expected: PASS; existing five WebGL-marked controls remain unchanged and the file-open control is not accidentally included in that exact-count selector.

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/useDocumentLibrary.js src/components/Library.jsx src/styles/main.css tests/setup.js tests/LibraryImport.test.jsx tests/App.test.jsx
git -c safe.directory=* commit -m "feat: import persistent documents from library"
```

### Task 5: Propagate Note Metadata and Initialize Stable Ink Pages

**Files:**
- Modify: `src/App.jsx:4-40`
- Modify: `src/components/SplitLayout.jsx:1-38`
- Modify: `src/ink/inkDocument.js:3-14`
- Modify: `src/hooks/useInkDocument.js:18-44`
- Modify: `tests/inkDocument.test.js`
- Modify: `tests/useInkDocument.test.js`
- Modify: `tests/App.test.jsx`
- Modify: `tests/SplitLayout.test.jsx`

**Interfaces:**
- Consumes: `note.id`, optional `note.pages`.
- Produces: `SplitLayout({ note, activeTab, onBack })`; `useInkDocument({ documentId, initialPageIds })`; `DocumentView` and `WritingZone` receive the same note/controller.

- [ ] **Step 1: Add failing stable-page tests**

```js
it('creates an ink document with supplied imported page IDs', () => {
  expect(createInkDocument('imported', ['imported-page-1', 'imported-page-2']).pages).toEqual([
    { id: 'imported-page-1' }, { id: 'imported-page-2' },
  ]);
});

it('uses initial page IDs only when no saved history exists', () => {
  const repository = createInkRepository(createMemoryStorage());
  const { result, rerender } = renderHook(
    ({ ids }) => useInkDocument({ documentId: 'imported', initialPageIds: ids, repository, saveDelay: 0 }),
    { initialProps: { ids: ['p1', 'p2'] } },
  );
  expect(result.current.document.pages.map(page => page.id)).toEqual(['p1', 'p2']);
  rerender({ ids: ['changed'] });
  expect(result.current.document.pages.map(page => page.id)).toEqual(['p1', 'p2']);
});
```

Add a `SplitLayout` propagation test with explicit imported metadata:

```jsx
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
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/inkDocument.test.js tests/useInkDocument.test.js tests/App.test.jsx tests/SplitLayout.test.jsx`

Expected: FAIL because the model accepts only a page count and `SplitLayout` receives only `documentId`.

- [ ] **Step 3: Extend document creation without breaking blank notes**

```js
function normalizePageIds(documentId, pages) {
  if (Array.isArray(pages)) {
    const unique = [...new Set(pages.map(String).filter(Boolean))];
    if (unique.length > 0) return unique;
  }
  const count = Math.max(1, Number.isFinite(pages) ? Math.floor(pages) : 1);
  return Array.from({ length: count }, (_, index) => `${documentId}-page-${index + 1}`);
}

export function createInkDocument(documentId, pages = 1) {
  const id = String(documentId);
  return {
    version: INK_SCHEMA_VERSION,
    documentId: id,
    pages: normalizePageIds(id, pages).map(pageId => ({ id: pageId })),
    strokes: [],
    updatedAt: 0,
  };
}
```

Thread `initialPageIds` into `createHistoryForDocument` and its `useState`/document-change paths. Never replace a loaded valid history merely because a later render supplies different IDs.

- [ ] **Step 4: Pass the complete note through the editor boundary**

```jsx
// App.jsx
<SplitLayout activeTab={activeTab} note={activeNote} onBack={() => setScreen('library')} />

// SplitLayout.jsx
export default function SplitLayout({ activeTab, onBack, note }) {
  const documentId = String(note?.id);
  const initialPageIds = note?.kind === 'imported' ? note.pages.map(page => page.id) : undefined;
  const inkController = useInkDocument({ documentId, initialPageIds });
  const focusBoxState = useFocusBox(inkController.document.pages.map(page => page.id));
  if (activeTab !== 'smartCanvas') return <div>Delegation Mode</div>;
  return (
    <div className={`split-layout ${layoutMode === 'split' ? '' : 'full-mode'}`}>
      <DocumentView
        note={note}
        inkController={inkController}
        toolState={toolState}
        focusBoxState={focusBoxState}
        toolbarState={toolState}
        onBack={onBack}
      />
      {layoutMode === 'split' && <WritingZone
        note={note}
        inkController={inkController}
        toolState={toolState}
        focusBoxState={focusBoxState}
        toolbarState={toolState}
      />}
    </div>
  );
}
```

Pass `note` to `WritingZone` as well so later page/source projection does not need global lookup. Add `data-document-kind` and `data-page-count` to `DocumentView` using the note and controller.

- [ ] **Step 5: Run focused and persistence regressions**

Run: `npm test -- tests/inkDocument.test.js tests/useInkDocument.test.js tests/App.test.jsx tests/SplitLayout.test.jsx tests/InkWorkspace.test.jsx`

Expected: PASS; saved history still wins and existing numeric note IDs remain normalized to strings.

- [ ] **Step 6: Commit**

```powershell
git add src/App.jsx src/components/SplitLayout.jsx src/ink/inkDocument.js src/hooks/useInkDocument.js tests/inkDocument.test.js tests/useInkDocument.test.js tests/App.test.jsx tests/SplitLayout.test.jsx
git -c safe.directory=* commit -m "feat: initialize ink from imported page metadata"
```

### Task 6: Variable Page Layout and Page-Local Ink Rendering

**Files:**
- Modify: `src/ink/pageCoordinates.js`
- Modify: `src/ink/renderInk.js`
- Create: `src/documents/pageRenderScale.js`
- Modify: `tests/pageCoordinates.test.js`
- Modify: `tests/renderInk.test.js`
- Create: `tests/pageRenderScale.test.js`

**Interfaces:**
- Produces: `createPageLayout(pages, { zoom, gap })`, frame-aware `mapViewportPoint`/`pagePointToViewport`, `renderInkPage`, and `calculatePdfRenderScale`.
- Compatibility: current uniform layout objects and `renderInkDocument` remain until Task 9 removes their use from `DocumentView`.

- [ ] **Step 1: Write failing mixed-page and render-cap tests**

```js
it('centers mixed-width pages and accumulates their individual heights', () => {
  const layout = createPageLayout([
    { id: 'portrait', width: 800, height: 1200 },
    { id: 'landscape', width: 400, height: 400 },
  ], { zoom: 0.5, gap: 28 });
  expect(layout.totalWidth).toBe(400);
  expect(layout.totalHeight).toBe(600 + 28 + 200);
  expect(layout.frames[1]).toMatchObject({ pageId: 'landscape', left: 100, top: 628, width: 200, height: 200 });
  expect(mapViewportPoint(layout, { x: 100, y: 620 })).toBeNull();
  expect(mapViewportPoint(layout, { x: 150, y: 678 })).toEqual({
    pageId: 'landscape', pageIndex: 1, x: 100, y: 100,
  });
});
```

```js
it('renders only strokes belonging to one page', () => {
  const context = createContextDouble();
  renderInkPage(context, {
    pages: [{ id: 'p1' }, { id: 'p2' }],
    strokes: [stroke('p1'), stroke('p2')],
  }, 'p2', { cssWidth: 800, cssHeight: 400, zoom: 1, dpr: 2 });
  expect(context.stroke).toHaveBeenCalledTimes(1);
});
```

```js
it('caps the requested PDF viewport at sixteen megapixels', () => {
  const uncapped = calculatePdfRenderScale({
    nativeWidth: 600, nativeHeight: 900, logicalWidth: 800, renderZoom: 1, dpr: 2,
  });
  expect(uncapped).toBeCloseTo(800 / 600 * 2);
  const capped = calculatePdfRenderScale({
    nativeWidth: 600, nativeHeight: 900, logicalWidth: 800, renderZoom: 8, dpr: 3,
  });
  expect(600 * capped * 900 * capped).toBeLessThanOrEqual(16_000_000.01);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/pageCoordinates.test.js tests/renderInk.test.js tests/pageRenderScale.test.js`

Expected: FAIL because the new layout, page renderer, and scale helper are absent.

- [ ] **Step 3: Add frame creation and frame-aware mapping**

```js
export function createPageLayout(pages, { zoom = 1, gap = 0 } = {}) {
  if (!Array.isArray(pages) || !(zoom > 0) || gap < 0) return null;
  const normalized = pages.filter(page => page && page.id && page.width > 0 && page.height > 0);
  if (normalized.length !== pages.length || normalized.length === 0) return null;
  const maxWidth = Math.max(...normalized.map(page => page.width));
  let top = 0;
  const frames = normalized.map((page, pageIndex) => {
    const frame = {
      pageId: String(page.id), pageIndex,
      logicalWidth: page.width, logicalHeight: page.height,
      left: (maxWidth - page.width) * zoom / 2,
      top,
      width: page.width * zoom,
      height: page.height * zoom,
    };
    top += frame.height + (pageIndex < normalized.length - 1 ? gap : 0);
    return frame;
  });
  return { frames, zoom, gap, totalWidth: maxWidth * zoom, totalHeight: top };
}

function framesFor(layout) {
  if (Array.isArray(layout?.frames)) return layout.frames;
  if (!Array.isArray(layout?.pageIds)) return [];
  return createPageLayout(layout.pageIds.map(id => ({
    id, width: layout.pageWidth, height: layout.pageHeight,
  })), { zoom: layout.zoom, gap: layout.showPageBreaks ? layout.pageGap : 0 })?.frames || [];
}
```

Update both mapping functions to search `framesFor(layout)`, subtract `frame.left/top`, divide by `layout.zoom`, and reject points outside every frame. Preserve the exact return shape `{ pageId, pageIndex, x, y }`.

- [ ] **Step 4: Add page-only rendering and a pure render-scale cap**

```js
export function renderInkPage(context, document, pageId, options = {}) {
  const zoom = finiteOr(options.zoom, 1);
  const dpr = options.dpr > 0 ? options.dpr : 1;
  context.save();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, finiteOr(options.cssWidth, 0), finiteOr(options.cssHeight, 0));
  (document?.strokes || [])
    .filter(stroke => stroke.pageId === pageId)
    .forEach(stroke => renderInkStroke(context, stroke, { scale: zoom }));
  context.restore();
}
```

```js
import { MAX_PAGE_CANVAS_PIXELS } from './fileImport.js';

export function calculatePdfRenderScale({
  nativeWidth, nativeHeight, logicalWidth, renderZoom, dpr,
  maxPixels = MAX_PAGE_CANVAS_PIXELS,
}) {
  if (![nativeWidth, nativeHeight, logicalWidth, renderZoom, dpr, maxPixels].every(value => value > 0)) return 1;
  const requested = logicalWidth / nativeWidth * renderZoom * dpr;
  const cap = Math.sqrt(maxPixels / (nativeWidth * nativeHeight));
  return Math.min(requested, cap);
}
```

- [ ] **Step 5: Run focused and current DocumentView regressions**

Run: `npm test -- tests/pageCoordinates.test.js tests/renderInk.test.js tests/pageRenderScale.test.js tests/DocumentView.test.jsx`

Expected: PASS through the temporary uniform-layout compatibility path.

- [ ] **Step 6: Commit**

```powershell
git add src/ink/pageCoordinates.js src/ink/renderInk.js src/documents/pageRenderScale.js tests/pageCoordinates.test.js tests/renderInk.test.js tests/pageRenderScale.test.js
git -c safe.directory=* commit -m "feat: support variable page geometry"
```

### Task 7: Persisted Source Loading and Cleanup

**Files:**
- Create: `src/hooks/useDocumentSource.js`
- Create: `tests/useDocumentSource.test.jsx`
- Modify: `src/documents/pdfRuntime.js`
- Modify: `src/documents/imageRuntime.js`

**Interfaces:**
- Consumes: imported note plus repository/runtime adapters.
- Produces: `useDocumentSource(note, dependencies)` returning `{ status, source, error, retry }`, where ready `source` is `{ kind: 'pdf', document }` or `{ kind: 'image', image, width, height }`.

- [ ] **Step 1: Write failing lifecycle tests**

```jsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import useDocumentSource from '../src/hooks/useDocumentSource.js';

const note = { id: 'n1', kind: 'imported', source: { fileId: 'f1', type: 'pdf' } };

it('loads one persisted PDF and disposes it when the note changes', async () => {
  const dispose = vi.fn();
  const repository = { getDocumentBundle: vi.fn(async () => ({ note, file: { blob: new Blob(['pdf']) } })) };
  const openPdf = vi.fn(async () => ({ document: { numPages: 2 }, dispose }));
  const { result, rerender } = renderHook(({ value }) => useDocumentSource(value, { repository, openPdf }), {
    initialProps: { value: note },
  });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(result.current.source).toMatchObject({ kind: 'pdf', document: { numPages: 2 } });
  rerender({ value: { id: 'blank', kind: 'blank' } });
  await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
  expect(result.current.status).toBe('blank');
});

it('exposes a retry that reloads after a source error', async () => {
  const repository = { getDocumentBundle: vi.fn()
    .mockRejectedValueOnce(new Error('missing'))
    .mockResolvedValueOnce({ note, file: { blob: new Blob(['pdf']) } }) };
  const { result } = renderHook(() => useDocumentSource(note, {
    repository, openPdf: vi.fn(async () => ({ document: {}, dispose: vi.fn() })),
  }));
  await waitFor(() => expect(result.current.status).toBe('error'));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(repository.getDocumentBundle).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/useDocumentSource.test.jsx`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement an abort-safe source lifecycle**

```js
import { useCallback, useEffect, useState } from 'react';
import { browserDocumentRepository } from '../storage/documentRepository.js';
import { openPdf as openPdfDefault } from '../documents/pdfRuntime.js';
import { openImage as openImageDefault } from '../documents/imageRuntime.js';

export default function useDocumentSource(note, {
  repository = browserDocumentRepository,
  openPdf = openPdfDefault,
  openImage = openImageDefault,
} = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: note?.kind === 'imported' ? 'loading' : 'blank', source: null, error: null });
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (note?.kind !== 'imported') {
      setState({ status: 'blank', source: null, error: null });
      return undefined;
    }
    let disposed = false;
    let opened = null;
    setState({ status: 'loading', source: null, error: null });
    repository.getDocumentBundle(note.id)
      .then(({ file }) => note.source.type === 'pdf' ? openPdf(file.blob) : openImage(file.blob))
      .then(value => {
        opened = value;
        if (disposed) return value.dispose();
        setState({
          status: 'ready', error: null,
          source: note.source.type === 'pdf'
            ? { kind: 'pdf', document: value.document }
            : { kind: 'image', image: value.image, width: value.width, height: value.height },
        });
      })
      .catch(error => { if (!disposed) setState({ status: 'error', source: null, error }); });
    return () => {
      disposed = true;
      opened?.dispose?.();
    };
  }, [attempt, note?.id, note?.kind, note?.source?.type, openImage, openPdf, repository]);

  return { ...state, retry };
}
```

Ensure both runtime `dispose` functions are idempotent so a late-resolving source and effect cleanup cannot release the same resource twice.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/useDocumentSource.test.jsx tests/documentImporter.test.js`

Expected: PASS with no state update after unmount warnings.

```powershell
git add src/hooks/useDocumentSource.js src/documents/pdfRuntime.js src/documents/imageRuntime.js tests/useDocumentSource.test.jsx
git -c safe.directory=* commit -m "feat: load persisted document sources safely"
```

### Task 8: Virtualized Per-Page Background and Ink Layers

**Files:**
- Create: `src/hooks/useNearViewport.js`
- Create: `src/components/document/PdfPageCanvas.jsx`
- Create: `src/components/document/ImagePageCanvas.jsx`
- Create: `src/components/document/InkPageCanvas.jsx`
- Create: `src/components/document/DocumentPage.jsx`
- Create: `tests/DocumentPage.test.jsx`

**Interfaces:**
- Consumes: `frame`, `page`, `source`, shared ink document/draft, `viewZoom`, `renderZoom`, and scroll root.
- Produces: `DocumentPage` with a fixed placeholder frame; near pages own backing stores and far pages release them.

- [ ] **Step 1: Write failing page-layer tests**

```jsx
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import DocumentPage from '../src/components/document/DocumentPage.jsx';

const frame = {
  pageId: 'p1', pageIndex: 0, logicalWidth: 800, logicalHeight: 1200,
  left: 0, top: 0, width: 400, height: 600,
};

it('cancels a stale PDF render before starting the settled zoom render', async () => {
  const cancel = vi.fn();
  const render = vi.fn(() => ({ promise: new Promise(() => {}), cancel }));
  const pageProxy = { getViewport: vi.fn(({ scale }) => ({ width: 600 * scale, height: 900 * scale })), render };
  const source = { kind: 'pdf', document: { getPage: vi.fn(async () => pageProxy) } };
  const { rerender } = render(<DocumentPage frame={frame} page={{ id: 'p1', index: 0, width: 800, height: 1200 }} source={source} inkDocument={{ strokes: [] }} viewZoom={0.5} renderZoom={0.5} forceNear />);
  await waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  rerender(<DocumentPage frame={frame} page={{ id: 'p1', index: 0, width: 800, height: 1200 }} source={source} inkDocument={{ strokes: [] }} viewZoom={0.75} renderZoom={0.75} forceNear />);
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
});

it('releases both backing stores when a page is far away', () => {
  render(<DocumentPage frame={frame} page={{ id: 'p1', index: 0, width: 800, height: 1200 }} source={{ kind: 'image', image: {} }} inkDocument={{ strokes: [] }} viewZoom={0.5} renderZoom={0.5} forceNear={false} />);
  expect(screen.getByTestId('page-background-p1')).toHaveAttribute('width', '1');
  expect(screen.getByTestId('page-ink-p1')).toHaveAttribute('width', '1');
});

it('keeps background, ink, and badge in one page-local frame', () => {
  render(<DocumentPage frame={frame} page={{ id: 'p1', index: 0, width: 800, height: 1200 }} source={null} inkDocument={{ strokes: [] }} viewZoom={0.5} renderZoom={0.5} forceNear />);
  expect(screen.getByTestId('document-page-p1')).toHaveStyle({ left: '0px', top: '0px', width: '400px', height: '600px' });
  expect(screen.getByText('SEITE 1 / 1')).toBeInTheDocument();
});

it('offers a page-local retry after a render failure', async () => {
  const renderTask = () => ({ promise: Promise.reject(new Error('render failed')), cancel: vi.fn() });
  const source = { kind: 'pdf', document: { getPage: vi.fn(async () => ({
    getViewport: ({ scale }) => ({ width: 600 * scale, height: 900 * scale }),
    render: vi.fn(renderTask),
  })) } };
  render(<DocumentPage frame={frame} page={{ id: 'p1', index: 0, width: 800, height: 1200 }} source={source} inkDocument={{ strokes: [] }} viewZoom={0.5} renderZoom={0.5} forceNear />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Seite konnte nicht gerendert werden');
  fireEvent.click(screen.getByRole('button', { name: 'Seite erneut rendern' }));
  await waitFor(() => expect(source.document.getPage).toHaveBeenCalledTimes(2));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/DocumentPage.test.jsx`

Expected: FAIL because page-layer components do not exist.

- [ ] **Step 3: Implement near-viewport activation**

```js
import { useEffect, useState } from 'react';

export default function useNearViewport(ref, { rootRef, rootMargin = '100% 0px', forceNear } = {}) {
  const [isNear, setIsNear] = useState(forceNear ?? true);
  useEffect(() => {
    if (forceNear !== undefined) {
      setIsNear(forceNear);
      return undefined;
    }
    if (!ref.current || typeof IntersectionObserver !== 'function') {
      setIsNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry.isIntersecting), {
      root: rootRef?.current || null,
      rootMargin,
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [forceNear, ref, rootMargin, rootRef]);
  return isNear;
}
```

- [ ] **Step 4: Implement cancellable background canvases and page-local ink**

`PdfPageCanvas` obtains `source.document.getPage(page.index + 1)`, calculates scale through `calculatePdfRenderScale`, sets backing dimensions from the returned viewport, and starts `pdfPage.render({ canvas, canvasContext, viewport })`. Its effect depends on `renderAttempt`; cleanup calls `renderTask.cancel()` and ignores `RenderingCancelledException`, while other failures call `onError(error)`. When `isNear` is false, set `canvas.width = canvas.height = 1` and skip `getPage`.

`ImagePageCanvas` sets backing size to the smaller of requested DPR size and the 16-megapixel cap, then draws the decoded image once. `InkPageCanvas` applies the same cap with `effectiveDpr = Math.min(devicePixelRatio, Math.sqrt(MAX_PAGE_CANVAS_PIXELS / (frame.width * frame.height)))`, then calls:

```jsx
resizeInkCanvas(canvas, frame.width, frame.height, effectiveDpr);
renderInkPage(context, previewDocument, page.id, {
  cssWidth: frame.width,
  cssHeight: frame.height,
  zoom: viewZoom,
  dpr: effectiveDpr,
});
```

When far, both image and ink canvases release to `1 × 1`.

Compose them in a positioned page component:

```jsx
export default function DocumentPage({
  frame, page, pageCount = 1, source, inkDocument, draftStroke,
  viewZoom, renderZoom, scrollRootRef, forceNear,
}) {
  const pageRef = useRef(null);
  const [renderError, setRenderError] = useState(null);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const isNear = useNearViewport(pageRef, { rootRef: scrollRootRef, forceNear });
  return (
    <section
      ref={pageRef}
      data-testid={`document-page-${page.id}`}
      data-page-id={page.id}
      style={{ position: 'absolute', left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
    >
      {source?.kind === 'pdf' && <PdfPageCanvas {...{ page, source, isNear, renderZoom, renderAttempt }} onError={setRenderError} />}
      {source?.kind === 'image' && <ImagePageCanvas {...{ page, source, isNear, renderZoom, renderAttempt }} onError={setRenderError} />}
      {!source && <div className="document-paper-background" />}
      <InkPageCanvas {...{ frame, page, inkDocument, draftStroke, isNear, viewZoom }} />
      <span className="document-page-badge">SEITE {page.index + 1} / {pageCount}</span>
      {renderError && <div role="alert" className="document-page-error">
        <span>Seite konnte nicht gerendert werden.</span>
        <button onClick={() => { setRenderError(null); setRenderAttempt(value => value + 1); }}>Seite erneut rendern</button>
      </div>}
    </section>
  );
}
```

Layer z-order must be background `0`, ink `1`, overlays/badge `2`; all canvases use `pointer-events: none`.

- [ ] **Step 5: Run focused tests and canvas regressions**

Run: `npm test -- tests/DocumentPage.test.jsx tests/renderInk.test.js tests/pageRenderScale.test.js`

Expected: PASS; cancellation is observed and far canvases are `1 × 1`.

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/useNearViewport.js src/components/document/PdfPageCanvas.jsx src/components/document/ImagePageCanvas.jsx src/components/document/InkPageCanvas.jsx src/components/document/DocumentPage.jsx tests/DocumentPage.test.jsx
git -c safe.directory=* commit -m "feat: render virtualized document pages"
```

### Task 9: Integrate Imported Pages into DocumentView and Focus Geometry

**Files:**
- Modify: `src/components/DocumentView.jsx:284-1418`
- Modify: `src/components/WritingZone.jsx:140-205`
- Modify: `src/components/SplitLayout.jsx`
- Modify: `src/styles/main.css`
- Modify: `tests/DocumentView.test.jsx`
- Modify: `tests/InkWorkspace.test.jsx`
- Create: `tests/FileOpenFlow.test.jsx`

**Interfaces:**
- Consumes: note descriptors, `useDocumentSource`, `createPageLayout`, `DocumentPage`, existing pointer/gesture/controller state.
- Produces: imported loading/error/ready states, mixed page frames, settled render zoom, fixed-page restrictions, and page-aware Focus Box clamping.

- [ ] **Step 1: Add failing DocumentView integration tests**

```jsx
const mixedImportedNote = () => ({
  id: 'imported', kind: 'imported', source: { fileId: 'f1', type: 'pdf' },
  pages: [
    { id: 'p1', index: 0, width: 800, height: 1200 },
    { id: 'p2', index: 1, width: 800, height: 400 },
  ],
});
const importedNote = () => ({ ...mixedImportedNote(), pages: [mixedImportedNote().pages[0]] });
const validStroke = () => ({
  id: 's1', pageId: 'p1', tool: 'pen', color: '#ffffff', width: 3, opacity: 1,
  points: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
});
const controllerFor = note => createControllerDouble({
  document: {
    version: 1, documentId: note.id,
    pages: note.pages.map(page => ({ id: page.id })),
    strokes: [], updatedAt: 0,
  },
});
const fakePdfDocument = () => ({
  getPage: vi.fn(async () => ({
    getViewport: vi.fn(({ scale }) => ({ width: 600 * scale, height: 900 * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  })),
});
const readyPdfSource = () => ({
  status: 'ready', source: { kind: 'pdf', document: fakePdfDocument() }, retry: vi.fn(),
});

it('renders mixed imported pages and suppresses page creation controls', async () => {
  const note = mixedImportedNote();
  render(<DocumentView
    note={note}
    documentSource={{ status: 'ready', source: { kind: 'pdf', document: fakePdfDocument() }, retry: vi.fn() }}
    inkController={controllerFor(note)}
    toolbarState={toolState()}
  />);
  expect(await screen.findByTestId('document-page-p1')).toBeInTheDocument();
  expect(screen.getByTestId('document-page-p2')).toHaveStyle({ height: '400px' });
  expect(screen.queryByTitle(/Neue Seite hinzufügen/)).not.toBeInTheDocument();
  expect(screen.queryByTitle(/Unendliches Dokument/)).not.toBeInTheDocument();
});

it('shows a recoverable imported-source error without deleting ink', () => {
  const retry = vi.fn();
  const note = importedNote();
  const controller = controllerFor(note);
  controller.document.strokes = [validStroke()];
  render(<DocumentView note={note} documentSource={{ status: 'error', error: new Error('missing'), retry }} inkController={controller} toolbarState={toolState()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Datei konnte nicht geladen werden');
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
  expect(retry).toHaveBeenCalled();
  expect(controller.clearDocument).not.toHaveBeenCalled();
});

it('clamps a focus rectangle to imported landscape page dimensions', () => {
  const setFocusBox = vi.fn();
  const note = mixedImportedNote();
  render(<DocumentView note={note} documentSource={readyPdfSource()} inkController={controllerFor(note)} focusBoxState={{ focusBox: { pageId: 'p2', x: 700, y: 350, width: 200, height: 100 }, setFocusBox }} toolbarState={toolState({ layoutMode: 'split' })} />);
  fireEvent.keyDown(screen.getByRole('region', { name: 'Fokusbereich' }), { key: 'ArrowRight' });
  const update = setFocusBox.mock.calls[0][0]({ pageId: 'p2', x: 700, y: 350, width: 200, height: 100 });
  expect(update.x + update.width).toBeLessThanOrEqual(800);
  expect(update.y + update.height).toBeLessThanOrEqual(400);
});
```

Create `tests/FileOpenFlow.test.jsx` with a stable imported-note double and module-boundary mocks:

```jsx
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const doubles = vi.hoisted(() => {
  const note = {
    schemaVersion: 1, id: 'flow-note', kind: 'imported', title: 'Arbeitsblatt', subject: 'Mathe',
    source: { fileId: 'flow-file', type: 'pdf' }, createdAt: 1, updatedAt: 1,
    pages: [
      { id: 'flow-note-page-1', index: 0, width: 800, height: 1200 },
      { id: 'flow-note-page-2', index: 1, width: 800, height: 400 },
    ],
  };
  const pdfDocument = {
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }) => ({ width: 600 * scale, height: 900 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    })),
  };
  return { note, pdfDocument, importFiles: vi.fn(async () => note) };
});

vi.mock('../src/hooks/useDocumentLibrary.js', () => ({
  default: () => ({
    importedNotes: [doubles.note], isLoading: false, isImporting: false, error: null,
    clearError: vi.fn(), importFiles: doubles.importFiles,
  }),
}));
vi.mock('../src/hooks/useDocumentSource.js', () => ({
  default: note => note?.kind === 'imported'
    ? { status: 'ready', source: { kind: 'pdf', document: doubles.pdfDocument }, error: null, retry: vi.fn() }
    : { status: 'blank', source: null, error: null, retry: vi.fn() },
}));

import App from '../src/App.jsx';

it('opens an imported file and reopens the same persisted page IDs', async () => {
  render(<App />);
  fireEvent.change(screen.getByTestId('file-import-input'), {
    target: { files: [new File(['pdf'], 'Arbeitsblatt.pdf', { type: 'application/pdf' })] },
  });
  expect(await screen.findByTestId('document-page-flow-note-page-1')).toBeInTheDocument();
  expect(screen.getByTestId('document-page-flow-note-page-2')).toBeInTheDocument();
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', 'flow-note');
  fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
  fireEvent.click(screen.getByText('Arbeitsblatt'));
  expect(await screen.findByTestId('document-page-flow-note-page-1')).toBeInTheDocument();
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', 'flow-note');
});
```

- [ ] **Step 2: Run integration tests and verify RED**

Run: `npm test -- tests/DocumentView.test.jsx tests/InkWorkspace.test.jsx tests/FileOpenFlow.test.jsx`

Expected: FAIL because `DocumentView` still creates one uniform master canvas and ignores note/source props.

- [ ] **Step 3: Introduce note pages and separated zoom state**

Load one source in `SplitLayout` and pass it to the document view; `WritingZone` already receives `note` for page dimensions:

```jsx
const documentSource = useDocumentSource(note);
<DocumentView
  note={note}
  documentSource={documentSource}
  inkController={inkController}
  toolState={toolState}
  focusBoxState={focusBoxState}
  toolbarState={toolState}
  onBack={onBack}
/>
```

At the top of `DocumentView`, consume the passed state without opening another PDF document:

```jsx
const sourceState = documentSource || { status: 'blank', source: null, error: null };
const isImported = note?.kind === 'imported';
const pages = isImported
  ? note.pages
  : inkDocument.pages.map((page, index) => ({ id: page.id, index, width: 800, height: 800 * 1.414 }));
const effectivePageBreaks = isImported ? true : Boolean(showPageBreaks);
const pageLayout = createPageLayout(pages, { zoom: viewZoom, gap: effectivePageBreaks ? PAGE_GAP : 0 });
const [renderZoom, setRenderZoom] = useState(viewZoom);
useEffect(() => {
  const timer = setTimeout(() => setRenderZoom(viewZoom), 120);
  return () => clearTimeout(timer);
}, [viewZoom]);
```

Rename the current `zoom` state to `viewZoom` throughout gesture and wheel code. Pointer mapping continues to call `mapViewportPoint(pageLayout, relativePoint(...))`, so gaps and mixed heights use one source of truth.

- [ ] **Step 4: Replace the master paper/canvas block with positioned `DocumentPage` layers**

Set the document container to `pageLayout.totalWidth × pageLayout.totalHeight`. Render:

```jsx
const pageNodes = pageLayout.frames.map((frame, index) => (
  <DocumentPage
    key={frame.pageId}
    frame={frame}
    page={pages[index]}
    pageCount={pages.length}
    source={sourceState.source}
    inkDocument={inkDocument}
    draftStroke={inkPointer.draftStroke}
    viewZoom={viewZoom}
    renderZoom={renderZoom}
    scrollRootRef={scrollRef}
  />
));
```

Delete the `master-canvas` allocation/redraw effect only after all component tests point to `page-ink-<pageId>`. Keep `data-testid="document-page"` on the outer page-stack container for existing pointer tests.

- [ ] **Step 5: Make Focus Box and editor restrictions page-aware**

Replace `clampFocusBox` constants with a descriptor lookup:

```js
function clampFocusBoxToPage(focusBox, pages) {
  const page = pages.find(item => item.id === focusBox?.pageId);
  if (!page) return null;
  const width = Math.min(page.width, Math.max(0, focusBox.width));
  const height = Math.min(page.height, Math.max(0, focusBox.height));
  return {
    ...focusBox,
    width,
    height,
    x: Math.min(page.width - width, Math.max(0, focusBox.x)),
    y: Math.min(page.height - height, Math.max(0, focusBox.y)),
  };
}
```

Use inverse frame mapping for the focus overlay. Update `WritingZone` to read the selected page descriptor rather than hard-coded `800 × 1131.2` bounds; its shared stroke mapping remains page-local.

For imported documents:

- do not render the page-mode toggle;
- do not render the add-page pill;
- skip scroll/focus auto-add calls;
- never call `inkController.addPage`.

For blank notes, preserve all four behaviors.

- [ ] **Step 6: Add loading, source error, and per-page retry UI**

Inside the existing scroll/content area, render exactly one of loading state, source-error state, or the page stack so the existing sidebar/back navigation remains mounted:

```jsx
{isImported && sourceState.status === 'loading' ? (
  <div role="status" className="document-source-state">Dokument wird geladen…</div>
) : isImported && sourceState.status === 'error' ? (
  <div role="alert" className="document-source-state">
    <strong>Datei konnte nicht geladen werden</strong>
    <button onClick={sourceState.retry}>Erneut versuchen</button>
    {onBack && <button onClick={onBack}>Zur Bibliothek</button>}
  </div>
) : (
  <div data-testid="document-page" ref={containerRef}>{pageNodes}</div>
)}
```

Append narrow state/page-layer styles to `main.css`; do not duplicate or early-return around the complete toolbar.

- [ ] **Step 7: Run focused and full regressions**

Run: `npm test -- tests/DocumentView.test.jsx tests/InkWorkspace.test.jsx tests/FileOpenFlow.test.jsx tests/pageCoordinates.test.js tests/renderInk.test.js`

Expected: PASS with no Canvas warnings and no imported add-page calls.

Run: `npm test`

Expected: complete suite PASS; blank-note page creation, focus writing, gestures, and ink persistence remain intact.

- [ ] **Step 8: Commit**

```powershell
git add src/components/DocumentView.jsx src/components/WritingZone.jsx src/components/SplitLayout.jsx src/styles/main.css tests/DocumentView.test.jsx tests/InkWorkspace.test.jsx tests/FileOpenFlow.test.jsx
git -c safe.directory=* commit -m "feat: display imported pages with aligned ink"
```

### Task 10: Offline, Performance, and Final Acceptance

**Files:**
- Modify only if a verified defect requires a regression test and a focused fix in files owned by Tasks 1-9.
- Record: `docs/superpowers/verification/2026-08-25-file-open-and-display-results.md`

**Interfaces:**
- Consumes: production build and representative local PDF/image files.
- Produces: evidence that import, persistence, rendering, cleanup, and existing ink behavior meet the specification.

- [ ] **Step 1: Run static architecture checks**

Run:

```powershell
rg -n "https?://|cdn" src/documents src/components/document
```

Expected: no matches.

Run:

```powershell
rg -n "master-canvas|renderInkDocument" src/components/DocumentView.jsx
```

Expected: no matches; the compatibility renderer may remain exported for other tests/code until a separate cleanup is justified.

- [ ] **Step 2: Run automated verification**

Run: `npm test`

Expected: all tests PASS with no unhandled promise rejections or React state-update-after-unmount warnings.

Run: `npm run build`

Expected: Vite build PASS and an emitted `pdf.worker` asset exists under `dist/assets`.

Run: `git -c safe.directory=* diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Exercise desktop import and persistence**

Run: `npm run dev -- --host 127.0.0.1`

At 1440×900:

1. Import a two-page PDF with one portrait and one landscape page.
2. Confirm the active subject is retained, pages are in source order, page badges are correct, and page gaps reject ink.
3. Draw on both pages and in the Focus Box; verify one shared undo/redo history.
4. Return to the Library, reload the browser offline, reopen the card, and confirm source plus ink persist.
5. Import a PNG and JPEG and confirm aspect ratios and titles.
6. Try an unsupported file, empty file, two dropped files, and a corrupt PDF; verify no card is created.

- [ ] **Step 4: Exercise tablet zoom and canvas memory behavior**

At 1024×768:

1. Open a long PDF and inspect canvas backing dimensions while scrolling.
2. Confirm only pages within approximately one viewport retain backing stores; far pages are `1 × 1` while their placeholders keep scroll height stable.
3. Pinch from 50% to 300%; confirm page/background/ink stay aligned during movement and PDF rasterization settles after interaction.
4. Confirm no background canvas exceeds 16,000,000 pixels.
5. Navigate away during a render and verify no stale page appears and no unhandled cancellation is logged.

- [ ] **Step 5: Record evidence**

Create the verification document only after Steps 1-4 have produced evidence. Use the title `# File Open and Display Verification — 2026-08-25` and sections `Automated`, `Desktop 1440×900`, `Tablet 1024×768`, and `Deviations`. Under each section, record the actual command result, pass count, emitted worker filename, observed canvas dimensions/pixel count, and interaction result. Write `None` under `Deviations` only when every check passed. If any check fails, stop acceptance, add the smallest failing automated regression, implement the focused correction, rerun the affected checks, and record the final result.

- [ ] **Step 6: Commit verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-25-file-open-and-display-results.md
git -c safe.directory=* commit -m "docs: verify file open and display flow"
```
