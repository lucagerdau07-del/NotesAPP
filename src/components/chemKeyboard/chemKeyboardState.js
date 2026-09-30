import { useSyncExternalStore } from "react";

// One switch for the whole app (every split pane): the "Mehr" menu flips it,
// page text fields read it to drop the native keyboard, ChemKeyboard shows up.
const STORAGE_KEY = "notes.chem-keyboard";
const listeners = new Set();

let enabled = false;
try {
  enabled = globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
} catch {
  // storage blocked: start off
}

export function setChemKeyboardEnabled(next) {
  enabled = Boolean(next);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // not persisted, still applies this session
  }
  listeners.forEach((listener) => listener());
}

export function useChemKeyboardEnabled() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabled,
  );
}
