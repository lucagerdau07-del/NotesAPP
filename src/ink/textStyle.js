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

// Where the baseline sits inside a line box is a font metric, not a constant:
// half-leading plus the font's ascent. Guessing it (we used fontSize * 0.8)
// lands 1.5-3px high and drifts with size, which is a visible miss against a
// 34px ruling — so measure the real thing once per font/size/weight and cache.
// The fallback ratio only applies where there is no DOM (tests, SSR).
const ASCENT_FALLBACK = 0.89;
const baselineCache = new Map();

function measureAscent(fontSize, stack, bold) {
  if (typeof document === "undefined") return fontSize * ASCENT_FALLBACK;
  const key = `${fontSize}|${stack}|${bold ? 1 : 0}`;
  const cached = baselineCache.get(key);
  if (cached !== undefined) return cached;
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre;` +
    `font-size:${fontSize}px;line-height:normal;font-family:${stack};font-weight:${bold ? 700 : 400};`;
  // A zero-size inline-block sits with its bottom edge exactly on the baseline.
  host.innerHTML = 'x<span style="display:inline-block;width:0;height:0"></span>';
  document.body.appendChild(host);
  const ascent =
    host.firstElementChild.getBoundingClientRect().bottom - host.getBoundingClientRect().top;
  document.body.removeChild(host);
  const value = Number.isFinite(ascent) && ascent > 0 ? ascent : fontSize * ASCENT_FALLBACK;
  baselineCache.set(key, value);
  return value;
}

// Distance from the top of a line box to the glyph baseline. Text sits ON the
// rule when the baseline meets it, not when the box top does.
export function baselineOffset(fontSize, lineHeight, fontFamily, bold) {
  const stack = fontStackOf(fontFamily);
  const ascent = measureAscent(fontSize, stack, bold);
  // line-height:normal is the font's own content height; the leading a taller
  // line box adds is split evenly above and below it.
  const natural = measureNaturalHeight(fontSize, stack, bold);
  return (lineHeight - natural) / 2 + ascent;
}

const naturalCache = new Map();

function measureNaturalHeight(fontSize, stack, bold) {
  if (typeof document === "undefined") return fontSize * 1.15;
  const key = `${fontSize}|${stack}|${bold ? 1 : 0}`;
  const cached = naturalCache.get(key);
  if (cached !== undefined) return cached;
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre;` +
    `font-size:${fontSize}px;line-height:normal;font-family:${stack};font-weight:${bold ? 700 : 400};`;
  host.textContent = "x";
  document.body.appendChild(host);
  const height = host.getBoundingClientRect().height;
  document.body.removeChild(host);
  const value = Number.isFinite(height) && height > 0 ? height : fontSize * 1.15;
  naturalCache.set(key, value);
  return value;
}

// Text keeps its own size (the agent's 28/22/18 hierarchy), but its lines must
// advance by a whole number of rules — otherwise only the first line can sit on
// the ruling and every line below it drifts by (spacing - lineHeight).
export function ruledLineHeight(fontSize, paperStyle) {
  const { spacing } = rhythmOf(paperStyle);
  return Math.max(1, Math.round((fontSize * 1.35) / spacing)) * spacing;
}

// For text that picks its own fontSize instead of locking to the ruling like
// snapTextToGrid does: keep the size, but give it a rule-multiple line height
// and shift y so the FIRST baseline lands on a rule — every following line then
// lands on one for free. "blank" paper has no rule to sit on, so it's left be.
export function snapBaselineToRule(y, fontSize, paperStyle, fontFamily, bold) {
  const lineHeight = ruledLineHeight(fontSize, paperStyle);
  if (paperStyle === "blank") return { y, lineHeight };
  const { spacing, offset } = rhythmOf(paperStyle);
  const baseline = baselineOffset(fontSize, lineHeight, fontFamily, bold);
  const snapped = offset + Math.round((y + baseline - offset) / spacing) * spacing;
  return { y: snapped - baseline, lineHeight };
}

export function snapFontSize(spacing, lineStep = 1) {
  return Math.max(6, Math.round(spacing * Math.max(1, lineStep) * CAP_RATIO));
}

// Snaps a text box onto the ruling: the box becomes exactly lineStep rules
// tall and its last BASELINE lands on the nearest rule, with y derived from
// that. Snapping the baseline — not the box's bottom edge, which sits a
// descender's worth below it — is what actually puts the glyphs on the rule
// the user sees. Deriving the target from the box (rather than the raw y) keeps
// it idempotent: an already-snapped box's baseline is already on a rule, so
// re-snapping it (a reselect, a nudge, a resize) leaves it exactly where it
// was instead of creeping a row every time it runs.
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
  // topPadding puts the first baseline exactly one row below the box top, so
  // the last one sits rows*rowHeight below it — that is the edge to snap, and
  // it is `topPadding` above the box's bottom.
  const lastBaseline = y + height - topPadding;
  const nearestRule = offset + Math.round((lastBaseline - offset) / spacing) * spacing;
  return {
    y: nearestRule - rows * rowHeight,
    fontSize,
    lineHeight: rowHeight,
    height: totalHeight,
    topPadding,
  };
}
