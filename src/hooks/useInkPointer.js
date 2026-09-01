import { useCallback, useRef, useState } from "react";
import {
  createInputState,
  PALM_GUARD_DEFAULTS,
  reducePointerInput,
  shouldBlockTouch as policyBlocksTouch,
} from "../ink/inputPolicy.js";
import { findIntersectingStrokeIds, getToolStyle } from "../ink/inkDocument.js";
import { loadPalmProfile, markPenSeen } from "../ink/palmSettings.js";

let nextStrokeNumber = 0;

function createStrokeId() {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  nextStrokeNumber += 1;
  return `ink-${Date.now()}-${nextStrokeNumber}`;
}

function mappedPoint(value) {
  if (
    !value ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    typeof value.pageId !== "string" ||
    value.pageId.length === 0
  )
    return null;
  return { pageId: value.pageId, x: value.x, y: value.y };
}

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
  // Committed touch strokes stay revocable for a moment: on a device with no
  // digitizer we only learn that a contact was a palm after the tip arrives,
  // which is after that palm's stroke has already been written down. Timed
  // off each event's own timeStamp, same as the rest of the policy — never
  // off the wall clock, or the window would depend on how fast tests run.
  const recentTouchStrokesRef = useRef([]);
  const lastEventTimeRef = useRef(0);
  const [draftStroke, setDraftStroke] = useState(null);
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
    setDraftStroke(null);
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

  const discardDraft = useCallback(() => {
    draftRef.current = null;
    draftOwnerRef.current = null;
    draftPointerIdRef.current = null;
    draftPointerTypeRef.current = null;
    strokeEraserRef.current = false;
    setDraftStroke(null);
    releaseCapture();
  }, [releaseCapture]);

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
        // hand from a travelling tip and to measure pinch separation.
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
    draftRef.current = null;
    draftOwnerRef.current = null;
    draftPointerIdRef.current = null;
    draftPointerTypeRef.current = null;
    strokeEraserRef.current = false;
    setDraftStroke(null);
    releaseCapture();

    const current = optionsRef.current;
    if (
      !draft ||
      draft.points.length < 2 ||
      !ownsLivePage(owner, current.document)
    )
      return;
    if (isStrokeEraser) {
      const strokeIds = findIntersectingStrokeIds(
        current.document,
        draft.pageId,
        draft.points,
        draft.width / 2,
      );
      if (strokeIds.length > 0) current.removeStrokes?.(strokeIds);
      return;
    }
    current.commitStroke?.(draft);
    if (pointerType === 'touch' && pointerId !== null) {
      recentTouchStrokesRef.current.push({
        strokeId: draft.id,
        pointerId,
        committedAt: lastEventTimeRef.current,
      });
    }
  }, [releaseCapture]);

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
    draftPointerIdRef.current = event.pointerId;
    draftPointerTypeRef.current = event.pointerType;
    strokeEraserRef.current = current.tool === 'stroke-eraser'
      || (tool === 'pixel-eraser' && current.eraserMode === 'stroke');
    // The live draft object is published once. Moves mutate it in place and are
    // painted incrementally via onDraftAppend, so no re-render per pointer move.
    setDraftStroke(draft);

    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
      captureRef.current = { target: event.currentTarget, pointerId: event.pointerId };
    }
    return true;
  }, []);

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
        const point = mappedPoint(current.mapPoint?.(sample));
        if (!point || point.pageId !== draft.pageId) {
          if (draft.points.length > appendedFrom)
            current.onDraftAppend?.(draft, appendedFrom);
          route(event, "abort");
          finalizeDraft();
          return;
        }
        draft.points.push({ x: point.x, y: point.y });
      }
      current.onDraftAppend?.(draft, appendedFrom);
    },
    [abortDraft, discardDraft, finalizeDraft, route],
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
    draftStroke,
  };
}
