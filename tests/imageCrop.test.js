import { describe, expect, it } from "vitest";
import { dragCropEdge, sourceRect } from "../src/ink/imageCrop";

const image = { x: 100, y: 50, width: 400, height: 200, crop: null };
const natural = { width: 800, height: 400 };

describe("dragCropEdge", () => {
  it("cuts the right edge without squashing: box shrinks, crop window follows", () => {
    const patch = dragCropEdge(image, natural, "e", -100, 0);
    expect(patch).toMatchObject({ x: 100, y: 50, width: 300, height: 200 });
    expect(patch.crop.x).toBeCloseTo(0);
    expect(patch.crop.width).toBeCloseTo(0.75);
    expect(patch.crop.height).toBeCloseTo(1);
  });

  it("moving the left edge shifts the box and can pull the cut part back out", () => {
    const cut = { ...image, ...dragCropEdge(image, natural, "w", 100, 0) };
    expect(cut.x).toBe(200);
    expect(cut.crop.x).toBeCloseTo(0.25);
    const back = dragCropEdge(cut, natural, "w", -500, 0);
    // Clamped at the source's own left edge, not beyond.
    expect(back.x).toBeCloseTo(100);
    expect(back.crop.x).toBeCloseTo(0);
  });

  it("never grows past the source image", () => {
    const patch = dragCropEdge(image, natural, "s", 999, 0);
    expect(patch.height).toBeCloseTo(200);
  });

  it("treats a letterboxed box as image only where the image is", () => {
    const wide = { ...image, height: 400 };
    const src = sourceRect(wide, natural);
    expect(src.height).toBeCloseTo(200);
    expect(src.y).toBeCloseTo(100);
  });
});
