import { describe, expect, it } from "vitest";
import {
  isInternalBrowserUrl,
  resolveBrowserInput,
  toExternalBrowserUrl,
} from "../src/browser/browserInput.js";

describe("browser input policy", () => {
  it("keeps HTTP URLs and upgrades a domain to HTTPS", () => {
    expect(resolveBrowserInput("https://example.com/a?q=1")).toBe(
      "https://example.com/a?q=1",
    );
    expect(resolveBrowserInput("wikipedia.org")).toBe(
      "https://wikipedia.org/",
    );
  });

  it("sends every free-text input to Google", () => {
    expect(resolveBrowserInput("photosynthese einfach erklärt")).toBe(
      "https://www.google.com/search?q=photosynthese%20einfach%20erkl%C3%A4rt",
    );
  });

  it("allows only HTTP(S) internally", () => {
    expect(isInternalBrowserUrl("https://example.com")).toBe(true);
    expect(isInternalBrowserUrl("javascript:alert(1)")).toBe(false);
    expect(isInternalBrowserUrl("file:///sdcard/test.html")).toBe(false);
  });

  it("returns only safe external targets", () => {
    expect(toExternalBrowserUrl("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(toExternalBrowserUrl("javascript:alert(1)")).toBeNull();
  });
});
