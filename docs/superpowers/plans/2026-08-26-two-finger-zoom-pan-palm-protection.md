# 2-Finger-Zoom, Pan und Handballen-Schutz – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Dokumentansicht unterstützt simultanen 2-Finger-Zoom/-Pan, verwirft einen begonnenen Fingerstrich beim zweiten Kontakt, verhindert Zeichnen bis zum vollständigen Loslassen und erlaubt vertikales 1-Finger-Scrollen ausschließlich im Randbereich nach mehr als 15 px Bewegung – mit konsequenter Stiftpriorität und Palm Rejection.

**Architecture:** `src/ink/inputPolicy.js` bleibt die einzige Quelle für Pointer-Zulassung, Zeichenbesitz und Release-Sperren. `useInkPointer` setzt diese Entscheidungen in Ink-Drafts um und stellt dem Gesten-Controller eine read-only Palm-Blockade-Abfrage bereit; `DocumentView` verwaltet aktive Touch-Koordinaten, Pinch-Geometrie, Scrollpositionen und Rand-Drag-Kandidaten. Pointer-Ereignisse laufen weiterhin zuerst über die Dokumentfläche und dann per Bubbling über den Scroll-Container, sodass ein zweiter Finger den Ink-Draft abbricht, bevor die Pinch-Geste initialisiert wird.

**Tech Stack:** React 19.2, JavaScript/JSX, HTML Pointer Events, Vitest 4.1, React Testing Library 16.3, jsdom 29.

**Spec:** `docs/superpowers/specs/2026-08-26-two-finger-zoom-pan-palm-protection-design.md`

## Global Constraints

- Ein aktiver Pen-Pointer (`pointerType === 'pen'`) besitzt exklusive Schreibberechtigung; alle Touch-Ereignisse liefern währenddessen `intent: 'ignore'` und dürfen weder Ink, Zoom, Pan noch Rand-Scrollen verändern.
- Ein einzelner Touch auf der Dokumentfläche startet nur im Fingermodus einen Strich; er verschiebt das Dokument in keinem Eingabemodus.
- Beim zweiten aktiven Touch wird ein Finger-Draft mit `intent: 'cancel-draw'` verworfen und eine gemeinsame Pan-/Pinch-Geste gestartet.
- Nach einer Mehrfinger-Geste bleibt Navigation gesperrt, bis `activePointers.size === 0`; der verbleibende Finger darf weder zeichnen noch verschieben.
- Zoom wird auf `0.5` bis `3.0` (50 % bis 300 %) begrenzt und um den aktuellen Mittelpunkt der beiden Finger verankert.
- Ein Touch darf nur dann vertikal scrollen, wenn sein `pointerdown` außerhalb von `document-page` begann und `Math.abs(deltaY) > 15` gilt.
- Der Split-Screen-`focusBox` bleibt beim Zoomen innerhalb seiner ausgewählten Seite und wird am Gestenende genau einmal persistiert.
- Der Spec-Begriff „kurz zuvor“ wird als zentral benannte Konstante `POST_PEN_TOUCH_GUARD_MS = 300` umgesetzt. Ein in diesem Fenster begonnener Touch bleibt bis zu seinem `up`/`cancel` blockiert, damit ein ruhender Handballen nicht später aktiv wird.
- Keine neue Laufzeitabhängigkeit; vorhandene Wheel-, Ink-, Zoom- und Focus-Box-Funktionen bleiben erhalten.
- Nach jeder Task werden die betroffenen Tests ausgeführt und gemäß `.agents/AGENTS.md` ein lokaler Git-Savestate erstellt.

---

## Dateistruktur und Verantwortlichkeiten

- `src/ink/inputPolicy.js`: Reiner Reducer für Zeichenbesitz, Pen-Priorität, aktive/gesperrte Touch-IDs, Mehrfinger-Release-Sperre und Post-Pen-Blockade.
- `tests/inputPolicy.test.js`: Reducer-Tests für Pointer-Reihenfolgen und Zeitgrenzen.
- `src/hooks/useInkPointer.js`: Übersetzt Reducer-Intents in Draft-Lebenszyklen und exponiert `shouldBlockTouch(timeStamp, pointerId)`.
- `tests/useInkPointer.test.js`: Hook-Tests für Draft-Abbruch, Pen-Übernahme und Palm-Abfrage.
- `src/components/DocumentView.jsx`: DOM-Controller für Touch-Punkte, centroid-basierten Pan/Zoom, Focus-Box und Rand-Drag.
- `tests/DocumentView.test.jsx`: Integrationstests über gebubbelte Pointer-Events sowie beobachtbare DOM-/Scroll-Effekte.

