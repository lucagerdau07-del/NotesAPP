import { describe, expect, it } from 'vitest';
import { createInputState, reducePointerInput } from '../src/ink/inputPolicy.js';

const event = (phase, pointerId, pointerType) => ({ phase, pointerId, pointerType });

describe('pointer admission and ownership policy', () => {
  it('protects a pen stroke from palm move and release events', () => {
    let result = reducePointerInput(createInputState(), event('down', 7, 'pen'), 'stylus');
    expect(result.intent).toBe('start-draw');
    result = reducePointerInput(result.state, event('move', 9, 'touch'), 'stylus');
    expect(result.intent).toBe('navigate');
    result = reducePointerInput(result.state, event('up', 9, 'touch'), 'stylus');
    expect(result.state.drawingPointerId).toBe(7);
  });

  it('does not surrender a pen stroke when a palm goes down', () => {
    let result = reducePointerInput(createInputState(), event('down', 7, 'pen'), 'stylus');
    result = reducePointerInput(result.state, event('down', 9, 'touch'), 'stylus');
    expect(result.intent).toBe('navigate');
    expect(result.state.drawingPointerId).toBe(7);
    expect(result.state.touchPointerIds).toEqual([9]);
  });

  it('cancels an uncommitted finger stroke when a second touch begins', () => {
    let result = reducePointerInput(createInputState(), event('down', 1, 'touch'), 'finger');
    result = reducePointerInput(result.state, event('down', 2, 'touch'), 'finger');
    expect(result.intent).toBe('cancel-draw');
    expect(result.state.drawingPointerId).toBeNull();
    expect(result.state.touchPointerIds).toEqual([1, 2]);
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
});
