# Premium Ink Engine Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current coupled dual-canvas drawing path with a persistent, page-aware, pointer-safe vector ink engine shared by the full document and focus writing area.

**Architecture:** Pure modules own the versioned ink document, bounded snapshot history, pointer policy, page coordinate mapping, rendering, and persistence. A single React controller hook composes those modules; `DocumentView` and `WritingZone` become input/render projections of the same controller and never maintain competing histories.

**Tech Stack:** React 19, JavaScript ES modules, Canvas 2D, Pointer Events, localStorage, Vitest 4, Testing Library, Vite 8.

**Spec:** `docs/superpowers/specs/2026-08-24-ink-engine-architecture-design.md`

## Global Constraints

- Preserve the existing editor layout; only input-mode and eraser-mode controls may be added.
- Stylus mode is the default: pen draws, touch navigates, mouse draws.
- Finger mode admits one touch for drawing and transfers two-touch input to navigation.
- Pressure data is ignored.
- Ink coordinates are page-local and independent of zoom, DPR, viewport size, and visual page gaps.
- Full document and focus writing area use one controller and one bounded undo/redo history.
- Ink document, history, tool preferences, input mode, and eraser mode persist locally per stable note ID.
- Stored payloads are schema-versioned and malformed payloads never crash the editor.
- Existing unrelated Android migration files and existing user changes in `src/styles/main.css` must be preserved.
- No new runtime dependency is required.

## File Structure

### New production files

- `src/ink/inkDocument.js` — schema constants, document/stroke factories, validation, immutable command application, bounded history, and geometric stroke hit testing.
- `src/ink/inputPolicy.js` — pure pointer admission and ownership state machine.
- `src/ink/pageCoordinates.js` — pure document/page/focus coordinate conversion.
- `src/ink/renderInk.js` — deterministic Canvas 2D sizing and complete-path rendering.
- `src/ink/inkRepository.js` — versioned localStorage serialization for history and preferences.
- `src/hooks/useInkDocument.js` — the sole React controller for commands, history, persistence, and preferences.
- `src/hooks/useInkPointer.js` — reusable React pointer adapter that collects a draft stroke and commits through the controller.

### New tests

- `tests/inkDocument.test.js`
- `tests/inputPolicy.test.js`
- `tests/pageCoordinates.test.js`
- `tests/renderInk.test.js`
- `tests/inkRepository.test.js`
- `tests/useInkDocument.test.js`
- `tests/useInkPointer.test.js`
- `tests/InkWorkspace.test.jsx`

### Modified production files

- `src/App.jsx` — normalize every opened note to a stable string ID and pass it into the editor.
- `src/components/SplitLayout.jsx` — create one controller, hold presentation-only tool state, and pass shared state to both views.
- `src/components/DocumentView.jsx` — consume the controller, pointer adapter, page mapper, and renderer; remove direct history and raw drawing ownership.
- `src/components/WritingZone.jsx` — become a focus projection of shared ink; remove global DOM queries and local history.
- `src/hooks/useFocusBox.js` — store page-local focus rectangles with a page ID.
- `src/styles/main.css` — append only narrow styles if the two new state controls cannot use existing rail styles.

### Removed after migration

- `src/hooks/useCanvas.js`
- `src/hooks/useMasterCanvas.js`
- Tests whose only subject is either removed compatibility hook.

---

### Task 1: Versioned Ink Document and Tool Semantics

**Files:**
- Create: `src/ink/inkDocument.js`
- Create: `tests/inkDocument.test.js`

**Interfaces:**
- Produces: `INK_SCHEMA_VERSION`, `createInkDocument(documentId, pageCount)`, `createInkStroke(input)`, `getToolStyle(tool, rawColor, rawWidth)`, `isInkDocument(value)`.
- Consumes: no application modules.

- [ ] **Step 1: Write the failing document and style tests**

