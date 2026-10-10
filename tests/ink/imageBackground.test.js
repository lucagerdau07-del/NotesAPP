import { describe, it, expect, vi } from "vitest";
import { blobToDataUrl, removeImageBackground } from "../../src/ink/imageBackground.js";

vi.mock("@imgly/background-removal", () => ({
  removeBackground: vi.fn(async (input) => {
    return new Blob(["fake-png-data"], { type: "image/png" });
  }),
}));

describe("imageBackground", () => {
  it("converts a blob to data URL", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
  });

  it("calls removeBackground and returns a png data URL", async () => {
    const fakeDataUrl = "data:image/jpeg;base64,1234";
    const result = await removeImageBackground(fakeDataUrl);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});
