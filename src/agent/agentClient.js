import { loadAgentConfig } from "./agentSettings.js";

// One chat/completions call against the proxy. The model is chosen server-side;
// the client only sends messages and tool schemas.
export async function requestCompletion({
  messages,
  tools,
  model,
  signal,
  config = loadAgentConfig(),
}) {
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Keine Backend-Adresse eingestellt. Einstellungen → KI & Netzwerk.");
  }

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
        ...(model ? { model } : {}),
        ...(tools?.length ? { tools } : {}),
      }),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new Error("Server nicht erreichbar. Verbindung prüfen.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403)
      throw new Error("Zugriff abgelehnt. Zugriffsschlüssel in den Einstellungen prüfen.");
    if (response.status === 429) throw new Error("Zu viele Anfragen. Später erneut versuchen.");
    throw new Error(`Fehler ${response.status}: ${detail.slice(0, 200) || "unbekannt"}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  if (!message) throw new Error(data?.error?.message || "Leere Antwort vom Modell.");
  return { message, usage: data?.usage ?? null };
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

