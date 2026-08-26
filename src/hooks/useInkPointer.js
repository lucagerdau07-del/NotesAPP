import { useCallback, useRef, useState } from "react";
import { createInputState, reducePointerInput, shouldBlockTouch as policyBlocksTouch } from "../ink/inputPolicy.js";
import { findIntersectingStrokeIds, getToolStyle } from "../ink/inkDocument.js";

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

export default function useInkPointer(options) {
  const optionsRef = useRef(options);
  const inputStateRef = useRef(createInputState());
  const draftRef = useRef(null);
  const draftOwnerRef = useRef(null);
  const strokeEraserRef = useRef(false);
  const captureRef = useRef(null);
  const [draftStroke, setDraftStroke] = useState(null);
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
    strokeEraserRef.current = false;
    setDraftStroke(null);
    releaseCapture();
  }, [releaseCapture]);

  const route = useCallback((event, phase) => {
    const { inputMode = "stylus" } = optionsRef.current;
    const routed = reducePointerInput(
      inputStateRef.current,
      {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        timeStamp: event.timeStamp,
        phase,
      },
      inputMode,
    );
    inputStateRef.current = routed.state;
    return routed;
  }, []);

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
    draftRef.current = null;
    draftOwnerRef.current = null;
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
    strokeEraserRef.current = current.tool === 'stroke-eraser'
      || (tool === 'pixel-eraser' && current.eraserMode === 'stroke');
    setDraftStroke({ ...draft, points: [...draft.points] });

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
      const point = mappedPoint(current.mapPoint?.(event));
      if (!ownsLivePage(draftOwnerRef.current, current.document)) {
        abortDraft(event);
        return;
      }
      if (!point || point.pageId !== draft.pageId) {
        route(event, "abort");
        finalizeDraft();
        return;
      }

      draft.points.push({ x: point.x, y: point.y });
      setDraftStroke({ ...draft, points: [...draft.points] });
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

  const shouldBlockTouch = useCallback((timeStamp, pointerId) => (
    policyBlocksTouch(inputStateRef.current, timeStamp, pointerId)
  ), []);

  const abortActiveStroke = useCallback((pointerId, timeStamp) => {
    route({ pointerId, pointerType: 'touch', timeStamp }, "abort");
    discardDraft();
  }, [discardDraft, route]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    shouldBlockTouch,
    abortActiveStroke,
    draftStroke,
  };
}
