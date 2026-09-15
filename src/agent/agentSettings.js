// Agent/chat backend configuration. The OpenRouter key lives in the Hugging
// Face Space secret, never on the device — the app only knows the proxy URL and
// an optional access token for it. Proxy route: POST {baseUrl}/chat/completions,
// added directly to the existing SchoolMind server (app-backend Space, server.js).
const STORAGE_KEY = "notes.agentConfig";

export const AGENT_DEFAULTS = {
  baseUrl: "https://luca448-app-backend.hf.space/api/notes",
  accessKey: "",
};

// Modelle für Anfragen mit Bildinhalt (Seiten-Scan, see_document). Der Proxy
// lässt nur diese IDs durch (server.js NOTES_ALLOWED_MODELS) und reicht sie als
// OpenRouter-Fallback-Kette weiter, solange model[0] mit "google/" beginnt.
// Läuft über den im OpenRouter-Account hinterlegten eigenen Google-AI-Key
// (BYOK) — Kosten trägt Googles Gratis-Kontingent, nicht unser Guthaben.
export const VISION_MODEL_CHAIN = [
  "google/gemini-3.8-flash",
  "google/gemini-3.7-flash",
  "google/gemini-3.6-flash",
];

export function loadAgentConfig(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return { ...AGENT_DEFAULTS, ...(raw ? JSON.parse(raw) : null) };
  } catch {
    return { ...AGENT_DEFAULTS };
  }
}

export function saveAgentConfig(config, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ ...AGENT_DEFAULTS, ...config }));
  } catch {
    // Storage blocked: the config just won't survive a restart.
  }
}
