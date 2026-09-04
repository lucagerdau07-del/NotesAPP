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
      lineOpacity: 0.07,
      gridOpacity: 0.065,
      inkColor: '#EFECE4',
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
      lineOpacity: 0.16,
      gridOpacity: 0.14,
      inkColor: '#1A1A1A',
    });
  });

  it('picks a readable default ink color for the chosen background', () => {
    expect(resolvePageStyle({ background: 'white' }).inkColor).toBe('#1A1A1A');
  });

  it('falls back to defaults for unknown ids instead of throwing', () => {
    const result = resolvePageStyle({ format: 'nope', background: 'nope', ruling: 'nope' });
    expect(result.width).toBe(PAGE_FORMATS['a4-portrait'].width);
    expect(result.ruling).toBe('lined');
  });

  it('ignores format for pageKind "whiteboard" and resolves a whiteboard style', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard', format: 'square' })).toEqual({
      kind: 'whiteboard',
      background: BACKGROUND_PRESETS.find((p) => p.id === 'dark').css,
      inkColor: '#EFECE4',
    });
  });

  it('resolves a background for a whiteboard too', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard', background: 'white' })).toEqual({
      kind: 'whiteboard',
      background: '#FFFFFF',
      inkColor: '#1A1A1A',
    });
  });

  it('defaults the whiteboard background to dark when none is chosen', () => {
    expect(resolvePageStyle({ pageKind: 'whiteboard' })).toEqual({
      kind: 'whiteboard',
      background: BACKGROUND_PRESETS.find((p) => p.id === 'dark').css,
      inkColor: '#EFECE4',
    });
  });
});
