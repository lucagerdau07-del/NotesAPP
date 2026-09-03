import { describe, expect, it } from 'vitest';
import {
  PAGE_FORMATS,
  BACKGROUND_PRESETS,
  RULING_PRESETS,
  resolvePageStyle,
} from '../src/documents/pageStyles.js';

describe('resolvePageStyle', () => {
  it('defaults to the current app-wide look when nothing is specified', () => {
    expect(resolvePageStyle()).toEqual({
      kind: 'page',
      width: 800,
      height: 800 * 1.414,
      background: BACKGROUND_PRESETS.find((p) => p.id === 'dark').css,
      ruling: 'lined',
      linesRgb: '255,255,255',
    });
  });

  it('resolves a chosen format, background and ruling', () => {
    expect(
      resolvePageStyle({ pageKind: 'page', format: 'square', background: 'white', ruling: 'grid' }),
    ).toEqual({
      kind: 'page',
      width: PAGE_FORMATS.square.width,
      height: PAGE_FORMATS.square.height,
      background: '#FFFFFF',
      ruling: 'grid',
      linesRgb: '0,0,0',
    });
  });

  it('falls back to defaults for unknown ids instead of throwing', () => {
    const result = resolvePageStyle({ format: 'nope', background: 'nope', ruling: 'nope' });
    expect(result.width).toBe(PAGE_FORMATS['a4-portrait'].width);
    expect(result.ruling).toBe('lined');
  });

  it('returns just a whiteboard marker for pageKind "whiteboard"', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard', format: 'square' })).toEqual({
      kind: 'whiteboard',
    });
  });
});
