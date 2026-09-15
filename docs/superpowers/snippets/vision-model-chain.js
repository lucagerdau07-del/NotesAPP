// Snippet für den app-backend Space (server.js), nicht Teil dieses Repos.
// Ersetzt den einzelnen OpenRouter-Aufruf im /chat/completions-Handler durch
// eine Modellkette mit Fallback, sobald die Anfrage Bild-Parts enthält
// (d.h. `see_page` bzw. documentScan.js schickt image_url-Content).
//
// Voraussetzung, bereits erledigt: Google-AI-Studio-Key ist im OpenRouter-Account
// unter Settings → Integrations als BYOK-Key hinterlegt. Rufe darüber google/*-Modelle
// auf, laufen die Kosten über Googles eigenes Gratis-Kontingent statt über
// OpenRouter-Guthaben.

const VISION_MODEL_CHAIN = [
  // BYOK: nutzt den hinterlegten Google-AI-Key, Kosten trägt Googles Gratis-Kontingent.
  "google/gemini-3.1-flash-lite",
  // Echte Gratis-Vision-Modelle als zweite Stufe.
  "inclusionai/ling-3.0-flash-vl:free",
  "thinkingmachines/inkling:free",
  // Letzter Fallback, bezahlt, falls alles andere ausfällt.
  "deepseek/deepseek-v4-flash-vision-exp",
];

async function callOpenRouterWithFallback(payload, { apiKey }) {
  let lastError;
  for (const model of VISION_MODEL_CHAIN) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ ...payload, model }),
      });
      if (!response.ok) {
        // 400/404 = Modell nicht verfügbar, 402 = Kontingent/Guthaben aufgebraucht,
        // 429 = Rate-Limit -> jeweils zum nächsten Modell der Kette weiterreichen.
        if ([400, 402, 404, 429].includes(response.status)) {
          lastError = new Error(`Modell ${model} nicht verfügbar (HTTP ${response.status})`);
          continue;
        }
        throw new Error(`OpenRouter-Fehler ${response.status} bei Modell ${model}`);
      }
      return await response.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Alle Modelle der Vision-Kette fehlgeschlagen.");
}

// Einbindung im bestehenden Handler, sinngemäß:
//
//   const isVisionRequest = body.messages?.some((m) =>
//     Array.isArray(m.content) && m.content.some((part) => part.type === "image_url")
//   );
//
//   const result = isVisionRequest
//     ? await callOpenRouterWithFallback(body, { apiKey: process.env.OPENROUTER_API_KEY })
//     : await callOpenRouter({ ...body, model: process.env.NOTES_MODEL }, { apiKey: process.env.OPENROUTER_API_KEY });
//
// (NOTES_MODEL bleibt für reine Text-Anfragen unverändert zuständig.)

module.exports = { VISION_MODEL_CHAIN, callOpenRouterWithFallback };
