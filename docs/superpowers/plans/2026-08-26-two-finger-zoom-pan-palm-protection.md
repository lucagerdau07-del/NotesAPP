# 2-Finger Zoom & Pan with Palm Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable seamless two-finger document zooming and panning, single-finger drawing (until multi-touch or active pen overrides), edge-gutter single-finger scrolling with a movement threshold, and strict palm rejection during active pen writing.

**Architecture:** Extend `inputPolicy.js` to prioritize stylus and reject touch during active pen strokes, abort 1-finger drawing into 2-finger pan/zoom when a 2nd touch appears, enforce full-lift before new drawing starts. Integrate dual-finger centroid pan & pinch zoom plus margin gutter thresholded scrolling in `DocumentView.jsx`.

**Tech Stack:** React 19, HTML5 Pointer Events API, Vitest, React Testing Library.

## Global Constraints

- Never break active pen stroke when touch/palm contacts appear during pen drawing.
- 1 finger on document surface draws (in finger mode) or is ignored (in stylus mode), but never pans.
- 2 fingers anywhere on the viewport perform simultaneous 2D pan (via finger centroid) and pinch zoom (scaled around centroid).
- 1 finger in the margin gutter outside the document scrolls vertically only after exceeding a 15px drag threshold, and is blocked if a pen is active.
- After a 2-finger gesture, lifting 1 finger does not draw until all fingers have lifted from the screen.

---

### Task 1: Enhance Input Policy State Machine (`src/ink/inputPolicy.js`)

**Files:**
- Modify: `src/ink/inputPolicy.js`
- Test: `tests/inputPolicy.test.js`

**Interfaces:**
- Consumes: Pointer event objects `{ phase: 'down' | 'move' | 'up' | 'cancel' | 'abort', pointerId: number, pointerType: 'pen' | 'touch' | 'mouse' }`
- Produces: `{ state: InputState, intent: 'start-draw' | 'continue-draw' | 'finish-draw' | 'cancel-draw' | 'navigate' | 'ignore' }`

- [ ] **Step 1: Write the failing tests for enhanced palm and gesture input policy**

In `tests/inputPolicy.test.js`, add test cases:
```javascript
it('strictly ignores touch events while a pen is actively drawing', () => {
  let result = reducePointerInput(createInputState(), event('down', 1, 'pen'), 'stylus');
  expect(result.intent).toBe('start-draw');
  expect(result.state.drawingPointerType).toBe('pen');

  result = reducePointerInput(result.state, event('down', 2, 'touch'), 'stylus');
  expect(result.intent).toBe('ignore');
  expect(result.state.drawingPointerId).toBe(1);

  result = reducePointerInput(result.state, event('move', 2, 'touch'), 'stylus');
  expect(result.intent).toBe('ignore');

  result = reducePointerInput(result.state, event('up', 2, 'touch'), 'stylus');
  expect(result.intent).toBe('ignore');
  expect(result.state.drawingPointerId).toBe(1);
});

it('aborts 1-finger draw immediately when a second touch appears and transitions to navigate', () => {
  let result = reducePointerInput(createInputState(), event('down', 10, 'touch'), 'finger');
  expect(result.intent).toBe('start-draw');
  expect(result.state.drawingPointerId).toBe(10);

  result = reducePointerInput(result.state, event('down', 11, 'touch'), 'finger');
  expect(result.intent).toBe('cancel-draw');
  expect(result.state.drawingPointerId).toBeNull();
  expect(result.state.inGestureMode).toBe(true);

  // Moving either finger in gesture mode returns navigate
  result = reducePointerInput(result.state, event('move', 10, 'touch'), 'finger');
  expect(result.intent).toBe('navigate');
});

it('prevents drawing when 1 finger remains after a 2-finger gesture until all fingers lift', () => {
  let result = reducePointerInput(createInputState(), event('down', 10, 'touch'), 'finger');
  result = reducePointerInput(result.state, event('down', 11, 'touch'), 'finger');
  expect(result.state.inGestureMode).toBe(true);

  // One finger lifts
  result = reducePointerInput(result.state, event('up', 11, 'touch'), 'finger');
  expect(result.intent).toBe('navigate');
  expect(result.state.drawingPointerId).toBeNull();

  // Remaining finger moves - must NOT start drawing
  result = reducePointerInput(result.state, event('move', 10, 'touch'), 'finger');
  expect(result.intent).toBe('navigate');
  expect(result.state.drawingPointerId).toBeNull();

  // Remaining finger lifts
  result = reducePointerInput(result.state, event('up', 10, 'touch'), 'finger');
  expect(result.state.inGestureMode).toBe(false);
  expect(result.state.touchPointerIds).toEqual([]);

  // Fresh touch can now draw
  result = reducePointerInput(result.state, event('down', 12, 'touch'), 'finger');
  expect(result.intent).toBe('start-draw');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/inputPolicy.test.js`
