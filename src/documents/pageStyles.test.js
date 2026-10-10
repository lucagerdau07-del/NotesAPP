import { describe, expect, it } from "vitest";
import { readableInk } from "./pageStyles.js";

describe("readableInk", () => {
  it("swaps the default ink that would vanish on the paper", () => {
    expect(readableInk("#EFECE4", true)).toBe("#1A1A1A");
    expect(readableInk("#efece4", true)).toBe("#1A1A1A");
    expect(readableInk("#1A1A1A", false)).toBe("#EFECE4");
  });

  it("keeps readable defaults and every other color", () => {
    expect(readableInk("#1A1A1A", true)).toBe("#1A1A1A");
    expect(readableInk("#EFECE4", false)).toBe("#EFECE4");
    expect(readableInk("#3E7BD8", true)).toBe("#3E7BD8");
  });
});
