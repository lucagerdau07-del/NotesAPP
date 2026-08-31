import { useCallback, useEffect, useRef, useState } from "react";
import { requestCompletion } from "../agent/agentClient.js";
import { AGENT_TOOLS, describeToolCall, executeTool } from "../agent/tools.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";

const MAX_STEPS = 30;
const MAX_HISTORY = 40;
const STORAGE_PREFIX = "notes.chat.";

function loadChat(documentId) {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_PREFIX + documentId);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChat(documentId, messages) {
  try {
    globalThis.localStorage?.setItem(STORAGE_PREFIX + documentId, JSON.stringify(messages));
  } catch {
    // Storage blocked: the conversation just won't survive a restart.
  }
}

function parseArguments(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

// Only the last MAX_HISTORY messages go to the model, and a tool result is only
// ever a string on the wire.
function wireMessages(messages) {
  return messages.slice(-MAX_HISTORY).map(({ role, content, tool_calls, tool_call_id }) => ({
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
export default function useAgent({ documentId, noteTitle, subject, inkControllerRef }) {
  const [messages, setMessages] = useState(() => loadChat(documentId));
  const [steps, setSteps] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | running | error
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const loadedFor = useRef(documentId);

  if (loadedFor.current !== documentId) {
    loadedFor.current = documentId;
    setMessages(loadChat(documentId));
    setSteps([]);
    setStatus("idle");
    setError(null);
  }

  useEffect(() => {
    saveChat(documentId, messages);
  }, [documentId, messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }, []);

  const clear = useCallback(() => {
    stop();
    setMessages([]);
    setSteps([]);
    setError(null);
  }, [stop]);

  const send = useCallback(
    async (text, { editDocument = true } = {}) => {
      const task = String(text || "").trim();
      if (!task || status === "running") return;

      const controllerAtStart = inkControllerRef?.current;
      const canEdit = editDocument && Boolean(controllerAtStart?.applyCommands);
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("running");
      setError(null);
      setSteps([]);

      // Read through the ref on every call: the controller object is replaced
      // on each render of the editor, and a run outlives many of them.
      const api = {
        getDocument: () => inkControllerRef.current.getDocument(),
        apply: (commands) => inkControllerRef.current.applyCommands(commands),
        getColor: () => inkControllerRef.current.color,
      };

      let conversation = [
        { role: "system", content: buildSystemPrompt({ noteTitle, subject, canEdit }) },
        ...messages,
        { role: "user", content: task },
      ];
      setMessages((current) => [...current, { role: "user", content: task }]);

      try {
        for (let step = 0; step < MAX_STEPS; step += 1) {
          const reply = await requestCompletion({
            messages: wireMessages(conversation),
            tools: canEdit ? AGENT_TOOLS : undefined,
            signal: controller.signal,
          });
          conversation = [...conversation, reply];

          const calls = reply.tool_calls || [];
          if (calls.length === 0) {
            const content = reply.content?.trim();
            setMessages((current) => [
              ...current,
              {
                role: "assistant",
                content: content || "Ich habe keine Antwort erhalten.",
              },
            ]);
            break;
          }

          let finished = null;
          for (const call of calls) {
            const name = call.function?.name;
            const args = parseArguments(call.function?.arguments);
            const label = describeToolCall(name, args || {});
            setSteps((current) => [...current, { id: call.id, label, state: "running" }]);

            let result;
            if (args === null) {
              result = "Fehler: Die Argumente waren kein gültiges JSON.";
            } else {
              try {
                result = executeTool(name, args, api);
              } catch (toolError) {
                result = `Fehler: ${toolError.message}`;
              }
            }
            const failed = typeof result === "string" && result.startsWith("Fehler");
            setSteps((current) =>
              current.map((entry) =>
                entry.id === call.id ? { ...entry, state: failed ? "failed" : "done" } : entry,
              ),
            );
            if (name === "done" && !failed) finished = result.summary;

            conversation = [
              ...conversation,
              {
                role: "tool",
                tool_call_id: call.id,
                content: typeof result === "string" ? result : JSON.stringify(result),
              },
            ];
          }

          if (finished !== null) {
            setMessages((current) => [
              ...current,
              { role: "assistant", content: finished || "Fertig." },
            ]);
            break;
          }

          if (step === MAX_STEPS - 1) {
            setMessages((current) => [
              ...current,
              {
                role: "assistant",
                content: `Schrittgrenze von ${MAX_STEPS} erreicht. Alles bisher Geschriebene bleibt stehen.`,
              },
            ]);
          }
        }
        setStatus("idle");
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
    [inkControllerRef, messages, noteTitle, status, subject],
  );

  return {
    messages,
    steps,
    status,
    isRunning: status === "running",
    error,
    send,
    stop,
    clear,
  };
}