---

### Task 1: Input-Policy als explizite Pen-/Touch-Zustandsmaschine

**Files:**
- Modify: `src/ink/inputPolicy.js:1-120`
- Modify: `tests/inputPolicy.test.js:1-74`

**Interfaces:**
- Consumes: `reducePointerInput(state, { phase, pointerId, pointerType, timeStamp }, inputMode)` mit `phase: 'down' | 'move' | 'up' | 'cancel' | 'abort'`.
- Produces: `{ drawingPointerId, drawingPointerType, touchPointerIds, blockedTouchPointerIds, gestureLocked, lastPenUpAt }`.
- Produces: `intent: 'start-draw' | 'replace-draw' | 'continue-draw' | 'finish-draw' | 'cancel-draw' | 'navigate' | 'ignore'`.
- Produces: `shouldBlockTouch(state, timeStamp, pointerId): boolean`.

- [ ] **Step 1: Fehlende Reducer-Verträge als fehlschlagende Tests festschreiben**

Passe den Event-Helper an und ersetze die alten Palm-Erwartungen (`navigate`) durch folgende Fälle:

```javascript
const event = (phase, pointerId, pointerType, timeStamp = 1_000) => ({
  phase, pointerId, pointerType, timeStamp,
});

it('ignores every touch phase while a pen owns the stroke', () => {
  let result = reducePointerInput(createInputState(), event('down', 7, 'pen'), 'stylus');
  for (const phase of ['down', 'move', 'up']) {
    result = reducePointerInput(result.state, event(phase, 9, 'touch', 1_010), 'stylus');
    expect(result.intent).toBe('ignore');
    expect(result.state.drawingPointerId).toBe(7);
  }
});

it('lets a pen replace an uncommitted finger draft immediately', () => {
  let result = reducePointerInput(createInputState(), event('down', 1, 'touch'), 'finger');
  result = reducePointerInput(result.state, event('down', 2, 'pen', 1_010), 'finger');
  expect(result.intent).toBe('replace-draw');
  expect(result.state).toMatchObject({ drawingPointerId: 2, drawingPointerType: 'pen' });
});

it('cancels finger ink on the second touch and unlocks only after full release', () => {
  let result = reducePointerInput(createInputState(), event('down', 1, 'touch'), 'finger');
  result = reducePointerInput(result.state, event('down', 2, 'touch'), 'finger');
  expect(result.intent).toBe('cancel-draw');
  expect(result.state.gestureLocked).toBe(true);
  result = reducePointerInput(result.state, event('up', 2, 'touch'), 'finger');
  result = reducePointerInput(result.state, event('move', 1, 'touch'), 'finger');
  expect(result.intent).toBe('navigate');
  expect(result.state.gestureLocked).toBe(true);
  result = reducePointerInput(result.state, event('up', 1, 'touch'), 'finger');
  expect(result.state.gestureLocked).toBe(false);
  result = reducePointerInput(result.state, event('down', 3, 'touch'), 'finger');
  expect(result.intent).toBe('start-draw');
});

it('latches a post-pen touch until that contact releases', () => {
  let result = reducePointerInput(createInputState(), event('down', 7, 'pen', 1_000), 'stylus');
  result = reducePointerInput(result.state, event('up', 7, 'pen', 1_100), 'stylus');
  result = reducePointerInput(result.state, event('down', 9, 'touch', 1_399), 'finger');
  expect(result.intent).toBe('ignore');
  expect(result.state.blockedTouchPointerIds).toEqual([9]);
  result = reducePointerInput(result.state, event('move', 9, 'touch', 1_900), 'finger');
  expect(result.intent).toBe('ignore');
  result = reducePointerInput(result.state, event('up', 9, 'touch', 1_901), 'finger');
  expect(result.state.blockedTouchPointerIds).toEqual([]);
  result = reducePointerInput(result.state, event('down', 10, 'touch', 1_902), 'finger');
  expect(result.intent).toBe('start-draw');
});
```

