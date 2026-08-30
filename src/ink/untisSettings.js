const STORAGE_KEY = 'notes.untisCredentials';

export const UNTIS_API_URL = 'https://luca448-app-backend.hf.space/api/untis';

export function loadUntisCredentials(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUntisCredentials(credentials, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Storage full/blocked: credentials just won't persist across sessions.
  }
}

export function clearUntisCredentials(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if the store is already unavailable.
  }
}
