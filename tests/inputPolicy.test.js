import { describe, expect, it } from 'vitest';
import { createInputState, reducePointerInput } from '../src/ink/inputPolicy.js';

const event = (phase, pointerId, pointerType, timeStamp = 1_000) => ({
  phase, pointerId, pointerType, timeStamp,
});

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
});
