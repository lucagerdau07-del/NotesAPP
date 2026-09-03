import { describe, expect, it, vi } from "vitest";
import { createBrowserBridge } from "../src/browser/browserBridge.js";

describe("browser bridge", () => {
  it("delegates navigation and physical-pixel frames to the native plugin", async () => {
    const plugin = {
      mount: vi.fn(),
      setFrame: vi.fn(),
      load: vi.fn(),
      addListener: vi.fn(() => ({ remove: vi.fn() })),
    };
    const bridge = createBrowserBridge({
      nativePlugin: plugin,
      devicePixelRatio: 2,
    });

    await bridge.mount({ x: 10, y: 20, width: 300, height: 500 });
    await bridge.setFrame({ x: 11, y: 21, width: 301, height: 501 });
    await bridge.load("https://example.com/");

    expect(plugin.mount).toHaveBeenCalledWith({
      x: 20,
      y: 40,
      width: 600,
      height: 1000,
    });
    expect(plugin.setFrame).toHaveBeenCalledWith({
      x: 22,
      y: 42,
      width: 602,
      height: 1002,
    });
    expect(plugin.load).toHaveBeenCalledWith({ url: "https://example.com/" });
  });

  it("forwards native browser events to subscribers", async () => {
    let nativeListener;
    const plugin = {
      mount: vi.fn(),
      addListener: vi.fn((_name, listener) => {
        nativeListener = listener;
        return { remove: vi.fn() };
      }),
    };
    const bridge = createBrowserBridge({ nativePlugin: plugin });
    const listener = vi.fn();
    bridge.subscribe(listener);
    await bridge.mount({ x: 0, y: 0, width: 1, height: 1 });

    nativeListener({ type: "load-end", url: "https://example.com/" });
    expect(listener).toHaveBeenCalledWith({
      type: "load-end",
      url: "https://example.com/",
    });
  });

  it("opens safe URLs through window.open in the web fallback", async () => {
    const open = vi.fn();
    const bridge = createBrowserBridge({
      nativePlugin: null,
      window: { open },
      devicePixelRatio: 1,
    });

    await bridge.openExternal("https://example.com");
    await bridge.openExternal("javascript:alert(1)");

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "https://example.com/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("exposes the web fallback URL as state without inventing history", async () => {
    const bridge = createBrowserBridge({ nativePlugin: null, window: {} });
    const listener = vi.fn();
    bridge.subscribe(listener);

    await bridge.load("https://example.com/");

    expect(listener).toHaveBeenNthCalledWith(1, {
      type: "state",
      url: "https://example.com/",
      canGoBack: false,
      canGoForward: false,
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      type: "load-start",
      url: "https://example.com/",
    });
  });
});
