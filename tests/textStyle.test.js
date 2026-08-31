import { describe, expect, it } from 'vitest';
import {
  FONT_STACKS,
  baselineOffset,
  fontStackOf,
  rhythmOf,
  snapBaselineToRule,
  snapFontSize,
  snapTextToGrid,
} from '../src/ink/textStyle';

describe('text styling', () => {
  it('falls back to the first stack for an unknown font id', () => {
    expect(fontStackOf('mono')).toBe(FONT_STACKS[2].stack);
    expect(fontStackOf('nope')).toBe(FONT_STACKS[0].stack);
  });

  it('gives dotted and blank paper the lined and grid rhythms they lack', () => {
    expect(rhythmOf('lined').spacing).toBe(34);
    expect(rhythmOf('dotted').spacing).toBe(24);
    expect(rhythmOf('blank')).toEqual(rhythmOf('lined'));
    expect(rhythmOf('unknown')).toEqual(rhythmOf('lined'));
  });

  it('snaps a box to the nearest rule on every paper style', () => {
    for (const style of ['lined', 'grid', 'dotted', 'blank']) {
      const { spacing, offset } = rhythmOf(style);
      const snapped = snapTextToGrid({ y: offset + spacing * 3 + 5, height: spacing }, style);
      // The BASELINE lands on a rule — the box's bottom sits a descender's
      // worth (topPadding) below it, so it is deliberately not rule-aligned.
      const baseline = snapped.y + snapped.height - snapped.topPadding;
      expect((baseline - offset) % spacing).toBeCloseTo(0, 9);
      expect(snapped.lineHeight).toBe(spacing);
      expect(snapped.fontSize).toBe(snapFontSize(spacing));
    }
  });

  it('rounds the height to whole rows plus the baseline padding, honours lineStep', () => {
    const withRows = snapTextToGrid({ y: 92, height: 80 }, 'lined');
    const rows = (withRows.height - withRows.topPadding) / withRows.lineHeight;
    expect(rows).toBeCloseTo(Math.round(rows), 9);
    const wide = snapTextToGrid({ y: 92, height: 10, lineStep: 2 }, 'lined');
    expect(wide.lineHeight).toBe(68);
    expect(wide.height).toBeCloseTo(wide.lineHeight + wide.topPadding, 9);
    expect(wide.fontSize).toBeGreaterThan(snapFontSize(34));
  });

  it('leaves room for the baseline padding so the last row is never clipped', () => {
    // height must cover topPadding plus every row's own line-height, or a
    // fixed-height, overflow-hidden box crops the bottom row's descenders.
    const twoRows = snapTextToGrid({ y: 92, height: 68 }, 'lined');
    expect(twoRows.height).toBeCloseTo(2 * twoRows.lineHeight + twoRows.topPadding, 9);
  });

  it('puts the baseline inside the line box, below its centre', () => {
    const offsetInBox = baselineOffset(20, 34);
    expect(offsetInBox).toBeGreaterThan(17);
    expect(offsetInBox).toBeLessThan(34);
  });

  it('is idempotent: re-snapping an already-snapped box leaves it in place', () => {
    // A reselect or a zero-distance drag re-runs the snap on the box the way
    // it already is — it must not creep up a row every time that happens.
    const once = snapTextToGrid({ y: 150, height: 34 }, 'lined');
    const twice = snapTextToGrid({ y: once.y, height: once.height, lineStep: 1 }, 'lined');
    expect(twice.y).toBe(once.y);
    expect(twice.height).toBe(once.height);
  });

  it('re-targets the nearest rule to where a drag actually moved the box', () => {
    const start = snapTextToGrid({ y: 150, height: 34 }, 'lined');
    const draggedDown = snapTextToGrid({ y: start.y + 20, height: start.height }, 'lined');
    expect(draggedDown.y).toBeCloseTo(start.y + 34, 9);
  });

  it('advances agent text by whole rules so every line sits on one, not just the first', () => {
    // The regression this guards: line-height was fontSize * 1.35 (24px for
    // 18px text) against a 34px ruling, so only the first line could land on a
    // rule and each line below drifted another 10px off it.
    for (const fontSize of [18, 22, 28]) {
      const { spacing } = rhythmOf('lined');
      const { lineHeight } = snapBaselineToRule(200, fontSize, 'lined');
      expect(lineHeight % spacing).toBe(0);
    }
  });

  it('lands the first baseline on a rule, keeping the requested font size', () => {
    const { spacing, offset } = rhythmOf('lined');
    for (const fontSize of [18, 22, 28]) {
      const { y, lineHeight } = snapBaselineToRule(207, fontSize, 'lined');
      const baseline = y + baselineOffset(fontSize, lineHeight);
      expect((baseline - offset) % spacing).toBeCloseTo(0, 6);
    }
  });

  it('leaves blank paper alone: no rules to sit on', () => {
    expect(snapBaselineToRule(207, 18, 'blank').y).toBe(207);
  });

  it('keeps the top edge fixed when the box grows to a second row', () => {
    // Wrapping onto a new line grows height without moving where the box was
    // placed — only its bottom edge should move down to make room.
    const oneRow = snapTextToGrid({ y: 150, height: 34 }, 'lined');
    const twoRows = snapTextToGrid({ y: oneRow.y, height: oneRow.height + oneRow.lineHeight }, 'lined');
    expect(twoRows.y).toBeCloseTo(oneRow.y, 9);
    expect(twoRows.height).toBeCloseTo(oneRow.height + oneRow.lineHeight, 9);
  });
});
