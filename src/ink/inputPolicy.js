import { CONTACT_DEFAULTS, classifyContacts, isPinchPair, updateContacts } from './contactClassifier.js';

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
  ...CONTACT_DEFAULTS,
  // On a device without a digitizer nothing ever reports pointerType 'pen', so
  // stylus mode would admit nothing at all. The elected contact stands in for
  // the pen until a real one shows up and takes the job back.
  passiveStylus: true,
  // How far back a stroke can still be taken away once its contact turns out
  // to have been a palm. The hand lands before the tip, so this has to cover a
  // whole short palm stroke, not just a frame.
  retroWindowMs: 1200,
};

// stylus: only the pen draws. finger: touch draws too. move: nothing draws,
// every pointer is left to the pan/pinch layer.
export const INPUT_MODES = ['stylus', 'finger', 'move'];

export function createInputState(seed = {}) {
  return {
    drawingPointerId: null,
    drawingPointerType: null,
    touchPointerIds: [],
    blockedTouchPointerIds: [],
    gestureLocked: false,
    lastPenUpAt: Number.NEGATIVE_INFINITY,
    lastPenSeenAt: Number.NEGATIVE_INFINITY,
    lastPalmUpAt: Number.NEGATIVE_INFINITY,
    contacts: {},
    electedPointerId: null,
    // Pointer ids condemned by this event and not blocked before it. The hook
    // uses them to take back ink that has already been drawn or committed.
    retroBlockedPointerIds: [],
    sawPenPointer: seed.sawPenPointer === true,
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
  // The elected-contact exception only applies while the passive-stylus
  // fallback is actually the thing admitting touches: once a real pen has
  // been seen, only the pen may draw and every touch stays under this guard,
  // exactly as on a device with a digitizer.
  const passiveActive = tuning.passiveStylus && !state.sawPenPointer;
  if (inputMode === 'stylus' && !(passiveActive && state.electedPointerId === event.pointerId)) {
    if (state.blockedTouchPointerIds.length > 0) return true;
    if (timeStamp - state.lastPalmUpAt < tuning.palmLatchMs) return true;
  }

  return isPalmContact(event, tuning);
}

export function reducePointerInput(
  inputState,
  event,
  inputMode = 'stylus',
  tuning = PALM_GUARD_DEFAULTS,
) {
  const contacts = updateContacts(inputState.contacts ?? {}, event, tuning);
  const verdict = classifyContacts(contacts, tuning, eventTime(event));
  // Android withdraws a contact it has decided was a palm as a cancel. That is
  // a verdict from the driver, better informed than anything computed up here.
  const osPalmIds = event.pointerType === 'touch' && event.phase === 'cancel'
    ? [event.pointerId]
    : [];
  const palmIds = [...new Set([...verdict.palmIds, ...osPalmIds])];
  const state = { ...inputState, contacts, electedPointerId: verdict.electedId };
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
  const classifierBlocked = [...new Set([...state.blockedTouchPointerIds, ...palmIds])];
  const blockedTouchPointerIds = !isTouch
    ? state.blockedTouchPointerIds
    : isRelease
      ? remove(classifierBlocked, event.pointerId)
      : blockedByPalmGuard && event.phase === 'down'
        ? addUnique(classifierBlocked, event.pointerId)
        : classifierBlocked;
  // Rejected contacts must not count toward the pinch: a palm plus the writing
  // finger is two pointers, and reading that as a gesture is how a rested hand
  // zooms the page out from under the stroke.
  const gestureTouchIds = touchPointerIds.filter(
    (id) => !blockedTouchPointerIds.includes(id),
  );
  // Two un-blocked touches are a deliberate gesture where every touch is a
  // finger. Without a digitizer the tip is a touch too, so the ordinary pair
  // there is the resting hand plus the pen — locking gestures on it freezes
  // writing for as long as the hand is down. Two only counts as a gesture start
  // when the pair actually moves like one; three or more is unambiguous either
  // way. Elsewhere this stays the plain "any two touches" rule.
  const passiveActive = tuning.passiveStylus && !state.sawPenPointer;
  const looksLikeGestureStart = passiveActive && inputMode === 'stylus'
    ? gestureTouchIds.length >= 3
      || (gestureTouchIds.length === 2 && isPinchPair(contacts, tuning))
    : gestureTouchIds.length >= 2;
  const gestureLocked = state.gestureLocked
    ? gestureTouchIds.length > 0
    : looksLikeGestureStart;
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
    retroBlockedPointerIds: palmIds.filter(
      (id) => !inputState.blockedTouchPointerIds.includes(id),
    ),
    sawPenPointer: state.sawPenPointer || event.pointerType === 'pen',
  };

  // The hand lands before the tip. When the contact that is currently drawing
  // turns out to be that hand, the only correct move is to take the stroke
  // back — deciding at pointerdown alone can never get this ordering right.
  if (state.drawingPointerId !== null && palmIds.includes(state.drawingPointerId)) {
    return {
      state: { ...nextState, drawingPointerId: null, drawingPointerType: null },
      intent: 'cancel-draw',
    };
  }

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
    // Where every touch is a finger, a second one is a deliberate gesture, so
    // the draft goes and gestures lock. But without a digitizer the tip is a
    // touch as well, and the hand landing beside it — or the tip landing beside
    // the hand — is the ordinary case this whole fallback exists for. Killing
    // the stroke there is the pen going dead the moment a palm touches down. So
    // when it does not look like a gesture and is not itself palm-sized, let it
    // take over the drawing slot instead.
    const passiveActive = tuning.passiveStylus && !state.sawPenPointer;
    if (
      passiveActive
      && inputMode === 'stylus'
      && !nextState.gestureLocked
      && !isPalmContact(event, tuning)
    ) {
      return {
        state: {
          ...nextState,
          drawingPointerId: event.pointerId,
          drawingPointerType: event.pointerType,
        },
        intent: 'replace-draw',
      };
    }
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
      || (
        isTouch
        && inputMode === 'stylus'
        && tuning.passiveStylus
        && !state.sawPenPointer
        && !gestureLocked
      )
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
