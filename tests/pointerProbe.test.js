import { describe, expect, it } from 'vitest';
import {
  createProbe,
  deriveProfileFromCalibration,
  recordSample,
  summarizeSamples,
} from '../src/ink/pointerProbe.js';

const sample = (label, size, pressure = 0) => ({
  label, phase: 'move', pointerId: 1, pointerType: 'touch',
  timeStamp: 1_000, width: size, height: size, pressure,
});

const fill = (label, sizes, pressure = 0) => {
  const probe = createProbe();
  for (const size of sizes) recordSample(probe, sample(label, size, pressure), label);
  return probe;
};

describe('pointer probe', () => {
  it('summarises contact sizes and reports whether the panel varies them', () => {
    const summary = summarizeSamples(fill('pen', [8, 9, 10, 11, 40]), 'pen');
    expect(summary.count).toBe(5);
    expect(summary.pointerTypes).toEqual(['touch']);
    expect(summary.sizeMin).toBe(8);
    expect(summary.sizeMax).toBe(40);
    expect(summary.sizeVaries).toBe(true);
  });

  it('flags a panel that reports one constant size for every contact', () => {
    const summary = summarizeSamples(fill('pen', [33, 33, 33, 33]), 'pen');
    expect(summary.sizeVaries).toBe(false);
  });

  it('ignores the placeholder size of 1 that means "unknown"', () => {
    const summary = summarizeSamples(fill('pen', [1, 1, 1]), 'pen');
    expect(summary.sizeSamples).toBe(0);
    expect(summary.sizeVaries).toBe(false);
  });

  it('derives thresholds between the pen and palm distributions', () => {
    const profile = deriveProfileFromCalibration(
      summarizeSamples(fill('pen', [8, 9, 10, 11, 12]), 'pen'),
      summarizeSamples(fill('palm', [50, 55, 60, 65, 70]), 'palm'),
    );
    expect(profile.geometryUsable).toBe(true);
    expect(profile.sizeChannel).toBe('geometry');
    expect(profile.penMaxPx).toBeGreaterThan(12);
    expect(profile.palmContactPx).toBeGreaterThan(profile.penMaxPx);
    expect(profile.palmContactPx).toBeLessThan(50);
  });

  it('refuses to derive thresholds when the distributions overlap', () => {
    const profile = deriveProfileFromCalibration(
      summarizeSamples(fill('pen', [30, 31, 32, 33]), 'pen'),
      summarizeSamples(fill('palm', [31, 32, 33, 34]), 'palm'),
    );
    expect(profile.geometryUsable).toBe(false);
    expect(profile.sizeChannel).toBe('none');
  });

  it('falls back to pressure when geometry is constant but pressure is not', () => {
    const pen = createProbe();
    for (const pressure of [0.08, 0.10, 0.12]) recordSample(pen, sample('pen', 33, pressure), 'pen');
    const palm = createProbe();
    for (const pressure of [0.70, 0.80, 0.90]) recordSample(palm, sample('palm', 33, pressure), 'palm');
    const profile = deriveProfileFromCalibration(
      summarizeSamples(pen, 'pen'),
      summarizeSamples(palm, 'palm'),
    );
    expect(profile.sizeChannel).toBe('pressure');
    expect(profile.geometryUsable).toBe(true);
  });
});