Expected: FAIL with missing `inGestureMode` or mismatch in intents.

- [ ] **Step 3: Update `src/ink/inputPolicy.js` implementation**

Implement the state updates:
```javascript
export function createInputState() {
  return {
    drawingPointerId: null,
    drawingPointerType: null,
    touchPointerIds: [],
    inGestureMode: false,
  };
}

function updateTouches(pointerIds, event) {
  if (event.pointerType !== "touch") return [...pointerIds];

  if (event.phase === "down") {
    return pointerIds.includes(event.pointerId)
      ? [...pointerIds]
      : [...pointerIds, event.pointerId];
  }

  if (event.phase === "up" || event.phase === "cancel") {
    return pointerIds.filter((pointerId) => pointerId !== event.pointerId);
  }

  return [...pointerIds];
}

export function reducePointerInput(state, event, inputMode = "stylus") {
  const nextTouches = updateTouches(state.touchPointerIds, event);
  const isGesture = state.inGestureMode
    ? nextTouches.length > 0
    : nextTouches.length > 1;

  const nextState = {
    ...state,
    touchPointerIds: nextTouches,
    inGestureMode: isGesture,
  };

  const ownerId = state.drawingPointerId;
  const isOwner = ownerId !== null && event.pointerId === ownerId;
  const isPenActive = ownerId !== null && state.drawingPointerType === "pen";

  // While a pen is actively drawing, all touch events are completely ignored
  if (isPenActive && event.pointerType === "touch") {
    return {
      state: nextState,
      intent: "ignore",
    };
  }

  const canStart =
    event.pointerType === "pen" ||
    event.pointerType === "mouse" ||
    (inputMode === "finger" && event.pointerType === "touch" && !state.inGestureMode && nextTouches.length <= 1);

  if (event.phase === "down") {
    if (ownerId !== null) {
      if (
        state.drawingPointerType === "touch" &&
        event.pointerType === "touch"
      ) {
        return {
          state: {
            ...nextState,
            drawingPointerId: null,
            drawingPointerType: null,
            inGestureMode: true,
          },
          intent: "cancel-draw",
        };
      }
      if (event.pointerType === "touch") {
        return { state: nextState, intent: isPenActive ? "ignore" : "navigate" };
      }
      return { state: nextState, intent: "ignore" };
    }

    if (canStart) {
      return {
        state: {
          ...nextState,
          drawingPointerId: event.pointerId,
          drawingPointerType: event.pointerType,
        },
        intent: "start-draw",
      };
    }

    return {
      state: nextState,
      intent: event.pointerType === "touch" ? "navigate" : "ignore",
    };
  }

  if (isOwner) {
    if (event.phase === "move") {
      return { state: nextState, intent: "continue-draw" };
    }
    if (event.phase === "abort") {
      return {
        state: {
          ...nextState,
          drawingPointerId: null,
          drawingPointerType: null,
        },
        intent: "cancel-draw",
      };
    }
    if (event.phase === "up") {
      return {
        state: {
          ...nextState,
          drawingPointerId: null,
          drawingPointerType: null,
        },
        intent: "finish-draw",
      };
    }
    if (event.phase === "cancel") {
      return {
        state: {
          ...nextState,
          drawingPointerId: null,
          drawingPointerType: null,
        },
        intent: "cancel-draw",
      };
    }
  }

  return {
    state: nextState,
    intent: event.pointerType === "touch" && !isPenActive ? "navigate" : "ignore",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/inputPolicy.test.js`
