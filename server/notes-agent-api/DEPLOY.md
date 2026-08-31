# Deploying notes-agent-api to the Hugging Face Space

The service is a dependency-free Node process that proxies chat completions to
OpenRouter using the Space secret `OPENROUTER_API_KEY`. It holds no state, so a
restart costs nothing.

## 1. Copy the sources

Clone the deploy checkout if it is not present:

```bash
git clone https://huggingface.co/spaces/Luca448/app-backend C:/Antigravity/app-backend-temp
```

Then copy this directory into it:

```bash
cp -r server/notes-agent-api C:/Antigravity/app-backend-temp/notes-agent-api
```

Never copy `node_modules`, `.env`, or any runtime state.

## 2. Start it alongside the other services

In the Space's `start.sh`, next to the existing services:

```sh
PORT=7863 node /app/notes-agent-api/src/index.js &
```

## 3. Route it in nginx

Same pattern as `/nourish/`, in the Space's nginx config:

```nginx
location /notes/ {
    proxy_pass http://127.0.0.1:7863/;
    proxy_set_header Host $host;
    proxy_read_timeout 300s;
}
```

## 4. Secrets

* `OPENROUTER_API_KEY` — already set in the Space. Nothing new is needed.
* `NOTES_MODEL` — optional, defaults to `anthropic/claude-sonnet-4.5`. Use a
  vision-capable model if page snapshots are added later.
* `NOTES_ACCESS_TOKEN` — optional but recommended. When set, requests must carry
  it as `X-App-Key`; the app sends the value from Settings → KI & Netzwerk.

## 5. Verify

```bash
curl https://luca448-app-backend.hf.space/notes/health
```

Expected: `{"ok":true,"service":"notes-agent-api","model":"…"}`.

The app points at `https://luca448-app-backend.hf.space/notes` by default
(Settings → KI & Netzwerk).
