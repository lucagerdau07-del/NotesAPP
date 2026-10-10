# Element and Image Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to adjust the orientation/rotation angle of images and page objects with a top-center rotation handle, cardinal snapping, and accurate hit-testing.

**Architecture:** Rotate objects around their geometric center using a normalized `rotation` degree property on the object model. Render with CSS transforms and an anchored rotation handle, inverse-rotate hit-test points for exact selection, and apply canvas rotation transforms in thumbnail generation.

**Tech Stack:** React, SVG / HTML5 Canvas, Vitest, Capacitor Android.

## Global Constraints

- Rotation values must be normalized in degrees $[0, 360)$ (default `0`).
- Cardinal snapping range is $\pm 4^\circ$ at $0^\circ, 90^\circ, 180^\circ, 270^\circ$.
- Rotation handle is displayed for 2D box elements (`image`, `rect`, `ellipse`, `text`, `fill`, `link`), but not vector lines/arrows which have dual endpoint dragging.
- After every change or fix, automatically create a git savestate commit (`RULE[c:\Antigravity\NotesAPP\.agents\AGENTS.md]`).

---

### Task 1: Data Model & Rotated Hit-Testing

**Files:**
- Modify: `src/ink/pageObjects.js`
- Test: `tests/ink/pageObjects.test.js`

**Interfaces:**
- Consumes: `objectBounds(object)`
- Produces: `rotation` property on `PageObject`, `hitTestObject(object, x, y)` supporting rotated coordinates.

- [ ] **Step 1: Write the failing tests for rotation normalization and rotated hit-testing**

In `tests/ink/pageObjects.test.js`, add test cases:
```javascript
import { describe, it, expect } from "vitest";
import { createPageObject, hitTestObject } from "../../src/ink/pageObjects.js";

describe("pageObjects rotation", () => {
  it("normalizes rotation property between 0 and 360", () => {
    expect(createPageObject({ type: "image", rotation: 45 }).rotation).toBe(45);
    expect(createPageObject({ type: "image", rotation: 370 }).rotation).toBe(10);
    expect(createPageObject({ type: "image", rotation: -30 }).rotation).toBe(330);
    expect(createPageObject({ type: "image" }).rotation).toBe(0);
  });

  it("hit-tests rotated rectangle correctly", () => {
    // 100x100 rect centered at (100, 100), rotated 45 degrees
    const rect = createPageObject({
      type: "rect",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 45,
      fillColor: "#ff0000"
    });

    // Center is (100, 100) -> should hit
    expect(hitTestObject(rect, 100, 100)).toBe(true);

    // Unrotated top-left corner was (50, 50). Rotated 45 deg, point (50, 50) is outside the diamond!
    expect(hitTestObject(rect, 50, 50)).toBe(false);

    // The top apex of the 45-deg diamond is at (100, 100 - 50 * sqrt(2)) ~ (100, 29.3) -> should hit
    expect(hitTestObject(rect, 100, 32)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ink/pageObjects.test.js`
Expected: FAIL (rotation property not on object, hitTestObject does not invert rotation).

- [ ] **Step 3: Implement rotation in `src/ink/pageObjects.js`**

1. In `createPageObject`:
```javascript
rotation: ((finite(source.rotation, 0) % 360) + 360) % 360,
```
2. In `hitTestObject`:
```javascript
if (object.rotation) {
  const bounds = objectBounds(object);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const rad = (-object.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  x = cx + dx * cos - dy * sin;
  y = cy + dx * sin + dy * cos;
}
```
3. In `isPointInsideObject`:
```javascript
if (object.rotation) {
  const bounds = objectBounds(object);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const rad = (-object.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  x = cx + dx * cos - dy * sin;
  y = cy + dx * sin + dy * cos;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ink/pageObjects.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ink/pageObjects.js tests/ink/pageObjects.test.js
git commit -m "feat(objects): add rotation property and rotated point hit-testing"
```

---

### Task 2: Interactive Rotation Handle & Drag Gesture in `PageObjectLayer.jsx`

**Files:**
- Modify: `src/components/document/PageObjectLayer.jsx`
- Test: `tests/PageObjectLayerBackground.test.jsx`

**Interfaces:**
- Consumes: `object.rotation`
- Produces: Visual rotation handle, `useDrag` mode `"rotate"`, cardinal snapping, CSS `transform: rotate(...)`.

- [ ] **Step 1: Write test for rotation handle and angle snapping**

