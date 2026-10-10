# Canva-Style Layer System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Canva-style Layer System featuring a sliding Layer Drawer, touch/drag-and-drop reordering, visibility (eye) & locking (lock) toggles, flexible ink layering, and quick-order selection toolbar controls.

**Architecture:** The document's `objects` array serves as the primary Z-index order (bottom to top). A new `inkLayerIndex` integer interleaves the hardware-accelerated handwriting `<canvas>` cleanly within the object stack, splitting rendered objects into two `<PageObjectLayer />` passes (below and above ink) with zero stylus drawing latency. Actions are managed through immutable commands (`reorder-layers`, `set-layer-lock`, `set-layer-visibility`, `shift-layer-order`) with full undo/redo.

**Tech Stack:** React 18, Vitest, Lucide Icons, Capacitor Android on Samsung Galaxy Tab A7.

## Global Constraints

- Never break backward compatibility for existing notes without `inkLayerIndex`.
- Stylus drawing on `<canvas>` must remain 100% fluid with zero FPS drop or lag.
- Every state mutation must be a single undo/redo step via `executeInkCommand`.
- Respect `RULE[c:\Antigravity\NotesAPP\.agents\AGENTS.md]`: Commit and push git savestates after every task.

---

### Task 1: Layer State & Commands in Ink Document Model

**Files:**
- Modify: `src/ink/inkDocument.js`
- Modify: `src/ink/pageObjects.js`
- Modify: `src/hooks/useInkDocument.js`
- Test: `tests/ink/layerManagement.test.js`

**Interfaces:**
- Consumes: `createPageObject`, `executeInkCommand`
- Produces:
  - `document.inkLayerIndex`: number (clamped $0 \le \text{idx} \le \text{objects.length}$)
  - `document.inkLayerHidden`: boolean
  - `document.inkLayerLocked`: boolean
  - `object.locked`: boolean
  - `object.hidden`: boolean
  - Commands: `"reorder-layers"`, `"set-layer-lock"`, `"set-layer-visibility"`, `"shift-layer-order"`
  - Controller methods: `reorderLayers`, `setLayerLock`, `setLayerVisibility`, `shiftLayerOrder`

- [ ] **Step 1: Write the failing tests in `tests/ink/layerManagement.test.js`**

```javascript
import { describe, it, expect } from "vitest";
import {
  createInkDocument,
  executeInkCommand,
  resolveInkLayerIndex,
} from "../../src/ink/inkDocument.js";
import { createPageObject } from "../../src/ink/pageObjects.js";

describe("Layer Management Commands", () => {
  it("resolves default inkLayerIndex for legacy documents", () => {
    const doc = createInkDocument({
      objects: [
        createPageObject({ type: "fill", id: "fill-1" }),
        createPageObject({ type: "image", id: "img-1" }),
      ],
    });
    // Fill should be below ink, image above ink
    expect(resolveInkLayerIndex(doc)).toBe(1);
  });

  it("reorders objects and updates inkLayerIndex with undo/redo", () => {
    const o1 = createPageObject({ type: "image", id: "img-1" });
    const o2 = createPageObject({ type: "text", id: "txt-1" });
    let history = {
      past: [],
      present: createInkDocument({ objects: [o1, o2], inkLayerIndex: 1 }),
      future: [],
    };

    history = executeInkCommand(history, {
      type: "reorder-layers",
      newObjectIds: ["txt-1", "img-1"],
      inkLayerIndex: 0,
    });

    expect(history.present.objects.map((o) => o.id)).toEqual(["txt-1", "img-1"]);
    expect(history.present.inkLayerIndex).toBe(0);
  });

  it("toggles layer lock and visibility for objects and ink", () => {
    const o1 = createPageObject({ type: "image", id: "img-1" });
    let history = {
      past: [],
      present: createInkDocument({ objects: [o1] }),
      future: [],
    };

    // Lock object
    history = executeInkCommand(history, {
      type: "set-layer-lock",
      target: "object",
      objectId: "img-1",
      locked: true,
    });
    expect(history.present.objects[0].locked).toBe(true);

    // Hide ink layer
    history = executeInkCommand(history, {
      type: "set-layer-visibility",
      target: "ink",
      hidden: true,
    });
    expect(history.present.inkLayerHidden).toBe(true);
  });

  it("shifts layer order forward, backward, to front, and to back", () => {
    const o1 = createPageObject({ type: "image", id: "1" });
    const o2 = createPageObject({ type: "image", id: "2" });
    const o3 = createPageObject({ type: "image", id: "3" });
    let history = {
      past: [],
      present: createInkDocument({ objects: [o1, o2, o3], inkLayerIndex: 2 }),
      future: [],
    };

    // Shift "1" to front
    history = executeInkCommand(history, {
      type: "shift-layer-order",
      objectId: "1",
      direction: "front",
    });
    expect(history.present.objects.map((o) => o.id)).toEqual(["2", "3", "1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ink/layerManagement.test.js`  
