import { useCallback, useRef, useState } from "react";
import {
  createInputState,
  PALM_GUARD_DEFAULTS,
  reducePointerInput,
  shouldBlockTouch as policyBlocksTouch,
} from "../ink/inputPolicy.js";
import { findIntersectingObjectIds, findIntersectingStrokeIds, getToolStyle } from "../ink/inkDocument.js";
import { loadPalmProfile, markPenSeen } from "../ink/palmSettings.js";
import { recognizeShape } from "../ink/shapeRecognizer.js";
import { createPageObject } from "../ink/pageObjects.js";

// Shorter than Library.jsx's useLongPress: that gesture opens a menu on
// static content, this one is a drawing pause mid-stroke and has to feel
// immediate or it reads as lag, not a gesture.
const HOLD_MS = 350;
// How far (screen px) the tip may drift and still count as held still. A tip
// resting on the glass never goes quiet: digitizer jitter and pressure
// changes keep firing pointermove, and re-arming on every one of those meant
// the hold only fired when the panel happened to fall silent.
const HOLD_SLOP_PX = 6;
// How long a just-committed stroke stays eligible to be pulled into a held
// shape guess - covers drawing a rect's four sides, or a shaft plus a
// separate arrowhead, as one continuous doodle with brief pen lifts. Four
// separate sides take a couple of seconds by hand; MERGE_MARGIN is what keeps
// nearby unrelated handwriting out.
const MERGE_WINDOW_MS = 4000;
// How close two strokes' bounding boxes have to be (page/world units, camera
// zoom already divided out by mapPoint) to count as the same doodle. Same
// reasoning as MERGE_WINDOW_MS: a rect's sides or an arrow's barbs sit right
// against each other, ordinary handwriting a line or word away does not.
const MERGE_MARGIN = 24;

function bboxOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function expandBox(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boxesNear(a, b, margin) {
  return !(b.minX > a.maxX + margin || b.maxX < a.minX - margin || b.minY > a.maxY + margin || b.maxY < a.minY - margin);
}

let nextStrokeNumber = 0;

function createStrokeId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  nextStrokeNumber += 1;
  return `ink-${Date.now()}-${nextStrokeNumber}`;
}

function mappedPoint(value, source) {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    typeof value.pageId !== "string" ||
    value.pageId.length === 0
  )
    return null;
  // Pressure rides along per sample so the renderer can taper the line. Only a
  // reading that actually varies is worth storing: a panel with no pressure
  // channel reports a flat 1 (or nothing at all), and points without `p` keep
  // the renderer on its single-path fast path.
  const pressure = source?.pressure;
  return Number.isFinite(pressure) && pressure > 0 && pressure < 1
    ? { pageId: value.pageId, x: value.x, y: value.y, p: pressure }
    : { pageId: value.pageId, x: value.x, y: value.y };
}

const inkPoint = (point) =>
  Number.isFinite(point.p) ? { x: point.x, y: point.y, p: point.p } : { x: point.x, y: point.y };

function selectedTool(tool) {
  return tool === "eraser" ||
    tool === "pixel-eraser" ||
    tool === "stroke-eraser"
    ? "pixel-eraser"
    : tool;
}

function draftOwner(document, pageId) {
  if (
    typeof document?.documentId !== "string" ||
    document.documentId.length === 0 ||
    !Array.isArray(document.pages) ||
    !document.pages.some((page) => page?.id === pageId)
  )
    return null;
  return { documentId: document.documentId, pageId };
}

function ownsLivePage(owner, document) {
  return (
    owner?.documentId === document?.documentId &&
    Array.isArray(document?.pages) &&
    document.pages.some((page) => page?.id === owner.pageId)
  );
}