```js
import { describe, expect, it } from 'vitest';
import {
  INK_SCHEMA_VERSION, createInkDocument, createInkStroke,
  getToolStyle, isInkDocument
} from '../src/ink/inkDocument';

describe('ink document schema', () => {
  it('creates stable page-local vector state', () => {
    expect(createInkDocument('note-7', 2)).toEqual({
      version: INK_SCHEMA_VERSION,
      documentId: 'note-7',
      pages: [{ id: 'note-7-page-1' }, { id: 'note-7-page-2' }],
      strokes: [],
      updatedAt: 0
    });
  });

  it('rejects malformed persisted documents', () => {
    expect(isInkDocument({ version: 1, documentId: 'x', pages: [], strokes: 'bad' })).toBe(false);
  });

  it.each([
    ['pen', 3, 3, 1],
    ['fountain', 3, 2.4, 1],
    ['pencil', 3, 3, 0.58],
    ['highlighter', 3, 15, 0.32],
    ['pixel-eraser', 3, 3, 1]
  ])('maps %s to deterministic width and opacity', (tool, rawWidth, width, opacity) => {
    expect(getToolStyle(tool, '#abcdef', rawWidth)).toMatchObject({ tool, width, opacity });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/inkDocument.test.js`

Expected: FAIL because `src/ink/inkDocument.js` does not exist.

- [ ] **Step 3: Implement factories and validation**

```js
export const INK_SCHEMA_VERSION = 1;

export function createInkDocument(documentId, pageCount = 1) {
  const id = String(documentId);
  return {
    version: INK_SCHEMA_VERSION,
    documentId: id,
    pages: Array.from({ length: Math.max(1, pageCount) }, (_, index) => ({ id: `${id}-page-${index + 1}` })),
    strokes: [],
    updatedAt: 0
  };
}

export function getToolStyle(tool, rawColor, rawWidth) {
  const base = Number.isFinite(rawWidth) ? rawWidth : 3;
  const styles = {
    pen: { width: base, opacity: 1, composite: 'source-over' },
    fountain: { width: base * 0.8, opacity: 1, composite: 'source-over' },
    pencil: { width: base, opacity: 0.58, composite: 'source-over' },
    highlighter: { width: base * 5, opacity: 0.32, composite: 'source-over' },
    'pixel-eraser': { width: base, opacity: 1, composite: 'destination-out' }
  };
  return { tool, color: rawColor, ...(styles[tool] || styles.pen) };
}
```

Implement `createInkStroke` with copied finite points and `isInkDocument` with version, ID, page, stroke, and point validation.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/inkDocument.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/ink/inkDocument.js tests/inkDocument.test.js
git -c safe.directory=* commit -m "savestate: add versioned ink document model"
```

### Task 2: Unified Commands, History, and Stroke Erasing

**Files:**
- Modify: `src/ink/inkDocument.js`
- Modify: `tests/inkDocument.test.js`

**Interfaces:**
- Consumes: `createInkDocument`, valid stroke objects.
- Produces: `createInkHistory(document, limit)`, `executeInkCommand(history, command)`, `undoInkHistory(history)`, `redoInkHistory(history)`, `findIntersectingStrokeIds(document, pageId, points, radius)`.

- [ ] **Step 1: Add failing history tests**

```js
it('keeps one bounded undo/redo timeline and replaces the redo branch', () => {
  const empty = createInkDocument('note');
  const a = createInkStroke({ id: 'a', pageId: 'note-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  const b = createInkStroke({ id: 'b', pageId: 'note-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 3, y: 3 }, { x: 4, y: 4 }] });
  let history = createInkHistory(empty, 10);
  history = executeInkCommand(history, { type: 'commit-stroke', stroke: a });
  history = undoInkHistory(history);
  history = executeInkCommand(history, { type: 'commit-stroke', stroke: b });
  expect(history.present.strokes.map(stroke => stroke.id)).toEqual(['b']);
  expect(history.future).toEqual([]);
});

