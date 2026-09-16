import { describe, it, expect } from 'vitest';
import {
  evaluateCasioExpression,
  handleCasioKeyPress,
  createCasioState,
  toFraction,
} from '../casioEngine.js';

describe('casioEngine evaluation', () => {
  it('evaluates basic arithmetic', () => {
    const { value, error } = evaluateCasioExpression(['2', '+', '3', '×', '4']);
    expect(error).toBeNull();
    expect(value).toBe(14);
  });

  it('evaluates division and parentheses', () => {
    const { value, error } = evaluateCasioExpression(['(', '1', '0', '+', '5', ')', '÷', '3']);
    expect(error).toBeNull();
    expect(value).toBe(5);
  });

  it('evaluates powers and roots', () => {
    const r1 = evaluateCasioExpression(['2', '^', '(', '3', ')']);
    expect(r1.value).toBe(8);

    const r2 = evaluateCasioExpression(['√(', '1', '6', ')']);
    expect(r2.value).toBe(4);

    const r3 = evaluateCasioExpression(['5', '²']);
    expect(r3.value).toBe(25);
  });

  it('evaluates trigonometry in DEG mode', () => {
    const r1 = evaluateCasioExpression(['sin(', '9', '0', ')'], { angleMode: 'DEG' });
    expect(r1.value).toBe(1);

    const r2 = evaluateCasioExpression(['cos(', '0', ')'], { angleMode: 'DEG' });
    expect(r2.value).toBe(1);

    const r3 = evaluateCasioExpression(['cos(', '9', '0', ')'], { angleMode: 'DEG' });
    expect(r3.value).toBe(0);
  });

  it('evaluates trigonometry in RAD mode', () => {
    const r1 = evaluateCasioExpression(['sin(', 'π', '÷', '2', ')'], { angleMode: 'RAD' });
    expect(r1.value).toBe(1);
  });

  it('handles Ans variable', () => {
    const r = evaluateCasioExpression(['Ans', '+', '5'], { lastAnswer: 10 });
    expect(r.value).toBe(15);
  });

  it('handles division by zero', () => {
    const r = evaluateCasioExpression(['5', '÷', '0']);
    expect(r.error).toBe('Math ERROR');
  });

  it('converts fractions correctly', () => {
    expect(toFraction(0.5)).toEqual({ n: 1, d: 2 });
    expect(toFraction(0.75)).toEqual({ n: 3, d: 4 });
    expect(toFraction(0.2)).toEqual({ n: 1, d: 5 });
    expect(toFraction(2.5)).toEqual({ n: 5, d: 2 });
  });

  it('handles state progression with keys', () => {
    let state = createCasioState();
    state = handleCasioKeyPress(state, 'NUM_9');
    state = handleCasioKeyPress(state, 'PLUS');
    state = handleCasioKeyPress(state, 'NUM_6');
    state = handleCasioKeyPress(state, 'EQUALS');
    expect(state.numericResult).toBe(15);
    expect(state.resultText).toBe('15');

    // S<=>D toggle
    state = handleCasioKeyPress(state, 'AC');
    state = handleCasioKeyPress(state, 'NUM_1');
    state = handleCasioKeyPress(state, 'DIV');
    state = handleCasioKeyPress(state, 'NUM_2');
    state = handleCasioKeyPress(state, 'EQUALS');
    expect(state.numericResult).toBe(0.5);

    state = handleCasioKeyPress(state, 'SD');
    expect(state.resultText).toBe('1 ⌟ 2');
    state = handleCasioKeyPress(state, 'SD');
    expect(state.resultText).toBe('0.5');
  });
});
