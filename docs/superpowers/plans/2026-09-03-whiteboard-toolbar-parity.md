# Whiteboard Toolbar Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Whiteboard documents get a background-color choice at creation, plus color/width picker, lasso select, shape/text/image insert, and bucket fill in the whiteboard rail.

**Architecture:** Every underlying algorithm (`lasso.js`, `bucketFill.js`, `pageObjects.js`) is already coordinate-system agnostic — confirmed by direct reading, not assumption. Two shared rendering components (`PageObjectLayer`, `LassoSelectionLayer`) each have exactly one internal call to the page-bound `pagePointToViewport` for computing screen origin; both get one new optional prop (`mapOrigin`) that lets a caller inject a different origin function, defaulting to today's exact call so `DocumentView.jsx`'s existing usage is untouched. `WhiteboardEditor.jsx` then reuses these components and pure functions directly, supplying a camera-based `mapOrigin` (built on the already-existing `worldToScreen`) instead of duplicating any rendering/hit-testing/drag logic.

**Tech Stack:** React (existing), vitest + @testing-library/react (existing). No new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-03-whiteboard-toolbar-parity-design.md](../specs/2026-09-03-whiteboard-toolbar-parity-design.md)

## Global Constraints

- No new npm dependencies.
- Every generalization to a shared component (`PageObjectLayer`, `LassoSelectionLayer`) must be a no-op for `DocumentView.jsx`'s existing usage — its tests must stay green unmodified.
- No ruling/format for whiteboard (still not requested) — only background color.
- Bucket fill on the whiteboard rasterizes the *current viewport* (not the whole infinite plane) — panning after a fill does not need to re-rasterize; the fill becomes a static object like any other, positioned at its rasterized location.

---

## Task 1: Whiteboard background color (dialog + resolve + apply)

**Files:**
- Modify: `src/documents/pageStyles.js`
- Modify: `src/components/NewDocumentDialog.jsx`
- Modify: `src/components/WhiteboardEditor.jsx:183-188` (the outer container's hardcoded background)
- Test: `tests/pageStyles.test.js`, `tests/NewDocumentDialog.test.jsx`, `tests/WhiteboardEditor.test.jsx`

**Interfaces:**
- Produces: `resolvePageStyle({pageKind: "whiteboard", background})` now returns `{kind: "whiteboard", background, inkColor}` instead of just `{kind: "whiteboard"}`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/pageStyles.test.js`:

```js
  it('resolves a background for a whiteboard too', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard', background: 'white' })).toEqual({
      kind: 'whiteboard',
      background: '#FFFFFF',
      inkColor: '#1A1A1A',
    });
  });

  it('defaults the whiteboard background to dark when none is chosen', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard' })).toEqual({
      kind: 'whiteboard',
      background: BACKGROUND_PRESETS.find((p) => p.id === 'dark').css,
      inkColor: '#EFECE4',
    });
  });
```

Add to `tests/NewDocumentDialog.test.jsx`:

```js
  it('shows background swatches for whiteboard too, but not format/ruling', () => {
    render(<NewDocumentDialog open onCreate={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('new-doc-kind-whiteboard'));
    expect(screen.getByTestId('new-doc-background-white')).toBeInTheDocument();
    expect(screen.queryByTestId('new-doc-format-square')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-doc-ruling-grid')).not.toBeInTheDocument();
  });

  it('submits the chosen background for a whiteboard', () => {
    const onCreate = vi.fn();
    render(<NewDocumentDialog open onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('new-doc-kind-whiteboard'));
    fireEvent.click(screen.getByTestId('new-doc-background-white'));
    fireEvent.click(screen.getByTestId('new-doc-submit'));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ pageKind: 'whiteboard', background: 'white' }),
    );
  });
