import { describe, expect, it } from "vitest";
import {
  PAGE_CANVAS_PIXEL_BUDGET,
  backingScale,
  pageCanvasWindow,
  visiblePageRect,
  windowCovers,
} from "../src/components/document/pageCanvasSlice.js";

// A Galaxy Tab A7 in landscape: 1000x600 CSS at dpr 2.
const viewport = { width: 1000, height: 600 };
const dpr = 2;
const box = (left, top) => ({ left, top });

describe("pageCanvasWindow", () => {
  it("leaves a page that fits the budget unwindowed", () => {
    // 800x1130 CSS at dpr 2 is 3.6M pixels: the 1x path, unchanged.
    expect(
      pageCanvasWindow({
        pageBox: box(0, 0),
        viewport,
        pageWidth: 800,
        pageHeight: 1130,
        dpr,
      }),
    ).toBeNull();
  });

  it("keeps a zoomed page inside the budget and covers what is on screen", () => {
    const pageWidth = 800 * 3;
    const pageHeight = 1130 * 3;
    const pageBox = box(-500, -2000); // scrolled into the middle of the page
    const region = pageCanvasWindow({ pageBox, viewport, pageWidth, pageHeight, dpr });

    expect(region.width * dpr * region.height * dpr).toBeLessThanOrEqual(
      PAGE_CANVAS_PIXEL_BUDGET,
    );
    expect(backingScale(region, dpr)).toBe(dpr); // still full resolution
    const visible = visiblePageRect(pageBox, viewport, pageWidth, pageHeight);
    expect(visible.width).toBeGreaterThan(0);
    expect(windowCovers(region, visible)).toBe(true);
  });

  it("stays inside the page and lands ahead of a page scrolled past the viewport", () => {
    const pageWidth = 800 * 3;
    const pageHeight = 1130 * 3;
    // Mounted eagerly, entirely above the viewport: the window belongs at the
    // bottom edge, which is what the user reaches first on the way back.
    const pageBox = box(0, -9000);
    const region = pageCanvasWindow({ pageBox, viewport, pageWidth, pageHeight, dpr });

    expect(region.left).toBeGreaterThanOrEqual(0);
    expect(region.top + region.height).toBeCloseTo(pageHeight, 5);
  });

  it("gives up resolution only when the visible rect alone blows the budget", () => {
    const huge = { width: 4000, height: 3000 };
    const region = pageCanvasWindow({
      pageBox: box(0, 0),
      viewport: huge,
      pageWidth: 8000,
      pageHeight: 6000,
      dpr,
    });
    expect(region.width).toBeCloseTo(huge.width, 5);
    expect(backingScale(region, dpr)).toBeLessThan(dpr);
    const pixels = region.width * region.height * backingScale(region, dpr) ** 2;
    expect(pixels).toBeLessThanOrEqual(PAGE_CANVAS_PIXEL_BUDGET + 1);
  });
});

describe("windowCovers", () => {
  it("is false once the viewport leaves the rendered window", () => {
    const region = { left: 0, top: 0, width: 800, height: 800 };
    expect(windowCovers(region, { left: 0, top: 100, width: 800, height: 600 })).toBe(true);
    expect(windowCovers(region, { left: 0, top: 400, width: 800, height: 600 })).toBe(false);
    expect(windowCovers(null, { left: 0, top: 0, width: 1, height: 1 })).toBe(false);
  });
});