Expected: PASS (all 13 tests).

- [ ] **Step 5: Commit changes**

```bash
git add src/ink/inputPolicy.js tests/inputPolicy.test.js
git commit -m "feat(ink): enhance input policy for pen priority and 2-finger gesture lifecycle"
```

---

### Task 2: Implement 2-Finger Zoom & Simultaneous Centroid Pan in `DocumentView.jsx`

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Test: `tests/DocumentView.test.jsx`

**Interfaces:**
- Consumes: React state, `inkController`, DOM pointer events
- Produces: Smooth 2-finger pinch-to-zoom and centroid panning in X and Y directions

- [ ] **Step 1: Write test in `tests/DocumentView.test.jsx` for 2-finger simultaneous pan & zoom**

```javascript
test('performs simultaneous two-finger pan and zoom', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callback();
    return 1;
  });
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });
  scroller.scrollTop = 100;
  scroller.scrollLeft = 50;

  // Touch 1 down at (100, 100), Touch 2 down at (200, 100) -> initial distance = 100, center = (150, 100)
  fireEvent.pointerDown(page, { pointerId: 10, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(page, { pointerId: 11, pointerType: 'touch', clientX: 200, clientY: 100 });

  // Move both fingers to (150, 150) and (350, 150) -> new distance = 200 (zoom 2x), center = (250, 150) (shifted dx=+100, dy=+50)
  fireEvent.pointerMove(page, { pointerId: 10, pointerType: 'touch', clientX: 150, clientY: 150 });
  fireEvent.pointerMove(page, { pointerId: 11, pointerType: 'touch', clientX: 350, clientY: 150 });

  expect(page.style.width).toBe('1600px'); // zoom doubled
  // Scroller shifted to track the centroid movement
  expect(controller.commitStroke).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify behavior**

Run: `npx vitest run tests/DocumentView.test.jsx`

- [ ] **Step 3: Refine `handleGestureStart`, `handleGestureMove`, `handleGestureEnd` in `DocumentView.jsx`**

Update gesture calculation:
- Track `activePointers` with initial positions.
- When 2 pointers active:
  ```javascript
  const pointers = Array.from(activePointers.current.values());
  const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
  const centerX = (pointers[0].x + pointers[1].x) / 2;
  const centerY = (pointers[0].y + pointers[1].y) / 2;
  pinchInitialData.current = {
    distance: Math.max(distance, 10),
    zoom: zoom,
    centerX,
    centerY,
    scrollTop: scrollContainer.scrollTop,
    scrollLeft: scrollContainer.scrollLeft,
    focusBox: focusBoxState?.focusBox ? { ...focusBoxState.focusBox } : null,
  };
  ```
- In `handleGestureMove` with 2 pointers:
  ```javascript
  const currentDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const currentCenterX = (p1.x + p2.x) / 2;
  const currentCenterY = (p1.y + p2.y) / 2;
  const newZoom = Math.max(0.5, Math.min(3.0, startZoom * (currentDist / startDist)));
  setZoom(newZoom);
  const zoomRatio = newZoom / startZoom;
  const dx = currentCenterX - startCenterX;
  const dy = currentCenterY - startCenterY;
  scrollContainer.scrollLeft = (startScrollLeft + startCenterX) * zoomRatio - currentCenterX;
  scrollContainer.scrollTop = (startScrollTop + startCenterY) * zoomRatio - currentCenterY;
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DocumentView.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "feat(gestures): improve 2-finger simultaneous pan and zoom around pinch centroid"
```

---

### Task 3: Edge Gutter 1-Finger Scrolling with Palm Rejection & Pen Suppression

**Files:**
- Modify: `src/components/DocumentView.jsx`
- Test: `tests/DocumentView.test.jsx`

**Interfaces:**
- Consumes: Touch events outside vs inside `document-page` element
- Produces: 1-finger vertical scrolling only when touch starts in gutter outside the document and exceeds 15px threshold; complete block when pen is drawing or touching.

- [ ] **Step 1: Write test for gutter scroll threshold and palm protection**

In `tests/DocumentView.test.jsx`:
```javascript
test('scrolls vertically with 1 finger on margin only after exceeding 15px drag threshold', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const scroller = screen.getByTestId('document-view').querySelector('.document-scroller') || screen.getByTestId('document-page').parentElement;
  mockRect(scroller, { left: 0, top: 0, width: 1000, height: 800 });
  scroller.scrollTop = 100;

  // Single touch on the margin gutter (e.g. clientX = 950 outside the 800px page)
  fireEvent.pointerDown(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 200 });
  
  // Small jitter of 5px (resting palm contact) -> must NOT scroll
  fireEvent.pointerMove(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 205 });
  expect(scroller.scrollTop).toBe(100);

  // Intentional vertical drag of 30px (200 -> 170) -> scrolls down by 30px
  fireEvent.pointerMove(scroller, { pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 170 });
  expect(scroller.scrollTop).toBe(130);
  expect(controller.commitStroke).not.toHaveBeenCalled();
});

