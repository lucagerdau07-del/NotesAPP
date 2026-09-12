import { describe, expect, it } from "vitest";
import { measureTextLines, mergeByLine } from "../src/agent/textMetrics";

// getClientRects() reports one rect per text fragment, so a wrapped line comes
// back as the words plus a separate sliver for the space it wrapped on, both at
// the same y. Drawn as markers those slivers are visible blobs hanging off the
// line ends — jsdom never produces them, so this is the browser's shape of the
// input, written out by hand.
describe("mergeByLine", () => {
  it("merges fragments that share a line into one box", () => {
    const merged = mergeByLine(
      [
        { x: 0, y: 2, width: 228, height: 21 },
        { x: 228, y: 2, width: 5.7, height: 21 },
        { x: 0, y: 28, width: 235, height: 21 },
        { x: 235, y: 28, width: 5.7, height: 21 },
      ],
      26,
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ x: 0, y: 2, width: 233.7 });
    expect(merged[1].y).toBe(28);
  });

  it("keeps lines apart that are a full line height from each other", () => {
    const merged = mergeByLine(
      [
        { x: 0, y: 0, width: 100, height: 21 },
        { x: 0, y: 26, width: 100, height: 21 },
        { x: 0, y: 52, width: 100, height: 21 },
      ],
      26,
    );
    expect(merged).toHaveLength(3);
  });

  it("returns lines top to bottom", () => {
    const merged = mergeByLine(
      [
        { x: 0, y: 52, width: 10, height: 21 },
        { x: 0, y: 0, width: 10, height: 21 },
        { x: 0, y: 26, width: 10, height: 21 },
      ],
      26,
    );
    expect(merged.map((line) => line.y)).toEqual([0, 26, 52]);
  });
});

describe("measureTextLines", () => {
  it("splits on explicit newlines", () => {
    const lines = measureTextLines("Erste\nZweite\nDritte", {
      width: 400,
      fontSize: 18,
      lineHeight: 26,
    });
    expect(lines).toHaveLength(3);
    expect(lines[1].y - lines[0].y).toBe(26);
  });

  it("wraps text that is wider than the box", () => {
    const lines = measureTextLines("Wort ".repeat(60), {
      width: 200,
      fontSize: 18,
      lineHeight: 26,
    });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.width <= 200)).toBe(true);
  });

  it("reports the glyph band, not the whole line box", () => {
    const [line] = measureTextLines("Kurz", { width: 400, fontSize: 18, lineHeight: 30 });
    expect(line.height).toBeLessThan(30);
    expect(line.y).toBeGreaterThan(0);
  });

  it("reports nothing drawable for empty text", () => {
    const lines = measureTextLines("", { width: 400, fontSize: 18, lineHeight: 26 });
    expect(lines.every((line) => line.width === 0)).toBe(true);
  });
});
