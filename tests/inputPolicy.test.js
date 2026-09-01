import { describe, expect, it } from 'vitest';
import {
  createInputState,
  PALM_GUARD_DEFAULTS,
  reducePointerInput,
} from '../src/ink/inputPolicy.js';
import { classifyContacts } from '../src/ink/contactClassifier.js';

const event = (phase, pointerId, pointerType, timeStamp = 1_000, size) => ({
  phase, pointerId, pointerType, timeStamp,
  ...(size === undefined ? {} : { width: size, height: size }),
});
const FINGER_PX = 20;
const PALM_PX = PALM_GUARD_DEFAULTS.palmContactPx + 10;

describe('pointer admission and ownership policy', () => {
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

  it('allows touch navigation in stylus mode', () => {
    const result = reducePointerInput(createInputState(), event('move', 4, 'touch'), 'stylus');
    expect(result.intent).toBe('navigate');
  });

  it('allows a mouse to own and continue a draw', () => {
    let result = reducePointerInput(createInputState(), event('down', 3, 'mouse'), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, event('move', 3, 'mouse'), 'stylus');
    expect(result.intent).toBe('continue-draw');
  });

  it('ignores a wrong pointer id while preserving the drawing owner', () => {
    let result = reducePointerInput(createInputState(), event('down', 3, 'pen'), 'stylus');
    result = reducePointerInput(result.state, event('move', 4, 'pen'), 'stylus');
    expect(result.intent).toBe('ignore');
    expect(result.state.drawingPointerId).toBe(3);
  });

  it('finishes only when the drawing owner lifts', () => {
    let result = reducePointerInput(createInputState(), event('down', 3, 'pen'), 'stylus');
    result = reducePointerInput(result.state, event('up', 3, 'pen'), 'stylus');
    expect(result.intent).toBe('finish-draw');
    expect(result.state.drawingPointerId).toBeNull();
  });

  it('cancels only when the drawing owner is cancelled', () => {
    let result = reducePointerInput(createInputState(), event('down', 3, 'pen'), 'stylus');
    result = reducePointerInput(result.state, event('cancel', 3, 'pen'), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.drawingPointerId).toBeNull();
  });

  it('removes touch pointers on up and cancel', () => {
    let result = reducePointerInput(createInputState(), event('down', 1, 'touch'), 'stylus');
    result = reducePointerInput(result.state, event('down', 2, 'touch'), 'stylus');
    result = reducePointerInput(result.state, event('up', 1, 'touch'), 'stylus');
    expect(result.state.touchPointerIds).toEqual([2]);
    result = reducePointerInput(result.state, event('cancel', 2, 'touch'), 'stylus');
    expect(result.state.touchPointerIds).toEqual([]);
  });

  it('aborts a finger draft without losing its still-active touch navigation state', () => {
    let result = reducePointerInput(createInputState(), event('down', 1, 'touch'), 'finger');
    result = reducePointerInput(result.state, event('abort', 1, 'touch'), 'finger');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.drawingPointerId).toBeNull();
    expect(result.state.touchPointerIds).toEqual([1]);

    result = reducePointerInput(result.state, event('down', 2, 'touch'), 'finger');
    expect(result.intent).toBe('navigate');
    expect(result.state.drawingPointerId).toBeNull();
  });

  it('rejects a wide contact patch and admits a fingertip-sized one', () => {
    let result = reducePointerInput(createInputState(), event('down', 1, 'touch', 1_000, PALM_PX), 'finger');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(createInputState(), event('down', 1, 'touch', 1_000, FINGER_PX), 'finger');
    expect(result.intent).toBe('start-draw');
  });

  it('treats a missing contact patch as unknown rather than as a palm', () => {
    // Panels without touch-major report 1x1 for everything; sizing must abstain.
    const result = reducePointerInput(createInputState(), event('down', 1, 'touch', 1_000, 1), 'finger');
    expect(result.intent).toBe('start-draw');
  });

  it('blocks a palm that lands before the pen tip, via hover proximity', () => {
    // Hover moves arrive while the pen is still off the glass and the hand is
    // already down — the pen-ownership guard alone would be too late here.
    let result = reducePointerInput(createInputState(), event('move', 7, 'pen', 1_000), 'stylus');
    expect(result.state.drawingPointerId).toBeNull();
    result = reducePointerInput(result.state, event('down', 9, 'touch', 1_100, FINGER_PX), 'stylus');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(result.state, event('up', 9, 'touch', 1_150, FINGER_PX), 'stylus');
    result = reducePointerInput(result.state, event('down', 10, 'touch', 1_700, FINGER_PX), 'stylus');
    expect(result.intent).toBe('navigate');
  });

  it('blocks the pinky riding next to a rejected palm in stylus mode', () => {
    // A real pen has been seen this session, so this is a digitizer device:
    // the passive-stylus fallback that would otherwise elect a small touch as
    // the writing candidate must stay off, and only the pen may ever draw.
    let result = reducePointerInput(createInputState(), event('down', 7, 'pen', 0), 'stylus');
    result = reducePointerInput(result.state, event('up', 7, 'pen', 50), 'stylus');
    result = reducePointerInput(result.state, event('down', 1, 'touch', 1_000, PALM_PX), 'stylus');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(result.state, event('down', 2, 'touch', 1_020, FINGER_PX), 'stylus');
    expect(result.intent).toBe('ignore');
  });

  it('keeps blocking briefly after the palm lifts, then releases the surface', () => {
    let result = reducePointerInput(createInputState(), event('down', 7, 'pen', 0), 'stylus');
    result = reducePointerInput(result.state, event('up', 7, 'pen', 50), 'stylus');
    result = reducePointerInput(result.state, event('down', 1, 'touch', 1_000, PALM_PX), 'stylus');
    result = reducePointerInput(result.state, event('up', 1, 'touch', 1_100, PALM_PX), 'stylus');
    result = reducePointerInput(result.state, event('down', 2, 'touch', 1_200, FINGER_PX), 'stylus');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(result.state, event('up', 2, 'touch', 1_250, FINGER_PX), 'stylus');
    result = reducePointerInput(result.state, event('down', 3, 'touch', 1_600, FINGER_PX), 'stylus');
    expect(result.intent).toBe('navigate');
  });

  it('keeps touch usable right after a pen pan in move mode', () => {
    // The pen pans there instead of writing, so its guards would only cost gestures.
    let result = reducePointerInput(createInputState(), event('up', 7, 'pen', 1_000), 'move');
    result = reducePointerInput(result.state, event('down', 9, 'touch', 1_005, FINGER_PX), 'move');
    expect(result.intent).toBe('navigate');
  });

  it('does not let one rejected palm lock out the writing finger in finger mode', () => {
    let result = reducePointerInput(createInputState(), event('down', 1, 'touch', 1_000, PALM_PX), 'finger');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(result.state, event('down', 2, 'touch', 1_020, FINGER_PX), 'finger');
    expect(result.intent).toBe('start-draw');
  });
});