- [ ] **Step 2: Test ausführen und erwartetes Rot verifizieren**

Run: `npm test -- tests/inputPolicy.test.js`

Expected: FAIL wegen der noch fehlenden Felder, `replace-draw` und konsequentem `ignore`.

- [ ] **Step 3: Zustand und Palm-Abfrage minimal implementieren**

```javascript
export const POST_PEN_TOUCH_GUARD_MS = 300;

export function createInputState() {
  return {
    drawingPointerId: null,
    drawingPointerType: null,
    touchPointerIds: [],
    blockedTouchPointerIds: [],
    gestureLocked: false,
    lastPenUpAt: Number.NEGATIVE_INFINITY,
  };
}

const addUnique = (ids, id) => ids.includes(id) ? ids : [...ids, id];
const remove = (ids, id) => ids.filter((candidate) => candidate !== id);
const eventTime = (event) => Number.isFinite(event.timeStamp) ? event.timeStamp : 0;

export function shouldBlockTouch(state, timeStamp, pointerId) {
  if (state.drawingPointerType === 'pen' && state.drawingPointerId !== null) return true;
  if (state.blockedTouchPointerIds.includes(pointerId)) return true;
  return timeStamp - state.lastPenUpAt < POST_PEN_TOUCH_GUARD_MS;
}
```

Ersetze anschließend den Reducer durch den vollständigen Übergangsablauf:

```javascript
export function reducePointerInput(state, event, inputMode = 'stylus') {
  const isTouch = event.pointerType === 'touch';
  const isRelease = event.phase === 'up' || event.phase === 'cancel';
  const touchPointerIds = !isTouch
    ? state.touchPointerIds
    : event.phase === 'down'
      ? addUnique(state.touchPointerIds, event.pointerId)
      : isRelease
        ? remove(state.touchPointerIds, event.pointerId)
        : state.touchPointerIds;
  const blockedByPalmGuard = isTouch && shouldBlockTouch(
    state,
    eventTime(event),
    event.pointerId,
  );
  const blockedTouchPointerIds = !isTouch
    ? state.blockedTouchPointerIds
    : blockedByPalmGuard && event.phase === 'down'
      ? addUnique(state.blockedTouchPointerIds, event.pointerId)
      : isRelease
        ? remove(state.blockedTouchPointerIds, event.pointerId)
        : state.blockedTouchPointerIds;
  const gestureLocked = state.gestureLocked
    ? touchPointerIds.length > 0
    : touchPointerIds.length >= 2;
  const nextState = {
    ...state,
    touchPointerIds,
    blockedTouchPointerIds,
    gestureLocked,
  };

  if (blockedByPalmGuard) return { state: nextState, intent: 'ignore' };

  const ownsEvent = state.drawingPointerId === event.pointerId;
  if (event.phase === 'down' && event.pointerType === 'pen') {
    return {
      state: {
        ...nextState,
        drawingPointerId: event.pointerId,
        drawingPointerType: 'pen',
        blockedTouchPointerIds: [
          ...new Set([...blockedTouchPointerIds, ...state.touchPointerIds]),
        ],
      },
      intent: state.drawingPointerId === null ? 'start-draw' : 'replace-draw',
    };
  }

  if (
    event.phase === 'down'
    && isTouch
    && state.drawingPointerType === 'touch'
  ) {
    return {
      state: {
        ...nextState,
        drawingPointerId: null,
        drawingPointerType: null,
        gestureLocked: true,
      },
      intent: 'cancel-draw',
    };
  }

  if (event.phase === 'down' && state.drawingPointerId === null) {
    const canDraw = event.pointerType === 'mouse'
      || (isTouch && inputMode === 'finger' && !gestureLocked);
    if (canDraw) {
      return {
        state: {
          ...nextState,
          drawingPointerId: event.pointerId,
          drawingPointerType: event.pointerType,
        },
        intent: 'start-draw',
      };
    }
    return { state: nextState, intent: isTouch ? 'navigate' : 'ignore' };
  }

  if (ownsEvent && event.phase === 'move') {
    return { state: nextState, intent: 'continue-draw' };
  }
  if (ownsEvent && (event.phase === 'abort' || event.phase === 'cancel')) {
    return {
      state: { ...nextState, drawingPointerId: null, drawingPointerType: null },
      intent: 'cancel-draw',
    };
  }
  if (ownsEvent && event.phase === 'up') {
    return {
      state: {
        ...nextState,
        drawingPointerId: null,
        drawingPointerType: null,
        lastPenUpAt: state.drawingPointerType === 'pen'
          ? eventTime(event)
          : state.lastPenUpAt,
      },
      intent: 'finish-draw',
    };
  }
  return { state: nextState, intent: isTouch ? 'navigate' : 'ignore' };
}
```

