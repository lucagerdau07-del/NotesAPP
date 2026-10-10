import { Capacitor, registerPlugin } from "@capacitor/core";
import { toExternalBrowserUrl } from "./browserInput.js";

function createNativeBridge(plugin, physical, listeners) {
  let nativeHandle = null;
  const emit = (event) => {
    listeners.forEach((listener) => listener(event));
  };
  const call = (method, value) => plugin[method]?.(value);

  return {
    isNative: true,
    async mount(frame) {
      if (!nativeHandle) {
        nativeHandle = await plugin.addListener("browserEvent", emit);
      }
      return call("mount", physical(frame));
    },
    setFrame: (frame) => call("setFrame", physical(frame)),
    show: () => call("show"),
    hide: () => call("hide"),
    load: (url) => call("load", { url }),
    back: () => call("back"),
    forward: () => call("forward"),
    reload: () => call("reload"),
    stop: () => call("stop"),
    openExternal: (url) => call("openExternal", { url }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async destroy() {
      await nativeHandle?.remove?.();
      nativeHandle = null;
      await call("destroy");
      listeners.clear();
    },
  };
}

function createWebBridge(browserWindow, listeners) {
  let currentUrl = "";
  const emit = (event) => {
    listeners.forEach((listener) => listener(event));
  };

  return {
    isNative: false,
    mount: async () => {},
    setFrame: async () => {},
    show: async () => {},
    hide: async () => {},
    async destroy() {
      listeners.clear();
    },
    async load(url) {
      currentUrl = url;
      emit({
        type: "state",
        url,
        canGoBack: false,
        canGoForward: false,
      });
      emit({ type: "load-start", url });
    },
    back: async () => {},
    forward: async () => {},
    async reload() {
      if (currentUrl) emit({ type: "load-start", url: currentUrl });
    },
    stop: async () => {},
    async openExternal(url) {
      const safe = toExternalBrowserUrl(url);
      if (safe) {
        browserWindow?.open?.(safe, "_blank", "noopener,noreferrer");
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createBrowserBridge(options = {}) {
  const ratio =
    options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  const hasInjectedPlugin = Object.hasOwn(options, "nativePlugin");
  const plugin = hasInjectedPlugin
    ? options.nativePlugin
    : Capacitor.isNativePlatform()
      ? registerPlugin("SidebarBrowser")
      : null;
  const listeners = new Set();
  const physical = (frame) =>
    Object.fromEntries(
      Object.entries(frame).map(([key, value]) => [
        key,
        Math.max(0, Math.round(value * ratio)),
      ]),
    );

  return plugin
    ? createNativeBridge(plugin, physical, listeners)
    : createWebBridge(options.window ?? globalThis.window, listeners);
}
