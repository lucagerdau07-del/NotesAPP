// Notes agent API: a thin, stateless OpenAI-compatible proxy in front of
// OpenRouter. Its only job is to hold OPENROUTER_API_KEY server-side so the
// tablet never carries it. No dependencies, no state, no document knowledge —
// the agent loop runs in the client.
import http from "node:http";

const PORT = Number(process.env.PORT || 7863);
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = process.env.OPENROUTER_API_KEY || "";
const ACCESS_TOKEN = process.env.NOTES_ACCESS_TOKEN || "";
const MODEL = process.env.NOTES_MODEL || "anthropic/claude-sonnet-4.5";
const MAX_BODY = 6 * 1024 * 1024;
const MAX_MESSAGES = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function send(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...CORS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Anfrage zu groß"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Ungültiges JSON"));
      }
    });
    request.on("error", reject);
  });
}

// The access token is optional, but once set it is required: an open relay in
// front of a paid key is the one failure mode worth guarding here.
function isAuthorized(request) {
  if (!ACCESS_TOKEN) return true;
  const header = request.headers["x-app-key"] || "";
  const bearer = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return header === ACCESS_TOKEN || bearer === ACCESS_TOKEN;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS);
    response.end();
    return;
  }

  if (request.method === "GET" && (path === "/health" || path === "/")) {
    send(response, 200, { ok: true, service: "notes-agent-api", model: MODEL });
    return;
  }

  if (request.method !== "POST" || path !== "/chat/completions") {
    send(response, 404, { error: { message: "Unbekannter Endpunkt" } });
    return;
  }

  if (!isAuthorized(request)) {
    send(response, 401, { error: { message: "Zugriffsschlüssel fehlt oder ist falsch" } });
    return;
  }

  if (!API_KEY) {
    send(response, 500, { error: { message: "OPENROUTER_API_KEY ist im Space nicht gesetzt" } });
    return;
  }

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    send(response, 400, { error: { message: error.message } });
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0 || messages.length > MAX_MESSAGES) {
    send(response, 400, { error: { message: "messages fehlt oder ist zu lang" } });
    return;
  }

  try {
    // The model is chosen here, not by the client — otherwise the proxy is an
    // open relay for any model on the account.
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        ...(Array.isArray(body.tools) && body.tools.length
          ? { tools: body.tools, tool_choice: "auto" }
          : {}),
        provider: { data_collection: "deny" },
      }),
    });
    const data = await upstream.json();
    send(response, upstream.status, data);
  } catch (error) {
    send(response, 502, { error: { message: `OpenRouter nicht erreichbar: ${error.message}` } });
  }
});

server.listen(PORT, () => {
  console.log(`notes-agent-api auf Port ${PORT}, Modell ${MODEL}`);
});