it('finds a stroke intersected between sampled endpoints', () => {
  const document = { ...createInkDocument('note'), strokes: [
    createInkStroke({ id: 'line', pageId: 'note-page-1', tool: 'pen', color: '#fff', width: 2, opacity: 1, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] })
  ] };
  expect(findIntersectingStrokeIds(document, 'note-page-1', [{ x: 50, y: 13 }], 4)).toEqual(['line']);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/inkDocument.test.js`

Expected: FAIL because history and hit-test exports are missing.

- [ ] **Step 3: Implement immutable commands and bounded snapshots**

```js
export function createInkHistory(document, limit = 100) {
  return { past: [], present: document, future: [], limit };
}

export function executeInkCommand(history, command) {
  const next = applyInkCommand(history.present, command);
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-history.limit),
    present: next,
    future: [],
    limit: history.limit
  };
}
```

Implement `commit-stroke`, `remove-strokes`, `clear-document`, and `add-page`. Each command returns a new document with a monotonic `updatedAt`. Implement undo/redo by moving immutable document snapshots between `past`, `present`, and `future`. Implement point-to-segment distance so stroke erasing catches intersections between stored endpoints.

- [ ] **Step 4: Run document tests and verify GREEN**

Run: `npm test -- tests/inkDocument.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/ink/inkDocument.js tests/inkDocument.test.js
git -c safe.directory=* commit -m "savestate: unify ink commands and history"
```

### Task 3: Pointer Admission and Ownership State Machine

**Files:**
- Create: `src/ink/inputPolicy.js`
- Create: `tests/inputPolicy.test.js`

**Interfaces:**
- Produces: `createInputState()`, `reducePointerInput(state, event, inputMode)` returning `{ state, intent }` where intent is `start-draw`, `continue-draw`, `finish-draw`, `cancel-draw`, `navigate`, or `ignore`.
- Consumes: normalized events `{ phase, pointerId, pointerType }`.

- [ ] **Step 1: Write failing pointer-policy tests**

```js
it('protects a pen stroke from palm move and release events', () => {
  let result = reducePointerInput(createInputState(), { phase: 'down', pointerId: 7, pointerType: 'pen' }, 'stylus');
  expect(result.intent).toBe('start-draw');
  result = reducePointerInput(result.state, { phase: 'move', pointerId: 9, pointerType: 'touch' }, 'stylus');
  expect(result.intent).toBe('navigate');
  result = reducePointerInput(result.state, { phase: 'up', pointerId: 9, pointerType: 'touch' }, 'stylus');
  expect(result.state.drawingPointerId).toBe(7);
});

