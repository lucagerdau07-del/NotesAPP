# Design Specification: Canva-Style Layer System

**Date:** 2026-09-04  
**Status:** Approved  
**Feature:** Canva-Style Layer System (Ebenen-System) for NotesAPP

---

## 1. Overview & Motivation

In visual note-taking and document editing, users frequently combine images, handwritten notes, shapes, text boxes, and color fills. Currently, elements in NotesAPP are partitioned into a fixed order (fills behind ink, all other objects above ink) with no visual list, no reordering capability, and no way to place images or text behind handwritten annotations or to lock backgrounds in place.

This specification defines a Canva-inspired Layer System that provides:
1. A **Layer Drawer (Seitenpanel)** sliding in from the left, displaying all elements in visual top-to-bottom order with drag-and-drop reordering, visibility toggle (eye icon), and locking (lock icon).
2. A **Flexible Ink Layer ("✍️ Handschrift & Striche")** within the stacking order, allowing images/shapes to be positioned either in front of or behind handwritten strokes.
3. **Quick Stacking Actions** on selected objects ("Ganz nach vorne", "Eine Ebene vor", "Eine Ebene zurück", "Ganz nach hinten").
4. **Lock & Visibility Semantics** preventing accidental stylus dragging of locked reference images while handwriting.

---

## 2. Architecture & Data Model

### 2.1 Document State Extensions (`inkDocument.js`)

The order of objects in `document.objects` directly defines their Z-stacking order:
- `objects[0]`: Bottom-most object layer.
- `objects[objects.length - 1]`: Top-most object layer.

Additional properties per object:
- `locked?: boolean` (default: `false`): When `true`, the object cannot be moved, resized, rotated, or deleted on the canvas.
- `hidden?: boolean` (default: `false`): When `true`, the object is omitted from rendering and hit-testing.

Document-level layer state:
- `inkLayerIndex?: number` (default: auto-computed for legacy notes): An integer $0 \le \text{inkLayerIndex} \le \text{objects.length}$ indicating where the handwritten `<canvas>` is interleaved in the object stack:
  - Objects at indices $< \text{inkLayerIndex}$ render **behind** the ink canvas.
  - Objects at indices $\ge \text{inkLayerIndex}$ render **in front of** the ink canvas.
- `inkLayerHidden?: boolean` (default: `false`): When `true`, the ink canvas is hidden from view.
- `inkLayerLocked?: boolean` (default: `false`): When `true`, the ink canvas rejects new pen strokes (read-only ink).

### 2.2 Backward Compatibility
For existing documents where `inkLayerIndex` is not specified:
- Objects with `type === "fill"` default to before the ink canvas ($[0, \text{fills.length})$).
- All other objects default to after the ink canvas.
- `inkLayerIndex` automatically resolves to the count of background fill objects, preserving identical visual rendering for all past notes.

---

## 3. Command Pipeline (`useInkDocument.js` & `inkDocument.js`)

All layer modifications integrate into the immutable undo/redo history pipeline:

1. **`reorder-layers`**:
   - Parameters: `{ newObjectIds: string[], inkLayerIndex: number }`
   - Reorders `document.objects` according to `newObjectIds` and updates `inkLayerIndex`.
2. **`set-layer-lock`**:
   - Parameters: `{ target: "object" | "ink", objectId?: string, locked: boolean }`
   - Sets `locked` on the specified object or on the ink layer.
3. **`set-layer-visibility`**:
   - Parameters: `{ target: "object" | "ink", objectId?: string, hidden: boolean }`
   - Sets `hidden` on the specified object or on the ink layer.
4. **`shift-layer-order`**:
   - Parameters: `{ objectId: string, direction: "forward" | "backward" | "front" | "back" }`
   - Convenience command to shift an object relative to other objects and the ink layer.

---

## 4. User Interface & Components

### 4.1 Layer Drawer (`src/components/document/LayerDrawer.jsx`)
- **Container**: Glassmorphic sidebar panel (280px width) sliding in next to the left editor rail.
- **Header**:
  - Title: "Ebenen" with layer count badge.
  - Close button (`X`).