const contact = (phase, pointerId, { size = 0, x = 0, y = 0, timeStamp = 1_000 } = {}) => ({
  phase, pointerId, pointerType: 'touch', timeStamp,
  width: size, height: size, clientX: x, clientY: y,
});

describe('passive stylus admission', () => {
  it('lets the elected contact draw in stylus mode on a device with no pen', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 60, x: 10, y: 10 }), 'stylus');
    expect(result.intent).toBe('ignore');
    result = reducePointerInput(result.state, contact('down', 2, { size: 9, x: 300, y: 300, timeStamp: 1_050 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    expect(result.state.drawingPointerId).toBe(2);
    expect(result.state.blockedTouchPointerIds).toContain(1);
  });

  it('cancels the palm stroke and names it for retroactive removal', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 30, x: 10, y: 10 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, contact('down', 2, { size: 8, x: 40, y: 40, timeStamp: 1_050 }), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.retroBlockedPointerIds).toContain(1);
  });

  it('treats an OS pointer cancel on a touch as a palm verdict', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 20 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, contact('cancel', 1, { size: 20, timeStamp: 1_020 }), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.retroBlockedPointerIds).toContain(1);
  });

  it('condemns a contact that has rested past the resting window', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 20, x: 5, y: 5 }), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, contact('move', 1, { size: 20, x: 6, y: 5, timeStamp: 1_400 }), 'stylus');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.retroBlockedPointerIds).toContain(1);
  });

  it('keeps the real pen path in charge once a pen pointer has been seen', () => {
    let result = reducePointerInput(createInputState(), event('down', 7, 'pen', 1_000), 'stylus');
    expect(result.state.sawPenPointer).toBe(true);
    result = reducePointerInput(result.state, event('up', 7, 'pen', 1_100), 'stylus');
    result = reducePointerInput(result.state, contact('down', 1, { size: 8, timeStamp: 5_000 }), 'stylus');
    expect(result.intent).toBe('navigate');
    expect(result.state.drawingPointerId).toBe(null);
  });

  it('still admits a two-finger pinch in stylus mode', () => {
    let result = reducePointerInput(createInputState(), contact('down', 1, { size: 20, x: 100, y: 100 }), 'stylus');
    result = reducePointerInput(result.state, contact('down', 2, { size: 22, x: 400, y: 300, timeStamp: 1_020 }), 'stylus');
    expect(result.state.blockedTouchPointerIds).toEqual([]);
    expect(result.state.gestureLocked).toBe(true);
  });

  it('lets the stylus start writing right after a resting palm on a panel that reports no usable contact size', () => {
    // The panel this bug was reported on reports the same contact size for
    // every touch, so geometry can never single out the pen tip — only
    // ordering and the palm's own resting timeout can. The hand always lands
    // first and stays close to the pen, so this is the ordinary case, not an
    // edge case.
    const tuning = { ...PALM_GUARD_DEFAULTS, sizeChannel: 'none', geometryUsable: false };
    let result = reducePointerInput(createInputState(), contact('down', 1, { x: 100, y: 100, timeStamp: 1_000 }), 'stylus', tuning);
    expect(result.intent).toBe('start-draw');
    // The hand settles rather than travelling, but not long enough yet to be
    // classified as resting.
    result = reducePointerInput(result.state, contact('move', 1, { x: 101, y: 100, timeStamp: 1_050 }), 'stylus', tuning);

    // The pen touches down close to the resting hand — not a pinch, and its
    // own geometry looks exactly like the palm's, since this panel reports
    // nothing usable at all.
    result = reducePointerInput(result.state, contact('down', 2, { x: 130, y: 100, timeStamp: 1_060 }), 'stylus', tuning);
    expect(result.intent).toBe('replace-draw');
    expect(result.state.drawingPointerId).toBe(2);
    expect(result.state.gestureLocked).toBe(false);

    result = reducePointerInput(result.state, contact('move', 2, { x: 160, y: 100, timeStamp: 1_080 }), 'stylus', tuning);
    expect(result.intent).toBe('continue-draw');
  });

  it('keeps the pen elected against a palm that has been drifting on the glass for seconds', () => {
    // Reported from the device: the palm draws the occasional line while the
    // pen writing next to it produces nothing. A resting hand is never
    // perfectly still — its contact centroid wanders a couple of px per frame
    // — so over a few seconds it accumulates far more travel than any single
    // pen stroke does. Electing on lifetime travel therefore hands the tip
    // slot to whichever contact has been down longest, which is always the
    // hand. The pen must win on how fast it is moving now, not on how far it
    // has come.
    const tuning = { ...PALM_GUARD_DEFAULTS, sizeChannel: 'none', geometryUsable: false };
    let result = reducePointerInput(createInputState(), contact('down', 1, { x: 100, y: 100, timeStamp: 0 }), 'stylus', tuning);

    // The hand settles as it takes weight: the contact patch reshapes and its
    // centroid travels well past the resting threshold inside the first frames,
    // so the resting timeout never gets to fire on it.
    let x = 100;
    for (let step = 1; step <= 6; step += 1) {
      x += 6;
      result = reducePointerInput(result.state, contact('move', 1, { x, y: 100, timeStamp: step * 16 }), 'stylus', tuning);
    }
    for (let step = 1; step <= 50; step += 1) {
      x += step % 2 === 0 ? 2 : -2;
      result = reducePointerInput(result.state, contact('move', 1, { x, y: 100, timeStamp: 200 + step * 200 }), 'stylus', tuning);
    }

    result = reducePointerInput(result.state, contact('down', 2, { x: 400, y: 400, timeStamp: 10_100 }), 'stylus', tuning);
    expect(result.state.drawingPointerId).toBe(2);

    for (let step = 1; step <= 4; step += 1) {
      result = reducePointerInput(
        result.state,
        contact('move', 2, { x: 400 + step * 30, y: 400, timeStamp: 10_100 + step * 16 }),
        'stylus',
        tuning,
      );
    }
    expect(result.state.blockedTouchPointerIds).not.toContain(2);
    expect(result.intent).toBe('continue-draw');
  });

  it('lets the pen write beside a parked hand on a panel whose palm never reads palm-sized', () => {
    // Measured on the device this was reported from: every contact, hand or
    // tip, reports between 1.3 and 17.3 px. Nothing there ever reaches
    // palmContactPx, so the size guard that is meant to keep a hand out of the
    // pinch test cannot fire — with or without calibration. A hand parked at
    // the edge of the screen is then simply "a contact far away from the other
    // one", which is all that is left of the pinch test.
    const size = 5;
    let result = reducePointerInput(createInputState(), contact('down', 1, { size, x: 700, y: 900, timeStamp: 0 }), 'stylus');
    // The hand takes weight before it settles, so it travels past the resting
    // threshold in the first frames and the resting timeout never fires on it.
    for (let step = 1; step <= 4; step += 1) {
      result = reducePointerInput(result.state, contact('move', 1, { size, x: 700 + step * 6, y: 900, timeStamp: step * 16 }), 'stylus');
    }
    for (let step = 1; step <= 20; step += 1) {
      result = reducePointerInput(result.state, contact('move', 1, { size, x: 724, y: 900, timeStamp: 64 + step * 100 }), 'stylus');
    }

    result = reducePointerInput(result.state, contact('down', 2, { size, x: 200, y: 300, timeStamp: 2_100 }), 'stylus');
    for (let step = 1; step <= 4; step += 1) {
      result = reducePointerInput(
        result.state,
        contact('move', 2, { size, x: 200 + step * 25, y: 300, timeStamp: 2_100 + step * 16 }),
        'stylus',
      );
    }
    expect(result.state.blockedTouchPointerIds).not.toContain(2);
    expect(result.intent).toBe('continue-draw');
  });
});