it('cancels an uncommitted finger stroke when a second touch begins', () => {
  let result = reducePointerInput(createInputState(), { phase: 'down', pointerId: 1, pointerType: 'touch' }, 'finger');
  result = reducePointerInput(result.state, { phase: 'down', pointerId: 2, pointerType: 'touch' }, 'finger');
  expect(result.intent).toBe('cancel-draw');
  expect(result.state.drawingPointerId).toBeNull();
  expect(result.state.touchPointerIds).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/inputPolicy.test.js`

Expected: FAIL because `inputPolicy.js` does not exist.

- [ ] **Step 3: Implement the pure reducer**

```js
export function createInputState() {
  return { drawingPointerId: null, drawingPointerType: null, touchPointerIds: [] };
}

export function reducePointerInput(state, event, inputMode = 'stylus') {
  const touches = updateTouches(state.touchPointerIds, event);
  const canStart = event.pointerType === 'pen' || event.pointerType === 'mouse' || (inputMode === 'finger' && event.pointerType === 'touch');
  // Return new state for every branch. Only the owner may continue, finish,
  // or cancel a draw. A second touch cancels an owned touch draw and navigates.
}
```

Cover touch navigation in stylus mode, mouse drawing, wrong pointer IDs, owner up, owner cancel, and pointer removal from `touchPointerIds`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/inputPolicy.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/ink/inputPolicy.js tests/inputPolicy.test.js
git -c safe.directory=* commit -m "savestate: isolate stylus and finger pointer policy"
```

### Task 4: Page and Focus Coordinate Mapping

**Files:**
- Create: `src/ink/pageCoordinates.js`
- Create: `tests/pageCoordinates.test.js`

**Interfaces:**
- Produces: `mapViewportPoint(layout, point)`, `pagePointToViewport(layout, pageId, point)`, `mapFocusPoint(focusRect, viewport, point)`.
- Consumes: layout `{ pageIds, pageWidth, pageHeight, pageGap, zoom, showPageBreaks }`.

- [ ] **Step 1: Write failing literal coordinate tests**

```js
const layout = { pageIds: ['p1', 'p2'], pageWidth: 800, pageHeight: 1000, pageGap: 28, zoom: 0.5, showPageBreaks: true };

it('rejects visual page gaps', () => {
  expect(mapViewportPoint(layout, { x: 100, y: 510 })).toBeNull();
});

it('maps the second page into page-local coordinates', () => {
  expect(mapViewportPoint(layout, { x: 100, y: 553 })).toEqual({ pageId: 'p2', pageIndex: 1, x: 200, y: 50 });
});

it('maps a focus viewport into the selected page rectangle', () => {
  expect(mapFocusPoint({ pageId: 'p2', x: 100, y: 200, width: 300, height: 150 }, { width: 600, height: 300 }, { x: 300, y: 150 }))
    .toEqual({ pageId: 'p2', x: 250, y: 275 });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/pageCoordinates.test.js`

Expected: FAIL because the mapper module is missing.

- [ ] **Step 3: Implement gap-aware pure mapping**

```js
export function mapViewportPoint(layout, point) {
  const scaledPageHeight = layout.pageHeight * layout.zoom;
  const stride = scaledPageHeight + (layout.showPageBreaks ? layout.pageGap : 0);
  const pageIndex = Math.floor(point.y / stride);
  const localVisualY = point.y - pageIndex * stride;
  if (pageIndex < 0 || pageIndex >= layout.pageIds.length || localVisualY > scaledPageHeight) return null;
  return { pageId: layout.pageIds[pageIndex], pageIndex, x: point.x / layout.zoom, y: localVisualY / layout.zoom };
}
```

Clamp neither x nor y silently; return `null` for points outside page bounds. Implement the inverse and focus mapping using hand-derived scale factors.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/pageCoordinates.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/ink/pageCoordinates.js tests/pageCoordinates.test.js
git -c safe.directory=* commit -m "savestate: add page-aware ink coordinates"
```

### Task 5: Deterministic Complete-Path Canvas Renderer

**Files:**
- Create: `src/ink/renderInk.js`
- Create: `tests/renderInk.test.js`

**Interfaces:**
- Consumes: validated document, layout from Task 4, Canvas 2D context.
- Produces: `resizeInkCanvas(canvas, cssWidth, cssHeight, dpr)`, `renderInkDocument(context, document, layout)`, `renderInkStroke(context, stroke, transform)`.

- [ ] **Step 1: Write failing renderer tests with a complete context double**

```js
it('renders a highlighter as one translucent complete path', () => {
  const context = createContextDouble();
  renderInkStroke(context, {
    id: 'h', pageId: 'p1', tool: 'highlighter', color: '#ffee00',
    width: 15, opacity: 0.32,
    points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]
  }, { offsetX: 0, offsetY: 0, scale: 2 });
  expect(context.beginPath).toHaveBeenCalledTimes(1);
  expect(context.moveTo).toHaveBeenCalledWith(2, 4);
  expect(context.lineTo).toHaveBeenNthCalledWith(2, 10, 12);
  expect(context.stroke).toHaveBeenCalledTimes(1);
  expect(context.globalAlpha).toBe(1);
});
```

The test double includes `save`, `restore`, `setTransform`, `clearRect`, `beginPath`, `moveTo`, `lineTo`, `stroke`, and writable style/composite/alpha properties.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/renderInk.test.js`

Expected: FAIL because `renderInk.js` does not exist.

- [ ] **Step 3: Implement sizing and renderer state isolation**

```js
export function renderInkStroke(context, stroke, transform) {
  if (stroke.points.length < 2) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === 'pixel-eraser' ? 'destination-out' : 'source-over';
  context.globalAlpha = stroke.opacity;
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width * transform.scale;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(transform.offsetX + stroke.points[0].x * transform.scale, transform.offsetY + stroke.points[0].y * transform.scale);
  stroke.points.slice(1).forEach(point => context.lineTo(transform.offsetX + point.x * transform.scale, transform.offsetY + point.y * transform.scale));
  context.stroke();
  context.restore();
}
```

`renderInkDocument` clears once, computes each page offset including unscaled visual gaps, and renders complete strokes. `resizeInkCanvas` changes backing dimensions only when needed and applies DPR through `setTransform` during document rendering.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/renderInk.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/ink/renderInk.js tests/renderInk.test.js
git -c safe.directory=* commit -m "savestate: add deterministic vector ink renderer"
```

### Task 6: Versioned Local Persistence

**Files:**
- Create: `src/ink/inkRepository.js`
- Create: `tests/inkRepository.test.js`

**Interfaces:**
- Consumes: `isInkDocument`, serializable history `{ past, present, future, limit }`.
- Produces: `createInkRepository(storage)`, with `loadHistory(documentId)`, `saveHistory(documentId, history)`, `loadPreferences()`, `savePreferences(preferences)`.

- [ ] **Step 1: Write failing persistence and recovery tests**

```js
it('round-trips a valid bounded history', () => {
  const storage = createMemoryStorage();
  const repository = createInkRepository(storage);
  const history = createInkHistory(createInkDocument('note-1'));
  expect(repository.saveHistory('note-1', history)).toBe(true);
  expect(repository.loadHistory('note-1')).toEqual(history);
});

it('returns null for malformed JSON without throwing', () => {
  const storage = createMemoryStorage({ 'notes-app:ink:note-1': '{bad' });
  expect(createInkRepository(storage).loadHistory('note-1')).toBeNull();
});

it('keeps drawing usable when storage rejects a write', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  expect(createInkRepository(storage).saveHistory('note-1', createInkHistory(createInkDocument('note-1')))).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/inkRepository.test.js`

Expected: FAIL because the repository module is missing.

- [ ] **Step 3: Implement guarded versioned storage**

```js
const historyKey = documentId => `notes-app:ink:${documentId}`;
const preferencesKey = 'notes-app:ink-preferences';

export function createInkRepository(storage) {
  return {
    loadHistory(documentId) {
      try {
        const value = JSON.parse(storage.getItem(historyKey(documentId)));
        return isValidHistory(value) ? value : null;
      } catch { return null; }
    },
    saveHistory(documentId, history) {
      try { storage.setItem(historyKey(documentId), JSON.stringify(history)); return true; }
      catch { return false; }
    }
  };
}
```

Validate every document snapshot in `past`, `present`, and `future`; normalize preferences to `{ inputMode: 'stylus'|'finger', eraserMode: 'pixel'|'stroke' }`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/inkRepository.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/ink/inkRepository.js tests/inkRepository.test.js
git -c safe.directory=* commit -m "savestate: persist versioned ink history"
```

### Task 7: Single React Ink Controller

**Files:**
- Create: `src/hooks/useInkDocument.js`
- Create: `tests/useInkDocument.test.js`

**Interfaces:**
- Consumes: Tasks 1, 2, and 6.
- Produces: `useInkDocument({ documentId, repository, saveDelay })` returning `{ document, commitStroke, removeStrokes, clearDocument, addPage, undo, redo, canUndo, canRedo, inputMode, setInputMode, eraserMode, setEraserMode }`.

- [ ] **Step 1: Write failing controller tests**

```js
it('shares one history for strokes, clear, undo, and redo', () => {
  const repository = createInkRepository(createMemoryStorage());
  const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));
  act(() => result.current.commitStroke(validStroke('a')));
  act(() => result.current.clearDocument());
  expect(result.current.document.strokes).toEqual([]);
  act(() => result.current.undo());
  expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['a']);
  act(() => result.current.redo());
  expect(result.current.document.strokes).toEqual([]);
});

it('loads saved history and preferences for the note', () => {
  const repository = createSeededRepository('note');
  const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));
  expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['saved']);
  expect(result.current.inputMode).toBe('finger');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/useInkDocument.test.js`

Expected: FAIL because `useInkDocument.js` does not exist.

- [ ] **Step 3: Implement controller composition and debounced saving**

```js
export default function useInkDocument({ documentId, repository = browserInkRepository, saveDelay = 120 }) {
  const [history, setHistory] = useState(() => repository.loadHistory(documentId) || createInkHistory(createInkDocument(documentId)));
  const [preferences, setPreferences] = useState(() => repository.loadPreferences());
  const commitStroke = useCallback(stroke => setHistory(current => executeInkCommand(current, { type: 'commit-stroke', stroke })), []);
  const undo = useCallback(() => setHistory(undoInkHistory), []);
  const redo = useCallback(() => setHistory(redoInkHistory), []);
  useEffect(() => {
    const timer = setTimeout(() => repository.saveHistory(documentId, history), saveDelay);
    return () => clearTimeout(timer);
  }, [documentId, history, repository, saveDelay]);
  return { document: history.present, commitStroke, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}
```

Define `browserInkRepository` at module scope with `createInkRepository(globalThis.localStorage)`. Add remove, clear, page, and preference commands with stable callbacks. When `documentId` changes, synchronously replace history from that note before accepting commands.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/useInkDocument.test.js`

Expected: PASS with fake timers restored after every test.

- [ ] **Step 5: Commit the task**

```powershell
git add src/hooks/useInkDocument.js tests/useInkDocument.test.js
git -c safe.directory=* commit -m "savestate: add single persistent ink controller"
```

### Task 8: Reusable Pointer-to-Stroke Adapter

**Files:**
- Create: `src/hooks/useInkPointer.js`
- Create: `tests/useInkPointer.test.js`

**Interfaces:**
- Consumes: `reducePointerInput`, a `mapPoint(event)` callback, active tool settings, controller commands.
- Produces: `useInkPointer(options)` returning pointer handlers and `draftStroke`.

- [ ] **Step 1: Write failing mixed-input tests**

```js
it('commits one pen stroke and ignores palm move and up events', () => {
  const commitStroke = vi.fn();
  const { result } = renderHook(() => useInkPointer({
    inputMode: 'stylus', tool: 'pen', color: '#fff', width: 3,
    mapPoint: event => ({ pageId: 'p1', x: event.clientX, y: event.clientY }),
    commitStroke
  }));
  act(() => result.current.onPointerDown(pointer(7, 'pen', 1, 2)));
  act(() => result.current.onPointerMove(pointer(9, 'touch', 50, 60)));
  act(() => result.current.onPointerMove(pointer(7, 'pen', 3, 4)));
  act(() => result.current.onPointerUp(pointer(9, 'touch', 50, 60)));
  act(() => result.current.onPointerUp(pointer(7, 'pen', 3, 4)));
  expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }));
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/useInkPointer.test.js`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement ref-based ownership and draft collection**

Use refs for input state and draft points so rapid pointer moves do not depend on React rerender timing. Acquire pointer capture only after `start-draw`, ignore non-owner moves, discard drafts on `cancel-draw` or `mapPoint === null`, and commit only drafts containing at least two points on `finish-draw`. For stroke eraser, call `findIntersectingStrokeIds` and `removeStrokes` instead of committing an ink stroke.

```js
const onPointerMove = useCallback(event => {
  const routed = route(event, 'move');
  if (routed.intent !== 'continue-draw') return;
  const point = mapPoint(event);
  if (!point || point.pageId !== draftRef.current?.pageId) return cancelDraft(event);
  draftRef.current.points.push({ x: point.x, y: point.y });
  setDraftStroke({ ...draftRef.current, points: [...draftRef.current.points] });
}, [mapPoint]);
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- tests/useInkPointer.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/hooks/useInkPointer.js tests/useInkPointer.test.js
git -c safe.directory=* commit -m "savestate: add pointer-safe ink stroke adapter"
```

### Task 9: Integrate Stable Note IDs and Shared Controller

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/SplitLayout.jsx`
- Modify: `tests/App.test.jsx`
- Modify: `tests/SplitLayout.test.jsx`

**Interfaces:**
- Consumes: `useInkDocument` from Task 7.
- Produces: `SplitLayout({ activeTab, onBack, documentId })`; passes `inkController` and presentation-only `toolState` to both views.

- [ ] **Step 1: Add failing integration tests**

```jsx
it('passes a stable generated ID to a newly opened note', () => {
  render(<App />);
  fireEvent.click(screen.getByTestId('new-note-btn'));
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-document-id');
  expect(screen.getByTestId('document-view').getAttribute('data-document-id')).not.toBe('undefined');
});

it('exposes stylus input and pixel eraser as controller defaults', () => {
  render(<SplitLayout activeTab="smartCanvas" documentId="note-1" />);
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-input-mode', 'stylus');
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-eraser-mode', 'pixel');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/App.test.jsx tests/SplitLayout.test.jsx`

Expected: FAIL because document IDs and controller state are not exposed.

- [ ] **Step 3: Normalize IDs and create one controller**

```jsx
const openNote = note => {
  const id = String(note?.id ?? globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}`);
  setActiveNote({ ...note, id });
  setScreen('editor');
};

