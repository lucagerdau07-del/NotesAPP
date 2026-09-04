import { describe, it, expect } from "vitest";
import { isUniformBorder, removeBackgroundCanvas } from "../../src/ink/canvasBackgroundRemoval.js";

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

    const centerIdx = (4 * width + 4) * 4;
    expect(data[centerIdx]).toBe(255);
    expect(data[centerIdx + 3]).toBe(255);

    const result = removeBackgroundCanvas({ width, height, data }, 30);

    // Corner pixel (0, 0) should be transparent (alpha = 0)
    expect(result.data[3]).toBe(0);

    // Inner white pixel (4, 4) should STILL be opaque (alpha = 255) because it's enclosed by the border!
    expect(result.data[centerIdx + 3]).toBe(255);
  });

  it("removes smooth gradient background", () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);

    // Create subtle gradient: from (240, 240, 240) to (210, 210, 210)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const val = 240 - Math.round(1.5 * x);
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    }

    // Draw an opaque colored box in the middle
    for (let y = 8; y <= 12; y++) {
      for (let x = 8; x <= 12; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = 200;
        data[idx + 1] = 20;
        data[idx + 2] = 20;
      }
    }

    const result = removeBackgroundCanvas({ width, height, data }, 35);
    // Corners should be transparent
    expect(result.data[3]).toBe(0);
    const rightCornerIdx = ((height - 1) * width + (width - 1)) * 4 + 3;
    expect(result.data[rightCornerIdx]).toBe(0);

    // Middle colored box should remain opaque
    const midIdx = (10 * width + 10) * 4 + 3;
    expect(result.data[midIdx]).toBe(255);
  });

  it("detects uniform/gradient borders vs chaotic photo borders", () => {
    const width = 16;
    const height = 16;
    const uniformData = new Uint8ClampedArray(width * height * 4).fill(250);
    expect(isUniformBorder({ width, height, data: uniformData })).toBe(true);

    // Chaotic data with random noise along border
    const chaoticData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < chaoticData.length; i += 4) {
      chaoticData[i] = (i * 37) % 256;
      chaoticData[i + 1] = (i * 73) % 256;
      chaoticData[i + 2] = (i * 109) % 256;
      chaoticData[i + 3] = 255;
    }
    expect(isUniformBorder({ width, height, data: chaoticData })).toBe(false);
  });
});
