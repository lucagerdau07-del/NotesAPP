export const POST_PEN_TOUCH_GUARD_MS = 300;

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