// App editor
<SplitLayout activeTab={activeTab} documentId={activeNote.id} onBack={() => setScreen('library')} />
```

In `SplitLayout`, replace `useMasterCanvas()` with `useInkDocument({ documentId })`. Keep raw tool width as the single source; call `getToolStyle` only when constructing a stroke. Remove the old `effectiveWidth` multiplier.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/App.test.jsx tests/SplitLayout.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/App.jsx src/components/SplitLayout.jsx tests/App.test.jsx tests/SplitLayout.test.jsx
git -c safe.directory=* commit -m "savestate: connect notes to shared ink controller"
```

### Task 10: Refactor Full Document Input and Rendering

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Modify: `tests/DocumentView.test.jsx`
- Create: `tests/InkWorkspace.test.jsx`

**Interfaces:**
- Consumes: controller, pointer adapter, page mapper, renderer.
- Produces: full-page drawing with page-local strokes, gap rejection, unified toolbar history, and minimal accessible input/eraser mode controls.

- [ ] **Step 1: Write failing behavior tests**

```jsx
it('does not commit touch ink in stylus mode but commits pen ink', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20 });
  fireEvent.pointerMove(page, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 30 });
  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 30 });
  expect(controller.commitStroke).not.toHaveBeenCalled();
  drawPointerStroke(page, { pointerId: 2, pointerType: 'pen' });
  expect(controller.commitStroke).toHaveBeenCalledTimes(1);
});

it('toggles finger and stroke-eraser modes with accessible pressed state', () => {
  render(<DocumentView inkController={createControllerDouble()} toolbarState={toolState()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Fingermodus' }));
  expect(screen.getByRole('button', { name: 'Fingermodus' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Radiermodus: Pixel' }));
  expect(screen.getByRole('button', { name: 'Radiermodus: Strich' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/DocumentView.test.jsx tests/InkWorkspace.test.jsx`