Expected: FAIL with missing commands / functions.

- [ ] **Step 3: Implement layer commands in `src/ink/inkDocument.js`, `src/ink/pageObjects.js`, and `src/hooks/useInkDocument.js`**

In `src/ink/pageObjects.js`:
- Add `locked: source.locked === true`
- Add `hidden: source.hidden === true`

In `src/ink/inkDocument.js`:
- Add `resolveInkLayerIndex(document)` helper.
- Implement command cases `"reorder-layers"`, `"set-layer-lock"`, `"set-layer-visibility"`, `"shift-layer-order"`.

In `src/hooks/useInkDocument.js`:
- Expose controller methods `reorderLayers`, `setLayerLock`, `setLayerVisibility`, `shiftLayerOrder`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ink/layerManagement.test.js`  
Expected: PASS (4 tests passing).

- [ ] **Step 5: Git Savestate Commit**

```bash
git add src/ink/pageObjects.js src/ink/inkDocument.js src/hooks/useInkDocument.js tests/ink/layerManagement.test.js
git commit -m "feat(layers): implement layer state, reordering, lock, visibility, and shift commands"
git push
```

---

### Task 2: Canva Layer Drawer Component (`LayerDrawer.jsx`)

**Files:**
- Create: `src/components/document/LayerDrawer.jsx`
- Create: `src/components/document/LayerDrawer.css`
- Test: `tests/components/LayerDrawer.test.jsx`

**Interfaces:**
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `objects: PageObject[]`
  - `inkLayerIndex: number`
  - `inkLayerHidden: boolean`
  - `inkLayerLocked: boolean`
  - `strokeCount: number`
  - `selectedId: string | null`
  - `onSelect: (id: string | null) => void`
  - `onReorder: (newObjectIds: string[], newInkLayerIndex: number) => void`
  - `onToggleLock: (target: "object" | "ink", id?: string) => void`
  - `onToggleVisibility: (target: "object" | "ink", id?: string) => void`
  - `onDeleteObject: (id: string) => void`

- [ ] **Step 1: Write component tests in `tests/components/LayerDrawer.test.jsx`**

```jsx
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import LayerDrawer from "../../src/components/document/LayerDrawer.jsx";

