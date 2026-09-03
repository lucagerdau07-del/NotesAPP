# Whiteboard toolbar parity + background color

Status: approved, not yet implemented
Date: 2026-09-03

## Problem

The whiteboard page type (shipped in [`2026-09-03-document-creation-options-design.md`](2026-09-03-document-creation-options-design.md)) only has Undo/Redo/Pen/Eraser. Normal pages additionally have: color/width picker, lasso select, bucket fill, shape/text/image insert. The whiteboard also can't be given a background color at creation (dialog hides format/background/ruling entirely for `pageKind: "whiteboard"`).

## Findings from research

All four missing tools' underlying algorithms are coordinate-system agnostic — they operate on plain stroke/object `{x,y}` data with no page-bounds assumption:

- **Lasso** (`src/ink/lasso.js`: `strokesInLasso`, `objectsInLasso`, `selectionBounds`) — pure point/bbox math.
- **Bucket fill** (`src/ink/bucketFill.js`: `rasterizePageWalls`, `floodFill`, `fillResultToDataUrl`) — already parameterized by explicit `width`/`height`/`offsetX`/`offsetY`, never implicitly "the page."
- **Design tools / objects** (`src/components/document/PageObjectLayer.jsx`, `src/ink/pageObjects.js`) — `objectBounds`/`hitTestObject` are plain rect math.
- **Color/width popovers** (`ColorWheelPopover`, `PenSettingsPopover` in `DocumentView.jsx`) — fully self-contained, only need `customColors`/`penColor`/`penWidth`/setters, no page-layout props.

The only page-boundedness lives in each feature's *viewport-mapping call sites* in `DocumentView.jsx`: `pagePointToViewport`/`focusRectToViewport` (`src/ink/pageCoordinates.js`), which hard-reject (`return null`) any coordinate outside `[0, page.width] × [0, page.height]`. A whiteboard needs the same job done by a non-clamping, camera-based equivalent.

## Non-goals

- No ruling/format for whiteboard (still doesn't make sense for an unbounded canvas — not requested).
- No page-break/multi-page navigation for whiteboard (still one page).
- Bucket fill windowing performance tuning beyond "rasterize the current viewport" — no tiling/caching across pans.
- No change to the normal-page tools themselves — this only adds whiteboard equivalents.

## Design

### 1. Whiteboard background color

`NewDocumentDialog.jsx`: show the background-swatch row for `pageKind === "whiteboard"` too (format and ruling rows stay hidden). `resolvePageStyle()` in `pageStyles.js`: for `kind: "whiteboard"`, also resolve and return `background`/`linesRgb`/`inkColor` from the chosen preset (reuse the exact same `BACKGROUND_PRESETS` lookup already used for `kind: "page"` — no new preset table). `WhiteboardEditor.jsx`: read `document.pages[0]?.background` for the container's background (falling back to the current hardcoded `#0B0B0D` dark) instead of the hardcoded value. `linesRgb` isn't used (no ruling on whiteboard); `inkColor` flows automatically since it already goes through the same `initialColor`/`useInkDocument` plumbing regardless of page kind.

### 2. `src/ink/whiteboardViewport.js` — camera-based mapping

New module, mirroring `pageCoordinates.js`'s shape but non-clamping and camera-driven:

```js
export function worldPointToViewport(camera, point) {
  // world -> screen via camera, no bounds check (wraps worldToScreen)
}
export function viewportRectToWorld(camera, rect) {
  // screen rect -> world rect, for lasso/draft-placement bounding boxes
}
```

Built on the existing `worldToScreen`/`screenToWorld` (`src/ink/whiteboardCoordinates.js`, unchanged). Every whiteboard tool below uses this instead of `pagePointToViewport`/`focusRectToViewport`.

### 3. Color/width popover

Lift `ColorWheelPopover` and `PenSettingsPopover` (currently private to `DocumentView.jsx`) into their own module (`src/components/document/PenPopovers.jsx`) so both `DocumentView.jsx` and `WhiteboardEditor.jsx` import the same components — no duplication. `DocumentView.jsx`'s existing usage is updated to import instead of using its local definitions (pure refactor there, zero behavior change). `WhiteboardEditor.jsx` gets its own `isPenSettingsOpen`/`isColorPickerOpen`/`customColors`/`activePickerIndex` state and rail buttons to open them, wired to `inkController.color`/`setColor`/`penWidth`/`setPenWidth`/`eraserWidth`/`setEraserWidth`.

### 4. Lasso

`WhiteboardEditor.jsx` gains `isLassoMode`/`lassoDraft`/`lassoSelection` state (mirrors `DocumentView.jsx`'s), a rail toggle button, and pointer-handling that — when lasso mode is active — draws the lasso polygon (in world coordinates, converted for the SVG overlay via `worldPointToViewport`) instead of routing to `useInkPointer`. On release, `strokesInLasso`/`objectsInLasso` (unchanged) compute the selection; a lightweight version of `LassoSelectionLayer` (or the existing one, generalized to accept a `mapPoint` prop instead of assuming `pagePointToViewport`) renders the selection handles.

### 5. Design tools (shapes/text/image)

`WhiteboardEditor.jsx` gains the `DESIGN_TOOLS` popover (imported from `DocumentView.jsx` — export it — not duplicated) and `placingTool`/`draftPlacement` state. Placement drag is mapped through `worldPointToViewport`/`viewportRectToWorld` instead of the page-bound equivalents. Inserted objects render via the existing `PageObjectLayer`, generalized (it already takes a `pageLayout` prop just to compute screen position via `pagePointToViewport` internally — this needs a small change to accept an injected mapping function instead, defaulting to today's `pagePointToViewport`-based behavior so `DocumentView.jsx`'s usage is unaffected).

### 6. Bucket fill

`WhiteboardEditor.jsx` gains bucket-fill mode (rail toggle) reusing `rasterizePageWalls`/`floodFill`/`fillResultToDataUrl` unchanged. Unlike the page version (rasterizes the whole fixed-size page), the whiteboard version rasterizes the **current viewport** (`camera` + container `width`/`height`, in world units) as the fill's coordinate window, passing `offsetX`/`offsetY` equal to the viewport's world-space top-left so strokes/objects are drawn in the walls raster at the right relative position. The resulting fill object is stored with world coordinates (same object model, `pageObjects.js`'s `createPageObject`, unchanged) sized/positioned to match the rasterized window. Panning after a fill doesn't need to re-rasterize — the fill is a static object like any other, same as the page version.

## Testing

- `resolvePageStyle` test additions: whiteboard + background id resolves `background`/`inkColor`.
- `whiteboardViewport.js` unit tests (pure functions, mirrors `whiteboardCoordinates.test.js`).
- `PenPopovers.jsx` extraction: existing `DocumentView.test.jsx` coverage must stay green unmodified (proves the refactor is behavior-preserving); no new tests required for the components themselves beyond what already exists.
- `WhiteboardEditor.test.jsx` additions: color/width popover opens and calls `setColor`/`setPenWidth`; lasso mode selects a stroke drawn within the loop and deletes it; design-tool insert creates an object with world coordinates; bucket fill creates a fill object bounded by the current viewport window.
- `PageObjectLayer`'s mapping-function generalization: existing tests must stay green (default behavior unchanged); one new test confirms an injected mapping function is used when provided.
