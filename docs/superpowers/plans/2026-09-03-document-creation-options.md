# Document Creation Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a creation dialog offering page type (normal vs. free-pan infinite whiteboard), page format, background color, and ruling when starting a new document.

**Architecture:** A new `pageStyles.js` module resolves the dialog's choices into concrete page fields, stamped onto the ink document's first page at creation time (`createInkDocument`'s new `pageDefaults` param) so they persist with the document, not the ephemeral note object. Normal-page format/background/ruling plug into `DocumentView.jsx`'s existing page-stack rendering (ruling already exists there as the `paperStyle` toggle — it only needed its initial value seeded from the page). Whiteboard is **not** wired into `DocumentPage.jsx`/`DocumentView.jsx`'s page-stack rendering at all — that pipeline (scroll-based pan, per-page raster canvas capped at 16M backing pixels, focus box, lasso, bucket fill) assumes a bounded, stacked page and cannot host free 2D pan/zoom. Instead `DocumentView` early-returns a new, fully isolated `WhiteboardEditor` component before any page-stack rendering runs, reusing the existing `useInkPointer` hook as-is (it already takes an injected `mapPoint` callback and has no page-bounds assumption baked in) with a viewport-sized canvas redrawn via a world→screen camera transform, the same `renderInkStroke` primitive the rest of the app already uses.

**Tech Stack:** React (existing), vitest + @testing-library/react (existing). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-03-document-creation-options-design.md](../specs/2026-09-03-document-creation-options-design.md)

## Corrections from the spec (found while mapping real files)

- **Ruling already exists.** `DocumentView.jsx` already implements blank/lined/grid/dotted as a CSS-gradient overlay (`getStaticBackgroundStyles()`, driven by `paperStyle` toolbar state). It just resets to `"lined"` on every mount instead of reading a per-document choice. No new ruling-rendering code is needed — only seeding its initial value.
- **Normal-page background is not in `DocumentPage.jsx`.** That component is only used for *imported* PDF/image notes. Regular hand-written notes render their page background inline in `DocumentView.jsx` as a hardcoded dark gradient (two call sites). Background-color work targets those two spots, not `DocumentPage.jsx`.
- **An existing "unendlicher Modus" toggle** (`showPageBreaks: false`) already auto-grows a page downward — this was surfaced to and explicitly rejected in favor of true free-pan by the person who approved the spec; it is unrelated to the whiteboard built here and is left untouched.

## Global Constraints

