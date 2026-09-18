import { useCallback, useEffect, useRef, useState } from "react";
import { requestCompletion } from "../agent/agentClient.js";
import { VISION_MODEL_CHAIN } from "../agent/agentSettings.js";
import {
  AGENT_CORE_TOOLS,
  AGENT_READ_TOOLS,
  AGENT_NO_DOCUMENT_TOOLS,
  AGENT_EXTENDED_BY_NAME,
  CORE_TOOL_NAMES,
  describeToolCall,
  executeTool,
} from "../agent/tools.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";

const MAX_STEPS = 30;
const MAX_HISTORY = 40;
const HISTORY_PREFIX = "notes.chats.";
const CHAT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 20;

function newSessionId() {
  return globalThis.crypto?.randomUUID?.() || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A note keeps a list of past chats (newest first), not just one — each is
// {id, title, savedAt, messages}. title starts null until the agent names it.
export function loadSessions(documentId) {
  try {
    const raw = globalThis.localStorage?.getItem(HISTORY_PREFIX + documentId);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && Date.now() - s.savedAt <= CHAT_TTL_MS);
  } catch {
    return [];
  }
}

export function saveSessions(documentId, sessions) {
  try {
    globalThis.localStorage?.setItem(
      HISTORY_PREFIX + documentId,
      JSON.stringify(sessions.slice(0, MAX_SESSIONS)),
    );
  } catch {
    // Storage blocked: history just won't survive a restart.
  }
}

// One-time sweep so a note nobody reopens still gets its old chats dropped
// after 30 days, not just ones loadSessions happens to touch again.
function pruneOldChats() {
  const storage = globalThis.localStorage;
  if (!storage) return;
  try {
    for (const key of Object.keys(storage)) {
      if (!key.startsWith(HISTORY_PREFIX)) continue;
      try {
        const parsed = JSON.parse(storage.getItem(key));
        if (!Array.isArray(parsed)) continue;
        const fresh = parsed.filter((s) => s && Date.now() - s.savedAt <= CHAT_TTL_MS);
        if (fresh.length === 0) storage.removeItem(key);
        else if (fresh.length !== parsed.length) storage.setItem(key, JSON.stringify(fresh));
      } catch {
        // Unreadable entry: leave it, not worth failing the whole sweep over.
      }
    }
  } catch {
    // Storage enumeration blocked: nothing to sweep.
  }
}
pruneOldChats();

// Best-effort, fire-and-forget: a short thematic title for a fresh chat, from
// its opening exchange. No tools, plain text reply.
async function generateTitle(task, replyText, signal, model) {
  try {
    const { message } = await requestCompletion({
      model,
      messages: [
        {
          role: "system",
          content:
            "Antworte NUR mit einem sehr kurzen thematischen Titel (2-5 Wörter) für dieses Gespräch. Keine Anführungszeichen, kein Satzzeichen am Ende, keine Erklärung.",
        },
        { role: "user", content: task },
        ...(replyText ? [{ role: "assistant", content: replyText }] : []),
      ],
      signal,
    });
    const title = message?.content
      ?.trim()
      .replace(/^["'„»]+|["'"«]+$/g, "")
      .replace(/[.!?]+$/, "");
    return title ? title.slice(0, 60) : null;
  } catch {
    return null;
  }
}

// Der Proxy weicht ohne explizite models-Angabe bei Bildinhalt auf das
// bezahlte DeepSeek-Vision-Modell aus. Läuft ein Bild mit, fordern wir
// stattdessen die Gemini-Kette an (BYOK, über Googles Gratis-Kontingent).
function conversationHasImage(conversation) {
  return conversation.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === "image_url"),
  );
}

