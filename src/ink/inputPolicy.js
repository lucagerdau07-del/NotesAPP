export function createInputState() {
  return {
    drawingPointerId: null,
    drawingPointerType: null,
    touchPointerIds: [],
  };
}

function updateTouches(pointerIds, event) {
  if (event.pointerType !== 'touch') return [...pointerIds];

  if (event.phase === 'down') {
    return pointerIds.includes(event.pointerId)
      ? [...pointerIds]
      : [...pointerIds, event.pointerId];
  }

  if (event.phase === 'up' || event.phase === 'cancel') {
    return pointerIds.filter((pointerId) => pointerId !== event.pointerId);
  }

  return [...pointerIds];
}

export function reducePointerInput(state, event, inputMode = 'stylus') {
  const nextState = {
    ...state,
    touchPointerIds: updateTouches(state.touchPointerIds, event),
  };
  const ownerId = state.drawingPointerId;
  const isOwner = ownerId !== null && event.pointerId === ownerId;
  const canStart = event.pointerType === 'pen'
    || event.pointerType === 'mouse'
    || (inputMode === 'finger' && event.pointerType === 'touch');

  if (event.phase === 'down') {
    if (ownerId !== null) {
      if (state.drawingPointerType === 'touch' && event.pointerType === 'touch') {
        return {
          state: { ...nextState, drawingPointerId: null, drawingPointerType: null },
          intent: 'cancel-draw',
        };
      }
      if (event.pointerType === 'touch') return { state: nextState, intent: 'navigate' };
      return { state: nextState, intent: 'ignore' };
    }

    if (canStart) {
      return {
        state: {
          ...nextState,
          drawingPointerId: event.pointerId,
          drawingPointerType: event.pointerType,
        },
        intent: 'start-draw',
      };
    }

    return { state: nextState, intent: event.pointerType === 'touch' ? 'navigate' : 'ignore' };
  }

  if (isOwner) {
    if (event.phase === 'move') return { state: nextState, intent: 'continue-draw' };
    if (event.phase === 'up') {
      return {
        state: { ...nextState, drawingPointerId: null, drawingPointerType: null },
        intent: 'finish-draw',
      };
    }
    if (event.phase === 'cancel') {
      return {
        state: { ...nextState, drawingPointerId: null, drawingPointerType: null },
        intent: 'cancel-draw',
      };
    }
  }

  return {
    state: nextState,
    intent: event.pointerType === 'touch' ? 'navigate' : 'ignore',
  };
}
