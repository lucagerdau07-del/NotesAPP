// A passive capacitive stylus is, to the panel, a small finger: pointerType,
// hover, tilt and real pressure are all unavailable. The only question worth
// asking is which channel THIS panel actually varies between a tip, a
// fingertip and a palm — and that is a measurement, not a spec sheet reading.

export const PROBE_LIMIT = 4000;
// Pressure arrives normalised to 0..1. Mapping it onto a pixel-like scale lets
// one pair of thresholds serve both channels instead of doubling the profile.
export const PRESSURE_SCALE_PX = 60;
// Below this relative gap the two distributions are the same distribution, and
// a threshold between them is a coin flip dressed up as a guard.
export const MIN_SEPARATION_RATIO = 0.2;

export function createProbe() {
  return { samples: [], truncated: false };
}

// Mutates: this runs at pointer rate on a tablet, and copying a 4000-entry
// array per sample is how a diagnostic tool becomes the thing being diagnosed.
export function recordSample(probe, event, label = '') {
  if (probe.samples.length >= PROBE_LIMIT) {
    probe.truncated = true;
    return probe;
  }
  const number = (value) => (Number.isFinite(value) ? value : 0);
  probe.samples.push({
    label,
    phase: typeof event.phase === 'string' ? event.phase : '',
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    timeStamp: number(event.timeStamp),
    width: number(event.width),
    height: number(event.height),
    pressure: number(event.pressure),
    tiltX: number(event.tiltX),
    tiltY: number(event.tiltY),
    twist: number(event.twist),
  });
  return probe;
}

const quantile = (values, q) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round((sorted.length - 1) * q);
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))];
};

export function summarizeSamples(probe, label) {
  const rows = label
    ? probe.samples.filter((entry) => entry.label === label)
    : probe.samples;
  // A device with no contact geometry reports 1x1 for everything. That is
  // "unknown", not "tiny", so those samples must not enter the statistics.
  const sizes = rows
    .map((entry) => Math.max(entry.width, entry.height))
    .filter((value) => value > 1);
  const pressures = rows.map((entry) => entry.pressure).filter((value) => value > 0);
  return {
    count: rows.length,
    pointerTypes: [...new Set(rows.map((entry) => entry.pointerType))].sort(),
    sizeSamples: sizes.length,
    sizeMin: quantile(sizes, 0),
    sizeP10: quantile(sizes, 0.1),
    sizeP50: quantile(sizes, 0.5),
    sizeP90: quantile(sizes, 0.9),
    sizeMax: quantile(sizes, 1),
    sizeVaries: sizes.length > 0 && quantile(sizes, 1) - quantile(sizes, 0) > 1,
    pressureSamples: pressures.length,
    pressureP10: quantile(pressures, 0.1),
    pressureP50: quantile(pressures, 0.5),
    pressureP90: quantile(pressures, 0.9),
    pressureVaries:
      pressures.length > 0 && quantile(pressures, 0.9) - quantile(pressures, 0.1) > 0.01,
  };
}

export function deriveProfileFromCalibration(penSummary, palmSummary) {
  const channel =
    penSummary.sizeVaries && palmSummary.sizeVaries
      ? 'geometry'
      : penSummary.pressureVaries && palmSummary.pressureVaries
        ? 'pressure'
        : 'none';
  if (channel === 'none') {
    return { geometryUsable: false, sizeChannel: 'none', separation: 0 };
  }
  const pen =
    channel === 'geometry' ? penSummary.sizeP90 : penSummary.pressureP90 * PRESSURE_SCALE_PX;
  const palm =
    channel === 'geometry' ? palmSummary.sizeP10 : palmSummary.pressureP10 * PRESSURE_SCALE_PX;
  const separation = palm > 0 ? (palm - pen) / palm : 0;
  if (separation < MIN_SEPARATION_RATIO) {
    return { geometryUsable: false, sizeChannel: 'none', separation };
  }
  return {
    geometryUsable: true,
    sizeChannel: channel,
    // The candidate ceiling sits nearer the pen, the hard palm gate nearer the
    // palm: a tip misread as a palm loses the stroke, a palm misread as a tip
    // only loses the election to the smaller real tip.
    penMaxPx: Math.round(pen + (palm - pen) * 0.35),
    palmContactPx: Math.round(pen + (palm - pen) * 0.65),
    separation,
  };
}