function parseArguments(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

// Only the last MAX_HISTORY messages go to the model, and a tool result is only
// ever a string on the wire. The system prompt (index 0) is kept pinned rather
// than counted into that window — otherwise a long-running tool loop pushes it
// out of the trailing slice and the model loses the only place that says when
// to call `done`, which is how it used to run to the step ceiling instead of
// finishing.
function wireMessages(messages) {
  const [first, ...rest] = messages;
  const kept =
    first?.role === "system" ? [first, ...rest.slice(-(MAX_HISTORY - 1))] : messages.slice(-MAX_HISTORY);
  return kept.map(({ role, content, tool_calls, tool_call_id }) => ({
    role,
    content: content ?? "",
    ...(tool_calls ? { tool_calls } : {}),
    ...(tool_call_id ? { tool_call_id } : {}),
  }));
}

/**
 * The agent loop lives in the client because the tools mutate the open
 * document, and the document lives here. Every tool call is applied
 * immediately, as one undo step, so the user watches the work happen.
 */
export default function useAgent({ documentId, noteTitle, subject, inkControllerRef, model, fast }) {
  const [sessions, setSessions] = useState(() => loadSessions(documentId));
  const [activeId, setActiveId] = useState(() => sessions[0]?.id ?? newSessionId());
  const [messages, setMessages] = useState(() => sessions[0]?.messages ?? []);
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | running | error
  const [error, setError] = useState(null);
  const [tokens, setTokens] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [streamText, setStreamText] = useState("");
  const abortRef = useRef(null);
  const loadedFor = useRef(documentId);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (status !== "running") return undefined;
    const id = setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (loadedFor.current !== documentId) {
    loadedFor.current = documentId;
    const next = loadSessions(documentId);
    setSessions(next);
    setActiveId(next[0]?.id ?? newSessionId());
    setMessages(next[0]?.messages ?? []);
    setSteps([]);
    setStatus("idle");
    setError(null);
  }

  // Persists the active session under its own id — a run's first message
  // creates it, later ones update it in place. An empty (never-sent) session
  // never hits storage.
  useEffect(() => {
    if (messages.length === 0) return;
    setSessions((current) => {
      const index = current.findIndex((s) => s.id === activeId);
      const title = index >= 0 ? current[index].title : null;
      const session = { id: activeId, title, savedAt: Date.now(), messages };
      const updated =
        index >= 0
          ? current.map((s, i) => (i === index ? session : s))
          : [session, ...current];
      saveSessions(documentId, updated);
      return updated;
    });
  }, [documentId, activeId, messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  // Switches to a blank chat without touching the current one — it stays in
  // history since the effect above already persisted it.
  const startNew = useCallback(() => {
    stop();
    setActiveId(newSessionId());
    setMessages([]);
    setSteps([]);
    setError(null);
  }, [stop]);

  // The trash button: deletes the current chat outright, then lands on a
  // fresh blank one.
  const clear = useCallback(() => {
    stop();
    setSessions((current) => {
      const updated = current.filter((s) => s.id !== activeId);
      saveSessions(documentId, updated);
      return updated;
    });
    setActiveId(newSessionId());
    setMessages([]);
    setSteps([]);
    setError(null);
  }, [stop, activeId, documentId]);

  const selectSession = useCallback(
    (id) => {
      const session = sessions.find((s) => s.id === id);
      if (!session) return;
      stop();
      setActiveId(id);
      setMessages(session.messages);
      setSteps([]);
      setError(null);
    },
    [stop, sessions],
  );

  // Deleting from the history list — the active chat included, which then
  // lands on a fresh blank one just like the trash button.
  const deleteSession = useCallback(
    (id) => {
      setSessions((current) => {
        const updated = current.filter((s) => s.id !== id);
        saveSessions(documentId, updated);
        return updated;
      });
      if (id === activeId) {
        stop();
        setActiveId(newSessionId());
        setMessages([]);
        setSteps([]);
        setError(null);
      }
    },
    [stop, activeId, documentId],
  );

  const renameSession = useCallback(
    (id, title) => {
      const trimmed = title.trim().slice(0, 60);
      if (!trimmed) return;
      setSessions((current) => {
        const updated = current.map((s) => (s.id === id ? { ...s, title: trimmed } : s));
        saveSessions(documentId, updated);
        return updated;
      });
    },
    [documentId],
  );

  const send = useCallback(
    async (text, { editDocument = true, image } = {}) => {
      const task = String(text || "").trim();
      if (!task || status === "running") return;

      const controllerAtStart = inkControllerRef?.current;
      const canRead = Boolean(controllerAtStart?.getDocument);
      // Fast mode trades editing for speed — the tools sent to the model
      // never include document-writing ones, same as buildSystemPrompt's gate.
      const canEdit = !fast && editDocument && Boolean(controllerAtStart?.applyCommands);
      const isWhiteboard = controllerAtStart?.document?.pages?.[0]?.kind === "whiteboard";
      const background = controllerAtStart?.document?.pages?.[0]?.background;
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("running");
      setError(null);
      setSteps([]);
      setTokens(0);
      setElapsedMs(0);
      setStreamText("");
      startTimeRef.current = Date.now();
      // Only a chat's opening exchange gets a generated title.
      const needsTitle = messages.length === 0;
      const sessionIdAtStart = activeId;
      let lastReplyText = "";

      // Read through the ref on every call: the controller object is replaced
      // on each render of the editor, and a run outlives many of them.
      const api = {
        getDocument: () => inkControllerRef.current.getDocument(),
        apply: (commands) => inkControllerRef.current.applyCommands(commands),
        getColor: () => inkControllerRef.current.color,
        getPaperStyle: () => inkControllerRef.current.paperStyle,
      };

      let currentSteps = [];
      // The persisted/displayed message stays plain text either way (its
      // renderer only ever handles a string) — the image rides along only
      // on the wire turn, same principle as see_document's synthetic message.
      const userTurn = image
        ? {
            role: "user",
            content: [
              { type: "text", text: task },
              { type: "image_url", image_url: { url: image } },
            ],
          }
        : { role: "user", content: task };
      let conversation = [
        {
          role: "system",
          content: buildSystemPrompt({
            noteTitle,
            subject,
            canEdit,
            canRead,
            isWhiteboard,
            background,
            fast,
          }),
        },
        ...messages,
        userTurn,
      ];
      setMessages((current) => [...current, { role: "user", content: task }]);

      // Table/diagram/component builders etc. only join the payload once the
      // model calls enable_tools for them (see describeExtendedToolManifest
      // in the system prompt) — grows across steps within this one run, reset
      // fresh on the next send() the same as steps/tokens below.
      const enabledExtra = new Set();

      try {
        for (let step = 0; step < MAX_STEPS; step += 1) {
          const { message: reply, usage } = await requestCompletion({
            model,
            messages: wireMessages(conversation),
            tools: canEdit
              ? [...AGENT_CORE_TOOLS, ...[...enabledExtra].map((name) => AGENT_EXTENDED_BY_NAME.get(name))]
              : canRead
                ? AGENT_READ_TOOLS
                : AGENT_NO_DOCUMENT_TOOLS,
            models: conversationHasImage(conversation) ? VISION_MODEL_CHAIN : undefined,
            signal: controller.signal,
            stream: true,
            onDelta: setStreamText,
          });
          setStreamText("");
          const stepTokens =
            usage?.total_tokens ??
            (usage?.prompt_tokens != null || usage?.completion_tokens != null
              ? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
              : 0);
          if (stepTokens > 0) {
            setTokens(stepTokens);
          }
          conversation = [...conversation, reply];

          const calls = reply.tool_calls || [];
          if (calls.length === 0) {
            const content = reply.content?.trim();
            lastReplyText = content || "Ich habe keine Antwort erhalten.";
            setMessages((current) => [
              ...current,
              {
                role: "assistant",
                content: lastReplyText,
                steps: currentSteps,
                elapsedMs: Date.now() - startTimeRef.current,
              },
            ]);
            setSteps([]);
            break;
          }

          let finished = null;
          for (const call of calls) {
            const name = call.function?.name;
            const args = parseArguments(call.function?.arguments);
            const label = describeToolCall(name, args || {});
            currentSteps = [...currentSteps, { id: call.id, name, label, state: "running" }];
            setSteps(currentSteps);

            let result;
            if (args === null) {
              result = "Fehler: Die Argumente waren kein gültiges JSON.";
            } else if (name === "enable_tools") {
              // Not a document tool: it only widens what the next step's
              // `tools` payload includes, so it's handled here rather than
              // going through executeTool/api at all.
              const requested = Array.isArray(args.names) ? args.names : [];
              // Core tools (read_document, write_text, done, ...) are always
              // on already — the model naming one here isn't wrong, just
              // redundant, so it's a no-op rather than an "unknown tool"
              // error. Only names that map to neither set are genuinely bad.
              const known = requested.filter((n) => AGENT_EXTENDED_BY_NAME.has(n));
              const alreadyCore = requested.filter((n) => CORE_TOOL_NAMES.has(n));
              const unknown = requested.filter(
                (n) => !AGENT_EXTENDED_BY_NAME.has(n) && !CORE_TOOL_NAMES.has(n),
              );
              for (const n of known) enabledExtra.add(n);
              result =
                known.length > 0 || alreadyCore.length > 0
                  ? {
                      enabled: known,
                      ...(alreadyCore.length ? { bereits_verfügbar: alreadyCore } : {}),
                      ...(unknown.length ? { unbekannt: unknown } : {}),
                    }
                  : `Fehler: Kein bekanntes Werkzeug unter ${JSON.stringify(requested)}.`;
            } else {
              try {
                result = await executeTool(name, args, api);
              } catch (toolError) {
                result = `Fehler: ${toolError.message}`;
              }
            }
            const failed = typeof result === "string" && result.startsWith("Fehler");
            // see_document and read_source with image: true both hand back
            // rendered pages; any result whose pages carry a src is an image.
            const sawPages =
              !failed &&
              Array.isArray(result?.pages) &&
              result.pages.length > 0 &&
              result.pages.every((page) => page.src);
            currentSteps = currentSteps.map((entry) =>
              entry.id === call.id
                ? {
                    ...entry,
                    state: failed ? "failed" : "done",
                    ...(failed ? { detail: result } : {}),
                    ...(sawPages ? { detail: `${result.pages.length} Bild(er)` } : {}),
                  }
                : entry,
            );
            setSteps(currentSteps);
            if (name === "done" && !failed) finished = result.summary;

            // A tool result must stay a string on the wire (see wireMessages),
            // so an image can't ride along in it. see_document's pages instead
            // go out as image_url content parts on a synthetic user turn right
            // after the tool result, the same shape documentScan.js builds for
            // the note-scan vision call.
            conversation = sawPages
              ? [
                  ...conversation,
                  {
                    role: "tool",
                    tool_call_id: call.id,
                    content: [
                      `${result.pages.length} Seite(n) als Bild angehängt.`,
                      result.pages.map((page) => page.cite).filter(Boolean).join("; "),
                    ]
                      .filter(Boolean)
                      .join(" "),
                  },
                  {
                    role: "user",
                    content: [
                      { type: "text", text: "Bild(er) der angeforderten Seite(n):" },
                      ...result.pages.map((page) => ({
                        type: "image_url",
                        image_url: { url: page.src },
                      })),
                    ],
                  },
                ]
              : [
                  ...conversation,
                  {
                    role: "tool",
                    tool_call_id: call.id,
                    content: typeof result === "string" ? result : JSON.stringify(result),
                  },
                ];
          }

          if (finished !== null) {
            lastReplyText = finished || "Fertig.";
            setMessages((current) => [
              ...current,
              {
                role: "assistant",
                content: lastReplyText,
                steps: currentSteps,
                elapsedMs: Date.now() - startTimeRef.current,
              },
            ]);
            setSteps([]);
            break;
          }

          if (step === MAX_STEPS - 1) {
            setMessages((current) => [
              ...current,
              {
                role: "assistant",
                content: `Schrittgrenze von ${MAX_STEPS} erreicht. Alles bisher Geschriebene bleibt stehen.`,
                steps: currentSteps,
                elapsedMs: Date.now() - startTimeRef.current,
              },
            ]);
            setSteps([]);
          }
        }
        setStatus("idle");
        if (needsTitle && lastReplyText) {
          generateTitle(task, lastReplyText, controller.signal, model).then((title) => {
            if (!title) return;
            setSessions((current) => {
              const updated = current.map((s) =>
                s.id === sessionIdAtStart ? { ...s, title } : s,
              );
              saveSessions(documentId, updated);
              return updated;
            });
          });
        }
      } catch (runError) {
        if (runError?.name === "AbortError") {
          setStatus("idle");
          return;
        }
        setError(runError.message);
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [activeId, documentId, fast, inkControllerRef, messages, model, noteTitle, status, subject],
  );

  return {
    messages,
    sessions,
    activeId,
    steps,
    status,
    isRunning: status === "running",
    error,
    tokens,
    elapsedMs,
    streamText,
    send,
    stop,
    clear,
    selectSession,
    startNew,
    deleteSession,
    renameSession,
  };
}