```

Add to `tests/WhiteboardEditor.test.jsx` (using the file's existing `createControllerDouble` helper, add a `background` field to its `document.pages[0]`):

```js
  it('uses the document\'s background instead of the hardcoded dark default', () => {
    const controller = createControllerDouble();
    controller.document.pages[0].background = '#FFFFFF';
    render(<WhiteboardEditor inkController={controller} />);
    const root = screen.getByTestId('document-view');
    expect(root.style.background).toContain('255, 255, 255');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pageStyles.test.js tests/NewDocumentDialog.test.jsx tests/WhiteboardEditor.test.jsx`
Expected: the 5 new tests FAIL (whiteboard doesn't resolve `background`/`inkColor`; dialog hides swatches for whiteboard; `WhiteboardEditor` still hardcodes `#0B0B0D`).

- [ ] **Step 3: Implement**

In `src/documents/pageStyles.js`, replace:

```js
  if (pageKind === 'whiteboard') {
    return { kind: 'whiteboard' };
  }
```

with:

```js
  if (pageKind === 'whiteboard') {
    const backgroundPreset =
      BACKGROUND_PRESETS.find((preset) => preset.id === background) ||
      BACKGROUND_PRESETS.find((preset) => preset.id === DEFAULT_BACKGROUND);
    return {
      kind: 'whiteboard',
      background: backgroundPreset.css,
      inkColor: backgroundPreset.inkColor,
    };
  }
```

In `src/components/NewDocumentDialog.jsx`, the background-swatch block is currently inside the `{pageKind === "page" && (...)}` block alongside format/ruling. Split it out: keep format and ruling inside that conditional, but move the background-swatch `<div>` block to render whenever `pageKind` is either `"page"` or `"whiteboard"` — i.e. change the wrapping condition from one `{pageKind === "page" && (<>...)}` block containing all three rows to two separate conditionals: `{pageKind === "page" && (<>format row + ruling row</>)}` and a background row rendered unconditionally right after the Seitentyp row (it's meaningful for both kinds — only format/ruling are page-only).

In `src/components/WhiteboardEditor.jsx`, replace:

```js
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0B0B0D" }}
```

with:

```js
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: document.pages[0]?.background || "#0B0B0D",
      }}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pageStyles.test.js tests/NewDocumentDialog.test.jsx tests/WhiteboardEditor.test.jsx`
Expected: PASS, including every pre-existing test in all three files.

Run: `npx vitest run`
Expected: PASS across the whole suite (only the 3 known pre-existing unrelated failures).

- [ ] **Step 5: Commit**

```bash
git add src/documents/pageStyles.js src/components/NewDocumentDialog.jsx src/components/WhiteboardEditor.jsx tests/pageStyles.test.js tests/NewDocumentDialog.test.jsx tests/WhiteboardEditor.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): let a whiteboard document choose a background color

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `PageObjectLayer` accepts an injectable origin mapping

**Files:**
- Modify: `src/components/document/PageObjectLayer.jsx`
- Test: extend whatever existing test file covers it (check for `tests/PageObjectLayer.test.jsx`; if none exists, add assertions to `tests/DocumentView.test.jsx` instead — this component has no dedicated test file today, so don't create one just for this)

**Interfaces:**
- Produces: `<PageObjectLayer objects pageLayout selectedId paperStyle editingId onEditingChange onSelect onChange onDelete mapOrigin />` — `mapOrigin` is optional, `(pageLayout, pageId) => {x, y} | null`, defaulting to `(layout, pid) => pagePointToViewport(layout, pid, {x: 0, y: 0})` (today's exact behavior).

- [ ] **Step 1: Write the failing test**

Add to `tests/DocumentView.test.jsx` (it already imports/exercises `PageObjectLayer` indirectly; add a direct import for this focused test):

```js
import PageObjectLayer from '../src/components/document/PageObjectLayer.jsx';

test('PageObjectLayer uses an injected mapOrigin instead of pagePointToViewport when provided', () => {
  const objects = [
    { id: 'o1', pageId: 'p1', type: 'rect', x: 10, y: 20, width: 100, height: 50, color: '#3E7BD8', strokeWidth: 3, fillColor: '#3E7BD8' },
  ];
  const mapOrigin = vi.fn(() => ({ x: 500, y: 300 }));
  render(
    <PageObjectLayer
      objects={objects}
      pageLayout={{ zoom: 2 }}
      mapOrigin={mapOrigin}
    />,
  );
  expect(mapOrigin).toHaveBeenCalledWith({ zoom: 2 }, 'p1');
  const node = document.querySelector('[data-object-id="o1"]');
  expect(node.style.left).toBe('520px'); // 500 + 10*2
  expect(node.style.top).toBe('340px'); // 300 + 20*2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DocumentView.test.jsx -t "injected mapOrigin"`
Expected: FAIL — `PageObjectLayer` doesn't accept a `mapOrigin` prop yet, so `mapOrigin` (the mock) is never called, and position falls back to `pagePointToViewport`'s (null, since `pageLayout.pageLayouts` is undefined) behavior.

- [ ] **Step 3: Implement**

In `src/components/document/PageObjectLayer.jsx`, replace the function signature:

```js
export default function PageObjectLayer({
  objects = [],
  pageLayout,
  selectedId = null,
  paperStyle = "lined",
  editingId = null,
  onEditingChange,
  onSelect,
  onChange,
  onDelete,
}) {
  const drag = useDrag(onChange);
  const zoom = pageLayout?.zoom || 1;
  if (objects.length === 0) return null;
```

with:

```js
export default function PageObjectLayer({
  objects = [],
  pageLayout,
  selectedId = null,
  paperStyle = "lined",
  editingId = null,
  onEditingChange,
  onSelect,
  onChange,
  onDelete,
  mapOrigin = (layout, pageId) => pagePointToViewport(layout, pageId, { x: 0, y: 0 }),
}) {
  const drag = useDrag(onChange);
  const zoom = pageLayout?.zoom || 1;
  if (objects.length === 0) return null;
```

Then replace the one internal call site:

```js
        const origin = pagePointToViewport(pageLayout, object.pageId, {
          x: 0,
          y: 0,
        });
```

with:

```js
        const origin = mapOrigin(pageLayout, object.pageId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: PASS, including every pre-existing test in the file (they don't pass `mapOrigin`, so the default reproduces today's exact `pagePointToViewport` call).

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/document/PageObjectLayer.jsx tests/DocumentView.test.jsx
git commit -m "$(cat <<'EOF'
feat(objects): let PageObjectLayer take an injectable origin mapping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `LassoSelectionLayer` accepts an injectable origin mapping

**Files:**
- Modify: `src/components/document/LassoSelectionLayer.jsx`
- Test: add to `tests/DocumentView.test.jsx` (same reasoning as Task 2 — no dedicated test file exists for this component)

**Interfaces:**
- Produces: `<LassoSelectionLayer bounds pageLayout onCommit onDelete mapOrigin />` — same `mapOrigin` contract as `PageObjectLayer`, same default.

- [ ] **Step 1: Write the failing test**

Add to `tests/DocumentView.test.jsx`:

```js
import LassoSelectionLayer from '../src/components/document/LassoSelectionLayer.jsx';

test('LassoSelectionLayer uses an injected mapOrigin instead of pagePointToViewport when provided', () => {
  const bounds = { pageId: 'p1', x: 10, y: 20, width: 100, height: 50 };
  const mapOrigin = vi.fn(() => ({ x: 500, y: 300 }));
  render(
    <LassoSelectionLayer bounds={bounds} pageLayout={{ zoom: 2 }} onCommit={vi.fn()} onDelete={vi.fn()} mapOrigin={mapOrigin} />,
  );
  expect(mapOrigin).toHaveBeenCalledWith({ zoom: 2 }, 'p1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DocumentView.test.jsx -t "LassoSelectionLayer uses an injected"`
Expected: FAIL — `mapOrigin` mock never called.

- [ ] **Step 3: Implement**

In `src/components/document/LassoSelectionLayer.jsx`, replace:

```js
export default function LassoSelectionLayer({ bounds, pageLayout, onCommit, onDelete }) {
  const zoom = pageLayout?.zoom || 1;
  const drag = useSelectionDrag(bounds, onCommit);
  if (!bounds) return null;
  const box = drag.draft || bounds;
  const origin = pagePointToViewport(pageLayout, bounds.pageId, { x: 0, y: 0 });
  if (!origin) return null;
```

with:

```js
export default function LassoSelectionLayer({
  bounds,
  pageLayout,
  onCommit,
  onDelete,
  mapOrigin = (layout, pageId) => pagePointToViewport(layout, pageId, { x: 0, y: 0 }),
}) {
  const zoom = pageLayout?.zoom || 1;
  const drag = useSelectionDrag(bounds, onCommit);
  if (!bounds) return null;
  const box = drag.draft || bounds;
  const origin = mapOrigin(pageLayout, bounds.pageId);
  if (!origin) return null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: PASS, including every pre-existing test.

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/document/LassoSelectionLayer.jsx tests/DocumentView.test.jsx
git commit -m "$(cat <<'EOF'
feat(lasso): let LassoSelectionLayer take an injectable origin mapping

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Export `DESIGN_TOOLS`/`TEXT_TOOL`/`DesignToolsPopover` from `DocumentView.jsx`

**Files:**
- Modify: `src/components/DocumentView.jsx:75, 89, 108` (add `export` to three existing declarations — no other change)
- Test: none needed (adding `export` to an already-tested, unchanged module-scope declaration can't change behavior; covered by the full suite staying green)

**Interfaces:**
- Produces: `export const DESIGN_TOOLS`, `export const TEXT_TOOL`, `export function DesignToolsPopover({onInsert, onClose})` — all three now importable from `../DocumentView.jsx`.

- [ ] **Step 1: Implement**

In `src/components/DocumentView.jsx`, change:

```js
const DESIGN_TOOLS = [
```

to:

```js
export const DESIGN_TOOLS = [
```

Change:

```js
const TEXT_TOOL = {
```

to:

```js
export const TEXT_TOOL = {
```

Change:

```js
function DesignToolsPopover({ onInsert, onClose }) {
```

to:

```js
export function DesignToolsPopover({ onInsert, onClose }) {
```

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run`
Expected: PASS across the whole suite (only the 3 known pre-existing unrelated failures) — this change is additive-only (adding named exports to already-existing declarations), so nothing can break.

- [ ] **Step 3: Commit**

```bash
git add src/components/DocumentView.jsx
git commit -m "$(cat <<'EOF'
refactor(editor): export design-tool constants for reuse by the whiteboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Whiteboard color/width popover

**Files:**
- Modify: `src/components/WhiteboardEditor.jsx`
- Test: `tests/WhiteboardEditor.test.jsx`

**Interfaces:**
- Consumes: `react-colorful`'s `HexColorPicker` (already a dependency, used elsewhere in `DocumentView.jsx`).
- Produces: a new rail button opening a simple color+width popover; `inkController.setColor`/`setPenWidth`/`setEraserWidth` get called from it.

- [ ] **Step 1: Write the failing test**

Add to `tests/WhiteboardEditor.test.jsx`:

```js
  it('opens a color/width popover and updates the ink color', () => {
    const setColor = vi.fn();
    render(<WhiteboardEditor inkController={createControllerDouble({ setColor })} />);
    fireEvent.click(screen.getByTitle('Farbe & Breite'));
    expect(screen.getByTestId('whiteboard-color-popover')).toBeInTheDocument();
  });
```

Also extend `createControllerDouble` in this file (it's a local helper, add the missing setters it doesn't already have): confirm/add `setColor: vi.fn()`, `setPenWidth: vi.fn()`, `setEraserWidth: vi.fn()` to its default object if not already present — check the existing helper first, only add what's missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx -t "color/width popover"`
Expected: FAIL — no button titled "Farbe & Breite" exists yet.

- [ ] **Step 3: Implement**

In `src/components/WhiteboardEditor.jsx`, add to the imports:

```js
import { Undo2, Redo2, PenLine, Eraser, Palette, X } from "lucide-react";
import { HexColorPicker } from "react-colorful";
```

Add state near the top of the component (alongside `isEraser`):

```js
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
```

Add a popover component above `WhiteboardEditor`, right after `relativePoint`:

```js
function ColorWidthPopover({ color, onColorChange, width, onWidthChange, onClose }) {
  const popoverRef = useRef(null);
  React.useEffect(() => {
    const handleDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !e.target.closest?.(".whiteboard-color-btn")) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      data-testid="whiteboard-color-popover"
      style={{
        position: "absolute",
        left: 60,
        top: 120,
        zIndex: 50,
        width: 220,
        padding: 16,
        borderRadius: 14,
        background: "#18181C",
        color: "#FFFFFF",
        boxShadow: "0 20px 48px -12px rgba(0,0,0,.8)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <Palette size={14} /> Farbe & Breite
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>
      <HexColorPicker color={color} onChange={onColorChange} />
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Breite</span>
        <input
          type="range"
          min={1}
          max={20}
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, width: 24, textAlign: "right" }}>{width}</span>
      </div>
    </div>
  );
}
```

In `WhiteboardEditor`'s `railContent`, add a button after the Eraser button (before the closing `</>`):

```jsx
      <button
        className="rail-btn whiteboard-color-btn"
        onClick={() => setIsColorPopoverOpen((open) => !open)}
        title="Farbe & Breite"
      >
        <Palette size={19} />
      </button>
```

And render the popover conditionally right after the `railContent` JSX block's own closing, inside the component's returned tree — add it as a sibling of `{railSlot ? createPortal(...) : railContent}`, inside the outer `<div data-testid="document-view" ...>`:

```jsx
      {isColorPopoverOpen && (
        <ColorWidthPopover
          color={isEraser ? "#FFFFFF" : inkController.color}
          onColorChange={(c) => inkController.setColor?.(c)}
          width={isEraser ? inkController.eraserWidth : inkController.penWidth}
          onWidthChange={(w) =>
            isEraser ? inkController.setEraserWidth?.(w) : inkController.setPenWidth?.(w)
          }
          onClose={() => setIsColorPopoverOpen(false)}
        />
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx`
Expected: PASS, including every pre-existing test in the file.

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/WhiteboardEditor.jsx tests/WhiteboardEditor.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): add color and pen-width picker to the whiteboard rail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Whiteboard lasso select

**Files:**
- Modify: `src/components/WhiteboardEditor.jsx`
- Test: `tests/WhiteboardEditor.test.jsx`

**Interfaces:**
- Consumes: `strokesInLasso`, `objectsInLasso`, `selectionBounds` (`src/ink/lasso.js`, unchanged), `LassoSelectionLayer` with `mapOrigin` (Task 3), `worldToScreen` (`src/ink/whiteboardCoordinates.js`, unchanged).

- [ ] **Step 1: Write the failing test**

Add to `tests/WhiteboardEditor.test.jsx`:

```js
  it('lasso-selects a stroke drawn inside the loop and deletes it on Delete', () => {
    const removeStrokes = vi.fn();
    const controller = createControllerDouble({
      removeStrokes,
      document: {
        version: 1, documentId: 'wb-1', pages: [{ id: 'wb-1-page-1', kind: 'whiteboard' }],
        strokes: [{ id: 's1', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 50, y: 50 }, { x: 60, y: 60 }] }],
        objects: [], updatedAt: 0,
      },
    });
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.click(screen.getByTitle('Lasso-Auswahl'));
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 0 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 200, clientY: 200 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 200 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 200 });

    expect(screen.getByTestId('lasso-selection-layer')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(removeStrokes).toHaveBeenCalledWith(['s1']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx -t "lasso-selects"`
Expected: FAIL — no "Lasso-Auswahl" button, no lasso mode exists yet.

- [ ] **Step 3: Implement**

In `src/components/WhiteboardEditor.jsx`, add to imports:

```js
import { Undo2, Redo2, PenLine, Eraser, Palette, X, Lasso } from "lucide-react";
import { strokesInLasso, objectsInLasso, selectionBounds } from "../ink/lasso.js";
import { pageObjectsOf } from "../ink/pageObjects.js";
import LassoSelectionLayer from "./document/LassoSelectionLayer.jsx";
```

Add state:

```js
  const [isLassoMode, setIsLassoMode] = useState(false);
  const [lassoDraft, setLassoDraft] = useState(null);
  const [lassoSelection, setLassoSelection] = useState(null);
```

Compute `pageObjects` near where `strokes` is derived:

```js
  const pageObjects = pageObjectsOf(document);
```

Add a `mapOrigin` for the camera (used by `LassoSelectionLayer` and, in later tasks, `PageObjectLayer`) — it must return a **screen** point: the screen position of this page's world-origin, i.e. `worldToScreen(camera, {x:0, y:0})`:

```js
  const mapOrigin = useCallback(
    () => worldToScreen(camera, { x: 0, y: 0 }),
    [camera],
  );
```

Add `worldToScreen` to the existing `whiteboardCoordinates.js` import:

```js
import { screenToWorld, worldToScreen } from "../ink/whiteboardCoordinates.js";
```

A fake `pageLayout` for these two components (they only read `.zoom`):

```js
  const fakePageLayout = { zoom: camera.scale };
```

Extend `handlePointerDown` — the current mouse/pen path is the final `inkPointer.onPointerDown(event);` call. Insert a lasso branch **before** that line (after the touch-pinch handling, so lasso only intercepts single-pointer draws):

```js
    if (isLassoMode) {
      const point = mapPoint(event);
      if (!point) return;
      setLassoSelection(null);
      setLassoDraft({ pointerId: event.pointerId, points: [{ x: point.x, y: point.y }] });
      return;
    }
    inkPointer.onPointerDown(event);
```

Extend `handlePointerMove` — insert before the final `inkPointer.onPointerMove(event);`:

```js
    if (lassoDraft && lassoDraft.pointerId === event.pointerId) {
      const point = mapPoint(event);
      if (!point) return;
      setLassoDraft((prev) => ({ ...prev, points: [...prev.points, { x: point.x, y: point.y }] }));
      return;
    }
    inkPointer.onPointerMove(event);
```

Extend `handlePointerUp` — insert before the final `inkPointer.onPointerUp(event);`:

```js
    if (lassoDraft && lassoDraft.pointerId === event.pointerId) {
      const polygon = lassoDraft.points;
      if (polygon.length >= 3) {
        const strokeIds = strokesInLasso(strokes, pageId, polygon);
        const objectIds = objectsInLasso(pageObjects, pageId, polygon);
        if (strokeIds.length > 0 || objectIds.length > 0) {
          setLassoSelection({ strokeIds, objectIds });
        }
      }
      setLassoDraft(null);
      return;
    }
    inkPointer.onPointerUp(event);
```

Add a keyboard-delete effect (near the other hooks, before the `return`):

```js
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if ((event.key === "Delete" || event.key === "Backspace") && lassoSelection) {
        event.preventDefault();
        if (lassoSelection.strokeIds.length > 0) inkController.removeStrokes?.(lassoSelection.strokeIds);
        if (lassoSelection.objectIds.length > 0) inkController.removeObjects?.(lassoSelection.objectIds);
        setLassoSelection(null);
      }
      if (event.key === "Escape") {
        if (lassoSelection) setLassoSelection(null);
        else if (isLassoMode) setIsLassoMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lassoSelection, isLassoMode, inkController]);
```

Add the rail button (after the color/width button from Task 5):

```jsx
      <button
        className={`rail-btn ${isLassoMode ? "active" : ""}`}
        onClick={() => {
          setIsLassoMode((mode) => !mode);
          setLassoSelection(null);
        }}
        title="Lasso-Auswahl"
      >
        <Lasso size={19} />
      </button>
```

Render the lasso draft polygon and the selection layer inside the `whiteboard-surface` div, after `<WhiteboardCanvas .../>`:

```jsx
        {lassoDraft && lassoDraft.points.length > 1 && (
          <svg
            data-testid="lasso-draft-path"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
          >
            <polyline
              points={lassoDraft.points
                .map((p) => {
                  const screen = worldToScreen(camera, p);
                  return `${screen.x},${screen.y}`;
                })
                .join(" ")}
              fill="rgba(62,123,216,0.12)"
              stroke="#3E7BD8"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          </svg>
        )}
        {lassoSelection && (
          <LassoSelectionLayer
            bounds={
              selectionBounds(strokes, pageObjects, lassoSelection.strokeIds, lassoSelection.objectIds)
                ? { pageId, ...selectionBounds(strokes, pageObjects, lassoSelection.strokeIds, lassoSelection.objectIds) }
                : null
            }
            pageLayout={fakePageLayout}
            mapOrigin={mapOrigin}
            onCommit={(transform) =>
              inkController.applyCommands?.([
                { type: "transform-selection", strokeIds: lassoSelection.strokeIds, objectIds: lassoSelection.objectIds, ...transform },
              ])
            }
            onDelete={() => {
              if (lassoSelection.strokeIds.length > 0) inkController.removeStrokes?.(lassoSelection.strokeIds);
              if (lassoSelection.objectIds.length > 0) inkController.removeObjects?.(lassoSelection.objectIds);
              setLassoSelection(null);
            }}
          />
        )}
```

Finally, disable single-finger touch drawing from also panning while lasso mode is on — no change needed there since lasso only intercepts via the new branch above, which runs for every pointer type including touch, consistent with how drawing itself already works for touch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx`
Expected: PASS, including every pre-existing test in the file.

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/WhiteboardEditor.jsx tests/WhiteboardEditor.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): add lasso select to the whiteboard rail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Whiteboard shape/text/image insert

**Files:**
- Modify: `src/components/WhiteboardEditor.jsx`
- Test: `tests/WhiteboardEditor.test.jsx`

**Interfaces:**
- Consumes: `DESIGN_TOOLS`, `TEXT_TOOL`, `DesignToolsPopover` (Task 4, `../DocumentView.jsx`), `PageObjectLayer` with `mapOrigin` (Task 2), `createPageObject`/`objectBounds` (`src/ink/pageObjects.js`, unchanged), `readImageObjectSource` (`src/ink/imageObject.js`, unchanged).

- [ ] **Step 1: Write the failing test**

Add to `tests/WhiteboardEditor.test.jsx`:

```js
  it('inserts a shape via the design-tools popover, placed at world coordinates', () => {
    const addObject = vi.fn();
    render(<WhiteboardEditor inkController={createControllerDouble({ addObject })} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.click(screen.getByTitle('Einfügen'));
    fireEvent.click(screen.getByTestId('insert-rect'));
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 250 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 250 });

    expect(addObject).toHaveBeenCalledTimes(1);
    const object = addObject.mock.calls[0][0];
    expect(object.type).toBe('rect');
    expect(object.pageId).toBe('wb-1-page-1');
    expect(object.width).toBeCloseTo(200);
    expect(object.height).toBeCloseTo(150);
  });
```

(Adjust `'wb-1-page-1'` if the file's `createControllerDouble` default uses a different page id — check the existing helper's default `document.pages[0].id` and match it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx -t "inserts a shape"`
Expected: FAIL — no "Einfügen" button exists yet.

- [ ] **Step 3: Implement**

In `src/components/WhiteboardEditor.jsx`, add to imports:

```js
import { Undo2, Redo2, PenLine, Eraser, Palette, X, Lasso, Shapes } from "lucide-react";
import { DESIGN_TOOLS, TEXT_TOOL, DesignToolsPopover } from "../components/DocumentView.jsx";
```

(Path note: `DocumentView.jsx` lives at `src/components/DocumentView.jsx`, i.e. a sibling of `WhiteboardEditor.jsx` — the relative import is `./DocumentView.jsx`, not `../components/DocumentView.jsx`. Use `import { DESIGN_TOOLS, TEXT_TOOL, DesignToolsPopover } from "./DocumentView.jsx";`)

```js
import { createPageObject, objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import PageObjectLayer from "./document/PageObjectLayer.jsx";
```

(`pageObjectsOf` is already imported from Task 6 — don't duplicate the import line, add `createPageObject`/`objectBounds` to that existing import instead.)

Add state:

```js
  const [isDesignToolsOpen, setIsDesignToolsOpen] = useState(false);
  const [placingTool, setPlacingTool] = useState(null);
  const [draftPlacement, setDraftPlacement] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const imageInputRef = useRef(null);
```

Extend `handlePointerDown` — insert a `placingTool` branch, checked before the lasso branch added in Task 6 (so an armed placement tool takes priority over a stray lasso-mode leftover — in practice only one is ever active since opening the design-tools popover doesn't toggle lasso off explicitly; add that too, see below):

```js
    if (placingTool) {
      const point = mapPoint(event);
      if (!point) return;
      setDraftPlacement({ type: placingTool.id, pointerId: event.pointerId, startX: point.x, startY: point.y, width: 0, height: 0 });
      return;
    }
```

(Place this immediately before the `if (isLassoMode) { ... }` block from Task 6.)

Extend `handlePointerMove` — insert before the lasso branch:

```js
    if (draftPlacement && draftPlacement.pointerId === event.pointerId) {
      const point = mapPoint(event);
      if (!point) return;
      setDraftPlacement((prev) => ({ ...prev, width: point.x - prev.startX, height: point.y - prev.startY }));
      return;
    }
```

Extend `handlePointerUp` — insert before the lasso branch:

```js
    if (draftPlacement && draftPlacement.pointerId === event.pointerId) {
      const tool = placingTool;
      const dragged = Math.abs(draftPlacement.width) > 8 || Math.abs(draftPlacement.height) > 8;
      const object = createPageObject({
        pageId,
        type: draftPlacement.type,
        x: dragged || tool.id === "text" ? draftPlacement.startX : draftPlacement.startX - tool.width / 2,
        y: dragged || tool.id === "text" ? draftPlacement.startY : draftPlacement.startY - tool.height / 2,
        width: dragged ? draftPlacement.width : tool.width,
        height: dragged ? draftPlacement.height : tool.height,
        color: inkController.color || "#3E7BD8",
        strokeWidth: inkController.penWidth || 3,
        text: draftPlacement.type === "text" ? (dragged ? "Text" : "") : undefined,
      });
      inkController.addObject?.(object);
      setSelectedObjectId(object.id);
      setDraftPlacement(null);
      setPlacingTool(null);
      return;
    }
```

Add an insert-tool handler (near the other handlers, above the return):

```js
  const handleInsertTool = (item) => {
    if (item.id === "image") {
      imageInputRef.current?.click();
      setIsDesignToolsOpen(false);
      return;
    }
    setPlacingTool(item);
    setIsDesignToolsOpen(false);
  };

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { src, width, height } = await readImageObjectSource(file);
      const maxWidth = Math.min(600, width);
      const scale = maxWidth / width;
      const center = screenToWorld(camera, { x: size.width / 2, y: size.height / 2 });
      const object = createPageObject({
        pageId,
        type: "image",
        x: center.x - maxWidth / 2,
        y: center.y - (height * scale) / 2,
        width: maxWidth,
        height: height * scale,
        src,
      });
      inkController.addObject?.(object);
      setSelectedObjectId(object.id);
    } catch {
      // A file the browser cannot decode simply inserts nothing.
    }
  };
```

Add the `readImageObjectSource` import:

```js
import { readImageObjectSource } from "../ink/imageObject.js";
```

Add the text-tool rail button and the design-tools rail button + popover + hidden file input. In `railContent`, after the lasso button from Task 6:

```jsx
      <button
        className={`rail-btn ${placingTool?.id === "text" ? "active" : ""}`}
        onClick={() => setPlacingTool((cur) => (cur?.id === "text" ? null : TEXT_TOOL))}
        title="Text"
      >
        <span style={{ fontSize: 15, fontWeight: 700 }}>T</span>
      </button>
      <button
        className={`rail-btn design-rail-btn ${isDesignToolsOpen || placingTool ? "active" : ""}`}
        onClick={() => {
          if (placingTool) setPlacingTool(null);
          else setIsDesignToolsOpen((open) => !open);
        }}
        title="Einfügen"
      >
        <Shapes size={19} />
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageFile}
      />
```

Render the popover and the object layer inside the outer `document-view` div, as siblings of the color popover from Task 5:

```jsx
      {isDesignToolsOpen && (
        <DesignToolsPopover onInsert={handleInsertTool} onClose={() => setIsDesignToolsOpen(false)} />
      )}
```

And inside `whiteboard-surface`, after the lasso rendering from Task 6:

```jsx
        <PageObjectLayer
          objects={pageObjects}
          pageLayout={fakePageLayout}
          mapOrigin={mapOrigin}
          selectedId={selectedObjectId}
          onSelect={setSelectedObjectId}
          onChange={(id, changes) => inkController.updateObject?.(id, changes)}
          onDelete={(id) => inkController.removeObjects?.([id])}
        />
```

Finally, opening the design-tools popover or arming a shape/text tool should turn lasso mode off (avoids two modes fighting over the same drag) — in the `isDesignToolsOpen` toggle button's `onClick` and in the text-tool button's `onClick`, also call `setIsLassoMode(false)`. Do the same the other way: the lasso rail button's `onClick` (Task 6) should also clear `setPlacingTool(null)`. Make both edits now.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx`
Expected: PASS, including every pre-existing test in the file.

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/WhiteboardEditor.jsx tests/WhiteboardEditor.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): add shape/text/image insert to the whiteboard rail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Whiteboard bucket fill

**Files:**
- Modify: `src/components/WhiteboardEditor.jsx`
- Test: `tests/WhiteboardEditor.test.jsx`

**Interfaces:**
- Consumes: `rasterizePageWalls`, `floodFill`, `fillResultToDataUrl`, `hexToRgb` (`src/ink/bucketFill.js`, unchanged), `isPointInsideObject` (`src/ink/pageObjects.js`, unchanged).

- [ ] **Step 1: Write the failing test**

Add to `tests/WhiteboardEditor.test.jsx`:

```js
  it('bucket-fills inside a closed loop of strokes at the clicked world point', () => {
    const addObject = vi.fn();
    const controller = createControllerDouble({
      addObject,
      document: {
        version: 1, documentId: 'wb-1', pages: [{ id: 'wb-1-page-1', kind: 'whiteboard' }],
        // A small closed square of strokes centered near (100,100) in world space.
        strokes: [
          { id: 's1', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 50, y: 50 }, { x: 150, y: 50 }] },
          { id: 's2', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 150, y: 50 }, { x: 150, y: 150 }] },
          { id: 's3', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 150, y: 150 }, { x: 50, y: 150 }] },
          { id: 's4', pageId: 'wb-1-page-1', tool: 'pen', color: '#fff', width: 3, opacity: 1, points: [{ x: 50, y: 150 }, { x: 50, y: 50 }] },
        ],
        objects: [], updatedAt: 0,
      },
    });
    render(<WhiteboardEditor inkController={controller} />);
    const surface = screen.getByTestId('whiteboard-surface');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });

    fireEvent.click(screen.getByTitle('Eimer-Füllung'));
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });
    fireEvent.pointerUp(surface, { pointerId: 1, pointerType: 'mouse', clientX: 100, clientY: 100 });

    expect(addObject).toHaveBeenCalledTimes(1);
    expect(addObject.mock.calls[0][0].type).toBe('fill');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx -t "bucket-fills"`
Expected: FAIL — no "Eimer-Füllung" button exists yet.

- [ ] **Step 3: Implement**

In `src/components/WhiteboardEditor.jsx`, add to imports:

```js
import { Undo2, Redo2, PenLine, Eraser, Palette, X, Lasso, Shapes, PaintBucket } from "lucide-react";
import { rasterizePageWalls, floodFill, fillResultToDataUrl, hexToRgb } from "../ink/bucketFill.js";
import { isPointInsideObject } from "../ink/pageObjects.js";
```

(`isPointInsideObject` joins the existing `pageObjects.js` import from Task 7 — add it to that same import line, don't duplicate.)

Add state:

```js
  const [isBucketMode, setIsBucketMode] = useState(false);
```

Add the fill handler (near `handleInsertTool`):

```js
  const handleBucketFill = (worldPoint) => {
    if (!worldPoint) return;

    const target = [...pageObjects]
      .reverse()
      .find(
        (object) =>
          (object.type === "rect" || object.type === "ellipse") &&
          isPointInsideObject(object, worldPoint.x, worldPoint.y),
      );
    if (target) {
      inkController.updateObject?.(target.id, { fillColor: inkController.color || "#3E7BD8" });
      return;
    }

    // Rasterize a viewport-sized window in world units, centered on the
    // current camera view, translating strokes/objects into that window's
    // local (0,0)-origin space first so rasterizePageWalls (unchanged, page
    // version's exact function) never needs to know about "world" at all.
    const windowWidth = Math.max(1, Math.round(size.width / camera.scale));
    const windowHeight = Math.max(1, Math.round(size.height / camera.scale));
    const originX = camera.x;
    const originY = camera.y;
    const translate = (points) => points.map((p) => ({ x: p.x - originX, y: p.y - originY }));
    const localStrokes = strokes
      .filter((s) => s.pageId === pageId)
      .map((s) => ({ ...s, points: translate(s.points) }));
    const localObjects = pageObjects.map((o) => ({ ...o, x: o.x - originX, y: o.y - originY }));

    const canvas = document.createElement("canvas");
    const wallData = rasterizePageWalls(canvas, {
      strokes: localStrokes,
      objects: localObjects,
      pageId,
      width: windowWidth,
      height: windowHeight,
    });
    const localX = Math.round(worldPoint.x - originX);
    const localY = Math.round(worldPoint.y - originY);
    if (localX < 0 || localY < 0 || localX >= windowWidth || localY >= windowHeight) return;
    const result = floodFill(wallData, windowWidth, windowHeight, localX, localY);
    if (!result) return;
    const { dataUrl, x, y, width: w, height: h } = fillResultToDataUrl(
      result,
      windowWidth,
      hexToRgb(inkController.color || "#3E7BD8"),
    );
    const object = createPageObject({
      pageId,
      type: "fill",
      x: x + originX,
      y: y + originY,
      width: w,
      height: h,
      color: inkController.color || "#3E7BD8",
      strokeWidth: 1,
      src: dataUrl,
    });
    inkController.addObject?.(object);
  };
```

Note: `document.createElement` inside this handler shadows the component's own local `document` variable (`const document = inkController.document;`, defined earlier in the file) — this is exactly the existing shadowing footgun flagged as a deferred minor from an earlier review. Do NOT fix that pre-existing shadow as part of this task (out of scope, already ledgered elsewhere) — but because of it, `document.createElement` here would actually try to call `.createElement` on the ink document object and crash. Work around it locally without touching the outer variable: use `globalThis.document.createElement("canvas")` in this handler instead of the bare `document.createElement("canvas")` shown above.

Extend `handlePointerDown` — insert a bucket-mode branch, checked first (before `placingTool`/`isLassoMode`):

```js
    if (isBucketMode) {
      const point = mapPoint(event);
      handleBucketFill(point);
      return;
    }
```

Add the rail button (after the design-tools button and image input from Task 7):

```jsx
      <button
        className={`rail-btn ${isBucketMode ? "active" : ""}`}
        onClick={() => {
          setIsBucketMode((mode) => !mode);
          setIsLassoMode(false);
          setPlacingTool(null);
        }}
        title="Eimer-Füllung"
      >
        <PaintBucket size={19} />
      </button>
```

Also add `setIsBucketMode(false)` to the lasso button's and the text/design-tools buttons' `onClick` handlers (mirroring the mutual-exclusion edit from Task 7, now including the bucket mode too) so only one placement/selection mode is ever active at a time.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/WhiteboardEditor.test.jsx`
Expected: PASS, including every pre-existing test in the file.

Run: `npx vitest run`
Expected: PASS across the whole suite.

- [ ] **Step 5: Commit**

```bash
git add src/components/WhiteboardEditor.jsx tests/WhiteboardEditor.test.jsx
git commit -m "$(cat <<'EOF'
feat(whiteboard): add bucket fill to the whiteboard rail

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Manual verification in the browser

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: every test passes except the 3 known pre-existing unrelated failures.

- [ ] **Step 2: Start the dev server** (see the previous plan's Task 13 for how — a plain `npm run dev`/`vite --port <free-port>` from within whatever workspace this executes in, opened in the browser pane; do not rely on any `.claude/launch.json` entry pointing at a different checkout than the one these changes landed in)

- [ ] **Step 3: Verify whiteboard background**

- Create a new document, choose Whiteboard, pick the white background swatch, create it.
- Confirm the whiteboard canvas background is white, not the dark default.
- Draw a stroke; confirm it's visible (dark ink on the light board, via the existing `inkColor` mechanism).

- [ ] **Step 4: Verify color/width**

- Click the palette rail button, pick a new color and width, draw a stroke, confirm it uses the new color/width.

- [ ] **Step 5: Verify lasso**

- Draw two strokes. Lasso around one of them. Confirm the selection frame appears around just that stroke. Drag the selection to move it. Press Delete; confirm it's removed and the other stroke is untouched.

- [ ] **Step 6: Verify shapes/text/image**

- Open "Einfügen", insert a rectangle by dragging; confirm it appears at the dragged location and can be moved/resized via its handles.
- Click the Text button, click once on the canvas; confirm a text box appears and can be typed into.
- Open "Einfügen" → Bild, pick an image file; confirm it appears centered in the current view.
- Pan/zoom the camera; confirm all inserted objects move/scale correctly with the camera (they're strokes/objects in the same world space, not screen-fixed).

- [ ] **Step 7: Verify bucket fill**

- Draw a closed loop of strokes (e.g. a rough rectangle). Open bucket fill, click inside the loop. Confirm a filled color region appears bounded by the strokes.
- Pan far away and back; confirm the fill is still there, correctly positioned.

- [ ] **Step 8: Check the browser console for errors**

Use `read_console_messages` after each of the above; expected: no errors or warnings introduced by this feature.

- [ ] **Step 9: Report results**

No commit for this task — verification only. If any check fails, go back to the relevant task, fix, re-run that task's tests, and re-verify here.
