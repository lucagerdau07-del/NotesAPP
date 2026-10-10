import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { supabase, ensureAnonUser } from "../lib/supabaseClient.js";

const STORAGE_KEY = "notes.untisCredentials";

export const UNTIS_API_URL = "https://luca448-app-backend.hf.space/api/untis";

// Native builds (Android/iOS) keep credentials in Keystore-backed encrypted
// storage that survives app updates. Plain web falls back to localStorage.
const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();

async function readLocal() {
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

async function writeLocal(credentials) {
  try {
    if (isNative()) {
      await SecureStoragePlugin.set({ key: STORAGE_KEY, value: JSON.stringify(credentials) });
      return;
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Storage full/blocked: credentials just won't persist across sessions.
  }
}

// Best-effort cloud mirror so credentials survive an uninstall/reinstall,
// which wipes local (even encrypted) storage on Android regardless of API used.
async function pullFromCloud() {
  if (!supabase) return null;
  try {
    const user = await ensureAnonUser();
    if (!user) return null;
    const { data, error } = await supabase
      .schema("notesapp")
      .from("untis_credentials")
      .select("school, server, username, password")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function pushToCloud(credentials) {
  if (!supabase) return;
  try {
    const user = await ensureAnonUser();
    if (!user) return;
    await supabase
      .schema("notesapp")
      .from("untis_credentials")
      .upsert({ user_id: user.id, ...credentials, updated_at: new Date().toISOString() });
  } catch {
    // Cloud sync is a convenience, not a requirement.
  }
}

export async function loadUntisCredentials() {
  const local = await readLocal();
  if (local?.school && local?.server && local?.username && local?.password) return local;
  const remote = await pullFromCloud();
  if (remote) await writeLocal(remote);
  return remote || local;
}

export async function saveUntisCredentials(credentials) {
  await writeLocal(credentials);
  pushToCloud(credentials);
}

export async function clearUntisCredentials() {
  try {
    if (isNative()) {
      await SecureStoragePlugin.remove({ key: STORAGE_KEY });
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // Nothing to clean up if the store is already unavailable.
  }
  if (supabase) {
    try {
      const user = await ensureAnonUser();
      if (user) {
        await supabase.schema("notesapp").from("untis_credentials").delete().eq("user_id", user.id);
      }
    } catch {
      // Best-effort cleanup.
    }
  }
}
