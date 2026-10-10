import { describe, it, expect } from "vitest";
import { createPageObject, hitTestObject, isPointInsideObject } from "../../src/ink/pageObjects.js";

describe("pageObjects rotation", () => {
  it("normalizes rotation property between 0 and 360", () => {
    expect(createPageObject({ type: "image", rotation: 45 }).rotation).toBe(45);
    expect(createPageObject({ type: "image", rotation: 370 }).rotation).toBe(10);
    expect(createPageObject({ type: "image", rotation: -30 }).rotation).toBe(330);
    expect(createPageObject({ type: "image" }).rotation).toBe(0);
  });

  it("hit-tests rotated rectangle correctly", () => {
    // 100x100 rect centered at (100, 100), rotated 45 degrees
    const rect = createPageObject({
      type: "rect",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 45,
      fillColor: "#ff0000",
    });

    // Center is (100, 100) -> should hit
    expect(hitTestObject(rect, 100, 100)).toBe(true);

    // Unrotated top-left corner was (50, 50). Rotated 45 deg, point (50, 50) is outside the diamond!
    expect(hitTestObject(rect, 50, 50)).toBe(false);

    // The top apex of the 45-deg diamond is at (100, 100 - 50 * sqrt(2)) ~ (100, 29.3) -> should hit
    expect(hitTestObject(rect, 100, 32)).toBe(true);
  });

  it("checks isPointInsideObject for rotated shapes correctly", () => {
    const rect = createPageObject({
      type: "rect",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 45,
    });

    expect(isPointInsideObject(rect, 100, 100)).toBe(true);
    expect(isPointInsideObject(rect, 50, 50)).toBe(false);
    expect(isPointInsideObject(rect, 100, 32)).toBe(true);
  });
});