Expected: FAIL because `DocumentView` still owns raw master-canvas state and accepts touch drawing.

- [ ] **Step 3: Replace raw drawing and history with shared modules**

Create `pageLayout` from controller page IDs, current zoom, page dimensions, gap, and page mode. Map pointer positions relative to `containerRef`; pass them to `useInkPointer`. Render `document.strokes` plus `draftStroke` through `renderInkDocument` in a layout effect and ResizeObserver.

```jsx
const inkPointer = useInkPointer({
  inputMode: inkController.inputMode,
  tool: isEraser ? (inkController.eraserMode === 'stroke' ? 'stroke-eraser' : 'pixel-eraser') : tool,
  color: rawColor,
  width: isEraser ? eraserWidth : rawLineWidth,
  mapPoint: event => mapViewportPoint(pageLayout, relativePoint(containerRef.current, event)),
  document: inkController.document,
  commitStroke: inkController.commitStroke,
  removeStrokes: inkController.removeStrokes
});
```

Route toolbar undo, redo, clear, and add-page only to the controller. Add `aria-label`, `aria-pressed`, and existing `rail-btn` styling to the input and eraser mode controls. Remove raw `drawStateRef`, dual `padActionsRef` calls, and pen pointers from gesture tracking.

- [ ] **Step 4: Run focused and regression tests**

