# Design Specification: Element and Image Rotation

## 1. Overview
Users need the ability to adjust the orientation/angle of images and elements (images, shapes, text, bucket fills) on note pages. This specification describes adding a rotation handle above selected elements, center-pivot rotation, cardinal angle snapping, accurate rotated hit-testing, and consistent preview rendering.

## 2. Requirements & User Preferences
- **Single Rotation Handle**: A visible handle extending above the top-center edge of the selection box for free rotation via pen or touch/mouse.
- **Center Pivot**: Objects rotate smoothly around their geometric center `(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)`.
- **Gentle Cardinal Snapping**: Soft snap within $\pm 4^\circ$ at $0^\circ$, $90^\circ$, $180^\circ$, and $270^\circ$ (and $360^\circ \equiv 0^\circ$). Continuous fine rotation at any other angle.
- **Accurate Hit-Testing**: Clicking, selecting, or dragging a rotated element must work seamlessly across its rotated footprint, without ghost boundaries.
- **Thumbnail / Preview Consistency**: Rotated objects must render with their exact orientation on notebook preview thumbnails.
- **Undo / Redo**: Rotation commits on pointer release as a single undo step through the existing ink document command system.

## 3. Architecture & Data Model

### 3.1 Data Model (`src/ink/pageObjects.js`)
- Add property `rotation`:
  ```js
  rotation: ((finite(source.rotation, 0) % 360) + 360) % 360
  ```
  Normalized to $[0, 360)$ in degrees (default `0`).
- Backward Compatibility: Existing documents without `rotation` automatically default to `0`.

### 3.2 Rotated Hit-Testing (`src/ink/pageObjects.js`)
When hit-testing an object with `rotation !== 0`:
1. Find object center:
   $$c_x = \text{bounds}.x + \frac{\text{bounds}.width}{2}, \quad c_y = \text{bounds}.y + \frac{\text{bounds}.height}{2}$$
2. Transform the test point $(x, y)$ into the unrotated local coordinate frame by rotating $(x - c_x, y - c_y)$ by $-\theta$:
   $$\text{rad} = -\frac{\theta \cdot \pi}{180}$$
   $$x' = c_x + (x - c_x) \cos(\text{rad}) - (y - c_y) \sin(\text{rad})$$
   $$y' = c_y + (x - c_x) \sin(\text{rad}) + (y - c_y) \cos(\text{rad})$$
3. Evaluate existing `hitTestObject(object, x', y')` using the unrotated geometry.

### 3.3 Interactive Layer & Rotation Handle (`src/components/document/PageObjectLayer.jsx`)
1. **Visual Handle**:
   - Placed at top-center: $X = \frac{\text{width}}{2}$, $Y = -24$px.
   - Connector stem: 1.5px vertical line from $Y = 0$ to $Y = -24$px.
   - Handle knob: 14px circular knob (white with 2px blue border `#3E7BD8`), cursor `crosshair` or `grab`.
2. **Gesture Interaction (`useDrag`)**:
   - New drag mode: `"rotate"`.
   - On `pointerdown`, compute and store the object center point in viewport coordinates.
   - On `pointermove`, compute current pointer vector relative to center:
     $$\text{rawAngle} = \left(\text{atan2}(P_y - C_y, P_x - C_x) \cdot \frac{180}{\pi} + 90\right) \bmod 360$$
   - Apply snapping within $\pm 4^\circ$ of $0^\circ, 90^\circ, 180^\circ, 270^\circ$.
   - Update `draft.rotation`.
   - On `pointerup`, commit `{ rotation }` to `onCommit(objectId, { rotation })`.
3. **Element CSS Transform**:
   - The element wrapper receives:
     ```css
     transform: rotate(${object.rotation || 0}deg);
     transform-origin: 50% 50%;
     ```
   - Because the selection frame and resize handles are children of the transformed container, they rotate in lockstep with the content.

### 3.4 Preview Thumbnail Rendering (`src/documents/notePreview.js`)
When drawing objects on the 2D preview canvas:
```js
if (object.rotation) {
  const cx = left + w / 2;
  const cy = top + h / 2;
  context.translate(cx, cy);
  context.rotate((object.rotation * Math.PI) / 180);
  context.translate(-cx, -cy);
}
```

## 4. Error Handling & Edge Cases
- **Lines & Arrows**: Vector lines/arrows already express orientation through their endpoints $(x_1, y_1) \to (x_2, y_2)$. The rotation handle is only displayed for 2D box elements (`image`, `rect`, `ellipse`, `text`, `fill`, `link`).
- **Aspect Ratio & Resize**: Corner resizing remains anchored along the rotated coordinate system.
- **Negative Dimensions**: `bounds.width` and `bounds.height` are strictly positive via `objectBounds(object)`.

## 5. Verification Plan
1. **Automated Unit Tests**:
   - `tests/ink/pageObjects.test.js`: Test `rotation` property default and normalization, rotated point hit-testing at 45°, 90°, 180°.
   - `tests/PageObjectLayerBackground.test.jsx` / `tests/ink/rotation.test.js`: Test angle calculation and cardinal snapping.
2. **Physical Tablet Test**:
   - Deploy build to Samsung Galaxy Tab A7.
   - Select the "APPROVED" stamp, drag the rotation handle, rotate to ~45° and verify smooth rendering.
   - Verify selection and repositioning of the rotated stamp.
   - Capture screenshot via ADB.
