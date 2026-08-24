# Ink Engine Architecture Refactoring

**Date:** 2026-08-24  
**Status:** Approved in chat; awaiting review of this written specification

## Goal

Refactor the existing handwriting and drawing path into a reliable, maintainable ink engine. The first stage improves the current canvas tools and their architecture. Keyboard text, freely positioned text boxes, rich-text editing, and object-selection workflows are explicitly deferred.

The refactoring must preserve the existing editor layout wherever possible. New UI is limited to controls required for input mode and eraser mode.

## Problems in the Current Architecture

1. `DocumentView` accepts pen, touch, and mouse input through the same drawing handlers while its parent also tracks the same pointers for gestures. Drawing is not bound to a single pointer ID, so a palm or second finger can alter or end an active pen stroke.
2. `useMasterCanvas` and `useCanvas` maintain separate histories. The toolbar calls both histories, while `WritingZone.updateStrokes` replaces history entries. Undo and redo can therefore diverge between the document and focus writing area.
3. Discrete page gaps exist only in the rendered layout. The master canvas and pointer coordinates still treat the document as one continuous rectangle, allowing ink to appear in gaps or at shifted positions.
4. Strokes are painted segment by segment as they arrive. Marker opacity cannot be represented correctly without visible segment overlap, and the marker width is multiplied inconsistently between settings, preview, and rendering.
5. `WritingZone` locates its canvas with `document.querySelector`, coupling it to a single global instance and making component isolation fragile.
6. Ink state is held only in refs and canvas pixels. There is no versioned document representation that can survive reloads, resize, rotation, or remounting.
7. The pen, fountain pen, and pencil labels do not map to meaningfully different rendering behavior.

## Proposed Architecture

```text
SplitLayout
  InkDocumentController
    InkDocumentModel
    UnifiedCommandHistory
    LocalInkRepository
  ToolState
  DocumentView
    PointerInputCoordinator
    PageCoordinateMapper
    InkCanvasRenderer
  WritingZone
    FocusViewport
    PointerInputCoordinator
    InkCanvasRenderer
```

### 1. Ink document model

The source of truth is a serializable vector document, not the pixels of either canvas.

```js
{
  version: 1,
  documentId: string,
  pages: [{ id: string }],
  strokes: [{
    id: string,
    pageId: string,
    tool: 'pen' | 'fountain' | 'pencil' | 'highlighter' | 'pixel-eraser',
    color: string,
    width: number,
    opacity: number,
    points: [{ x: number, y: number }]
  }],
  updatedAt: number
}
```

Coordinates are page-local and independent of viewport size, zoom, device-pixel ratio, and visual gaps. All canvases render projections of this model.

### 2. One controller and one history

An `InkDocumentController` owns document state and exposes explicit commands:

- `commitStroke`
- `removeStrokes`
- `clearDocument`
- `addPage`
- `undo`
- `redo`
- `loadDocument`

Every user action creates one history entry. The focus writing area never owns an independent history; it sends the same commands to the controller. New commands after undo discard the redo branch. History is bounded to avoid unbounded memory growth.

Pixel erasing is represented as an eraser stroke and replayed with `destination-out`. Stroke erasing performs hit testing and records the removed stroke IDs and data as one reversible command.

### 3. Pointer input coordinator

Input policy is explicit and shared by full-page and focus writing views.

- **Stylus mode (default):** pen draws; touch pointers navigate/zoom and are never admitted to the drawing pipeline; mouse can draw for desktop testing and use.
- **Finger mode:** one touch pointer can draw; adding a second touch cancels the uncommitted touch stroke and hands both pointers to navigation/zoom.
- An active stroke is owned by exactly one `pointerId`. Move, up, and cancel events from other pointers are ignored by the drawing pipeline.
- Pointer capture is acquired for the admitted drawing pointer and released at the end.
- Palm-like touch input cannot terminate or mutate a pen stroke.
- Pressure data is intentionally ignored in this stage.

The coordinator returns intent (`draw`, `navigate`, or `ignore`) instead of directly mutating canvas state. This keeps input policy testable without a browser canvas.

### 4. Page coordinate mapper

A pure mapper converts viewport coordinates into `{ pageId, x, y }`.

- Visual page gaps return `null` and do not accept ink.
- A stroke crossing a gap ends at the current page boundary. Drawing may resume only after a new pointer-down on another page.
- Infinite-document mode maps into the same page-local model while presenting pages without visible gaps.
- Focus viewport coordinates map through its selected page region into the same page coordinates.

