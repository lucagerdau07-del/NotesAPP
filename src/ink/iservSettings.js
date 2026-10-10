import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

const STORAGE_KEY = "notes.iservCredentials";

// Wie bei den Untis-Zugangsdaten: nativ im Keystore, im Browser in localStorage.
// Anders als dort gibt es keinen Cloud-Spiegel, der Account soll nirgends in der
// Cloud liegen, in die er selbst den Zugang öffnet.
const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

export async function loadIservCredentials() {
  try {
    if (isNative()) {
      const { value } = await SecureStoragePlugin.get({ key: STORAGE_KEY });
      return value ? JSON.parse(value) : null;
    }
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveIservCredentials(credentials) {
  try {
    if (isNative()) {
      await SecureStoragePlugin.set({ key: STORAGE_KEY, value: JSON.stringify(credentials) });
      return;
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Speicher voll oder gesperrt: die Zugangsdaten überleben dann die Sitzung nicht.
  }
}
