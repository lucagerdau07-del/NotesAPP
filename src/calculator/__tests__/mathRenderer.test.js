import { describe, it, expect } from 'vitest';
import { formatMathToText, renderMathCard } from '../mathRenderer.js';

describe('mathRenderer', () => {
  it('formats fraction and square root expression to text', () => {
    const items = [
      { type: 'frac', num: ['3'], den: ['4'] },
      '+',
      { type: 'sqrt', content: ['1', '6'] },
    ];
    const text = formatMathToText({
      items,
      numericResult: 4.75,
      fractionResult: { n: 19, d: 4 },
      isFractionMode: true,
    });
    expect(text).toBe('(3/4) + √(16) = 19/4');
  });

  it('formats decimal result when isFractionMode is false', () => {
    const items = [
      { type: 'frac', num: ['1'], den: ['2'] },
    ];
    const text = formatMathToText({
      items,
      resultText: '0.5',
      numericResult: 0.5,
      fractionResult: { n: 1, d: 2 },
      isFractionMode: false,
    });
    expect(text).toBe('(1/2) = 0.5');
  });

  it('formats power and integral in text', () => {
    const items = [
      { type: 'pow', base: ['2'], exp: ['3'] },
    ];
    const text = formatMathToText({
      items,
      resultText: '8',
      numericResult: 8,
    });
    expect(text).toBe('(2)^(3) = 8');
  });

  it('renders a canvas card dataUrl with width and height', () => {
    const items = [
      { type: 'frac', num: ['1'], den: ['2'] },
      '+',
      '3',
    ];
    const card = renderMathCard({
      items,
      numericResult: 3.5,
      fractionResult: { n: 7, d: 2 },
      isFractionMode: true,
    });

    expect(card).not.toBeNull();
    expect(card.width).toBeGreaterThan(50);
    expect(card.height).toBeGreaterThan(20);
    expect(card.dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