### 5. Renderer

`InkCanvasRenderer` clears and redraws from the vector model whenever document state, size, zoom, or device-pixel ratio changes.

- Complete paths are rendered once, avoiding marker opacity buildup at every segment.
- Canvas backing dimensions follow CSS size and device-pixel ratio without changing logical coordinates.
- Pen styles are deterministic and pressure-independent:
  - pen: opaque round line;
  - fountain: slightly narrower, opaque line;
  - pencil: softer, lower-opacity line;
  - highlighter: wider translucent path;
  - pixel eraser: `destination-out` path.
- Rendering may be scheduled with `requestAnimationFrame`, but committed document state remains synchronous and testable.

### 6. Focus writing area

`WritingZone` becomes a viewport over the shared document model.

- It receives an explicit canvas ref and focus rectangle.
- It filters and transforms shared strokes for display only.
- New focus-area strokes are mapped to page coordinates and committed directly to the controller.
- Undo, redo, clear, and persistence remain controller responsibilities.
- No global DOM queries or duplicate stroke-flush logic remain.

### 7. Persistence

A small repository serializes the versioned ink document and its bounded command history to `localStorage` under a stable note ID.

- Saves are debounced after committed commands, undo, and redo.
- The current history cursor is stored with the bounded history so undo and redo remain coherent after a restart.
- Loading validates the schema and falls back to an empty document when data is absent or malformed.
- Tool preferences, input mode, and eraser mode are stored separately from document content.
- Canvas resize, rotation, and component remount never affect saved ink because pixels are not persisted.

The app must pass a stable note ID into `SplitLayout`. Notes without an ID receive one when opened or created.

## State and Error Handling

- Invalid stored JSON or unsupported schema versions must not crash the editor; the invalid payload is ignored and an empty document is used.
- Pointer cancellation discards only the uncommitted stroke.
- An unavailable canvas context leaves the document model intact and allows a later render retry.
- Storage write failure must not block drawing. The current session remains usable even if persistence cannot complete.
- Clear-document remains undoable.

## Test Strategy

Implementation follows red-green-refactor. Tests exercise behavior rather than internal implementation details.

### Pure unit tests

- pointer admission for stylus, finger, mouse, palm, second-touch, wrong pointer ID, and cancellation;
- viewport-to-page mapping before, inside, and after a page gap;
- command history across stroke, erase, clear, undo, redo, and redo-branch replacement;
- stroke hit testing for stroke eraser;
- serialization, malformed data fallback, and schema-version handling;
- deterministic tool style mapping.

### Hook/component tests

- a pen stroke is unaffected by touch move/up events;
- finger mode admits one touch but transfers two-touch interaction to gestures;
- both full-page and focus writing commit to the same history;
- resize/remount redraws existing vector strokes;
- toolbar undo/redo affects one unified controller;
- input- and eraser-mode controls update behavior and accessible state.

### Verification

- complete Vitest suite;
- production Vite build;
- browser smoke test at tablet and desktop viewport sizes;
- manual pointer-event smoke test where browser automation permits synthetic pen/touch events.

## Migration and Compatibility

There is no durable ink format in the current implementation, so no stored user ink can be migrated. Existing in-session ink behavior is replaced by the versioned model. Existing paper styles, page modes, zoom, focus box, colors, and editor layout remain available.

## Files and Boundaries

Expected new focused modules:

- `src/ink/inkDocument.js`
- `src/ink/inkHistory.js`
- `src/ink/inputPolicy.js`
- `src/ink/pageCoordinates.js`
- `src/ink/renderInk.js`
- `src/ink/inkRepository.js`
- `src/hooks/useInkDocument.js`

Expected refactors:

- `src/components/SplitLayout.jsx`
- `src/components/DocumentView.jsx`
- `src/components/WritingZone.jsx`
- `src/hooks/useCanvas.js` (reduced to a thin compatibility layer or removed)
- `src/hooks/useMasterCanvas.js` (replaced by the controller hook)
- `src/App.jsx` (stable note ID propagation)

Existing unrelated Android migration files and the user's current `src/styles/main.css` changes must be preserved. CSS changes, if required for the two new controls, must be narrow and appended without rewriting unrelated styling.

## Non-goals for This Stage

- pressure-sensitive width;
- handwriting recognition;
- typed or rich text;
- freely positioned text boxes;
- lasso move/resize/duplicate workflows;
- cloud synchronization;
- visual redesign of the editor.
