# File Open and Display System — Design Specification

**Date:** 2026-08-25
**Status:** Reviewed and revised against the current React/Vite ink architecture
**Target:** NotesAPP web/tablet client (React 19, Vite 8, Capacitor shell)

## 1. Goal and Scope

Students can import one PDF, PNG, JPG, or JPEG file from the Library, open it as a persistent note, and annotate every page with the existing vector ink and Focus Box tools. Imported files and their note metadata remain available after reload and without network access.

This subsystem owns:

- file selection and Library drag-and-drop;
- validation and metadata extraction;
- atomic local persistence of the original binary and imported-note metadata;
- local PDF/image decoding and page rendering;
- page-aware integration with the existing ink model, zoom, pan, and Focus Box;
- recoverable loading and storage error states.

It does not add document editing, PDF text selection/search, OCR, password entry, export, cloud sync, multi-file batch import, or native Android share-sheet/file-intent integration.

## 2. Architecture Decision

### 2.1 Options considered

1. **One master background canvas and one master ink canvas.** This matches the current blank-paper implementation but becomes unsafe for long or highly zoomed PDFs because canvas backing stores grow with the complete document height and can exceed browser texture/canvas limits.
2. **One background and ink canvas per page, all rendered eagerly.** This isolates page dimensions and avoids a single oversized canvas, but still retains excessive GPU/CPU memory for large PDFs.
3. **Virtualized per-page layers with shared document state — selected.** Every page has a stable layout frame, a lazily rendered background canvas, and a page-local ink canvas. `IntersectionObserver` activates pages near the viewport; pages far away retain their layout placeholder but release backing-store memory. The shared ink controller remains the single source of truth.

Option 3 requires more explicit boundaries, but it fits the existing page-local ink model, supports mixed PDF page sizes, and scales without replacing the current controller/history design.

### 2.2 Component boundaries

```text
Library
  FileImportControl / DragDropOverlay
  useDocumentLibrary
    documentImporter
      fileValidation
      pdfRuntime / imageMetadata
      documentRepository (IndexedDB)

App(activeNote)
  SplitLayout(note)
    useInkDocument(documentId, initialPageIds)
    useDocumentSource
    DocumentView(note, documentSource)
      DocumentPage[]
        PdfPageBackground | ImagePageBackground | PaperBackground
        InkPageCanvas
      FocusBox
    WritingZone (shared ink projection with note page descriptors)
```

Each unit has one responsibility:

- `documentRepository` is the only IndexedDB boundary.
- `documentImporter` validates and inspects a file before committing it.
- `pdfRuntime` configures and owns the local pdf.js worker/document lifecycle.
- `useDocumentSource` loads one persisted source per open note and exposes loading, ready, and error states to both editor views.
- `DocumentPage` owns only one page's layout and canvases; it does not own persistent ink state.
- `useInkDocument` remains the authority for strokes, undo/redo, and tool preferences.

## 3. User Experience

### 3.1 Import entry points

- The Library exposes an accessible button labelled **„Datei öffnen“** and a hidden file input with `accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"`.
- The Library root accepts drag-and-drop while showing a visible drop overlay. Nested controls must not flicker the overlay; drag depth is tracked explicitly.
- Exactly one file is imported at a time. Dropping or choosing multiple files produces **„Bitte jeweils nur eine Datei importieren.“** and writes nothing.
- The active Library subject is copied to the new note. If no subject is active, the note remains unassigned because the current application has no persisted default-subject setting.
- While validation, metadata extraction, and persistence run, the import control shows a busy state and rejects a second import.
- On success, the imported note is inserted into the Library state and opened immediately.

### 3.2 Editor behavior

- PDF pages appear in source order with the existing 28 px visual gap and `SEITE X / Y` badge.
- All imported pages use the original aspect ratio. Mixed portrait and landscape pages are supported.
- Pages are centered independently; the widest visible page determines the scrollable content width.
- Ink, highlighter, pixel/stroke eraser, undo/redo, and Focus Box operate in page-local coordinates above the source page.
- The Focus Box is clamped to its selected page and cannot span a page gap.
- Imported documents have a fixed page set. The infinite-paper toggle and „Neue Seite hinzufügen“ affordance are disabled for them; blank notes retain existing page creation behavior.
- Returning to the Library keeps imported-note metadata, the source binary, and ink history. Reopening the note restores the same page IDs and annotations.

Lasso/object manipulation is not promised by this feature; it remains outside the current ink-engine scope.

## 4. Persistence and Data Model

### 4.1 IndexedDB schema

Use database `notes-app-db`, schema version `1`, with two stores:

- `files`, key path `id`;
- `importedNotes`, key path `id`, with indexes on `updatedAt` and `subject`.

The small `idb` wrapper is used for transaction completion and upgrade handling. Tests use `fake-indexeddb`. The original file is stored as a `Blob`, not an `ArrayBuffer`, so IndexedDB can structured-clone the binary without forcing the storage layer to maintain a second full in-memory copy.

```ts
interface FileRecord {
  id: string;
  name: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  size: number;
  blob: Blob;
  createdAt: number;
}

interface ImportedPageDescriptor {
  id: string;          // `${noteId}-page-${index + 1}`
  index: number;       // zero based
  width: number;       // canonical page-local units, normally 800
  height: number;      // canonical units preserving source aspect ratio
}

interface ImportedNoteRecord {
  schemaVersion: 1;
  id: string;
  kind: 'imported';
  title: string;
  subject: string;
  createdAt: number;
  updatedAt: number;
  source: {
    fileId: string;
    type: 'pdf' | 'image';
  };
  pages: ImportedPageDescriptor[];
}
```

`pageCount` is derived from `pages.length`; it is not persisted separately. The original MIME type and name live on the file record, while the note stores only the source kind needed by the Library and editor without loading the Blob.

### 4.2 Atomic write contract

`documentRepository.saveImportedDocument({ note, file })` writes both records in one `readwrite` transaction. A metadata extraction failure, quota error, or aborted transaction leaves neither record behind. `getDocumentBundle(noteId)` returns `{ note, file }` and reports missing/corrupt associations as a typed repository error.

The existing ink history remains in `localStorage` under `notes-app:ink:<noteId>`. Moving ink history into IndexedDB is a separate migration and is not required to import sources safely.

### 4.3 Ink-page initialization

`useInkDocument` accepts `initialPageIds`. If no saved ink history exists, it creates pages with exactly those IDs. Existing valid history wins on reload. Imported source files are immutable, so their page list is never reconciled by silently deleting or renaming pages.

Blank notes continue to generate their current page IDs. Imported notes and blank notes therefore share the same stroke format:

```ts
interface InkStroke {
  pageId: string;
  points: Array<{ x: number; y: number }>;
  // existing tool/color/width/opacity fields
}
```

## 5. Import Pipeline

1. Normalize MIME type from the browser MIME value plus the lower-cased extension. Accept only PDF, PNG, and JPEG, and reject a conflict between a supported declared MIME type and supported extension.
2. Reject zero-byte files, files larger than `100 * 1024 * 1024` bytes, and multiple-file input before reading binary data.
3. For PDF, load the bytes through the locally bundled pdf.js worker, reject encrypted/password-protected or corrupt documents, and read every page's viewport at scale `1`.
4. For images, use `createImageBitmap` (with an `Image` fallback) to read intrinsic dimensions. Reject decoded images over 40 megapixels to avoid tablet memory exhaustion.
5. Convert every source page to canonical logical width `800`; calculate `height = 800 * sourceHeight / sourceWidth`. Keep full floating-point precision in metadata and round only CSS/backing-store dimensions.
6. Build stable note/file IDs with `crypto.randomUUID()` and a deterministic fallback for test/legacy environments. Derive the title from the file name without its final extension; preserve Unicode and trim surrounding whitespace.
7. Commit the `FileRecord` and `ImportedNoteRecord` atomically.
8. Destroy the temporary pdf.js document/loading task or decoded image resource. No Object URL may survive the import function.

The source binary must be read once per import inspection and may necessarily exist in memory while pdf.js parses it. The design guarantees bounded page-canvas memory, not zero memory usage for the PDF byte stream.

## 6. Page Layout and Coordinates

The current uniform `{ pageWidth, pageHeight }` layout is extended to an explicit frame list:

```ts
interface PageFrame {
  pageId: string;
  logicalWidth: number;
  logicalHeight: number;
  left: number;     // viewport-space CSS px at current zoom
  top: number;
  width: number;
  height: number;
}

interface PageLayout {
  frames: PageFrame[];
  zoom: number;
  gap: number;
  totalWidth: number;
  totalHeight: number;
}
```

`createPageLayout(pageDescriptors, { zoom, gap })` centers narrower pages and computes cumulative `top` positions. `mapViewportPoint` finds the containing frame and converts into logical page coordinates. Gaps return `null`. `pagePointToViewport` performs the inverse transform for Focus Box placement. These functions remain pure and are shared by background, ink, pointer, and Focus Box code.

Ink canvases are page-local. `renderInkPage(context, document, pageId, renderOptions)` filters strokes by `pageId`; it never allocates a canvas for the complete document height.