Alle bestehenden Mouse-, falsche-ID-, Abort- und Cancel-Tests bleiben zusätzlich erhalten.

- [ ] **Step 4: Reducer-Suite grün ausführen**

Run: `npm test -- tests/inputPolicy.test.js`

Expected: PASS; Pen-Owner bleibt erhalten, Release-Lock endet nur bei leerer Touch-Liste, und der 300-ms-Kontakt bleibt bis Release blockiert.

- [ ] **Step 5: Git-Savestate erstellen**

```bash
git add src/ink/inputPolicy.js tests/inputPolicy.test.js
git commit -m "feat(ink): enforce pen priority and gesture release lock"
```

---

### Task 2: Ink-Draft an Pen-Übernahme und Palm-Abfrage anbinden

**Files:**
- Modify: `src/hooks/useInkPointer.js:1-190`
- Modify: `tests/useInkPointer.test.js:1-260`

**Interfaces:**
- Consumes: `replace-draw` und `shouldBlockTouch` aus Task 1.
- Produces: bestehende vier Pointer-Handler plus `shouldBlockTouch(timeStamp: number, pointerId: number): boolean`.

- [ ] **Step 1: Fehlschlagende Hook-Tests ergänzen**

Erweitere den Test-Event-Helper um `timeStamp` und füge hinzu:

```javascript
it('discards finger ink and starts pen ink when the pen takes priority', () => {
  const { result, commitStroke } = renderInkPointer({ inputMode: 'finger' });
  act(() => result.current.onPointerDown(pointer(1, 'touch', 10, 10)));
  act(() => result.current.onPointerMove(pointer(1, 'touch', 20, 20)));
  act(() => result.current.onPointerDown(pointer(2, 'pen', 30, 30)));
  act(() => result.current.onPointerMove(pointer(2, 'pen', 40, 40)));
  act(() => result.current.onPointerUp(pointer(2, 'pen', 40, 40)));
  expect(commitStroke).toHaveBeenCalledOnce();
  expect(commitStroke).toHaveBeenCalledWith(expect.objectContaining({
    points: [{ x: 30, y: 30 }, { x: 40, y: 40 }],
  }));
});

it('exposes active and recent pen blocking without mutating policy state', () => {
  const { result } = renderInkPointer();
  act(() => result.current.onPointerDown({ ...pointer(7, 'pen', 1, 2), timeStamp: 1_000 }));
  expect(result.current.shouldBlockTouch(1_010, 9)).toBe(true);
  act(() => result.current.onPointerUp({ ...pointer(7, 'pen', 1, 2), timeStamp: 1_100 }));
  expect(result.current.shouldBlockTouch(1_399, 9)).toBe(true);
  expect(result.current.shouldBlockTouch(1_400, 9)).toBe(false);
});
```

- [ ] **Step 2: Hook-Test rot ausführen**

Run: `npm test -- tests/useInkPointer.test.js`

Expected: FAIL, weil Pen-Übernahme keinen neuen Draft erzeugt und die Abfrage fehlt.

- [ ] **Step 3: Draft-Erzeugung extrahieren und beide Start-Intents behandeln**

Importiere `shouldBlockTouch as policyBlocksTouch`. Extrahiere den bestehenden Draft-Aufbau in diese fokussierte Callback-Funktion:

```javascript
const startDraft = useCallback((event) => {
  const current = optionsRef.current;
  const point = mappedPoint(current.mapPoint?.(event));
  const owner = point ? draftOwner(current.document, point.pageId) : null;
  if (!point || !owner) return false;

  const tool = selectedTool(current.tool);
  const style = getToolStyle(tool, current.color, current.width);
  const draft = {
    id: createStrokeId(),
    pageId: point.pageId,
    tool: style.tool,
    color: style.color,
    width: style.width,
    opacity: style.opacity,
    points: [{ x: point.x, y: point.y }],
  };
  draftRef.current = draft;
  draftOwnerRef.current = owner;
  strokeEraserRef.current = current.tool === 'stroke-eraser'
    || (tool === 'pixel-eraser' && current.eraserMode === 'stroke');
  setDraftStroke({ ...draft, points: [...draft.points] });

  if (typeof event.currentTarget?.setPointerCapture === 'function') {
    event.currentTarget.setPointerCapture(event.pointerId);
    captureRef.current = { target: event.currentTarget, pointerId: event.pointerId };
  }
  return true;
}, []);
```

Passe `onPointerDown` danach an:

```javascript
const onPointerDown = useCallback((event) => {
  const routed = route(event, 'down');
  if (routed.intent === 'cancel-draw') return discardDraft();
  if (routed.intent === 'replace-draw') {
    discardDraft();
    if (!startDraft(event)) abortDraft(event);
    return;
  }
  if (routed.intent === 'start-draw' && !startDraft(event)) abortDraft(event);
}, [abortDraft, discardDraft, route, startDraft]);

const shouldBlockTouch = useCallback((timeStamp, pointerId) => (
  policyBlocksTouch(inputStateRef.current, timeStamp, pointerId)
), []);
```

Gib `shouldBlockTouch` zusammen mit den vorhandenen Handlern und `draftStroke` zurück. Die Abfrage darf den Reducer nicht aufrufen.

- [ ] **Step 4: Hook und Policy gemeinsam grün ausführen**

Run: `npm test -- tests/inputPolicy.test.js tests/useInkPointer.test.js`

Expected: PASS; Finger-Draft wird nie committed, Pen-Draft genau einmal, 299 ms blockiert und 300 ms nicht.

- [ ] **Step 5: Git-Savestate erstellen**

```bash
git add src/hooks/useInkPointer.js tests/useInkPointer.test.js
git commit -m "feat(ink): expose palm guard to document gestures"
```

---

### Task 3: Dokumentfläche auf ausschließlich 2-Finger-Pan/Zoom umstellen

**Files:**
- Modify: `src/components/DocumentView.jsx:741-909,980-1007,1438-1487`
- Modify: `tests/DocumentView.test.jsx:242-480`

**Interfaces:**
- Consumes: gebubbelte Touch-Events und `inkPointer.shouldBlockTouch` aus Task 2.
- Produces: `activePointers: Map<number, { x, y, startedOnPage }>` und `pinchInitialData` mit Distanz, Zoom, Centroid, Scrollstart und Focus-Box.
- Produces: Zoom 0.5–3.0 und simultane `scrollLeft`-/`scrollTop`-Änderungen ohne Page-1-Finger-Pan.

- [ ] **Step 1: Veralteten 1-Finger-Pan-Test ersetzen**

```javascript
test.each(['stylus', 'finger'])(
  'does not pan the document surface with one touch in %s mode',
  (inputMode) => {
    render(<DocumentView
      inkController={createControllerDouble({ inputMode })}
      toolbarState={toolState()}
    />);
    const page = screen.getByTestId('document-page');
    const scroller = page.parentElement;
    scroller.scrollTop = 200;
    scroller.scrollLeft = 40;
    fireEvent.pointerDown(page, {
      pointerId: 3, pointerType: 'touch', clientX: 200, clientY: 300,
    });
    fireEvent.pointerMove(page, {
      pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 240,
    });
    fireEvent.pointerUp(page, {
      pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 240,
    });
    expect(scroller.scrollTop).toBe(200);
    expect(scroller.scrollLeft).toBe(40);
  },
);
```

- [ ] **Step 2: Centroid-Anker und Full-Release testen**

```javascript
test('zooms and pans around the moving two-finger centroid', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => (cb(), 1));
  render(<DocumentView inkController={createControllerDouble()} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollLeft = 50;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(page, { pointerId: 10, pointerType: 'touch', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(page, { pointerId: 11, pointerType: 'touch', clientX: 200, clientY: 100 });
  fireEvent.pointerMove(page, { pointerId: 10, pointerType: 'touch', clientX: 150, clientY: 150 });
  fireEvent.pointerMove(page, { pointerId: 11, pointerType: 'touch', clientX: 350, clientY: 150 });
  expect(page).toHaveStyle({ width: '1600px' });
  expect(scroller.scrollLeft).toBe(150);
  expect(scroller.scrollTop).toBe(250);
});
```

