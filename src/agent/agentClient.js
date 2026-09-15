import { loadAgentConfig, getModelChain } from "./agentSettings.js";

// One chat/completions call against the proxy.
// Supports multi-model fallback (OpenRouter `models` array and client-side failover).
export async function requestCompletion({
  messages,
  tools,
  model,
  models,
  signal,
  config = loadAgentConfig(),
}) {
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Keine Backend-Adresse eingestellt. Einstellungen → KI & Netzwerk.");
  }

  const modelChain = models?.length ? models : model ? getModelChain(model) : [undefined];
  let lastError = null;

  for (let i = 0; i < modelChain.length; i += 1) {
    const currentModel = modelChain[i];
    const remainingModels = modelChain.slice(i);

    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(config.accessKey ? { "X-App-Key": config.accessKey } : {}),
        },
        body: JSON.stringify({
          messages,
          ...(currentModel ? { model: currentModel } : {}),
          ...(remainingModels.length > 1 ? { models: remainingModels } : {}),
          ...(tools?.length ? { tools } : {}),
        }),
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new Error("Server nicht erreichbar. Verbindung prüfen.");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new Error("Zugriff abgelehnt. Zugriffsschlüssel in den Einstellungen prüfen.");
      }

      const isRecoverable =
        response.status === 400 ||
        response.status === 404 ||
        response.status === 429 ||
        response.status >= 500;

      if (isRecoverable && i < modelChain.length - 1) {
        lastError = new Error(
          response.status === 429
            ? "Zu viele Anfragen. Später erneut versuchen."
            : `Fehler ${response.status}: ${detail.slice(0, 200) || "unbekannt"}`,
        );
        continue;
      }

      if (response.status === 429) throw new Error("Zu viele Anfragen. Später erneut versuchen.");
      throw new Error(`Fehler ${response.status}: ${detail.slice(0, 200) || "unbekannt"}`);
    }

    const data = await response.json().catch(() => null);
    const message = data?.choices?.[0]?.message;
    if (!message) {
      if (i < modelChain.length - 1) {
        lastError = new Error(data?.error?.message || "Leere Antwort vom Modell.");
        continue;
      }
      throw new Error(data?.error?.message || "Leere Antwort vom Modell.");
    }
    return { message, usage: data?.usage ?? null };
  }

  throw lastError || new Error("Keines der Modelle im Fallback-Katalog war erreichbar.");
}

// Allgemeine Websuche (Tavily, server-seitig geschlüsselt) — Rückfallebene für
// search_web, wenn Wikipedia nichts findet. Gleiche Proxy-Route wie oben, nur
// /search statt /chat/completions.
export async function requestSearch({ query, signal, config = loadAgentConfig() }) {
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Keine Backend-Adresse eingestellt.");

  let response;
  try {
    response = await fetch(`${baseUrl}/search`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(config.accessKey ? { "X-App-Key": config.accessKey } : {}),
      },
      body: JSON.stringify({ query }),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Server nicht erreichbar.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Fehler ${response.status}`);
  return Array.isArray(data?.results) ? data.results : [];
}