Run: `npm test -- tests/DocumentView.test.jsx tests/InkWorkspace.test.jsx tests/SplitLayout.test.jsx`

Expected: PASS without Canvas `getContext` warnings; provide a full context test double in `tests/setup.js` if JSDOM lacks Canvas 2D.

- [ ] **Step 5: Commit the task**

```powershell
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx tests/InkWorkspace.test.jsx tests/setup.js
git -c safe.directory=* commit -m "savestate: refactor document ink input and rendering"
```

### Task 11: Refactor Focus Writing as a Shared Projection

**Files:**
- Modify: `src/components/WritingZone.jsx`
- Modify: `src/hooks/useFocusBox.js`
- Modify: `tests/useFocusBox.test.js`
- Modify: `src/components/__tests__/Task4.test.jsx`
- Modify: `tests/InkWorkspace.test.jsx`

**Interfaces:**
- Consumes: shared controller, page-local focus rectangle, pointer adapter, focus mapper, renderer.
- Produces: focus-area drawing that commits into the same document and history with no DOM query or local history.

- [ ] **Step 1: Write failing shared-history test**

```jsx
it('commits focus ink into the same controller and one undo removes it everywhere', () => {
  render(<SplitLayout activeTab="smartCanvas" documentId="shared-note" />);
  fireEvent.click(screen.getByTestId('layout-mode-btn'));
  const focusCanvas = screen.getByTestId('focus-ink-canvas');
  mockRect(focusCanvas, { left: 0, top: 0, width: 500, height: 200 });
  drawPointerStroke(focusCanvas, { pointerId: 4, pointerType: 'pen' });
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '1');
  fireEvent.click(screen.getByTitle('Rückgängig'));
  expect(screen.getByTestId('document-view')).toHaveAttribute('data-stroke-count', '0');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- tests/InkWorkspace.test.jsx src/components/__tests__/Task4.test.jsx tests/useFocusBox.test.js`

Expected: FAIL because `WritingZone` still owns `useCanvas` history and uses `document.querySelector`.

- [ ] **Step 3: Implement a controller-backed focus viewport**

Change focus state to `{ pageId, x, y, width, height }`. Render only strokes with the selected `pageId`; transform them by `scaleX = canvasWidth / focus.width`, `scaleY = canvasHeight / focus.height`, and negative focus offsets. Use `mapFocusPoint` for input. Commit and erase through the controller.

