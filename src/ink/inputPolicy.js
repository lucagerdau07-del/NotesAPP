export const POST_PEN_TOUCH_GUARD_MS = 300;

// The browser exposes no palm flag, so palm rejection is assembled from the
// signals a digitizer does report. Each entry is one independent layer; a touch
// has to survive all of them to be treated as a real finger.
export const PALM_GUARD_DEFAULTS = {
  // A pen in hover range keeps firing pointermove with no button down. While
  // that is fresh the hand is already resting on the glass, so every touch is
  // palm. This is the layer that catches the palm landing *before* the tip.
  penProximityMs: 600,
  // The hand rolls off over the frames after the tip lifts.
  postPenGuardMs: POST_PEN_TOUCH_GUARD_MS,
  // PointerEvent width/height carry the contact patch in CSS px. A fingertip
  // stays well under this; a palm, knuckle row or forearm is far above it.
  palmContactPx: 45,
  // A palm that lifts usually re-seats within a few frames instead of leaving.
  palmLatchMs: 250,
};

// stylus: only the pen draws. finger: touch draws too. move: nothing draws,
// every pointer is left to the pan/pinch layer.
export const INPUT_MODES = ['stylus', 'finger', 'move'];

export function createInputState() {
  return {
    drawingPointerId: null,
    drawingPointerType: null,
    touchPointerIds: [],
    blockedTouchPointerIds: [],
    gestureLocked: false,
    lastPenUpAt: Number.NEGATIVE_INFINITY,
    lastPenSeenAt: Number.NEGATIVE_INFINITY,
    lastPalmUpAt: Number.NEGATIVE_INFINITY,
  };
}

const addUnique = (ids, id) => ids.includes(id) ? ids : [...ids, id];
const remove = (ids, id) => ids.filter((candidate) => candidate !== id);
const eventTime = (event) => Number.isFinite(event.timeStamp) ? event.timeStamp : 0;

// Devices with no contact geometry report 1x1 for every pointer. Reading that
// as a tiny finger is right: it means "unknown", not "small", and the other
// layers have to carry the decision on those devices.
const contactSize = (event) => {
  const size = Math.max(
    Number.isFinite(event.width) ? event.width : 0,
    Number.isFinite(event.height) ? event.height : 0,
  );
  return size > 1 ? size : 0;
};

export function isPalmContact(event, tuning = PALM_GUARD_DEFAULTS) {
  return contactSize(event) >= tuning.palmContactPx;
}

export function shouldBlockTouch(
  state,
  event,
  tuning = PALM_GUARD_DEFAULTS,
  inputMode = 'stylus',
) {
  if (state.drawingPointerType === 'pen' && state.drawingPointerId !== null) return true;
  if (state.blockedTouchPointerIds.includes(event.pointerId)) return true;

  const timeStamp = eventTime(event);
  // In move mode the pen is a pan tool, not a writing tool: there is no stroke
  // to protect, so locking touch out around its contacts only costs gestures.
  if (inputMode !== 'move') {
    if (timeStamp - state.lastPenUpAt < tuning.postPenGuardMs) return true;
    if (timeStamp - state.lastPenSeenAt < tuning.penProximityMs) return true;
  }

  // A hand on the glass blocks the whole surface: the pinky riding next to the
  // palm reports a fingertip-sized patch, so sizing it on its own never catches
  // it. Only in stylus mode, where no touch is ever meant to draw — in finger
  // mode that rule would lock out the writing finger next to its own palm.
  if (inputMode === 'stylus') {
    if (state.blockedTouchPointerIds.length > 0) return true;
    if (timeStamp - state.lastPalmUpAt < tuning.palmLatchMs) return true;
  }

  return isPalmContact(event, tuning);
}

export function reducePointerInput(
  state,
  event,
  inputMode = 'stylus',
  tuning = PALM_GUARD_DEFAULTS,
) {
  const isTouch = event.pointerType === 'touch';
  const isRelease = event.phase === 'up' || event.phase === 'cancel';
  const touchPointerIds = !isTouch
    ? state.touchPointerIds
    : event.phase === 'down'
      ? addUnique(state.touchPointerIds, event.pointerId)
      : isRelease
        ? remove(state.touchPointerIds, event.pointerId)
        : state.touchPointerIds;
  const blockedByPalmGuard = isTouch && shouldBlockTouch(state, event, tuning, inputMode);
  const blockedTouchPointerIds = !isTouch
    ? state.blockedTouchPointerIds
    : blockedByPalmGuard && event.phase === 'down'
      ? addUnique(state.blockedTouchPointerIds, event.pointerId)
      : isRelease
        ? remove(state.blockedTouchPointerIds, event.pointerId)
        : state.blockedTouchPointerIds;
  // Rejected contacts must not count toward the pinch: a palm plus the writing
  // finger is two pointers, and reading that as a gesture is how a rested hand
  // zooms the page out from under the stroke.
  const gestureTouchIds = touchPointerIds.filter(
    (id) => !blockedTouchPointerIds.includes(id),
  );
  const gestureLocked = state.gestureLocked
    ? gestureTouchIds.length > 0
    : gestureTouchIds.length >= 2;
  const nextState = {
    ...state,
    touchPointerIds,
    blockedTouchPointerIds,
    gestureLocked,
    // Hover counts: a pen that is merely in range already means the hand is
    // down, and those moves reach us before the tip ever touches.
    lastPenSeenAt: event.pointerType === 'pen' ? eventTime(event) : state.lastPenSeenAt,
    lastPalmUpAt: isTouch && isRelease && state.blockedTouchPointerIds.includes(event.pointerId)
      ? eventTime(event)
      : state.lastPalmUpAt,
  };

  if (blockedByPalmGuard) return { state: nextState, intent: 'ignore' };

  const ownsEvent = state.drawingPointerId === event.pointerId;
  if (event.phase === 'down' && event.pointerType === 'pen' && inputMode !== 'move') {
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
    const canDraw = inputMode !== 'move' && (
      event.pointerType === 'mouse'
      || (isTouch && inputMode === 'finger' && !gestureLocked)
    );
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
