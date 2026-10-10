import { fontStackOf } from "../ink/textStyle.js";

// Where each *line* of a wrapped text block actually lands. estimateTextHeight
// in tools.js answers "how tall is this block" — enough to stack blocks, but
// not enough to put a marker behind a line: a highlight drawn to the block's
// full width overshoots every short line and reads as a printed bar instead of
// a highlighter swipe. A Range over the laid-out text reports one rect per
// line box, which is the real thing rather than an average-glyph guess.

const AVERAGE_GLYPH_RATIO = 0.52;
// Glyphs occupy roughly this much of their line box; the rest is leading. The
// browser path measures the real band, this is the estimate's stand-in for it.
const GLYPH_BAND_RATIO = 1.15;

function estimateLines(text, width, fontSize, lineHeight) {
  const perLine = Math.max(1, Math.floor(width / (fontSize * AVERAGE_GLYPH_RATIO)));
  const band = Math.min(lineHeight, fontSize * GLYPH_BAND_RATIO);
  const leading = (lineHeight - band) / 2;
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    const rows = Math.max(1, Math.ceil(paragraph.length / perLine));
    for (let row = 0; row < rows; row += 1) {
      const chars = Math.min(perLine, Math.max(0, paragraph.length - row * perLine));
      lines.push({
        x: 0,
        y: lines.length * lineHeight + leading,
        width: chars === 0 ? 0 : Math.min(width, chars * fontSize * AVERAGE_GLYPH_RATIO),
        height: band,
      });
    }
  }
  return lines;
}

// getClientRects() reports one rect per *text fragment*, not per line: the
// space a line wraps on comes back as its own 5px rect at the same y, and an
// explicit newline adds a zero-width one. Rendered as markers those are
// visible blobs hanging off the line ends, so fragments sharing a line are
// merged back into the single box the caller is actually asking for.
export function mergeByLine(rects, lineHeight) {
  const merged = [];
  for (const rect of rects) {
    const sameLine = merged.find((line) => Math.abs(line.y - rect.y) < lineHeight / 2);
    if (!sameLine) {
      merged.push({ ...rect });
      continue;
    }
    const left = Math.min(sameLine.x, rect.x);
    const right = Math.max(sameLine.x + sameLine.width, rect.x + rect.width);
    sameLine.x = left;
    sameLine.width = right - left;
    sameLine.y = Math.min(sameLine.y, rect.y);
    sameLine.height = Math.max(sameLine.height, rect.height);
  }
  return merged.sort((a, b) => a.y - b.y);
}

/**
 * One box per rendered line, relative to the text block's top left, in page
 * pixels. Each box is the band the glyphs occupy, not the full line box, so a
 * marker drawn to it sits on the text rather than touching the line above.
 * Empty lines come back with width 0 so callers can skip them.
 */
export function measureTextLines(
  text,
  { width, fontSize, lineHeight, fontFamily, bold = false, italic = false } = {},
) {
  const resolvedHeight = lineHeight || fontSize * 1.4;
  const content = String(text ?? "");
  if (!content || typeof document === "undefined")
    return estimateLines(content, width, fontSize, resolvedHeight);

  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;` +
    `width:${width}px;font-size:${fontSize}px;font-family:${fontStackOf(fontFamily)};` +
    `font-weight:${bold ? 700 : 400};font-style:${italic ? "italic" : "normal"};` +
    `line-height:${resolvedHeight}px;`;
  host.appendChild(document.createTextNode(content));
  document.body.appendChild(host);

  let lines = [];
  try {
    const origin = host.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(host);
    // jsdom parses the CSS but runs no layout, and its Range has no
    // getClientRects at all — so this whole path is best-effort and the
    // character estimate below is the real answer outside a browser.
    const rects = range.getClientRects?.() ?? [];
    lines = [...rects].map((rect) => ({
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: rect.width,
      height: rect.height || resolvedHeight,
    }));
  } catch {
    lines = [];
  } finally {
    document.body.removeChild(host);
  }

  const laidOut = lines.some((line) => line.width > 0 || line.height > 0);
  return laidOut
    ? mergeByLine(lines, resolvedHeight)
    : estimateLines(content, width, fontSize, resolvedHeight);
}
