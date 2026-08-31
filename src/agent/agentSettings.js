// Agent/chat backend configuration. The OpenRouter key lives in the Hugging
// Face Space secret, never on the device — the app only knows the proxy URL and
// an optional access token for it. Proxy route: POST {baseUrl}/chat/completions,
// added directly to the existing SchoolMind server (app-backend Space, server.js).
const STORAGE_KEY = "notes.agentConfig";

export const AGENT_DEFAULTS = {
  baseUrl: "https://luca448-app-backend.hf.space/api/notes",
  accessKey: "",
};

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
