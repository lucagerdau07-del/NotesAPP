import { describe, expect, it } from "vitest";
import {
  clampDocOffsetX,
  pageLeftEdgeX,
  pinchAnchorX,
} from "../DocumentView.jsx";

const VIEWPORT = 800;

// Screen x of a point sitting `local` px into the page, measured in the page's
// own pixels at that zoom. Mirrors what the browser actually does: centered
// while the page fits, pinned flush left once it is wider (verified in Chrome).
function screenX({ local, pageWidth, offsetX }) {
  return pageLeftEdgeX(VIEWPORT, pageWidth) + offsetX + local;
}

describe("pageLeftEdgeX", () => {
  it("centers a fitting page and pins an overflowing one", () => {
    expect(pageLeftEdgeX(800, 400)).toBe(200);
    expect(pageLeftEdgeX(800, 800)).toBe(0);
    expect(pageLeftEdgeX(800, 1600)).toBe(0);
  });
});

describe("clampDocOffsetX", () => {
  it("lets a fitting page move either way by the slack only", () => {
    expect(clampDocOffsetX(9999, 800, 600)).toBe(200);
    expect(clampDocOffsetX(-9999, 800, 600)).toBe(-200);
  });

  it("opens up travel toward the hidden side when the page overflows", () => {
    // 1600px page in an 800px viewport: 800px hidden to the right, nothing to
    // the left, so only the leftward pull reaches new content.
    expect(clampDocOffsetX(-9999, 800, 1600)).toBe(-1000);
    expect(clampDocOffsetX(9999, 800, 1600)).toBe(200);
  });
});

describe("pinchAnchorX", () => {
  it("keeps the pinched point under the fingers", () => {
    for (const startPageWidth of [400, 794, 1600]) {
      for (const scale of [0.6, 1, 1.25, 2]) {
        for (const startOffsetX of [-120, 0, 90]) {
          for (const startCenterX of [90, 400, 720]) {
            for (const drag of [-60, 0, 60]) {
              const pageWidth = startPageWidth * scale;
              const local =
                startCenterX - pageLeftEdgeX(VIEWPORT, startPageWidth) - startOffsetX;
              const { offsetX } = pinchAnchorX({
                centerX: startCenterX + drag,
                startCenterX,
                startOffsetX,
                viewportWidth: VIEWPORT,
                startPageWidth,
                pageWidth,
              });
              // Only where the bounds are not the thing deciding the position.
              const slack = VIEWPORT * 0.25;
              const atBound =
                offsetX === slack ||
                offsetX === -Math.max(0, pageWidth - VIEWPORT) - slack;
              if (atBound) continue;
              expect(
                screenX({ local: local * scale, pageWidth, offsetX }),
              ).toBeCloseTo(startCenterX + drag, 6);
            }
          }
        }
      }
    }
  });

  it("holds an overflowing page still when the fingers do not move", () => {
    // The bug this covers: stepping the zoom up at 200% walked the page
    // sideways a little each time, because the edge was assumed to keep
    // sliding left past 0.
    const { offsetX } = pinchAnchorX({
      centerX: 400,
      startCenterX: 400,
      startOffsetX: -300,
      viewportWidth: VIEWPORT,
      startPageWidth: 1600,
      pageWidth: 1600,
    });
    expect(offsetX).toBeCloseTo(-300, 6);
  });

  it("previews exactly where it will commit", () => {
    const args = {
      centerX: 300,
      startCenterX: 250,
      startOffsetX: -200,
      viewportWidth: VIEWPORT,
      startPageWidth: 1600,
      pageWidth: 2000,
    };
    const { offsetX, translateX } = pinchAnchorX(args);
    const local = 640; // any point on the page, in start-zoom page pixels
    const scale = args.pageWidth / args.startPageWidth;
    const previewed =
      pageLeftEdgeX(VIEWPORT, args.startPageWidth) + translateX + local * scale;
    expect(previewed).toBeCloseTo(
      screenX({ local: local * scale, pageWidth: args.pageWidth, offsetX }),
      6,
    );
  });
});