test('ignores 1-finger touch on the document canvas so palm resting does not scroll', () => {
  const controller = createControllerDouble({ inputMode: 'stylus' });
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;

  // Touch on the document surface in stylus mode
  fireEvent.pointerDown(page, { pointerId: 30, pointerType: 'touch', clientX: 200, clientY: 200 });
  fireEvent.pointerMove(page, { pointerId: 30, pointerType: 'touch', clientX: 200, clientY: 150 });
  fireEvent.pointerUp(page, { pointerId: 30, pointerType: 'touch', clientX: 200, clientY: 150 });

  // In stylus mode, 1-finger on page does not scroll
  expect(scroller.scrollTop).toBe(100);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/DocumentView.test.jsx`

- [ ] **Step 3: Implement gutter scroll detection and thresholding in `DocumentView.jsx`**

- In `handleGestureStart`: Check whether `e.target` is within `containerRef.current` (`document-page`).
- If `target` is within the document page:
  - Do NOT set 1-finger `touchPanInitialData`. Single touch is handled exclusively by `useInkPointer`.
- If `target` is outside the document page (margin gutter):
  - Check if pen is actively drawing. If so, ignore.
  - Store initial `{ startY: e.clientY, startScrollTop: scrollContainer.scrollTop, isDragging: false }`.
- In `handleGestureMove`:
  - If 1 pointer on gutter:
    ```javascript
    const dy = e.clientY - gutterData.startY;
    if (!gutterData.isDragging && Math.abs(dy) > 15) {
      gutterData.isDragging = true;
    }
    if (gutterData.isDragging) {
      scrollContainer.scrollTop = gutterData.startScrollTop - dy;
    }
    ```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS (all 40 test files, all tests passing).

- [ ] **Step 5: Commit changes**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "feat(gestures): add margin gutter 1-finger thresholded scroll and palm rejection"
```

---

## Plan Self-Review
- **Spec coverage:** Covers 2-finger zoom/pan, pen priority palm rejection, release protection, 1-finger margin scroll with 15px threshold.
- **Placeholder scan:** No TBDs, all code blocks explicit.
- **Type & signature consistency:** Matches current `inputPolicy.js` and `DocumentView.jsx`.