Entferne den parametrisierten Test, der nach Pinch 1-Finger-Pan erwartet, und ersetze `keeps a surviving finger...` durch:

```javascript
test('keeps the surviving finger inert until every touch is released', () => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(cb => (cb(), 1));
  const controller = createControllerDouble({ inputMode: 'finger' });
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 200;
  fireEvent.pointerDown(page, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 300 });
  fireEvent.pointerDown(page, { pointerId: 4, pointerType: 'touch', clientX: 200, clientY: 300 });
  fireEvent.pointerMove(page, { pointerId: 4, pointerType: 'touch', clientX: 300, clientY: 300 });
  fireEvent.pointerUp(page, { pointerId: 4, pointerType: 'touch', clientX: 300, clientY: 300 });
  const scrollAfterPinch = scroller.scrollTop;
  fireEvent.pointerMove(page, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 230 });
  expect(scroller.scrollTop).toBe(scrollAfterPinch);
  expect(controller.commitStroke).not.toHaveBeenCalled();
  fireEvent.pointerUp(page, { pointerId: 3, pointerType: 'touch', clientX: 100, clientY: 230 });
  drawPointerStroke(page, {
    pointerId: 5,
    pointerType: 'touch',
    start: { x: 20, y: 20 },
    end: { x: 30, y: 30 },
  });
  expect(controller.commitStroke).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3: Dokumentansicht-Test rot ausführen**

Run: `npm test -- tests/DocumentView.test.jsx`

Expected: FAIL wegen aktuellem `touchPanInitialData`, unvollständigem Centroid-Anker und erneuter Pan-Initialisierung nach Release.

- [ ] **Step 4: Page-Touch-Tracking und Pinch-Initialisierung umstellen**

Entferne `touchPanInitialData` vollständig. Setze am Scroll-Container `touchAction: 'none'`, damit Android/WebView keine konkurrierende native Geste startet. Verwende:

```javascript
const handleGestureStart = (event) => {
  if (event.pointerType !== 'touch') return;
  if (inkPointer.shouldBlockTouch(event.timeStamp, event.pointerId)) return;
  const startedOnPage = containerRef.current?.contains(event.target) ?? false;
  activePointers.current.set(event.pointerId, {
    x: event.clientX, y: event.clientY, startedOnPage,
  });
  if (activePointers.current.size !== 2) return;
  const [first, second] = Array.from(activePointers.current.values());
  pinchInitialData.current = {
    distance: Math.max(Math.hypot(first.x - second.x, first.y - second.y), 1),
    zoom,
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    scrollTop: scrollRef.current.scrollTop,
    scrollLeft: scrollRef.current.scrollLeft,
    focusBox: focusBoxState?.focusBox ? { ...focusBoxState.focusBox } : null,
    ticking: false,
  };
};
```

- [ ] **Step 5: Scrollformel und Full-Release implementieren**

Behalte RAF-Drosselung, Zoom-Clamp und Focus-Box-Berechnung. Ersetze nur die Scrollformel:

```javascript
const zoomRatio = newZoom / startZoom;
scrollContainer.scrollLeft = (startScrollLeft + startX) * zoomRatio - currentCenterX;
scrollContainer.scrollTop = (startScrollTop + startY) * zoomRatio - currentCenterY;
```

Der End-Handler darf keinen 1-Finger-Pan reaktivieren:

```javascript
const handleGestureEnd = (event) => {
  if (event.pointerType !== 'touch') return;
  activePointers.current.delete(event.pointerId);
  if (activePointers.current.size < 2) {
    pinchInitialData.current = null;
    if (pendingFocusBox.current) {
      focusBoxState?.setFocusBox?.(pendingFocusBox.current);
      pendingFocusBox.current = null;
    }
  }
};
```

Behalte den vorhandenen Focus-Box-Seitengrenzen-Test unverändert.

- [ ] **Step 6: Dokumentflächen-Suite grün ausführen**

Run: `npm test -- tests/DocumentView.test.jsx`

Expected: PASS; kein Page-1-Finger-Pan, Centroid-Pan in X/Y, Zoom-Clamp und inerter Restfinger.

- [ ] **Step 7: Git-Savestate erstellen**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "feat(document): add centroid anchored two finger navigation"
```