describe("LayerDrawer Component", () => {
  const objects = [
    { id: "obj-1", type: "image", text: "Stempel", locked: false, hidden: false },
    { id: "obj-2", type: "text", text: "Notiz", locked: false, hidden: false },
  ];

  it("renders list items in reverse visual order (top-most first)", () => {
    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        strokeCount={5}
        onClose={() => {}}
      />
    );
    const items = screen.getAllByTestId("layer-item");
    // Top-most is obj-2, followed by Ink layer, followed by obj-1
    expect(items[0]).toHaveTextContent("Notiz");
    expect(items[1]).toHaveTextContent("Handschrift & Striche");
    expect(items[2]).toHaveTextContent("Stempel");
  });

  it("calls onToggleLock and onToggleVisibility when action buttons are clicked", () => {
    const onToggleLock = vi.fn();
    const onToggleVisibility = vi.fn();

    render(
      <LayerDrawer
        isOpen={true}
        objects={objects}
        inkLayerIndex={1}
        onToggleLock={onToggleLock}
        onToggleVisibility={onToggleVisibility}
        onClose={() => {}}
      />
    );

    const lockBtns = screen.getAllByTitle(/sperren/i);
    fireEvent.click(lockBtns[0]);
    expect(onToggleLock).toHaveBeenCalled();

    const eyeBtns = screen.getAllByTitle(/ausblenden|einblenden/i);
    fireEvent.click(eyeBtns[0]);
    expect(onToggleVisibility).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/LayerDrawer.test.jsx`  
Expected: FAIL with "LayerDrawer is not defined".

- [ ] **Step 3: Implement `LayerDrawer.jsx` and `LayerDrawer.css`**

Features:
- Glassmorphic slide-in drawer from the left (`width: 280px`).
- Header with "Ebenen" title, count badge, and close button (`X`).
- Merges `objects` and virtual `"__ink__"` layer item into a top-to-bottom array.
- Renders thumbnails (mini images, colored shape icons, text preview, ink stroke count).
- Drag handle with touch-friendly pointer drag up/down for reordering.
- Lock and Eye toggle buttons.
- Click card to select element on page.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/LayerDrawer.test.jsx`  
Expected: PASS.

- [ ] **Step 5: Git Savestate Commit**

```bash
git add src/components/document/LayerDrawer.jsx src/components/document/LayerDrawer.css tests/components/LayerDrawer.test.jsx
git commit -m "feat(ui): add canva-style LayerDrawer component with drag reordering, lock, and visibility"
git push
```

---

### Task 3: Selection Toolbar Quick Actions & Locked Object Handling

**Files:**
- Modify: `src/components/document/PageObjectLayer.jsx`
- Test: `tests/PageObjectLayerBackground.test.jsx`

**Interfaces:**
- Consumes: `object.locked`, `object.hidden`, `shiftLayerOrder`, `onOpenLayers`
- Produces:
  - Lock badge on locked objects (`Lock` icon in top-right)
  - Disabling transform handles (resize, rotate, move drag) when `object.locked === true`
  - Position quick-actions popover button in object toolbar (`Layers` icon):
    - "Ganz nach vorne"
    - "Eine Ebene nach vorne"
    - "Eine Ebene nach hinten"
    - "Ganz nach hinten"
    - "Ebenen anzeigen"
  - Filter out `hidden: true` objects from rendering and hit-testing

- [ ] **Step 1: Write test for locked object handles and quick actions**

In `tests/PageObjectLayerBackground.test.jsx`:
- Verify locked object does not render rotate handle or resize handle.
- Verify locked object renders lock badge.
- Verify layer position dropdown buttons trigger `onShiftLayer`.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/PageObjectLayerBackground.test.jsx`  
Expected: FAIL.

- [ ] **Step 3: Implement lock handling and position popover in `PageObjectLayer.jsx`**

- If `object.locked === true`:
  - Show small lock badge button on corner: clicking it unlocks the object.
  - Omit `RotateHandle` and corner `Handle`s.
  - Disable cursor: "move" and disable `drag.start`.
- In floating toolbar above selected object:
  - Add `Layers` button opening popover with position options:
    - Bring to Front (`bring-to-front`)
    - Bring Forward (`bring-forward`)
    - Send Backward (`send-backward`)
    - Send to Back (`send-to-back`)
    - Open Layers Panel (`onOpenLayers`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/PageObjectLayerBackground.test.jsx`  
Expected: PASS.

- [ ] **Step 5: Git Savestate Commit**

```bash
git add src/components/document/PageObjectLayer.jsx tests/PageObjectLayerBackground.test.jsx
git commit -m "feat(ui): add lock badge, handle suppression, and layer position popover to PageObjectLayer"
git push
```

---

### Task 4: Stacking Pipeline & DocumentView Integration

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Modify: `src/documents/notePreview.js`
- Test: `tests/DocumentView.test.jsx`

**Interfaces:**
- Consumes: `LayerDrawer`, `inkController.inkLayerIndex`, `inkController.inkLayerHidden`, `inkController.reorderLayers`
- Produces:
  - Rail `Layers` button opens/closes `LayerDrawer`
  - Partitioned `<PageObjectLayer />` passes (below ink and above ink)
  - `<canvas />` visibility controlled by `inkLayerHidden`
  - `notePreview.js` canvas thumbnail rendering with layer ordering

- [ ] **Step 1: Write test for DocumentView layer toggle and split rendering**

- [ ] **Step 2: Implement integration in `DocumentView.jsx` and `notePreview.js`**

In `DocumentView.jsx`:
- Enable rail button `<button data-testid="layers-btn" onClick={() => setIsLayersOpen(p => !p)}>` (remove disabled).
- Compute `inkLayerIndex = resolveInkLayerIndex(inkDocument)`.
- Split objects:
  - `objectsBelowInk = livePageObjects.slice(0, inkLayerIndex).filter(o => !o.hidden)`
  - `objectsAboveInk = livePageObjects.slice(inkLayerIndex).filter(o => !o.hidden)`
- Render `<PageObjectLayer objects={objectsBelowInk} ... />`
- Render `{!inkDocument.inkLayerHidden && <canvas ref={inkCanvasRef} ... />}`
- Render `<PageObjectLayer objects={objectsAboveInk} ... />`
- Mount `<LayerDrawer ... />` with state `isLayersOpen`.

In `src/documents/notePreview.js`:
- In `drawPreview`, render `objects.slice(0, inkLayerIndex)`, then ink strokes, then `objects.slice(inkLayerIndex)`.

- [ ] **Step 3: Run all unit tests**

Run: `npx vitest run`  
Expected: PASS for all layer, object, and document view tests.

- [ ] **Step 4: Git Savestate Commit**

```bash
git add src/components/DocumentView.jsx src/documents/notePreview.js
git commit -m "feat(document): integrate canva layer drawer and split ink stacking pipeline"
git push
```

---

### Task 5: Build, Android Sync, and Tablet Hardware Verification

**Files:**
- Target Device: Samsung Galaxy Tab A7 (SM-T505, Android 12)

- [ ] **Step 1: Build production bundle and sync Capacitor Android**
  - Run: `npm run build && npx cap sync android`
  - Assemble: `$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; cmd.exe /c "cd android && gradlew.bat assembleDebug"`
  - Install: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 2: Launch App and Connect CDP**
  - Force-stop and start: `adb shell am force-stop com.notes.app && adb shell am start -n com.notes.app/.MainActivity`
  - Forward CDP port: `adb forward tcp:9222 localabstract:<socket>`

- [ ] **Step 3: Test Layer Drawer and Reordering on Tablet**
  - Tap `Layers` button in left rail to open Canva Layer Drawer.
  - Verify all elements (Claude image, Approved stamp, handwritten stroke layer) are listed with thumbnails.
  - Drag Approved stamp below "Handschrift & Striche".
  - Verify that handwritten ink strokes now display **on top of** the Approved stamp!
  - Tap lock icon on Claude image and verify lock badge appears and prevents dragging.
  - Tap eye icon on handwritten layer and verify ink disappears/reappears cleanly.

- [ ] **Step 4: Capture Screenshots and Generate Walkthrough**
  - Take ADB screencap of open Layer Drawer on tablet.
  - Take screencap of ink rendered on top of image.
  - Update `walkthrough.md` with tablet screenshots.

- [ ] **Step 5: Final Git Savestate Commit**
  - Commit final verification scripts, walkthrough, and changes.
  - Push to `origin/master`.
