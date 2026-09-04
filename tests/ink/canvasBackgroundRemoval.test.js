import { describe, it, expect } from "vitest";
import { removeBackgroundCanvas } from "../../src/ink/canvasBackgroundRemoval.js";

describe("canvasBackgroundRemoval", () => {
  it("removes uniform white background while preserving inner white", () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill all with white (255, 255, 255, 255)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }

    // Draw a dark square border around center (x: 2..7, y: 2..7)
    for (let y = 2; y <= 7; y++) {
      for (let x = 2; x <= 7; x++) {
        if (x === 2 || x === 7 || y === 2 || y === 7) {
          const idx = (y * width + x) * 4;
          data[idx] = 0; // Black
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }
      }
    }

    // Center pixel (4, 4) is white inside the black border!
    const centerIdx = (4 * width + 4) * 4;
    expect(data[centerIdx]).toBe(255);
    expect(data[centerIdx + 3]).toBe(255);

    const result = removeBackgroundCanvas({ width, height, data }, 30);

    // Corner pixel (0, 0) should be transparent (alpha = 0)
    expect(result.data[3]).toBe(0);

    // Inner white pixel (4, 4) should STILL be opaque (alpha = 255) because it's enclosed by the border!
    expect(result.data[centerIdx + 3]).toBe(255);
  });
});
