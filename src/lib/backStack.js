import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

// Android back button: the topmost registered handler runs first. When none
// is registered (library root) the app is sent to the background instead of
// being destroyed.
const stack = [];

export function handleBack() {
  const top = stack[stack.length - 1];
  if (top) top.current();
  else CapacitorApp.minimizeApp();
}

if (Capacitor.isNativePlatform()) CapacitorApp.addListener("backButton", handleBack);

// Registers `onBack` while `active` is true. Later-mounted / later-activated
// handlers sit on top, so an open dialog beats the screen underneath it.
export function useBackHandler(active, onBack) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return undefined;
    stack.push(ref);
    return () => {
      const i = stack.lastIndexOf(ref);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
