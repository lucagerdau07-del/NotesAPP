// Text objects carry their own typography, and optionally lock onto the paper's
// ruling. The rhythm below mirrors the CSS backgrounds DocumentView paints, so
// a snapped line of text lands on the same pixels the user sees ruled.

export const FONT_STACKS = [
  { id: "sans", name: "Sans", stack: "system-ui, -apple-system, Segoe UI, sans-serif" },
  { id: "serif", name: "Serif", stack: "Iowan Old Style, Palatino, Georgia, serif" },
  { id: "mono", name: "Mono", stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { id: "hand", name: "Handschrift", stack: "Segoe Script, Bradley Hand, Chalkboard, cursive" },
  { id: "round", name: "Rund", stack: "Trebuchet MS, Verdana, Avenir, sans-serif" },
];

export const DEFAULT_FONT = "sans";

export function fontStackOf(fontFamily) {
  const match = FONT_STACKS.find((font) => font.id === fontFamily);
  return (match || FONT_STACKS[0]).stack;
}

// spacing/offset in page units, straight from getStaticBackgroundStyles().
// "blank" and "dotted" have no horizontal rules to sit on, so they borrow the
// lined rhythm — the whole point of the mode is writing straight without them.
export const PAPER_RHYTHM = {
  lined: { spacing: 34, offset: 92 },
  grid: { spacing: 24, offset: 92 },
  dotted: { spacing: 24, offset: 92 },
  blank: { spacing: 34, offset: 92 },
};

export function rhythmOf(paperStyle) {
  return PAPER_RHYTHM[paperStyle] || PAPER_RHYTHM.lined;
}

// A text line as tall as the ruling would touch the rules above and below it,
// so glyphs get this fraction of the row and the rest is breathing room.
const CAP_RATIO = 0.62;

// Distance from the top of a line box to the glyph baseline. Text sits ON the
// rule when the baseline meets it, not when the box top does.
export function baselineOffset(fontSize, lineHeight) {
  return (lineHeight - fontSize) / 2 + fontSize * 0.8;
}

export function snapFontSize(spacing, lineStep = 1) {
  return Math.max(6, Math.round(spacing * Math.max(1, lineStep) * CAP_RATIO));
}

// Snaps a text box onto the ruling: the box becomes exactly lineStep rules
// tall, its BOTTOM edge lands on the nearest rule, and y is derived from that.
// Snapping off the bottom edge (not the raw y) makes this idempotent — an
// already-snapped box's bottom is already on a rule, so re-snapping it (a
// reselect, a nudge, a resize) leaves it exactly where it was instead of
// creeping up one more row every time it runs.
export function snapTextToGrid(object, paperStyle) {
  const { spacing, offset } = rhythmOf(paperStyle);
  const step = Math.max(1, Math.round(object?.lineStep || 1));
  const rowHeight = spacing * step;
  const fontSize = snapFontSize(spacing, step);
  // The first line needs this much top padding to push its baseline down onto
  // the rule at its row's bottom edge (see baselineOffset) — every line below
  // it inherits the same downward shift for free, so it's added once, not
  // once per row. But it does make the box that much taller than rows*rowHeight,
  // and any height calc that forgets it clips the last row's descenders.
  const topPadding = rowHeight - baselineOffset(fontSize, rowHeight);
  const y = object?.y ?? 0;
  const height = object?.height ?? rowHeight;
  const rows = Math.max(1, Math.round(Math.abs(height - topPadding) / rowHeight));
  // The box's own total height, not one row — a 2-row box's top sits two
  // rows above its bottom rule, not one, or every extra row it grows would
  // leave its top edge a row short of where a top-anchored box belongs.
  const totalHeight = rows * rowHeight + topPadding;
  const bottom = y + height;
  const nearestRule = offset + Math.round((bottom - offset) / spacing) * spacing;
  return {
    y: nearestRule - totalHeight,
    fontSize,
    lineHeight: rowHeight,
    height: totalHeight,
    topPadding,
  };
}