## 7. PDF and Image Rendering

### 7.1 Local pdf.js runtime

Install `pdfjs-dist` and bundle its module worker through Vite using a local `?url` import. `GlobalWorkerOptions.workerSrc` must never reference a CDN. `useDocumentSource` loads the persisted Blob into a `Uint8Array`, creates one `PDFDocumentProxy` per open note, and calls `destroy()` when the note changes or the editor unmounts.

### 7.2 Visible zoom versus render zoom

Pinch/wheel interaction updates `viewZoom` immediately so page frames, background canvases, and ink layers transform together without lag. A 120 ms settled value, `renderZoom`, controls expensive PDF rasterization. An in-flight `PDFRenderTask` is cancelled before a new task begins for the same canvas.

For a PDF page whose scale-1 viewport width is `nativeWidth`:

```text
logicalScale = logicalPageWidth / nativeWidth
requestedPixelScale = logicalScale * renderZoom * devicePixelRatio
```

The canvas CSS size follows `logical size * viewZoom`; its backing store follows the settled render viewport. The render scale is capped so one page backing canvas does not exceed 16 megapixels. This protects tablet memory at extreme zoom; CSS zoom remains functional even when raster sharpness reaches the safety cap.

### 7.3 Visibility and cleanup

- Pages within one viewport above or below the visible region are active.
- Active pages render asynchronously and keep their backing stores.
- Far pages keep their measured frame/placeholder but set canvas backing dimensions to `1 × 1` after leaving the active range.
- Page render errors affect only that page and show an inline retry action.
- Image pages use `createImageBitmap` where available and release it with `close()` on unmount.

The DOM order is always background canvas, ink canvas, then interactive overlays. Both canvases use the same frame dimensions and transform origin.

## 8. State, Errors, and Recovery

Import errors are presented in the Library and do not navigate:

- unsupported or multiple files;
- empty or over-limit file;
- corrupt/encrypted PDF;
- invalid or over-limit image dimensions;
- IndexedDB unavailable or quota exceeded.

Editor source errors replace the page stack with a recoverable panel containing **„Erneut versuchen“** and **„Zur Bibliothek“**. Ink data is never deleted when the source is missing or fails to decode.

All async effects use an abort/disposed guard. PDF render tasks are cancelled before canvas reuse. Object URLs, `ImageBitmap` objects, `PDFDocumentProxy` instances, and observers are cleaned up when their owning component unmounts.

## 9. Testing Strategy

Implementation follows red-green-refactor.

### Pure unit tests

- MIME/extension normalization, title derivation, size limits, multiple-file rejection;
- canonical page-dimension calculation for portrait, landscape, and mixed PDF pages;
- variable-page layout, gap rejection, centering, and inverse Focus Box mapping;
- render-scale calculation including DPR and the 16-megapixel cap.

### Repository and importer tests

- IndexedDB schema creation with `fake-indexeddb`;
- atomic file/note save, list ordering, bundle load, and transaction failure rollback;
- PDF/image metadata mapping with runtime decoders mocked at the boundary;
- corrupt/encrypted/oversized input leaves no records behind.

### Hook and component tests

- picker acceptance, busy state, single-file enforcement, subject assignment, and immediate navigation;
- drag-depth overlay behavior and drop import;
- persisted imported notes reappear after remount;
- loading, ready, missing-file, page-render-error, and retry states;
- mixed-size page frames render in source order;
- near pages render, far pages release backing stores, stale PDF render tasks cancel;
- imported page IDs initialize ink once and survive reload;
- ink and Focus Box mapping remain aligned at 50%, 100%, and 300% zoom;
- imported documents suppress page creation while blank notes retain it.

### Final verification

- complete Vitest suite;
- Vite production build proving the pdf.js worker is bundled locally;
- browser acceptance at 1440×900 and 1024×768;
- offline reload of an imported multi-page PDF and a large image;
- manual memory check on a long PDF confirming only near-viewport canvases retain backing stores.

## 10. Delivery Boundaries

### Included

- one-file Library import and drag/drop;
- durable imported-note list and source storage;
- offline PDF/PNG/JPEG viewing;
- mixed-size, virtualized page rendering;
- existing vector ink and Focus Box integration;
- user-visible recovery paths and automated coverage.

### Deferred

- multiple-file batch import;
- deleting an imported note and garbage-collecting its file;
- password entry for encrypted PDFs;
- PDF text layer, links, search, forms, and accessibility tree extraction;
- thumbnails/previews generated from source pages;
- annotation flattening or PDF export;
- cloud sync and cross-device migration;
- native Android intents and share targets.
