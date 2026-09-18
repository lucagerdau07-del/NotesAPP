// A page canvas is allocated at page size x zoom x dpr, so it costs zoom²
// pixels: the 3.6M pixels a page needs at 1x on a Galaxy Tab A7 become 32M at
// 3x, and a page carries two of those (PDF background plus ink). Measured on
// that tablet: 246MB of canvas at 3x, renderer RSS 730MB, CrRendererMain
// aborting on its allocation ceiling. Only a viewport's worth is ever on
// screen, so allocate a window around what is visible instead of the whole
// page, and the cost stops following the zoom.
//
// ponytail: 24MB per canvas is the calibration knob. Higher re-renders less
// often while scrolling zoomed in, lower saves memory. Picked so a page at
// zoom 1 on a 2x tablet screen (800x1130 CSS = 3.6M pixels) still fits whole
// and nothing about the 1x path changes at all.
export const PAGE_CANVAS_PIXEL_BUDGET = 6_000_000;

// Head-room on every side of what is on screen, as a share of the viewport, so
// an ordinary scroll stays inside the window that is already rendered.
const HEADROOM = 0.5;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// The part of a page that is on screen, in the page's own CSS pixels (which
// already include zoom). A page mounted ahead of the viewport collapses to an
// empty rect on the edge the viewport will reach first, so its window lands
// where the user is heading rather than at the page's top-left corner.
export function visiblePageRect(pageBox, viewport, pageWidth, pageHeight) {
  const left = clamp(-pageBox.left, 0, pageWidth);
  const top = clamp(-pageBox.top, 0, pageHeight);
  return {
    left,
    top,
    width: clamp(viewport.width - pageBox.left, 0, pageWidth) - left,
    height: clamp(viewport.height - pageBox.top, 0, pageHeight) - top,
  };
}

// The window to allocate for a page, in page CSS pixels. null means the whole
// page fits the budget and nothing has to be windowed — the 1x case, and every
// desktop case below a hard zoom.
export function pageCanvasWindow({
  pageBox,
  viewport,
  pageWidth,
  pageHeight,
  dpr,
  budget = PAGE_CANVAS_PIXEL_BUDGET,
}) {
  if (pageWidth * dpr * pageHeight * dpr <= budget) return null;

  const visible = visiblePageRect(pageBox, viewport, pageWidth, pageHeight);
  let width = Math.min(pageWidth, visible.width + viewport.width * HEADROOM * 2);
  let height = Math.min(pageHeight, visible.height + viewport.height * HEADROOM * 2);

  // Over budget: give back head-room first, and only what is off screen. A
  // window smaller than the visible rect would leave bare page next to it, so
  // past that point the resolution gives instead (see backingScale).
  const over = (width * dpr * height * dpr) / budget;
  if (over > 1) {
    const shrink = Math.sqrt(over);
    width = Math.max(visible.width, width / shrink);
    height = Math.max(visible.height, height / shrink);
  }

  const centerX = visible.left + visible.width / 2;
  const centerY = visible.top + visible.height / 2;
  return {
    left: clamp(centerX - width / 2, 0, pageWidth - width),
    top: clamp(centerY - height / 2, 0, pageHeight - height),
    width,
    height,
  };
}

// True while the window already rendered still covers everything on screen,
// i.e. while scrolling needs no new render at all.
export function windowCovers(current, visible) {
  if (!current) return false;
  const slack = 0.5; // Rounding only: the window is laid out in whole pixels.
  return (
    visible.left >= current.left - slack &&
    visible.top >= current.top - slack &&
    visible.left + visible.width <= current.left + current.width + slack &&
    visible.top + visible.height <= current.top + current.height + slack
  );
}

// Backing pixels per CSS pixel for a window: the device's own ratio, unless
// even the visible rect alone blows the budget at that ratio — a viewport
// larger than the budget — where resolution is the only thing left to give.
export function backingScale(region, dpr, budget = PAGE_CANVAS_PIXEL_BUDGET) {
  const pixels = region.width * dpr * region.height * dpr;
  return pixels <= budget ? dpr : dpr * Math.sqrt(budget / pixels);
}
