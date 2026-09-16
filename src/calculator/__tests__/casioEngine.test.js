import { describe, it, expect } from 'vitest';
import {
  evaluateCasioTree,
  handleCasioKeyPress,
  createCasioState,
  toFraction,
} from '../casioEngine.js';

describe('casioEngine Natural V.P.A.M. evaluation', () => {
  it('evaluates basic arithmetic in tree', () => {
    const { value, error } = evaluateCasioTree(['2', '+', '3', '×', '4']);
    expect(error).toBeNull();
    expect(value).toBe(14);
  });

  it('evaluates division and parentheses', () => {
    const { value, error } = evaluateCasioTree(['(', '1', '0', '+', '5', ')', '÷', '3']);
    expect(error).toBeNull();
    expect(value).toBe(5);
  });

  it('evaluates natural fraction node', () => {
    const fracNode = {
      type: 'frac',
      id: 'f1',
      num: ['3'],
      den: ['4'],
    };
    const { value, error } = evaluateCasioTree([fracNode]);
    expect(error).toBeNull();
    expect(value).toBe(0.75);
  });

  it('evaluates natural square root node', () => {
    const sqrtNode = {
      type: 'sqrt',
      id: 's1',
      content: ['1', '6'],
    };
    const { value, error } = evaluateCasioTree([sqrtNode]);
    expect(error).toBeNull();
    expect(value).toBe(4);
  });

  it('evaluates natural power node', () => {
    const powNode = {
      type: 'pow',
      id: 'p1',
      base: ['2'],
      exp: ['3'],
    };
    const { value, error } = evaluateCasioTree([powNode]);
    expect(error).toBeNull();
    expect(value).toBe(8);
  });

  it('evaluates natural integral node', () => {
    const intNode = {
      type: 'integral',
      id: 'i1',
      integrand: ['2', '×', 'x'],
      lower: ['0'],
      upper: ['1'],
    };
    const { value, error } = evaluateCasioTree([intNode]);
    expect(error).toBeNull();
    expect(Math.round(value)).toBe(1);
  });

  it('handles fraction key press and navigation', () => {
    let state = createCasioState();
    // Press FRAC
    state = handleCasioKeyPress(state, 'FRAC');
    expect(state.items.length).toBe(1);
    expect(state.items[0].type).toBe('frac');
    expect(state.cursorTarget.slot).toBe('num');

    // Type 1 in numerator
    state = handleCasioKeyPress(state, 'NUM_1');
    expect(state.items[0].num).toEqual(['1']);

    // Move to denominator with D_DOWN
    state = handleCasioKeyPress(state, 'D_DOWN');
    expect(state.cursorTarget.slot).toBe('den');

    // Type 2 in denominator
    state = handleCasioKeyPress(state, 'NUM_2');
    expect(state.items[0].den).toEqual(['2']);

    // Evaluate
    state = handleCasioKeyPress(state, 'EQUALS');
    expect(state.numericResult).toBe(0.5);
    expect(state.fractionResult).toEqual({ n: 1, d: 2 });
    expect(state.isFractionMode).toBe(true);
    expect(state.resultText).toBe('1/2');

    // S<=>D toggle to decimal
    state = handleCasioKeyPress(state, 'SD');
    expect(state.isFractionMode).toBe(false);
    expect(state.resultText).toBe('0.5');

    // S<=>D toggle back to fraction
    state = handleCasioKeyPress(state, 'SD');
    expect(state.isFractionMode).toBe(true);
    expect(state.resultText).toBe('1/2');
    expect(state.fractionResult).toEqual({ n: 1, d: 2 });
  });

  it('handles square root key press and evaluation', () => {
    let state = createCasioState();
    state = handleCasioKeyPress(state, 'SQRT');
    expect(state.items[0].type).toBe('sqrt');
    state = handleCasioKeyPress(state, 'NUM_9');
    state = handleCasioKeyPress(state, 'EQUALS');
    expect(state.numericResult).toBe(3);
  });

  it('handles power key press and evaluation', () => {
    let state = createCasioState();
    state = handleCasioKeyPress(state, 'NUM_5');
    state = handleCasioKeyPress(state, 'POW');
    expect(state.items[0].type).toBe('pow');
    expect(state.items[0].base).toEqual(['5']);
    state = handleCasioKeyPress(state, 'NUM_2');
    state = handleCasioKeyPress(state, 'EQUALS');
    expect(state.numericResult).toBe(25);
  });
});