- **Stack List (Top to Bottom)**:
  - Highest visual layer at the top, lowest layer at the bottom.
  - Each item card displays:
    - **Grip handle (`GripVertical`)**: Drag & drop reordering using HTML5 drag/drop or touch-friendly pointer drag.
    - **Thumbnail / Icon**:
      - Image: Mini thumbnail preview of `src`.
      - Shapes: Rect / Ellipse / Arrow / Line icon colored with `color` / `fillColor`.
      - Text: Type icon with text snippet.
      - Fill: Paint bucket icon with fill color.
      - Ink: Special card labeled **"✍️ Handschrift & Striche"** with stroke counter.
    - **Title / Label**: Editable or auto-generated name (e.g. "Bild", "Text: Notizen...", "Rechteck").
    - **Actions**:
      - Eye icon (`Eye` / `EyeOff`): Toggle visibility.
      - Lock icon (`Lock` / `Unlock`): Toggle lock state.
- **Selection Synchronization**:
  - Clicking an item in the drawer selects it on the canvas (`onSelect(id)`).
  - Selecting an object on the canvas highlights its card in the drawer and scrolls it into view.

### 4.2 Selection Toolbar Position Quick-Actions (`PageObjectLayer.jsx`)
When an object is selected on the canvas, its floating mini-toolbar includes a `Layers` button (`Layers` icon) with a dropdown / popup menu containing:
- **In den Vordergrund** (`Bring to Front`)
- **Eine Ebene nach vorne** (`Bring Forward`)
- **Eine Ebene nach hinten** (`Send Backward`)
- **In den Hintergrund** (`Send to Back`)
- **Ebenen-Panel öffnen** (`Open Layer Drawer`)

### 4.3 Locked Object Presentation (`PageObjectLayer.jsx`)
- When an object is `locked`:
  - It shows a small lock badge (`Lock` icon) on the top-right of the selection outline.
  - Resize handles, drag-move cursor, and rotate handles are hidden.
  - Clicking the lock badge or the lock toggle in the toolbar/drawer unlocks the object.
  - Lasso tool transformations ignore locked objects.

---

## 5. Rendering Pipeline (`DocumentView.jsx`)

In `DocumentView.jsx`:
```jsx
{/* 1. Layers below ink */}
<PageObjectLayer
  objects={visibleObjectsBelowInk}
  selectedId={selectedObjectId}
  ...
/>

{/* 2. Ink Canvas (unless hidden) */}
{!inkLayerHidden && (
  <canvas
    ref={inkCanvasRef}
    className="master-canvas"
    ...
  />
)}

{/* 3. Layers above ink */}
<PageObjectLayer
  objects={visibleObjectsAboveInk}
  selectedId={selectedObjectId}
  ...
/>
```

Where:
- `visibleObjectsBelowInk = objects.slice(0, inkLayerIndex).filter(o => !o.hidden)`
- `visibleObjectsAboveInk = objects.slice(inkLayerIndex).filter(o => !o.hidden)`

---

## 6. Thumbnail Previews (`src/documents/notePreview.js`)

The `drawPreviewObject` loop in `notePreview.js` renders elements in their exact layer order:
- Renders `objects.slice(0, inkLayerIndex)` (filtering out `o.hidden === true`).
- Renders ink strokes (if `!inkLayerHidden`).
- Renders `objects.slice(inkLayerIndex)` (filtering out `o.hidden === true`).

---

## 7. Verification Plan

1. **Unit Tests**:
   - `tests/ink/layerManagement.test.js`: Test `reorder-layers`, `shift-layer-order`, `locked`, `hidden`, and `inkLayerIndex` boundary clamping.
   - `tests/components/LayerDrawer.test.jsx`: Test rendering items, drag/drop reordering callback, lock and hide toggles.
   - `tests/PageObjectLayer.test.jsx`: Test locked object disables handles and displays lock badge.
2. **E2E & Hardware Tablet Verification**:
   - Build web bundle and Android APK.
   - Install on Samsung Galaxy Tab A7.
   - Open Layer Drawer via the `Layers` icon in the left rail.
   - Move an image layer below the ink layer and verify handwritten ink renders on top of the image.
   - Toggle lock on an image and verify drawing or dragging over it does not disturb the image.
   - Capture screenshots for walkthrough documentation.