// A pen or mouse tap is deliberate by construction — the tip only reaches the
// glass because someone put it there. A touch is the passive-stylus case,
// where the same contact channel also carries every graze of the hand, so it
// has to look like a tap: brief. Size is deliberately NOT part of this test —
// contactClassifier's own comments document a single contact's reported width
// swinging 1-34px on this hardware, so a size cutoff here would reject real
// taps at random. A hand that lands and lifts quickly still slips through,
// but a hand that actually rests is already caught upstream (see the "resting
// contact" handling in contactClassifier.js) before it ever reaches here.
function isDeliberateTap(pointerType, downAt, liftedAt, tuning) {
  if (pointerType !== "touch") return true;
  if (downAt === null) return false;
  return liftedAt - downAt <= tuning.tapMaxMs;
}

const palmGuard = (options) =>
  options.palmGuard ? { ...PALM_GUARD_DEFAULTS, ...options.palmGuard } : PALM_GUARD_DEFAULTS;

export default function useInkPointer(options) {
  const optionsRef = useRef(options);
  const inputStateRef = useRef(
    createInputState({ sawPenPointer: loadPalmProfile().sawPenPointer === true }),
  );
  const draftRef = useRef(null);
  const draftOwnerRef = useRef(null);
  const draftPointerIdRef = useRef(null);
  const draftPointerTypeRef = useRef(null);
  const strokeEraserRef = useRef(false);
  const captureRef = useRef(null);
  // When the live draft touched down, for the tap-to-dot duration test.
  const tapDownAtRef = useRef(null);
  // Committed touch strokes stay revocable for a moment: on a device with no
  // digitizer we only learn that a contact was a palm after the tip arrives,
  // which is after that palm's stroke has already been written down. Timed
  // off each event's own timeStamp, same as the rest of the policy — never
  // off the wall clock, or the window would depend on how fast tests run.
  const recentTouchStrokesRef = useRef([]);
  const lastEventTimeRef = useRef(0);
  // Set once the hold-still timer fires on a draft that isn't a recognized
  // shape, so finalizeDraft knows to offer it for handwritten-link detection
  // after it commits as ordinary ink.
  const heldWithoutShapeRef = useRef(false);
  const holdTimerRef = useRef(null);
  // Client position the hold timer was last armed at, for HOLD_SLOP_PX.
  const holdAnchorRef = useRef(null);
  // Non-eraser strokes committed in the last MERGE_WINDOW_MS, for the hold
  // gesture to pull nearby ones into a multi-stroke shape guess.
  const recentShapeStrokesRef = useRef([]);
  const [draftVersion, setDraftVersion] = useState(0);
  const previousDocumentIdRef = useRef(options.document?.documentId);
  if (previousDocumentIdRef.current !== options.document?.documentId) {
    inputStateRef.current = createInputState({ sawPenPointer: inputStateRef.current.sawPenPointer });
    previousDocumentIdRef.current = options.document?.documentId;
    draftRef.current = null;
    draftOwnerRef.current = null;
    draftPointerIdRef.current = null;
    draftPointerTypeRef.current = null;
    strokeEraserRef.current = false;
    recentTouchStrokesRef.current = [];
    recentShapeStrokesRef.current = [];
    heldWithoutShapeRef.current = false;
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setDraftVersion((version) => version + 1);
    if (captureRef.current?.target?.releasePointerCapture) {
      captureRef.current.target.releasePointerCapture(captureRef.current.pointerId);
    }
    captureRef.current = null;
  }
  optionsRef.current = options;

  const releaseCapture = useCallback(() => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (
      capture?.target &&
      typeof capture.target.releasePointerCapture === "function"
    ) {
      capture.target.releasePointerCapture(capture.pointerId);
    }
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const movedPastHoldSlop = useCallback((event) => {
    const anchor = holdAnchorRef.current;
    if (anchor && Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) <= HOLD_SLOP_PX) return false;
    holdAnchorRef.current = { x: event.clientX, y: event.clientY };
    return true;
  }, []);

  const discardDraft = useCallback(() => {
    draftRef.current = null;
    draftOwnerRef.current = null;
    draftPointerIdRef.current = null;
    draftPointerTypeRef.current = null;
    strokeEraserRef.current = false;
    heldWithoutShapeRef.current = false;
    clearHoldTimer();
    setDraftVersion((version) => version + 1);
    releaseCapture();
  }, [releaseCapture, clearHoldTimer]);

  // Fires when the pen has sat still for HOLD_MS: a rect/ellipse/line/arrow
  // guess becomes a real page object immediately (ladder: recognizer owns
  // the confidence bar, so an ordinary drawing pause just keeps drawing).
  // Anything else that was held just gets flagged for finalizeDraft to offer
  // to onHoldWithoutShape once it commits as normal ink.
  const armHoldTimer = useCallback(() => {
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      const draft = draftRef.current;
      if (!draft || strokeEraserRef.current) return;
      const current = optionsRef.current;

      // Pull in just-drawn strokes near the current one - four sides of a
      // rect, or a shaft plus a separately-drawn arrowhead, are usually a
      // few quick strokes with brief pen lifts, not one unbroken loop.
      const now = Date.now();
      // Oldest first already (push order in finalizeDraft) - walking forward
      // keeps that order, so no timestamp sort needed (and none would be
      // reliable: strokes drawn within the same millisecond tie).
      const recent = recentShapeStrokesRef.current;
      let clusterBox = bboxOf(draft.points);
      const merged = [];
      for (const entry of recent) {
        if (entry.pageId !== draft.pageId) continue;
        if (now - entry.committedAt > MERGE_WINDOW_MS) continue;
        const box = bboxOf(entry.points);
        if (!boxesNear(clusterBox, box, MERGE_MARGIN)) continue;
        clusterBox = expandBox(clusterBox, box);
        merged.push(entry);
      }

      let shape = null;
      if (merged.length > 0) {
        shape = recognizeShape([...merged.flatMap((entry) => entry.points), ...draft.points]);
      }
      const usedMerge = shape !== null;
      if (!shape) shape = recognizeShape(draft.points);

      if (shape) {
        if (typeof current.addObject === "function") {
          current.addObject(
            createPageObject({
              ...shape,
              pageId: draft.pageId,
              color: draft.color,
              strokeWidth: draft.width,
            }),
          );
          if (usedMerge) {
            const mergedIds = new Set(merged.map((entry) => entry.id));
            current.removeStrokes?.(merged.map((entry) => entry.id));
            recentShapeStrokesRef.current = recentShapeStrokesRef.current.filter((entry) => !mergedIds.has(entry.id));
          }
          discardDraft();
        }
        return;
      }
      if (draft.points.length >= 6 && typeof current.onHoldWithoutShape === "function") {
        heldWithoutShapeRef.current = true;
      }
    }, HOLD_MS);
  }, [clearHoldTimer, discardDraft]);

  const revokeCommitted = useCallback((pointerIds, at) => {
    const window = palmGuard(optionsRef.current).retroWindowMs;
    const buffer = recentTouchStrokesRef.current;
    const doomed = buffer.filter(
      (entry) => pointerIds.includes(entry.pointerId) && at - entry.committedAt <= window,
    );
    recentTouchStrokesRef.current = buffer.filter(
      (entry) => at - entry.committedAt <= window && !doomed.includes(entry),
    );
    if (doomed.length > 0) {
      optionsRef.current.removeStrokes?.(doomed.map((entry) => entry.strokeId));
    }
  }, []);

  const route = useCallback((event, phase) => {
    const { inputMode = "stylus" } = optionsRef.current;
    const timeStamp = Number.isFinite(event.timeStamp) ? event.timeStamp : lastEventTimeRef.current;
    lastEventTimeRef.current = timeStamp;
    if (phase === 'down') {
      // A pointerId names a contact only while that contact is on the glass;
      // the platform hands the same number to whatever lands next. Ink still
      // held revocable under this id belongs to a contact that is gone, so
      // leaving it there lets the hand that inherits the id take back the
      // stroke the tip just finished.
      recentTouchStrokesRef.current = recentTouchStrokesRef.current.filter(
        (entry) => entry.pointerId !== event.pointerId,
      );
    }
    const routed = reducePointerInput(
      inputStateRef.current,
      {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        timeStamp,
        // Contact geometry is what separates a fingertip from a palm; without
        // it the guard is blind to a hand that lands before the pen does.
        width: event.width,
        height: event.height,
        // The contact classifier needs real coordinates to tell a resting
        // hand from a travelling tip.
        clientX: event.clientX,
        clientY: event.clientY,
        phase,
      },
      inputMode,
      palmGuard(optionsRef.current),
    );
    const hadPen = inputStateRef.current.sawPenPointer;
    inputStateRef.current = routed.state;
    if (!hadPen && routed.state.sawPenPointer) markPenSeen();
    if (routed.state.retroBlockedPointerIds.length > 0) {
      revokeCommitted(routed.state.retroBlockedPointerIds, timeStamp);
    }
    return routed;
  }, [revokeCommitted]);

  const abortDraft = useCallback(
    (event) => {
      route(event, "abort");
      discardDraft();
    },
    [discardDraft, route],
  );

  const finalizeDraft = useCallback(() => {
    const draft = draftRef.current;
    const owner = draftOwnerRef.current;
    const isStrokeEraser = strokeEraserRef.current;
    const pointerId = draftPointerIdRef.current;
    const pointerType = draftPointerTypeRef.current;
    const wasHeldWithoutShape = heldWithoutShapeRef.current;
    draftRef.current = null;
    draftOwnerRef.current = null;
    draftPointerIdRef.current = null;
    draftPointerTypeRef.current = null;
    strokeEraserRef.current = false;
    heldWithoutShapeRef.current = false;
    clearHoldTimer();
    setDraftVersion((version) => version + 1);
    releaseCapture();

    const current = optionsRef.current;
    if (!draft || draft.points.length === 0 || !ownsLivePage(owner, current.document))
      return;
    // A tap fires down+up with no move in between, so the draft never grows
    // past one point. Duplicate it into a zero-length segment instead of
    // dropping it: the round line cap renders that as a dot.
    if (draft.points.length === 1) {
      if (
        !isDeliberateTap(
          pointerType,
          tapDownAtRef.current,
          lastEventTimeRef.current,
          palmGuard(current),
        )
      )
        return;
      draft.points.push({ ...draft.points[0] });
    }
    if (isStrokeEraser) {
      const strokeIds = findIntersectingStrokeIds(
        current.document,
        draft.pageId,
        draft.points,
        draft.width / 2,
      );
      if (strokeIds.length > 0) current.removeStrokes?.(strokeIds);
      // A shape born from hold-to-convert is drawn ink turned object, not
      // ink any more - the stroke eraser has to reach it too, or "erasing"
      // an unwanted rect/arrow silently does nothing.
      const objectIds = findIntersectingObjectIds(
        current.document,
        draft.pageId,
        draft.points,
        draft.width / 2,
      );
      if (objectIds.length > 0) current.removeObjects?.(objectIds);
      return;
    }
    current.commitStroke?.(draft);
    const now = Date.now();
    recentShapeStrokesRef.current = [
      ...recentShapeStrokesRef.current.filter((entry) => now - entry.committedAt <= MERGE_WINDOW_MS),
      { id: draft.id, pageId: draft.pageId, points: draft.points, committedAt: now },
    ];
    if (wasHeldWithoutShape) current.onHoldWithoutShape?.(draft);
    if (pointerType === 'touch' && pointerId !== null) {
      recentTouchStrokesRef.current.push({
        strokeId: draft.id,
        pointerId,
        committedAt: lastEventTimeRef.current,
      });
    }
  }, [releaseCapture, clearHoldTimer]);

  const startDraft = useCallback((event) => {
    const current = optionsRef.current;
    const point = mappedPoint(current.mapPoint?.(event), event);
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
      points: [inkPoint(point)],
    };
    draftRef.current = draft;
    draftOwnerRef.current = owner;
    draftPointerIdRef.current = event.pointerId;
    draftPointerTypeRef.current = event.pointerType;
    tapDownAtRef.current = lastEventTimeRef.current;
    strokeEraserRef.current = current.tool === 'stroke-eraser'
      || (tool === 'pixel-eraser' && current.eraserMode === 'stroke');
    // No render at pen-down: on slow tablets it stalls the first samples.

    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
      captureRef.current = { target: event.currentTarget, pointerId: event.pointerId };
    }
    holdAnchorRef.current = { x: event.clientX, y: event.clientY };
    armHoldTimer();
    return true;
  }, [armHoldTimer]);

  const onPointerDown = useCallback((event, options = {}) => {
    const routed = route(event, 'down');
    if (routed.intent === 'cancel-draw') return discardDraft();
    if (routed.intent === 'replace-draw') {
      discardDraft();
      if (!options.preventDraw && !startDraft(event)) abortDraft(event);
      return;
    }
    if (routed.intent === 'start-draw' && !options.preventDraw && !startDraft(event)) {
      abortDraft(event);
    }
  }, [abortDraft, discardDraft, route, startDraft]);

  const onPointerMove = useCallback(
    (event) => {
      const routed = route(event, "move");
      if (routed.intent === "cancel-draw") {
        discardDraft();
        return;
      }
      if (routed.intent !== "continue-draw") return;

      const draft = draftRef.current;
      if (!draft) return;
      const current = optionsRef.current;
      if (!ownsLivePage(draftOwnerRef.current, current.document)) {
        abortDraft(event);
        return;
      }

      // Coalesced samples keep fast strokes smooth instead of polygonal.
      const native = event.nativeEvent || event;
      const coalesced =
        typeof native.getCoalescedEvents === "function"
          ? native.getCoalescedEvents()
          : null;
      const samples = coalesced && coalesced.length > 0 ? coalesced : [event];

      const appendedFrom = draft.points.length;
      for (const sample of samples) {
        const point = mappedPoint(current.mapPoint?.(sample), sample);
        if (!point || point.pageId !== draft.pageId) {
          if (draft.points.length > appendedFrom)
            current.onDraftAppend?.(draft, appendedFrom);
          route(event, "abort");
          finalizeDraft();
          return;
        }
        draft.points.push(inkPoint(point));
      }
      current.onDraftAppend?.(draft, appendedFrom);
      if (movedPastHoldSlop(event)) armHoldTimer();
    },
    [abortDraft, discardDraft, finalizeDraft, route, armHoldTimer, movedPastHoldSlop],
  );

  const onPointerUp = useCallback(
    (event) => {
      const routed = route(event, "up");
      if (routed.intent === "cancel-draw") {
        discardDraft();
        return;
      }
      if (routed.intent !== "finish-draw") return;

      finalizeDraft();
    },
    [discardDraft, finalizeDraft, route],
  );

  const onPointerCancel = useCallback(
    (event) => {
      const routed = route(event, "cancel");
      if (routed.intent === "cancel-draw") discardDraft();
    },
    [discardDraft, route],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    shouldBlockTouch: (event) =>
      policyBlocksTouch(
        inputStateRef.current,
        event,
        palmGuard(optionsRef.current),
        optionsRef.current.inputMode || "stylus",
      ),
    abortActiveStroke: (pointerId, timeStamp) => {
      const routed = reducePointerInput(
        inputStateRef.current,
        { pointerId, pointerType: 'touch', timeStamp, phase: 'abort' },
        optionsRef.current.inputMode || 'stylus',
        palmGuard(optionsRef.current),
      );
      inputStateRef.current = routed.state;
      if (routed.intent === 'cancel-draw') discardDraft();
    },
    markPalm: (pointerId, timeStamp) => {
      const routed = reducePointerInput(
        inputStateRef.current,
        { pointerId, pointerType: 'touch', timeStamp, phase: 'cancel' },
        optionsRef.current.inputMode || 'stylus',
        palmGuard(optionsRef.current),
      );
      inputStateRef.current = routed.state;
      if (draftPointerIdRef.current === pointerId) discardDraft();
      revokeCommitted([pointerId], timeStamp);
    },
    reset: () => {
      inputStateRef.current = createInputState();
      recentTouchStrokesRef.current = [];
      discardDraft();
    },
    // Getter, not snapshot: nothing re-renders when a stroke starts.
    get draftStroke() {
      return draftRef.current;
    },
    draftVersion,
  };
}