---

### Task 4: Rand-Scrollen mit 15-px-Schwelle und Pen-Sperre

**Files:**
- Modify: `src/components/DocumentView.jsx:741-909,980-1007,1438-1487`
- Modify: `tests/DocumentView.test.jsx:242-480`

**Interfaces:**
- Consumes: `startedOnPage` aus Task 3 und `inkPointer.shouldBlockTouch` aus Task 2.
- Produces: `gutterDrag = { pointerId, startY, startScrollTop, thresholdPassed } | null`.

- [ ] **Step 1: Rand-Schwelle und aktive Pen-Sperre testen**

```javascript
test('scrolls one gutter touch only after more than 15 vertical pixels', () => {
  render(<DocumentView inkController={createControllerDouble()} toolbarState={toolState()} />);
  const scroller = screen.getByTestId('document-page').parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(scroller, {
    pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 200,
  });
  fireEvent.pointerMove(scroller, {
    pointerId: 20, pointerType: 'touch', clientX: 900, clientY: 215,
  });
  expect(scroller.scrollTop).toBe(100);
  fireEvent.pointerMove(scroller, {
    pointerId: 20, pointerType: 'touch', clientX: 900, clientY: 216,
  });
  expect(scroller.scrollTop).toBe(84);
  expect(scroller.scrollLeft).toBe(0);
});

test('blocks a gutter palm while a pen stroke is active', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(page, { pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100 });
  fireEvent.pointerDown(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200 });
  fireEvent.pointerMove(scroller, { pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 150 });
  expect(scroller.scrollTop).toBe(100);
  fireEvent.pointerMove(page, { pointerId: 1, pointerType: 'pen', clientX: 110, clientY: 110 });
  fireEvent.pointerUp(page, { pointerId: 1, pointerType: 'pen', clientX: 110, clientY: 110 });
  expect(controller.commitStroke).toHaveBeenCalledOnce();
});
```

Ergänze den Post-Pen-Fall explizit. Verwende `createEvent` aus React Testing Library, weil `Event.timeStamp` in jsdom read-only ist:

```javascript
test('keeps a gutter touch begun during the post-pen guard inert until release', () => {
  const controller = createControllerDouble();
  render(<DocumentView inkController={controller} toolbarState={toolState()} />);
  const page = screen.getByTestId('document-page');
  const scroller = page.parentElement;
  scroller.scrollTop = 100;
  const dispatchAt = (target, type, init, timeStamp) => {
    const event = createEvent[type](target, init);
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    fireEvent(target, event);
  };
  dispatchAt(page, 'pointerDown', {
    pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100,
  }, 1_000);
  dispatchAt(page, 'pointerUp', {
    pointerId: 1, pointerType: 'pen', clientX: 100, clientY: 100,
  }, 1_100);
  dispatchAt(scroller, 'pointerDown', {
    pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 200,
  }, 1_200);
  dispatchAt(scroller, 'pointerMove', {
    pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100,
  }, 2_000);
  expect(scroller.scrollTop).toBe(100);
  dispatchAt(scroller, 'pointerUp', {
    pointerId: 2, pointerType: 'touch', clientX: 950, clientY: 100,
  }, 2_001);
});
```

Erweitere dafür den Import am Dateikopf um `createEvent`.

- [ ] **Step 2: Rand-Tests rot ausführen**

Run: `npm test -- tests/DocumentView.test.jsx`

Expected: FAIL, weil `gutterDrag` noch nicht existiert.

- [ ] **Step 3: Rand-Kandidat initialisieren und bei Pinch verwerfen**

```javascript
const gutterDrag = useRef(null);

if (activePointers.current.size === 1 && !startedOnPage) {
  gutterDrag.current = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startScrollTop: scrollRef.current?.scrollTop ?? 0,
    thresholdPassed: false,
  };
}
if (activePointers.current.size === 2) {
  gutterDrag.current = null;
  const [first, second] = Array.from(activePointers.current.values());
  pinchInitialData.current = {
    distance: Math.max(Math.hypot(first.x - second.x, first.y - second.y), 1),
    zoom,
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    scrollTop: scrollRef.current.scrollTop,
    scrollLeft: scrollRef.current.scrollLeft,
    focusBox: focusBoxState?.focusBox ? { ...focusBoxState.focusBox } : null,
    ticking: false,
  };
}
```

