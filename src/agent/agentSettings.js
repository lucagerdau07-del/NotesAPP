// Agent/chat backend configuration. The OpenRouter key lives in the Hugging
// Face Space secret, never on the device — the app only knows the proxy URL and
// an optional access token for it. Proxy route: POST {baseUrl}/chat/completions,
// added directly to the existing SchoolMind server (app-backend Space, server.js).
const STORAGE_KEY = "notes.agentConfig";
const MODEL_STORAGE_KEY = "notes.chatModel";

export const ULTIMATE_FALLBACK_MODEL = "deepseek/deepseek-v4-flash";

export const CHAT_MODELS = [
  {
    id: "google/gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    fallbacks: [
      "google/gemini-3.7-flash",
      "google/gemini-3.6-flash",
      "deepseek/deepseek-v4-flash",
    ],
  },
  {
    id: "google/gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash lite",
    fallbacks: [
      "google/gemini-3.1-flash-lite",
      "deepseek/deepseek-v4-flash",
    ],
  },
  {
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    fallbacks: [],
  },
];

export function getModelChain(modelId) {
  const match = CHAT_MODELS.find((m) => m.id === modelId);
  if (!match) {
    return [modelId, ULTIMATE_FALLBACK_MODEL].filter(Boolean);
  }
  const list = [match.id, ...(match.fallbacks || [])];
  if (!list.includes(ULTIMATE_FALLBACK_MODEL)) {
    list.push(ULTIMATE_FALLBACK_MODEL);
  }
  return [...new Set(list)];
}

export const DEFAULT_CHAT_MODEL = CHAT_MODELS[0].id;

export function loadChatModel(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem(MODEL_STORAGE_KEY);
    if (saved && CHAT_MODELS.some((m) => m.id === saved)) {
      return saved;
    }
    return DEFAULT_CHAT_MODEL;
  } catch {
    return DEFAULT_CHAT_MODEL;
  }
}

export function saveChatModel(modelId, storage = globalThis.localStorage) {
  try {
    storage?.setItem(MODEL_STORAGE_KEY, modelId);
  } catch {
    // Storage blocked.
  }
}

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