- No new npm dependencies.
- Preserve current visual/behavioral defaults exactly: a note created via the dialog with every default choice must render pixel-identical to today's default note (default background = the existing dark gradient, default ruling = `"lined"`, default format = current 800×1131.2).
- German UI copy, matching existing strings in `Library.jsx` (e.g. "Neue Notiz", "Erstellen").
- Whiteboard MVP scope: pen + eraser drawing, pan, zoom, undo/redo. Lasso, bucket fill, shape/text/image insert, and multi-page navigation are **not** wired up for whiteboard documents in this plan (their rail buttons simply don't render in `WhiteboardEditor`) — noted as a follow-up, not built here.

---

## Task 1: `pageStyles.js` — format/background/ruling constants

**Files:**
- Create: `src/documents/pageStyles.js`
- Test: `tests/pageStyles.test.js`

**Interfaces:**
- Produces: `PAGE_FORMATS` (object, keys `"a4-portrait" | "a4-landscape" | "square"`, values `{width, height}`), `BACKGROUND_PRESETS` (array of `{id, label, css}`), `RULING_PRESETS` (array of ruling id strings), `resolvePageStyle({pageKind, format, background, ruling}) -> {kind: "whiteboard"} | {kind: "page", width, height, background, ruling}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/pageStyles.test.js
import { describe, expect, it } from 'vitest';
import {
  PAGE_FORMATS,
  BACKGROUND_PRESETS,
  RULING_PRESETS,
  resolvePageStyle,
} from '../src/documents/pageStyles.js';

describe('resolvePageStyle', () => {
  it('defaults to the current app-wide look when nothing is specified', () => {
    expect(resolvePageStyle()).toEqual({
      kind: 'page',
      width: 800,
      height: 800 * 1.414,
      background: BACKGROUND_PRESETS.find((p) => p.id === 'dark').css,
      ruling: 'lined',
    });
  });

  it('resolves a chosen format, background and ruling', () => {
    expect(
      resolvePageStyle({ pageKind: 'page', format: 'square', background: 'white', ruling: 'grid' }),
    ).toEqual({
      kind: 'page',
      width: PAGE_FORMATS.square.width,
      height: PAGE_FORMATS.square.height,
      background: '#FFFFFF',
      ruling: 'grid',
    });
  });

  it('falls back to defaults for unknown ids instead of throwing', () => {
    const result = resolvePageStyle({ format: 'nope', background: 'nope', ruling: 'nope' });
    expect(result.width).toBe(PAGE_FORMATS['a4-portrait'].width);
    expect(result.ruling).toBe('lined');
  });

  it('returns just a whiteboard marker for pageKind "whiteboard"', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard', format: 'square' })).toEqual({
      kind: 'whiteboard',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pageStyles.test.js`
Expected: FAIL — `Cannot find module '../src/documents/pageStyles.js'`

- [ ] **Step 3: Write the implementation**

```js
// src/documents/pageStyles.js
export const PAGE_FORMATS = {
  'a4-portrait': { width: 800, height: 800 * 1.414 },
  'a4-landscape': { width: 800 * 1.414, height: 800 },
  square: { width: 900, height: 900 },
};

export const BACKGROUND_PRESETS = [
  {
    id: 'dark',
    label: 'Dunkel',
    css: 'linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)',
  },
  { id: 'white', label: 'Weiß', css: '#FFFFFF' },
  { id: 'beige', label: 'Beige', css: '#EFECE4' },
  { id: 'gray', label: 'Grau', css: '#3A3A3E' },
];

export const RULING_PRESETS = ['blank', 'lined', 'grid', 'dotted'];

const DEFAULT_FORMAT = 'a4-portrait';
const DEFAULT_BACKGROUND = 'dark';
const DEFAULT_RULING = 'lined';

export function resolvePageStyle(options = {}) {
  const { pageKind, format, background, ruling } = options || {};

  if (pageKind === 'whiteboard') {
    return { kind: 'whiteboard' };
  }

  const formatPreset = PAGE_FORMATS[format] || PAGE_FORMATS[DEFAULT_FORMAT];
  const backgroundPreset =
    BACKGROUND_PRESETS.find((preset) => preset.id === background) ||
    BACKGROUND_PRESETS.find((preset) => preset.id === DEFAULT_BACKGROUND);
  const resolvedRuling = RULING_PRESETS.includes(ruling) ? ruling : DEFAULT_RULING;

  return {
    kind: 'page',
    width: formatPreset.width,
    height: formatPreset.height,
    background: backgroundPreset.css,
    ruling: resolvedRuling,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pageStyles.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/documents/pageStyles.js tests/pageStyles.test.js
git commit -m "$(cat <<'EOF'
feat(documents): add page format/background/ruling presets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `createInkDocument` accepts per-page defaults

**Files:**
- Modify: `src/ink/inkDocument.js:21-31`
- Test: `tests/inkDocument.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createInkDocument(documentId, pages, pageDefaults = {})` — every created page object is now `{ id: pageId, ...pageDefaults }` instead of just `{ id: pageId }`. Existing 2-arg calls are unaffected (defaults to `{}`, which spreads to nothing).

- [ ] **Step 1: Write the failing test**

Add to `tests/inkDocument.test.js` (inside the existing `describe('ink document schema', ...)` block, near the existing `createInkDocument` tests):

```js
  it('stamps supplied page defaults onto every created page', () => {
    expect(createInkDocument('note-8', 1, { kind: 'whiteboard' }).pages).toEqual([
      { id: 'note-8-page-1', kind: 'whiteboard' },
    ]);
  });

  it('keeps existing two-argument calls unaffected', () => {
    expect(createInkDocument('note-9', 1).pages).toEqual([{ id: 'note-9-page-1' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inkDocument.test.js`
Expected: FAIL on the first new test — `note-8-page-1` object has no `kind` key.

- [ ] **Step 3: Implement**

In `src/ink/inkDocument.js`, replace:

```js
export function createInkDocument(documentId, pages = 1) {
  const id = String(documentId);
  return {
    version: INK_SCHEMA_VERSION,
    documentId: id,
    pages: normalizePageIds(id, pages).map((pageId) => ({ id: pageId })),
    strokes: [],
    objects: [],
    updatedAt: 0,
  };
}
```

with:

```js
export function createInkDocument(documentId, pages = 1, pageDefaults = {}) {
  const id = String(documentId);
  const defaults =
    pageDefaults && typeof pageDefaults === 'object' && !Array.isArray(pageDefaults)
      ? pageDefaults
      : {};
  return {
    version: INK_SCHEMA_VERSION,
    documentId: id,
    pages: normalizePageIds(id, pages).map((pageId) => ({ id: pageId, ...defaults })),
    strokes: [],
    objects: [],
    updatedAt: 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/inkDocument.test.js`
Expected: PASS, including the two new tests and every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/ink/inkDocument.js tests/inkDocument.test.js
git commit -m "$(cat <<'EOF'
feat(ink): let createInkDocument stamp page defaults at creation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `useInkDocument` threads `initialPageStyle` through

**Files:**
- Modify: `src/hooks/useInkDocument.js`
- Test: `tests/useInkDocument.test.js` (new)

**Interfaces:**
- Consumes: `createInkDocument(documentId, pages, pageDefaults)` from Task 2.
- Produces: `useInkDocument({ documentId, initialPageIds, initialPageStyle, repository, saveDelay })` — `initialPageStyle` is forwarded to `createInkDocument` only when a *new* document is created (no persisted history yet for that `documentId`); it has no effect on a document that already exists in the repository.

- [ ] **Step 1: Write the failing test**

```js
// tests/useInkDocument.test.js
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useInkDocument from '../src/hooks/useInkDocument.js';

function createRepositoryDouble() {
  const store = new Map();
  return {
    loadHistory: vi.fn((id) => store.get(id)),
    saveHistory: vi.fn((id, history) => store.set(id, history)),
    loadPreferences: vi.fn(() => ({})),
    savePreferences: vi.fn(),
  };
}

describe('useInkDocument initialPageStyle', () => {
  it('stamps initialPageStyle onto a brand-new document', () => {
    const repository = createRepositoryDouble();
    const { result } = renderHook(() =>
      useInkDocument({
        documentId: 'wb-1',
        initialPageStyle: { kind: 'whiteboard' },
        repository,
      }),
    );
    expect(result.current.document.pages[0]).toMatchObject({ kind: 'whiteboard' });
  });

  it('ignores initialPageStyle when the document already has persisted history', () => {
    const repository = createRepositoryDouble();
    repository.loadHistory.mockReturnValue({
      past: [],
      present: {
        version: 1, documentId: 'existing-1',
        pages: [{ id: 'existing-1-page-1', kind: 'page' }],
        strokes: [], objects: [], updatedAt: 5,
      },
      future: [],
      limit: 100,
    });
    const { result } = renderHook(() =>
      useInkDocument({
        documentId: 'existing-1',
        initialPageStyle: { kind: 'whiteboard' },
        repository,
      }),
    );
    expect(result.current.document.pages[0].kind).toBe('page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/useInkDocument.test.js`
Expected: FAIL — first test's page has no `kind` key (the hook doesn't forward `initialPageStyle` yet).

- [ ] **Step 3: Implement**

In `src/hooks/useInkDocument.js`, replace:

```js
function createHistoryForDocument(repository, documentId, initialPageIds) {
  try {
    return (
      repository.loadHistory(documentId) ||
      createInkHistory(createInkDocument(documentId, initialPageIds))
    );
  } catch {
    return createInkHistory(createInkDocument(documentId, initialPageIds));
  }
}
```

with:

```js
function createHistoryForDocument(repository, documentId, initialPageIds, initialPageStyle) {
  try {
    return (
      repository.loadHistory(documentId) ||
      createInkHistory(createInkDocument(documentId, initialPageIds, initialPageStyle))
    );
  } catch {
    return createInkHistory(createInkDocument(documentId, initialPageIds, initialPageStyle));
  }
}
```

Then update the four call sites and the function signature:

```js
export default function useInkDocument({
  documentId,
  initialPageIds,
  initialPageStyle,
  repository = browserInkRepository,
  saveDelay = 120,
}) {
```

```js
  const [history, setHistory] = useState(() =>
    createHistoryForDocument(repository, activeDocumentId, initialPageIds, initialPageStyle),
  );
```

```js
  if (history.present.documentId !== activeDocumentId) {
    setHistory(
      createHistoryForDocument(repository, activeDocumentId, initialPageIds, initialPageStyle),
    );
  }
```

(The `applyCommands`/`applyCommand` callbacks' internal `createHistoryForDocument(repositoryRef.current, documentId)` calls — used only when history was created for a *different* document than the one a batched command targets — are left as-is: that path recovers from a document-id mismatch mid-flight, not initial creation, and passing `initialPageStyle` there would be wrong since it's a stale prop from a previous render.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/useInkDocument.test.js`
Expected: PASS (2 tests)

Then run the full existing suite for regressions:

Run: `npx vitest run`
Expected: PASS — no other test passes `initialPageStyle`, so this is purely additive.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useInkDocument.js tests/useInkDocument.test.js
git commit -m "$(cat <<'EOF'
feat(ink): thread initialPageStyle through useInkDocument

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `SplitLayout` resolves and seeds the page style

**Files:**
- Modify: `src/components/SplitLayout.jsx`
- Test: `tests/SplitLayout.test.jsx`

**Interfaces:**
- Consumes: `resolvePageStyle` (Task 1), `useInkDocument({..., initialPageStyle})` (Task 3).
- Produces: `SplitLayout`'s `paperStyle` toolbar state now seeds from the document's own page (`inkController.document.pages[0]?.ruling`) instead of a hardcoded `"lined"`, and new documents created via the dialog get their chosen format/background/ruling/kind stamped onto page 1.

- [ ] **Step 1: Write the failing test**

Add to `tests/SplitLayout.test.jsx`:

```js
  it('creates a new document with the requested page style', () => {
    const note = { id: 'styled-1', title: 'Blatt', subject: '', pageKind: 'page', format: 'square', background: 'white', ruling: 'grid' };
    render(<SplitLayout activeTab="smartCanvas" note={note} />);
    // The rail-btn paper-style toggle only exists in DocumentView's full render,
    // so assert indirectly via the ink document the hook produced: DocumentView
    // exposes it on window in test builds is overkill — assert through the
    // document-view's own data-page-count/data-document-id which already prove
    // the right controller mounted, and drive the toolbar-visible effect instead.
    expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id', 'styled-1');
  });

  it('seeds the ruling toggle from the document instead of always defaulting to lined', () => {
    const note = { id: 'styled-2', title: 'Blatt', subject: '', ruling: 'grid' };
    render(<SplitLayout activeTab="smartCanvas" note={note} />);
    fireEvent.click(screen.getByTestId('layout-mode-btn'));
    // WritingZone reads the same paperStyle prop DocumentView does; grid maps to
    // a distinct paper background color there (see WritingZone.jsx paperBgColor).
    expect(screen.getByTestId('writing-zone')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/SplitLayout.test.jsx`
Expected: The second test doesn't yet meaningfully assert anything file-specific — replace it before running with the stronger check below once you see what's actually easy to assert. Instead, write this single, directly-verifying test:

```js
  it('seeds the ruling toggle from the document instead of always defaulting to lined', () => {
    const note = { id: 'styled-3', title: 'Blatt', subject: '', ruling: 'grid' };
    const { container } = render(<SplitLayout activeTab="smartCanvas" note={note} />);
    // paperStyle flows into DocumentView's className as `paper-style-${paperStyle}`.
    expect(container.querySelector('.paper-style-grid')).toBeTruthy();
  });
```

Run: `npx vitest run tests/SplitLayout.test.jsx`
Expected: FAIL — `paperStyle` is still hardcoded to `"lined"`, so `.paper-style-grid` doesn't exist.

- [ ] **Step 3: Implement**

In `src/components/SplitLayout.jsx`, add the import:

```js
import { resolvePageStyle } from "../documents/pageStyles.js";
```

Replace:

```js
  const [isEraser, setIsEraser] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [paperStyle, setPaperStyle] = useState("lined");
  const [showPageBreaks, setShowPageBreaks] = useState(true);
  const [layoutMode, setLayoutMode] = useState("full"); // 'full' | 'split'
  const inkController = useInkDocument({ documentId, initialPageIds });
```

with:

```js
  const [isEraser, setIsEraser] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [showPageBreaks, setShowPageBreaks] = useState(true);
  const [layoutMode, setLayoutMode] = useState("full"); // 'full' | 'split'
  const initialPageStyle =
    note?.kind === "imported" ? undefined : resolvePageStyle(note || {});
  const inkController = useInkDocument({
    documentId,
    initialPageIds,
    initialPageStyle,
  });
  const [paperStyle, setPaperStyle] = useState(
    () => inkController.document.pages[0]?.ruling || "lined",
  );
```

(Moved `paperStyle`'s declaration below `inkController` since its initializer now reads from it — the rest of the file references `paperStyle`/`setPaperStyle` further down and is unaffected by the reorder.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/SplitLayout.test.jsx`
Expected: PASS, including all pre-existing tests in the file.

Also remove the first, weaker test added in Step 1 (the "creates a new document with the requested page style" one) — it doesn't assert anything Task 4 specifically changes; keep only the `.paper-style-grid` test plus whatever already existed.

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/SplitLayout.jsx tests/SplitLayout.test.jsx
git commit -m "$(cat <<'EOF'
feat(editor): seed page style from the document at creation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `DocumentView` honors custom format and background color

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Test: `tests/DocumentView.test.jsx`, `tests/DocumentViewMultiPage.test.jsx`

**Interfaces:**
- Consumes: `inkController.document.pages[0]` fields `width`/`height`/`background` (Tasks 2-4 make these available for a document created via the dialog; absent for every pre-existing document, where the fallbacks below reproduce today's exact behavior).

- [ ] **Step 1: Write the failing test**

Add to `tests/DocumentView.test.jsx` (using the file's existing `createControllerDouble` helper):

```js
test('renders a custom page format and background instead of the hardcoded default', () => {
  const controller = createControllerDouble({
    document: {
      version: 1,
      documentId: 'note-square',
      pages: [{ id: 'page-1', width: 900, height: 900, background: '#FFFFFF' }],
      strokes: [],
      updatedAt: 0,
    },
  });
  render(
    <DocumentView
      note={{ id: 'note-square' }}
      inkController={controller}
      toolbarState={toolState()}
      focusBoxState={{ focusBox: null, setFocusBox: vi.fn() }}
    />,
  );
  const page = screen.getByTestId('document-page');
  // The content div's inline width should reflect the 900px square format at zoom 1.
  expect(page.style.width).toBe('900px');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DocumentView.test.jsx -t "custom page format"`
Expected: FAIL — `page.style.width` is `"800px"` (the hardcoded default), not `"900px"`.

- [ ] **Step 3: Implement**

In `src/components/DocumentView.jsx`:

1. Add a module-level constant for the current default gradient, right after the existing `maxPages`/`emptyDocument` constants (around line 804):

```js
const DEFAULT_PAGE_BACKGROUND =
  "linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)";
```

2. Replace:

```js
  const [draftFocusBox, setDraftFocusBox] = useState(null);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const documentHeight = pageHeight * pagesCount;
  const pageDescriptors =
    note?.kind === "imported" &&
    Array.isArray(note.pages) &&
    note.pages.length > 0
      ? note.pages
      : pageIds.map((id, index) => ({
          id,
          index,
          width: baseWidth,
          height: pageHeight,
        }));
```

with:

```js
  const [draftFocusBox, setDraftFocusBox] = useState(null);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const resolvedPageWidth = inkDocument.pages[0]?.width || baseWidth;
  const resolvedPageHeight = inkDocument.pages[0]?.height || pageHeight;
  const pageBackground = inkDocument.pages[0]?.background || DEFAULT_PAGE_BACKGROUND;
  const documentHeight = resolvedPageHeight * pagesCount;
  const pageDescriptors =
    note?.kind === "imported" &&
    Array.isArray(note.pages) &&
    note.pages.length > 0
      ? note.pages
      : pageIds.map((id, index) => ({
          id,
          index,
          width: inkDocument.pages[index]?.width || baseWidth,
          height: inkDocument.pages[index]?.height || pageHeight,
        }));
```

3. Replace the `totalDocumentHeight` block:

```js
  const totalDocumentHeight = showPageBreaks
    ? note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : pagesCount * pageHeight * zoom + (pagesCount - 1) * PAGE_GAP
    : note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : documentHeight * zoom;
```

with:

```js
  const totalDocumentHeight = showPageBreaks
    ? note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : pagesCount * resolvedPageHeight * zoom + (pagesCount - 1) * PAGE_GAP
    : note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : documentHeight * zoom;
```

4. In `redrawInkCanvasRef.current`, replace:

```js
    const cssWidth = baseWidth * zoom;
    const cssHeight = totalDocumentHeight;
```

with:

```js
    const cssWidth = resolvedPageWidth * zoom;
    const cssHeight = totalDocumentHeight;
```

5. In the render return, replace:

```js
            width: `${baseWidth * zoom}px`,
            height: `${totalDocumentHeight}px`,
```

with:

```js
            width: `${resolvedPageWidth * zoom}px`,
            height: `${totalDocumentHeight}px`,
```

6. Replace the `!showPageBreaks` page-background block:

```js
          ) : !showPageBreaks ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${documentHeight * zoom}px`,
                borderRadius: isFullBleed ? 0 : isFullMode ? "22px 22px 0 0" : "20px",
                background:
                  "linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)",
                boxShadow:
                  "inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 34px 74px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${baseWidth}px`,
                  height: `${documentHeight}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "0 0",
                  ...getStaticBackgroundStyles(),
                  pointerEvents: "none",
                  willChange: "transform",
                }}
              />
            </div>
          ) : (
```

with:

```js
          ) : !showPageBreaks ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${documentHeight * zoom}px`,
                borderRadius: isFullBleed ? 0 : isFullMode ? "22px 22px 0 0" : "20px",
                background: pageBackground,
                boxShadow:
                  "inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 34px 74px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${resolvedPageWidth}px`,
                  height: `${documentHeight}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "0 0",
                  ...getStaticBackgroundStyles(),
                  pointerEvents: "none",
                  willChange: "transform",
                }}
              />
            </div>
          ) : (
```

7. Replace the `showPageBreaks` (multi-page card) block:

```js
            Array.from({ length: pagesCount }).map((_, i) => {
              const pageTop = i * (pageHeight * zoom + PAGE_GAP);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: `${pageTop}px`,
                    left: 0,
                    width: "100%",
                    height: `${pageHeight * zoom}px`,
                    borderRadius: isFullBleed ? 0 : "20px",
                    background:
                      "linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)",
                    boxShadow:
                      "inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 24px 50px -16px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)",
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${baseWidth}px`,
                      height: `${pageHeight}px`,
                      transform: `scale(${zoom})`,
                      transformOrigin: "0 0",
                      ...getStaticBackgroundStyles(),
                      pointerEvents: "none",
                    }}
                  />
                </div>
              );
            })
```

with:

```js
            Array.from({ length: pagesCount }).map((_, i) => {
              const pageTop = i * (resolvedPageHeight * zoom + PAGE_GAP);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: `${pageTop}px`,
                    left: 0,
                    width: "100%",
                    height: `${resolvedPageHeight * zoom}px`,
                    borderRadius: isFullBleed ? 0 : "20px",
                    background: pageBackground,
                    boxShadow:
                      "inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 24px 50px -16px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)",
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${resolvedPageWidth}px`,
                      height: `${resolvedPageHeight}px`,
                      transform: `scale(${zoom})`,
                      transformOrigin: "0 0",
                      ...getStaticBackgroundStyles(),
                      pointerEvents: "none",
                    }}
                  />
                </div>
              );
            })
```

`clampFocusBoxToPage`, `moveFocusBoxWithinPage`, and the wheel-zoom focus-box clamp keep using the fixed `baseWidth`/`pageHeight` module constants unchanged — the split-mode focus box is out of scope for custom formats in this plan (existing behavior for that feature is unaffected either way, since it isn't exposed via any dialog choice).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DocumentView.test.jsx tests/DocumentViewMultiPage.test.jsx`
Expected: PASS, including every pre-existing test (they don't set `width`/`height`/`background` on their page fixtures, so `resolvedPageWidth`/`resolvedPageHeight`/`pageBackground` fall back to today's exact constants).

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "$(cat <<'EOF'
feat(editor): honor per-document page format and background color

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `NewDocumentDialog` component

**Files:**
- Create: `src/components/NewDocumentDialog.jsx`
- Test: `tests/NewDocumentDialog.test.jsx`

**Interfaces:**
- Consumes: `PAGE_FORMATS`, `BACKGROUND_PRESETS`, `RULING_PRESETS` (Task 1).
- Produces: `<NewDocumentDialog open subject onCreate(payload) onClose />`. `payload` shape: `{ title, subject, pageKind, format, background, ruling }`, where `pageKind` is `"page" | "whiteboard"`.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/NewDocumentDialog.test.jsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/NewDocumentDialog.test.jsx`
Expected: FAIL — `Cannot find module '../src/components/NewDocumentDialog.jsx'`

- [ ] **Step 3: Implement**

```jsx
// src/components/NewDocumentDialog.jsx
import React, { useState } from "react";
import { X } from "lucide-react";
import {
  PAGE_FORMATS,
  BACKGROUND_PRESETS,
  RULING_PRESETS,
} from "../documents/pageStyles.js";

const RULING_LABELS = { blank: "Blanko", lined: "Liniert", grid: "Kariert", dotted: "Punktraster" };
const FORMAT_LABELS = {
  "a4-portrait": "A4 Hochformat",
  "a4-landscape": "A4 Querformat",
  square: "Quadratisch",
};

export default function NewDocumentDialog({ open, subject = "", onCreate, onClose }) {
  const [pageKind, setPageKind] = useState("page");
  const [format, setFormat] = useState("a4-portrait");
  const [background, setBackground] = useState("dark");
  const [ruling, setRuling] = useState("lined");
  const [title, setTitle] = useState("");

  if (!open) return null;

  const defaultTitle = subject ? `Neue ${subject}-Notiz` : "Neue Notiz";

  const submit = () => {
    onCreate?.({
      title: title.trim() || defaultTitle,
      subject: subject || "",
      pageKind,
      format,
      background,
      ruling,
    });
  };

  const optionButtonStyle = (active) => ({
    flex: 1,
    padding: "8px 6px",
    borderRadius: 10,
    fontSize: 12,
    border: active ? "2px solid #3E7BD8" : "1px solid rgba(255,255,255,.15)",
    background: active ? "rgba(62,123,216,.15)" : "transparent",
    color: "#FFFFFF",
    cursor: "pointer",
  });

  return (
    <div
      data-testid="new-document-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 440,
          maxWidth: "90vw",
          borderRadius: 20,
          background: "#18181C",
          color: "#FFFFFF",
          padding: 24,
          boxShadow: "0 40px 90px -20px rgba(0,0,0,.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ font: '700 18px "Bricolage Grotesque",sans-serif' }}>Neues Dokument</span>
          <button
            data-testid="new-doc-cancel"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          data-testid="new-doc-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle}
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.06)",
            color: "#FFFFFF",
            font: "500 14px sans-serif",
          }}
        />

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Seitentyp</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["page", "whiteboard"].map((kind) => (
              <button
                key={kind}
                data-testid={`new-doc-kind-${kind}`}
                onClick={() => setPageKind(kind)}
                style={optionButtonStyle(pageKind === kind)}
              >
                {kind === "page" ? "Normal" : "Whiteboard"}
              </button>
            ))}
          </div>
        </div>

        {pageKind === "page" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Format</div>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.keys(PAGE_FORMATS).map((id) => (
                  <button
                    key={id}
                    data-testid={`new-doc-format-${id}`}
                    onClick={() => setFormat(id)}
                    style={optionButtonStyle(format === id)}
                  >
                    {FORMAT_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Hintergrundfarbe</div>
              <div style={{ display: "flex", gap: 8 }}>
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    data-testid={`new-doc-background-${preset.id}`}
                    onClick={() => setBackground(preset.id)}
                    title={preset.label}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: preset.css,
                      border:
                        background === preset.id
                          ? "2px solid #3E7BD8"
                          : "1px solid rgba(255,255,255,.25)",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>Linierung</div>
              <div style={{ display: "flex", gap: 8 }}>
                {RULING_PRESETS.map((id) => (
                  <button
                    key={id}
                    data-testid={`new-doc-ruling-${id}`}
                    onClick={() => setRuling(id)}
                    style={optionButtonStyle(ruling === id)}
                  >
                    {RULING_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <button
          data-testid="new-doc-submit"
          onClick={submit}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 12,
            border: "none",
            background: "#FFFFFF",
            color: "#08080A",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Erstellen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/NewDocumentDialog.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/NewDocumentDialog.jsx tests/NewDocumentDialog.test.jsx
git commit -m "$(cat <<'EOF'
feat(library): add document creation options dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire the dialog into `Library.jsx`

**Files:**
- Modify: `src/components/Library.jsx:3108-3130` (search-pill "+" button), `src/components/Library.jsx:3271-3312` (`new-note-btn` pill)
- Modify: `tests/App.test.jsx` (two tests that assume immediate navigation)

**Interfaces:**
- Consumes: `<NewDocumentDialog open subject onCreate onClose />` (Task 6).
- Produces: both buttons now open the dialog instead of calling `onOpenNote` directly; the dialog's `onCreate` payload is what gets passed to `onOpenNote`.

- [ ] **Step 1: Write the failing test**

Update the two affected tests in `tests/App.test.jsx`:

Replace:

```js
  it('opens the editor from a note and can return to the library', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });
```

with:

```js
  it('opens the editor from a note and can return to the library', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Neue Notiz'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    expect(screen.getByTestId('document-view')).toBeInTheDocument();
    expect(screen.queryByText('Bibliothek')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Zurück zur Bibliothek'));
    expect(screen.getByText('Bibliothek')).toBeInTheDocument();
  });
```

Replace:

```js
  it('passes a stable generated ID to a newly opened note', () => {
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByTestId('new-note-btn'));

    const documentId = screen.getByTestId('document-view').getAttribute('data-document-id');
```

with:

```js
  it('passes a stable generated ID to a newly opened note', () => {
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByTestId('new-note-btn'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));

    const documentId = screen.getByTestId('document-view').getAttribute('data-document-id');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/App.test.jsx`
Expected: FAIL — clicking `new-doc-submit` throws `Unable to find an element by: [data-testid="new-doc-submit"]` because the buttons still call `onOpenNote` directly and no dialog renders.

- [ ] **Step 3: Implement**

In `src/components/Library.jsx`, add the import near the other component imports at the top of the file:

```js
import NewDocumentDialog from "./NewDocumentDialog.jsx";
```

Add dialog-open state alongside `Library`'s other `useState` declarations (near where `searchQuery`/`isMicActive` etc. are declared — same component scope as the two buttons being changed):

```js
  const [isNewDocDialogOpen, setIsNewDocDialogOpen] = useState(false);
```

Replace the search-pill button's `onClick`:

```js
        <button
          onClick={() =>
            onOpenNote?.({
              title: selectedSubject
                ? `Neue ${selectedSubject.name}-Notiz`
                : "Neue Notiz",
              subject: selectedSubject ? selectedSubject.name : "",
            })
          }
```

with:

```js
        <button
          onClick={() => setIsNewDocDialogOpen(true)}
```

Replace the `new-note-btn` pill's `onClick`:

```js
      <div
        ref={newNoteRef}
        onClick={() =>
          onOpenNote?.({
            title: selectedSubject
              ? `Neue ${selectedSubject.name}-Notiz`
              : "Neue Notiz",
            subject: selectedSubject ? selectedSubject.name : "",
          })
        }
        className="liquid-glass-pill lib-newnote"
```

with:

```js
      <div
        ref={newNoteRef}
        onClick={() => setIsNewDocDialogOpen(true)}
        className="liquid-glass-pill lib-newnote"
```

Finally, render the dialog once near the end of `Library`'s returned JSX (immediately before the component's closing top-level tag, so it overlays everything):

```jsx
      <NewDocumentDialog
        open={isNewDocDialogOpen}
        subject={selectedSubject ? selectedSubject.name : ""}
        onCreate={(payload) => {
          setIsNewDocDialogOpen(false);
          onOpenNote?.(payload);
        }}
        onClose={() => setIsNewDocDialogOpen(false)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/App.test.jsx`
Expected: PASS, including every other pre-existing test in the file (they don't touch note creation).

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/Library.jsx tests/App.test.jsx
git commit -m "$(cat <<'EOF'
feat(library): open the creation dialog before starting a new note

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `whiteboardCoordinates.js` — screen↔world mapping

**Files:**
- Create: `src/ink/whiteboardCoordinates.js`
- Test: `tests/whiteboardCoordinates.test.js`

**Interfaces:**
- Produces: `screenToWorld({x, y, scale}, {x, y}) -> {x, y}`, `worldToScreen({x, y, scale}, {x, y}) -> {x, y}`. `camera` is `{x, y, scale}` — the world coordinate that maps to screen `(0,0)` is `(camera.x, camera.y)`, at `camera.scale` screen-pixels per world-unit.

- [ ] **Step 1: Write the failing test**

```js
// tests/whiteboardCoordinates.test.js
import { describe, expect, it } from 'vitest';
import { screenToWorld, worldToScreen } from '../src/ink/whiteboardCoordinates.js';

describe('whiteboard screen/world coordinate mapping', () => {
  it('maps the camera origin to screen (0,0)', () => {
    const camera = { x: 500, y: 200, scale: 1 };
    expect(screenToWorld(camera, { x: 0, y: 0 })).toEqual({ x: 500, y: 200 });
  });

  it('divides by scale when going screen -> world', () => {
    const camera = { x: 0, y: 0, scale: 2 };
    expect(screenToWorld(camera, { x: 100, y: 50 })).toEqual({ x: 50, y: 25 });
  });

  it('is the exact inverse of worldToScreen for arbitrary camera state', () => {
    const camera = { x: 137, y: -42, scale: 1.7 };
    const world = { x: 1000, y: -250 };
    const screen = worldToScreen(camera, world);
    const roundTripped = screenToWorld(camera, screen);
    expect(roundTripped.x).toBeCloseTo(world.x);
    expect(roundTripped.y).toBeCloseTo(world.y);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/whiteboardCoordinates.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```js
// src/ink/whiteboardCoordinates.js
export function screenToWorld(camera, point) {
  return {
    x: point.x / camera.scale + camera.x,
    y: point.y / camera.scale + camera.y,
  };
}

export function worldToScreen(camera, point) {
  return {
    x: (point.x - camera.x) * camera.scale,
    y: (point.y - camera.y) * camera.scale,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/whiteboardCoordinates.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ink/whiteboardCoordinates.js tests/whiteboardCoordinates.test.js
git commit -m "$(cat <<'EOF'
feat(ink): add screen<->world coordinate mapping for the whiteboard camera

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `useWhiteboardCamera` — pan/zoom state

**Files:**
- Create: `src/hooks/useWhiteboardCamera.js`
- Test: `tests/useWhiteboardCamera.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `useWhiteboardCamera(initial = {x:0,y:0,scale:1}) -> { camera, panBy(dxScreen, dyScreen), zoomBy(screenPoint, factor), focusWorldPointAtScreen(worldPoint, screenPoint, scale) }`. Scale is clamped to `[0.1, 4]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/useWhiteboardCamera.test.js
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useWhiteboardCamera from '../src/hooks/useWhiteboardCamera.js';

describe('useWhiteboardCamera', () => {
  it('starts at the given initial camera', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 10, y: 20, scale: 2 }));
    expect(result.current.camera).toEqual({ x: 10, y: 20, scale: 2 });
  });

  it('panBy moves the camera opposite the screen delta, scaled', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 0, y: 0, scale: 2 }));
    act(() => result.current.panBy(20, 10));
    expect(result.current.camera).toEqual({ x: -10, y: -5, scale: 2 });
  });

  it('zoomBy keeps the screen point fixed in world space', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 0, y: 0, scale: 1 }));
    act(() => result.current.zoomBy({ x: 100, y: 100 }, 2));
    // World point under (100,100) was (100,100) before zoom; after doubling
    // scale it must still be (100,100) under that same screen point.
    const { camera } = result.current;
    expect(camera.scale).toBe(2);
    expect(100 / camera.scale + camera.x).toBeCloseTo(100);
    expect(100 / camera.scale + camera.y).toBeCloseTo(100);
  });

  it('clamps scale to [0.1, 4]', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 0, y: 0, scale: 1 }));
    act(() => result.current.zoomBy({ x: 0, y: 0 }, 100));
    expect(result.current.camera.scale).toBe(4);
    act(() => result.current.zoomBy({ x: 0, y: 0 }, 0.0001));
    expect(result.current.camera.scale).toBe(0.1);
  });

  it('focusWorldPointAtScreen sets camera so the world point lands exactly on the screen point', () => {
    const { result } = renderHook(() => useWhiteboardCamera());
    act(() => result.current.focusWorldPointAtScreen({ x: 400, y: 300 }, { x: 50, y: 60 }, 1.5));
    const { camera } = result.current;
    expect(camera.scale).toBe(1.5);
    expect((400 - camera.x) * camera.scale).toBeCloseTo(50);
    expect((300 - camera.y) * camera.scale).toBeCloseTo(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/useWhiteboardCamera.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```js
// src/hooks/useWhiteboardCamera.js
import { useCallback, useState } from "react";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

function clampScale(scale) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export default function useWhiteboardCamera(initial = { x: 0, y: 0, scale: 1 }) {
  const [camera, setCamera] = useState(initial);

  const panBy = useCallback((dxScreen, dyScreen) => {
    setCamera((prev) => ({
      ...prev,
      x: prev.x - dxScreen / prev.scale,
      y: prev.y - dyScreen / prev.scale,
    }));
  }, []);

  const zoomBy = useCallback((screenPoint, factor) => {
    setCamera((prev) => {
      const scale = clampScale(prev.scale * factor);
      const worldX = screenPoint.x / prev.scale + prev.x;
      const worldY = screenPoint.y / prev.scale + prev.y;
      return {
        scale,
        x: worldX - screenPoint.x / scale,
        y: worldY - screenPoint.y / scale,
      };
    });
  }, []);

  const focusWorldPointAtScreen = useCallback((worldPoint, screenPoint, scale) => {
    const clamped = clampScale(scale);
    setCamera({
      scale: clamped,
      x: worldPoint.x - screenPoint.x / clamped,
      y: worldPoint.y - screenPoint.y / clamped,
    });
  }, []);

  return { camera, panBy, zoomBy, focusWorldPointAtScreen };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/useWhiteboardCamera.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWhiteboardCamera.js tests/useWhiteboardCamera.test.js
git commit -m "$(cat <<'EOF'
feat(ink): add whiteboard pan/zoom camera state hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `WhiteboardCanvas` — viewport-relative renderer

**Files:**
- Create: `src/components/document/WhiteboardCanvas.jsx`
- Test: `tests/WhiteboardCanvas.test.jsx`

**Interfaces:**
- Consumes: `renderInkStroke(context, stroke, transform)` (existing, `src/ink/renderInk.js`).
- Produces: `<WhiteboardCanvas pageId strokes draftStroke camera={{x,y,scale}} width height dpr />` — a `<canvas>` sized to the viewport (`width`×`height` CSS px), redrawn on any prop change, applying the camera as a `renderInkStroke` transform instead of accumulating a page-sized raster.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/WhiteboardCanvas.test.jsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WhiteboardCanvas from '../src/components/document/WhiteboardCanvas.jsx';
import * as renderInk from '../src/ink/renderInk.js';

afterEach(() => vi.restoreAllMocks());

function stubContext() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  return ctx;
}

describe('WhiteboardCanvas', () => {
  it('sizes the canvas backing store to the viewport at the given dpr', () => {
    stubContext();
    const { getByTestId } = render(
      <WhiteboardCanvas pageId="p1" strokes={[]} camera={{ x: 0, y: 0, scale: 1 }} width={400} height={300} dpr={2} />,
    );
    const canvas = getByTestId('whiteboard-canvas');
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('draws only strokes belonging to this page, transformed by the camera', () => {
    stubContext();
    const spy = vi.spyOn(renderInk, 'renderInkStroke');
    const strokes = [
      { id: 's1', pageId: 'p1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { id: 's2', pageId: 'other-page', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    ];
    render(
      <WhiteboardCanvas
        pageId="p1"
        strokes={strokes}
        camera={{ x: 50, y: 20, scale: 2 }}
        width={400}
        height={300}
        dpr={1}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      strokes[0],
      { offsetX: -100, offsetY: -40, scaleX: 2, scaleY: 2 },
    );
  });

  it('also draws the live draft stroke when present', () => {
    stubContext();
    const spy = vi.spyOn(renderInk, 'renderInkStroke');
    const draftStroke = { id: 'draft', pageId: 'p1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    render(
      <WhiteboardCanvas
        pageId="p1"
        strokes={[]}
        draftStroke={draftStroke}
        camera={{ x: 0, y: 0, scale: 1 }}
        width={400}
        height={300}
        dpr={1}
      />,
    );
    expect(spy).toHaveBeenCalledWith(expect.anything(), draftStroke, expect.anything());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/WhiteboardCanvas.test.jsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```jsx
// src/components/document/WhiteboardCanvas.jsx
import React, { useEffect, useRef } from "react";
import { renderInkStroke } from "../../ink/renderInk.js";

// ponytail: redraws every stroke on every camera/stroke change (no viewport
// culling, no incremental per-segment paint like the page-stack canvas).
// Fine at normal note stroke counts; add bounding-box culling if a whiteboard
// document's stroke count makes full redraws visibly slow.
export default function WhiteboardCanvas({
  pageId,
  strokes = [],
  draftStroke,
  camera,
  width,
  height,
  dpr = 1,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const transform = {
      offsetX: -camera.x * camera.scale,
      offsetY: -camera.y * camera.scale,
      scaleX: camera.scale,
      scaleY: camera.scale,
    };

    for (const stroke of strokes) {
      if (stroke.pageId === pageId) renderInkStroke(ctx, stroke, transform);
    }
    if (draftStroke && draftStroke.pageId === pageId) {
      renderInkStroke(ctx, draftStroke, transform);
    }
  }, [pageId, strokes, draftStroke, camera, width, height, dpr]);

  return (
    <canvas
      ref={canvasRef}
      className="whiteboard-ink-canvas"
      data-testid="whiteboard-canvas"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        touchAction: "none",
      }}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/WhiteboardCanvas.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/document/WhiteboardCanvas.jsx tests/WhiteboardCanvas.test.jsx
git commit -m "$(cat <<'EOF'
feat(ink): add viewport-relative whiteboard canvas renderer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `WhiteboardEditor` — composition, pointer and gesture wiring

**Files:**
- Create: `src/components/WhiteboardEditor.jsx`
- Test: `tests/WhiteboardEditor.test.jsx`

**Interfaces:**
- Consumes: `useInkPointer` (existing, `src/hooks/useInkPointer.js`), `useWhiteboardCamera` (Task 9), `screenToWorld` (Task 8), `WhiteboardCanvas` (Task 10), `loadPalmProfile`/`palmGuardFromProfile` (existing, `src/ink/palmSettings.js`).
- Produces: `<WhiteboardEditor inkController railSlot />`. `inkController` is the same shape `useInkDocument` returns (`document`, `tool`, `color`, `penWidth`, `eraserWidth`, `eraserMode`, `inputMode`, `commitStroke`, `removeStrokes`, `undo`, `redo`, `canUndo`, `canRedo`). Assumes `inkController.document.pages[0]` exists and is the whiteboard's single page — callers (Task 12) only mount this when that's true.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/WhiteboardEditor.test.jsx
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WhiteboardEditor from '../src/components/WhiteboardEditor.jsx';

function createControllerDouble(overrides = {}) {
  return {
    document: {
      version: 1,
      documentId: 'wb-1',
      pages: [{ id: 'wb-1-page-1', kind: 'whiteboard' }],
      strokes: [],
      objects: [],
      updatedAt: 0,
    },
    tool: 'pen',
    color: '#EFECE4',
    penWidth: 3,
    eraserWidth: 15,
    eraserMode: 'pixel',
    inputMode: 'stylus',
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    ...overrides,
  };
}

describe('WhiteboardEditor', () => {
  it('renders a whiteboard canvas for the document\'s single page', () => {
    render(<WhiteboardEditor inkController={createControllerDouble()} />);
    expect(screen.getByTestId('whiteboard-canvas')).toBeInTheDocument();
  });

  it('draws a stroke on mouse drag and commits it on release', () => {
    const commitStroke = vi.fn();
    render(<WhiteboardEditor inkController={createControllerDouble({ commitStroke })} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 40, clientY: 30 });

    expect(commitStroke).toHaveBeenCalledTimes(1);
    const stroke = commitStroke.mock.calls[0][0];
    expect(stroke.pageId).toBe('wb-1-page-1');
    expect(stroke.points.length).toBeGreaterThanOrEqual(2);
  });

  it('wires undo/redo buttons to the controller', () => {
    const undo = vi.fn();
    const redo = vi.fn();
    render(
      <WhiteboardEditor
        inkController={createControllerDouble({ undo, redo, canUndo: true, canRedo: true })}
      />,
    );
    fireEvent.click(screen.getByTitle('Rückgängig'));
    fireEvent.click(screen.getByTitle('Wiederholen'));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('toggles eraser on and off', () => {
    render(<WhiteboardEditor inkController={createControllerDouble()} />);
    const eraserBtn = screen.getByTitle('Radierer');
    expect(eraserBtn).toHaveClass('active', { exact: false });
    fireEvent.click(eraserBtn);
    expect(eraserBtn.className).toContain('active');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```jsx
// src/components/WhiteboardEditor.jsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Undo2, Redo2, PenLine, Eraser } from "lucide-react";
import useInkPointer from "../hooks/useInkPointer.js";
import useWhiteboardCamera from "../hooks/useWhiteboardCamera.js";
import { loadPalmProfile, palmGuardFromProfile } from "../ink/palmSettings.js";
import { screenToWorld } from "../ink/whiteboardCoordinates.js";
import WhiteboardCanvas from "./document/WhiteboardCanvas.jsx";

function relativePoint(element, event) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export default function WhiteboardEditor({ inkController, railSlot }) {
  const containerRef = useRef(null);
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const [isEraser, setIsEraser] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { camera, panBy, zoomBy, focusWorldPointAtScreen } = useWhiteboardCamera();
  const palmGuard = useMemo(() => palmGuardFromProfile(loadPalmProfile()), []);

  const document = inkController.document;
  const pageId = document.pages[0]?.id || "";
  const strokes = document.strokes;

  const mapPoint = useCallback(
    (event) => {
      const point = relativePoint(containerRef.current, event);
      if (!point) return null;
      const world = screenToWorld(camera, point);
      return { pageId, x: world.x, y: world.y };
    },
    [camera, pageId],
  );

  const inkPointer = useInkPointer({
    inputMode: inkController.inputMode,
    palmGuard,
    tool: isEraser
      ? inkController.eraserMode === "stroke"
        ? "stroke-eraser"
        : "pixel-eraser"
      : inkController.tool,
    eraserMode: inkController.eraserMode,
    color: inkController.color,
    width: isEraser ? inkController.eraserWidth : inkController.penWidth,
    mapPoint,
    document,
    commitStroke: inkController.commitStroke,
    removeStrokes: inkController.removeStrokes,
  });

  const measureRef = useCallback((node) => {
    containerRef.current = node;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        inkPointer.abortActiveStroke?.(event.pointerId, event.timeStamp);
        const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const [a, b] = Array.from(touchesRef.current.values());
        const centerScreen = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        pinchRef.current = {
          startDistance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
          startScale: camera.scale,
          worldCenter: screenToWorld(camera, centerScreen),
        };
        return;
      }
      if (touchesRef.current.size > 2) return;
    }
    inkPointer.onPointerDown(event);
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2 && pinchRef.current) {
        const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const [a, b] = Array.from(touchesRef.current.values());
        const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
        const centerScreen = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const scale = pinchRef.current.startScale * (distance / pinchRef.current.startDistance);
        focusWorldPointAtScreen(pinchRef.current.worldCenter, centerScreen, scale);
        return;
      }
      if (touchesRef.current.size >= 2) return;
    }
    inkPointer.onPointerMove(event);
  };

  const handlePointerUp = (event) => {
    if (event.pointerType === "touch") {
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    }
    inkPointer.onPointerUp(event);
  };

  const handlePointerCancel = (event) => {
    if (event.pointerType === "touch") {
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    }
    inkPointer.onPointerCancel(event);
  };

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const normalizedDeltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const normalizedDeltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (event.ctrlKey) {
        const rect = node.getBoundingClientRect();
        const factor = Math.exp(-normalizedDeltaY * 0.0015);
        zoomBy({ x: event.clientX - rect.left, y: event.clientY - rect.top }, factor);
      } else {
        panBy(-normalizedDeltaX, -normalizedDeltaY);
      }
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [panBy, zoomBy]);

  const railContent = (
    <>
      <button
        className="rail-btn"
        onClick={() => inkController.undo?.()}
        disabled={!inkController.canUndo}
        style={{ opacity: inkController.canUndo ? 1 : 0.35 }}
        title="Rückgängig"
      >
        <Undo2 size={19} />
      </button>
      <button
        className="rail-btn"
        onClick={() => inkController.redo?.()}
        disabled={!inkController.canRedo}
        style={{ opacity: inkController.canRedo ? 1 : 0.35 }}
        title="Wiederholen"
      >
        <Redo2 size={19} />
      </button>
      <button
        className={`rail-btn ${!isEraser ? "active" : ""}`}
        onClick={() => setIsEraser(false)}
        title="Stift"
      >
        <PenLine size={19} />
      </button>
      <button
        className={`rail-btn ${isEraser ? "active" : ""}`}
        onClick={() => setIsEraser(true)}
        title="Radierer"
      >
        <Eraser size={19} />
      </button>
    </>
  );

  return (
    <div
      data-testid="document-view"
      data-document-id={document.documentId}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0B0B0D" }}
    >
      <div
        ref={measureRef}
        data-testid="whiteboard-surface"
        style={{ position: "absolute", inset: 0, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {size.width > 0 && size.height > 0 && (
          <WhiteboardCanvas
            pageId={pageId}
            strokes={strokes}
            draftStroke={inkPointer.draftStroke}
            camera={camera}
            width={size.width}
            height={size.height}
            dpr={globalThis.devicePixelRatio || 1}
          />
        )}
      </div>
      {railSlot ? createPortal(railContent, railSlot) : railContent}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx`
Expected: PASS (4 tests). Note: `ResizeObserver` must exist in the test environment — check `tests/setup.js` first; if it doesn't already polyfill `ResizeObserver` (`DocumentPage.jsx`/other components already rely on `IntersectionObserver`/`ResizeObserver` in tests, so it very likely already does), add this to `tests/setup.js` only if the test fails with `ResizeObserver is not defined`:

```js
global.ResizeObserver = global.ResizeObserver || class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
```

- [ ] **Step 5: Commit**

```bash
git add src/components/WhiteboardEditor.jsx tests/WhiteboardEditor.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): add free-pan/zoom whiteboard editor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `DocumentView` dispatches to `WhiteboardEditor`

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Test: `tests/DocumentView.test.jsx`

**Interfaces:**
- Consumes: `WhiteboardEditor` (Task 11).
- Produces: `DocumentView` renders `WhiteboardEditor` instead of the page-stack tree whenever `inkController.document.pages[0]?.kind === "whiteboard"`; every existing (non-whiteboard) code path is completely untouched.

- [ ] **Step 1: Write the failing test**

Add to `tests/DocumentView.test.jsx`:

```js
test('renders WhiteboardEditor instead of the page-stack view for a whiteboard document', () => {
  const controller = createControllerDouble({
    document: {
      version: 1,
      documentId: 'wb-doc',
      pages: [{ id: 'wb-doc-page-1', kind: 'whiteboard' }],
      strokes: [],
      objects: [],
      updatedAt: 0,
    },
  });
  render(
    <DocumentView
      note={{ id: 'wb-doc' }}
      inkController={controller}
      toolbarState={toolState()}
      focusBoxState={{ focusBox: null, setFocusBox: vi.fn() }}
    />,
  );
  expect(screen.getByTestId('whiteboard-surface')).toBeInTheDocument();
  expect(screen.queryByTestId('document-page')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DocumentView.test.jsx -t "WhiteboardEditor instead"`
Expected: FAIL — `whiteboard-surface` doesn't exist; `DocumentView` renders its normal page-stack tree regardless of `page.kind`.

- [ ] **Step 3: Implement**

In `src/components/DocumentView.jsx`, add the import near the top with the other component imports:

```js
import WhiteboardEditor from "./WhiteboardEditor.jsx";
```

Then, as the very first lines inside the `DocumentView` function body (before the `toolbarState ||` destructure), add the early return:

```js
export default function DocumentView({
  note,
  sourceHandle,
  sourceLoading,
  sourceError,
  retrySource,
  inkController,
  focusBoxState,
  toolbarState,
  onBack,
  railSlot,
  onCurrentPageChange,
  isImmersive,
}) {
  if (inkController?.document?.pages?.[0]?.kind === "whiteboard") {
    return <WhiteboardEditor inkController={inkController} railSlot={railSlot} />;
  }

  const {
    color,
    setColor,
```

(No hooks run before this check — `inkController` is a prop, not a hook call inside `DocumentView` — so this satisfies the Rules of Hooks: every hook below still runs unconditionally for every render of a non-whiteboard document, and none run for a whiteboard document, which is consistent for the lifetime of one mounted `DocumentView` since a document's `kind` never changes after creation.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: PASS, including every pre-existing test (none of their fixtures set `page.kind`, so they all still take the original path).

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): dispatch whiteboard documents to WhiteboardEditor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test passes, zero regressions.

- [ ] **Step 2: Start the dev server and open it**

Use the project's preview tooling to start the dev server (check `.claude/launch.json`; if it doesn't exist yet, create it pointing at `npm run dev` and the Vite port from `vite.config.js`) and open it in the browser pane.

- [ ] **Step 3: Verify the normal-page options**

- Click the "+" button (or the "Neue Notiz" pill) in the library.
- Confirm the dialog opens with "Normal" pre-selected, A4 Hochformat, the dark background swatch, and "Liniert" pre-selected.
- Pick "Quadratisch" format, the white background swatch, and "Kariert" ruling, then click "Erstellen".
- Confirm the editor opens showing a square white page with a grid pattern, and that drawing a stroke near the page's right/bottom edge is not clipped.
- Go back to the library and create a plain default note; confirm it looks pixel-identical to a note created before this change (dark page, lined ruling, A4 portrait).

- [ ] **Step 4: Verify the whiteboard**

- Open the creation dialog, choose "Whiteboard", click "Erstellen".
- Confirm the editor shows a full-bleed canvas with just Undo/Redo/Pen/Eraser in the rail (no page navigation, no lasso/shape/text tools).
- Draw a few strokes with the mouse.
- Pan: hold Ctrl and scroll to zoom in/out anchored under the cursor; scroll without Ctrl to pan.
- Confirm strokes stay visually fixed in world space while panning/zooming (they move/scale with the camera, not with the viewport).
- Click Undo, confirm the last stroke disappears; click Redo, confirm it comes back.
- Draw far outside the original viewport (pan away first, then draw); confirm there's no visible boundary/edge.

- [ ] **Step 5: Check the browser console for errors**

Use `read_console_messages` (or the browser devtools) after each of the above interactions; expected: no errors or warnings introduced by this feature.

- [ ] **Step 6: Report results**

No commit for this task — it's verification only. If any check fails, go back to the relevant task, fix, re-run that task's tests, and re-verify here.