- [ ] **Step 4: Vertikales Scrollen strikt nach Überschreiten der Schwelle anwenden**

```javascript
const drag = gutterDrag.current;
if (activePointers.current.size === 1 && drag?.pointerId === event.pointerId) {
  const deltaY = event.clientY - drag.startY;
  if (!drag.thresholdPassed && Math.abs(deltaY) > 15) drag.thresholdPassed = true;
  if (drag.thresholdPassed && scrollRef.current) {
    scrollRef.current.scrollTop = drag.startScrollTop - deltaY;
  }
  return;
}
```

Lösche `gutterDrag` beim passenden `pointerup`/`pointercancel`. Die Blockade-Abfrage am Anfang von `handleGestureStart` verhindert während aktivem oder kürzlich abgesetztem Pen bereits das Anlegen von `activePointers` und `gutterDrag`.

- [ ] **Step 5: Pointer-State bei Dokumentwechsel und Unmount bereinigen**

```javascript
useEffect(() => () => {
  cancelFocusBoxDrag();
  activePointers.current.clear();
  pinchInitialData.current = null;
  gutterDrag.current = null;
  pendingFocusBox.current = null;
}, [inkDocument.documentId]);
```

Ergänze einen eigenen Cleanup-Test:

```javascript
test('drops stale gutter pointer state when the document changes', () => {
  const first = createControllerDouble();
  const view = render(<DocumentView inkController={first} toolbarState={toolState()} />);
  const scroller = screen.getByTestId('document-page').parentElement;
  scroller.scrollTop = 100;
  fireEvent.pointerDown(scroller, {
    pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 200,
  });
  view.rerender(<DocumentView
    inkController={createControllerDouble({
      document: { ...first.document, documentId: 'note-2' },
    })}
    toolbarState={toolState()}
  />);
  fireEvent.pointerMove(scroller, {
    pointerId: 20, pointerType: 'touch', clientX: 950, clientY: 100,
  });
  expect(scroller.scrollTop).toBe(100);
});
```

- [ ] **Step 6: Relevante Suites grün ausführen**

Run: `npm test -- tests/inputPolicy.test.js tests/useInkPointer.test.js tests/DocumentView.test.jsx`

Expected: PASS; Rand-Touch scrollt erst ab 16 px, horizontales Zittern scrollt nicht, Pen/Palm blockiert, 2-Finger-Pinch verdrängt Rand-Kandidaten.

- [ ] **Step 7: Gesamtsuite und Produktions-Build verifizieren**

Run: `npm test`

Expected: Alle Vitest-Dateien bestehen ohne offene Handles.

Run: `npm run build`

Expected: Vite beendet den Produktions-Build mit Exit-Code 0.

- [ ] **Step 8: Git-Savestate erstellen**

```bash
git add src/components/DocumentView.jsx tests/DocumentView.test.jsx
git commit -m "feat(document): add guarded gutter scrolling"
```

---

## Manuelle Gerätevalidierung

- [ ] Im Fingermodus einen Strich beginnen und einen zweiten Finger aufsetzen: Draft verschwindet sofort; Zoom und X/Y-Pan funktionieren gemeinsam.
- [ ] Nach Pinch nur einen Finger abheben und bewegen: Weder Seite noch Ink ändern sich; erst nach vollständigem Release startet ein neuer Fingerstrich.
- [ ] Bei 50 %, 100 % und 300 % um einen sichtbaren Seitenpunkt pinchen: Der Punkt bleibt unter dem bewegten Centroid, soweit Scrollgrenzen dies zulassen.
- [ ] Pen-Strich halten und Handballen/Finger auf Dokument sowie Rand ablegen: Pen-Strich bleibt durchgehend; Zoom/Pan/Scroll bleiben unverändert.
- [ ] Direkt nach Pen-Up den Handballen am Rand bewegen: kein Scrollen; nach Release scrollt ein neuer bewusster Rand-Drag ab dem 16. vertikalen Pixel.
- [ ] Im Split-Screen eine Focus-Box pinchen: Sie bleibt in derselben Seite, folgt dem Zoom und wird am Ende ohne Sprung gespeichert.
