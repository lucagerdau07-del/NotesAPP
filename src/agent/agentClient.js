import { loadAgentConfig, getModelChain } from "./agentSettings.js";

// One chat/completions call against the proxy.
// Supports multi-model fallback (OpenRouter `models` array and client-side failover).
// Reads an OpenRouter-style SSE stream (`data: {...}\n\n`, ending in
// `data: [DONE]`) and folds the delta chunks into one message, calling
// onDelta(textSoFar) as content chunks arrive so the caller can render
// tokens as they land instead of waiting for the whole reply.
async function readSseCompletion(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let content = "";
  const toolCalls = [];
  let usage = null;
  let finishReason = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffered.indexOf("\n")) !== -1) {
      const line = buffered.slice(0, newlineIndex).trim();
      buffered = buffered.slice(newlineIndex + 1);
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed?.error) throw new Error(parsed.error.message || "Fehler vom Modell.");
      if (parsed?.usage) usage = parsed.usage;
      const delta = parsed?.choices?.[0]?.delta;
      if (!delta) continue;
      if (parsed.choices[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
      if (delta.content) {
        content += delta.content;
        onDelta?.(content);
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing = toolCalls[idx] || {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          toolCalls[idx] = existing;
        }
      }
    }
  }

  const message = {
    role: "assistant",
    content: content || null,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
  return { message, usage, finishReason };
}

export async function requestCompletion({
  messages,
  tools,
  model,
  models,
  signal,
  stream,
  onDelta,
  config = loadAgentConfig(),
}) {
  const baseUrl = String(config.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Keine Backend-Adresse eingestellt. Einstellungen → KI & Netzwerk.");
  }

  const modelChain = models?.length ? models : model ? getModelChain(model) : [undefined];
  const useStream = stream && typeof onDelta === "function";
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
          ...(useStream ? { stream: true, stream_options: { include_usage: true } } : {}),
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

    let message;
    let usage;
    // A backend not yet updated for streaming ignores `stream: true` and
    // replies with plain JSON — fall back to the non-stream parse rather
    // than feeding an SSE reader a body it can't make sense of.
    const isSse = response.headers?.get?.("content-type")?.includes("text/event-stream");
    if (useStream && isSse) {
      try {
        const result = await readSseCompletion(response, onDelta);
        message = result.message;
        usage = result.usage;
      } catch (error) {
        if (i < modelChain.length - 1) {
          lastError = error;
          continue;
        }
        throw error;
      }
    } else {
      const data = await response.json().catch(() => null);
      message = data?.choices?.[0]?.message;
      usage = data?.usage ?? null;
    }

    // A message with no text and no tool call is a dead end for the caller
    // (it renders as "keine Antwort erhalten") just like a missing message —
    // treat it the same and fall back to the next model instead of surfacing it.
    const isEmpty = !message || (!message.content?.trim?.() && !message.tool_calls?.length);
    if (isEmpty) {
      if (i < modelChain.length - 1) {
        lastError = new Error("Leere Antwort vom Modell.");
        continue;
      }
      throw new Error("Leere Antwort vom Modell.");
    }
    return { message, usage: usage ?? null };
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

