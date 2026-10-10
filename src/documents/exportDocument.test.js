import { describe, expect, it } from "vitest";
import { containInPage, sanitizeFilename, parseRgbColor } from "./exportDocument.js";

describe("containInPage", () => {
  it("fits a landscape image to the page's width, centered vertically", () => {
    const { x, y, width, height } = containInPage(2, 600, 800);
    expect(width).toBe(600);
    expect(height).toBe(300);
    expect(x).toBe(0);
    expect(y).toBe(250);
  });

  it("fits a portrait image to the page's height, centered horizontally", () => {
    const { x, y, width, height } = containInPage(0.5, 600, 800);
    expect(width).toBe(400);
    expect(height).toBe(800);
    expect(x).toBe(100);
    expect(y).toBe(0);
  });

  it("falls back to the page's own ratio for a degenerate ratio", () => {
    const { x, y, width, height } = containInPage(0, 600, 800);
    expect(width).toBe(600);
    expect(height).toBe(800);
    expect(x).toBe(0);
    expect(y).toBe(0);
  });
});

describe("sanitizeFilename", () => {
  it("strips characters illegal in filenames", () => {
    expect(sanitizeFilename('Mathe: Klausur/Vorbereitung?"*')).toBe("Mathe_ Klausur_Vorbereitung_");
  });

  it("falls back to a default name when empty", () => {
    expect(sanitizeFilename("")).toBe("Notiz");
    expect(sanitizeFilename(null)).toBe("Notiz");
  });
});

describe("parseRgbColor", () => {
  it("parses an rgb() string", () => {
    expect(parseRgbColor("rgb(26,26,31)")).toEqual([26, 26, 31]);
  });

  it("parses 6-digit and 3-digit hex", () => {
    expect(parseRgbColor("#1a1a1f")).toEqual([26, 26, 31]);
    expect(parseRgbColor("#fff")).toEqual([255, 255, 255]);
  });

  it("returns null for anything else", () => {
    expect(parseRgbColor("transparent")).toBeNull();
    expect(parseRgbColor(null)).toBeNull();
  });
});