```jsx
const canvasRef = useRef(null);
const mapPoint = useCallback(event => mapFocusPoint(
  focusBoxState.focusBox,
  { width: canvasRef.current.getBoundingClientRect().width, height: canvasRef.current.getBoundingClientRect().height },
  {
    x: event.clientX - canvasRef.current.getBoundingClientRect().left,
    y: event.clientY - canvasRef.current.getBoundingClientRect().top
  }
), [focusBoxState.focusBox]);
```

Delete `loadedStateRef`, `flushChanges`, `padActionsRef`, and every `document.querySelector` call.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/InkWorkspace.test.jsx src/components/__tests__/Task4.test.jsx tests/useFocusBox.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```powershell
git add src/components/WritingZone.jsx src/hooks/useFocusBox.js tests/useFocusBox.test.js src/components/__tests__/Task4.test.jsx tests/InkWorkspace.test.jsx
git -c safe.directory=* commit -m "savestate: share ink state with focus writing"
```

### Task 12: Remove Legacy Canvas State

**Files:**
- Remove: `src/hooks/useCanvas.js`
- Remove: `src/hooks/useMasterCanvas.js`
- Remove: `tests/useCanvas.test.js`
- Remove: `tests/useMasterCanvas.test.js`
- Verify: `tests/InkWorkspace.test.jsx`
- Verify: `tests/App.test.jsx`

**Interfaces:**
- Consumes: all new architecture modules.
- Produces: no legacy dual-history or bitmap-authority path remains.

- [ ] **Step 1: Establish a green refactoring baseline**

Run: `npm test`

Expected: all tests PASS before deleting compatibility code. Tasks 7 and 10 already introduced the reload and resize tests before their implementations; those tests protect this behavior during cleanup.

- [ ] **Step 2: Remove legacy imports, hooks, and hook-only tests**

Delete the four files listed under **Files** and remove their imports. Do not change the public behavior of the new ink modules.

- [ ] **Step 3: Verify no legacy architecture symbols remain**

Search for stale architecture symbols:

Run: `rg -n "useCanvas|useMasterCanvas|padActionsRef|document\.querySelector\('\.writing-zone" src tests`

Expected after cleanup: no matches. A match in the plan or design documents does not count because the command is scoped to `src` and `tests`.

- [ ] **Step 4: Run the full suite and production build**

Run: `npm test`

Expected: all tests PASS with no Canvas warnings.

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 5: Commit the task**

```powershell
git add src tests
git -c safe.directory=* commit -m "savestate: complete premium ink architecture migration"
```

### Task 13: Browser Acceptance and Final Architecture Audit

**Files:**
- Modify only if acceptance reveals a verified defect in files already owned by Tasks 9-12.

**Interfaces:**
- Consumes: production application.
- Produces: verified desktop/tablet behavior and an evidence-backed handoff.

- [ ] **Step 1: Start the app and exercise desktop behavior**

Run: `npm run dev -- --host 127.0.0.1`

At a 1440×900 viewport, open a note and verify mouse drawing, tool changes, unified undo/redo, both eraser modes, page creation, gap rejection, reload persistence, and focus writing.

- [ ] **Step 2: Exercise tablet behavior**

At a 1024×768 viewport, synthesize or manually use pen/touch pointers. Verify pen drawing with touch navigation in stylus mode, one-finger drawing in finger mode, two-finger gesture handoff, palm isolation, rotation/resize redraw, and no ink in page gaps.

- [ ] **Step 3: Run the architecture audit**

Run: `rg -n "document\.querySelector|historyRef|canvas\.toDataURL|effectiveWidth|lineWidth \* 5" src/components src/hooks src/ink`

Expected: no global writing-zone query, no component-owned history, no bitmap persistence, and no duplicate marker multiplier. A private history implementation inside `src/ink/inkDocument.js` is not expected because history is immutable state, not hidden refs.

- [ ] **Step 4: Run final verification**

Run: `npm test && npm run build && git -c safe.directory=* diff --check`

Expected: all tests pass, build succeeds, and diff check reports no whitespace errors.

- [ ] **Step 5: Record acceptance status**

If acceptance reveals a defect, stop this audit task and start a separate red-green-refactor cycle named after the observed behavior, with the regression test and exact affected production file identified from the failure. If no defect is observed, record the verified viewport sizes and interaction matrix in the final handoff and do not create an empty commit.