In `tests/PageObjectLayerBackground.test.jsx`, add tests verifying the rotation handle renders when selected for images/shapes and fires `onChange` with updated `rotation`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/PageObjectLayerBackground.test.jsx`
Expected: FAIL (no rotation handle found).

- [ ] **Step 3: Implement `RotateHandle` and gesture handling in `PageObjectLayer.jsx`**

1. Create `RotateHandle` component:
```jsx
function RotateHandle({ position, onPointerDown }) {
  return (
    <div
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "auto",
        cursor: "grab",
        touchAction: "none",
        zIndex: 20,
      }}
      onPointerDown={onPointerDown}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          border: "2px solid #3E7BD8",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      />
      <div
        style={{
          width: 1.5,
          height: 18,
          background: "#3E7BD8",
        }}
      />
    </div>
  );
}
```

2. In `useDrag`:
When starting `"rotate"`:
```javascript
const rect = event.currentTarget.getBoundingClientRect();
const origin = mapOrigin(pageLayout, object.pageId);
const bounds = objectBounds(object);
const cx = origin.x + (bounds.x + bounds.width / 2) * zoom;
const cy = origin.y + (bounds.y + bounds.height / 2) * zoom;
gesture.current = {
  pointerId: event.pointerId,
  mode: "rotate",
  cx,
  cy,
  startAngle: object.rotation || 0,
  object,
};
```
In `move` for `"rotate"`:
```javascript
const rawDeg = (Math.atan2(event.clientY - active.cy, event.clientX - active.cx) * 180) / Math.PI + 90;
let normalized = ((rawDeg % 360) + 360) % 360;

// Cardinal snapping (+/- 4 degrees)
const SNAP_TOLERANCE = 4;
for (const cardinal of [0, 90, 180, 270, 360]) {
  if (Math.abs(normalized - cardinal) <= SNAP_TOLERANCE) {
    normalized = cardinal % 360;
    break;
  }
}
setDraft({ ...active.object, rotation: Math.round(normalized) });
```
In `end` for `"rotate"`:
```javascript
if (active.mode === "rotate") {
  onCommit?.(active.object.id, { rotation: committed.rotation });
}
```

3. Render container with `transform`:
```jsx
style={{
  position: "absolute",
  left: origin.x + bounds.x * zoom,
  top: origin.y + bounds.y * zoom,
  width: bounds.width * zoom,
  height: bounds.height * zoom,
  pointerEvents: "auto",
  touchAction: "none",
  cursor: "move",
  transform: `rotate(${object.rotation || 0}deg)`,
  transformOrigin: "50% 50%",
  outline: isSelected ? "1.5px solid #3E7BD8" : "none",
  outlineOffset: 3,
}}
```

4. Render `RotateHandle` when `isSelected` and object is not a line/arrow:
```jsx
{isSelected && object.type !== "arrow" && object.type !== "line" && (
  <RotateHandle
    position={{
      left: (bounds.width * zoom) / 2,
      top: -24,
    }}
    onPointerDown={(event) => drag.start(event, object, "rotate", zoom)}
  />
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/PageObjectLayerBackground.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/document/PageObjectLayer.jsx tests/PageObjectLayerBackground.test.jsx
git commit -m "feat(ui): add rotation handle and real-time rotation gesture with cardinal snapping"
```

---

### Task 3: Note Preview Thumbnail Support

**Files:**
- Modify: `src/documents/notePreview.js`
- Test: `tests/ink/pageObjects.test.js`

**Interfaces:**
- Consumes: `object.rotation`
- Produces: Accurately rotated canvas draw commands in note thumbnail generation.

- [ ] **Step 1: Check preview drawing with rotation**

In `src/documents/notePreview.js`, update `drawObject` to apply canvas rotation:
```javascript
if (object.rotation) {
  const cx = left + w / 2;
  const cy = top + h / 2;
  context.translate(cx, cy);
  context.rotate((object.rotation * Math.PI) / 180);
  context.translate(-cx, -cy);
}
```

- [ ] **Step 2: Run all tests to ensure zero regressions**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/documents/notePreview.js
git commit -m "feat(preview): render rotated objects in notebook thumbnails"
```

---

### Task 4: Build, Deploy & Verify on Physical Tablet

**Files:**
- Android build: `android/`
- Verification: Samsung Galaxy Tab A7 (`SM-T505`)

- [ ] **Step 1: Build web assets and sync Capacitor**

```powershell
npm run build
npx cap sync android
```

- [ ] **Step 2: Compile and install debug APK on tablet**

```powershell
cmd /c "set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr&& cd android && gradlew.bat installDebug"
```

- [ ] **Step 3: Relaunch app on tablet**

```powershell
adb shell am start -n com.notes.app/.MainActivity
```

- [ ] **Step 4: Test rotation interaction live via CDP**

1. Select "APPROVED" stamp on the tablet note.
2. Drag rotation handle by ~45 degrees.
3. Verify that stamp rotates cleanly around center.
4. Capture screenshot with ADB.

- [ ] **Step 5: Git Savestate Commit**

```bash
git add .
git commit -m "chore: verify object rotation on physical tablet"
git push origin master
```
