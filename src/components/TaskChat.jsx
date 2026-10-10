import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, RotateCcw, Square } from "lucide-react";
import useAgent from "../hooks/useAgent";
import { loadChatModel } from "../agent/agentSettings";
import { buildTaskContext, generateStartMessage } from "../agent/taskChat.js";
import { CopyButton, StepList } from "./AiChatPanel";
import Markdown from "./Markdown";

// Erst wenn die Aufgabe so lange ausgewählt bleibt, entsteht die Startnachricht:
// Durchblättern der Liste soll keine Modellaufrufe verbrennen.
export const START_DELAY_MS = 1500;

/**
 * Der Chat zu einer Aufgabe im Kalender (rechte Spalte des Detail-Fensters).
 * Der Verlauf gehört der Aufgabe (`task.key`) und überlebt Neustart und
 * Aufgabenwechsel. `task` kommt aus taskForEntry.
 */
export default function TaskChat({ task }) {
  const [model] = useState(() => loadChatModel());
  const chat = useAgent({ documentId: `task:${task.key}`, model, task });
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const scrollRef = useRef(null);
  const taskRef = useRef(task);
  taskRef.current = task;

  // Eine erledigte Aufgabe bekommt keine automatische Startnachricht.
  const needsStart = chat.messages.length === 0 && !task.done && !chat.isRunning;
  const { seedMessage } = chat;
  useEffect(() => {
    if (!needsStart) return undefined;
    const controller = new AbortController();
    setStartError("");
    const timer = setTimeout(async () => {
      setStarting(true);
      try {
        const text = await generateStartMessage({
          context: buildTaskContext(taskRef.current),
          model,
          signal: controller.signal,
        });
        seedMessage(text);
      } catch (error) {
        if (error?.name !== "AbortError") setStartError(error.message || "Startnachricht fehlgeschlagen.");
      } finally {
        if (!controller.signal.aborted) setStarting(false);
      }
    }, START_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setStarting(false);
    };
  }, [needsStart, task.key, attempt, model, seedMessage]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chat.messages, chat.steps, chat.streamText, starting]);

  const submit = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || chat.isRunning) return;
    setDraft("");
    chat.send(text);
  };

  return (
    <section className="task-chat" aria-label="Chat zur Aufgabe" data-testid="task-chat">
      <header className="task-chat-head">
        <h3 className="task-chat-title">Hilfe zur Aufgabe</h3>
        {chat.messages.length > 0 && (
          <button
            type="button"
            className="task-chat-icon"
            onClick={chat.clear}
            title="Chat neu beginnen"
            aria-label="Chat neu beginnen"
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="task-chat-thread" ref={scrollRef}>
        {chat.messages.map((message, index) => (
          <React.Fragment key={index}>
            {message.role === "assistant" && message.steps?.length > 0 && (
              <StepList steps={message.steps} elapsedMs={message.elapsedMs} />
            )}
            <div className={`task-chat-msg ${message.role}`}>
              {message.role === "assistant" ? <Markdown text={message.content} /> : message.content}
              <CopyButton text={message.content} />
            </div>
          </React.Fragment>
        ))}

        {chat.messages.length === 0 && !starting && !startError && !chat.isRunning && (
          <p className="task-chat-hint">
            {task.done ? "Frag den Agenten zu dieser Aufgabe." : "Der Agent meldet sich gleich."}
          </p>
        )}

        {chat.isRunning && chat.steps.length > 0 && <StepList steps={chat.steps} />}
        {chat.isRunning && chat.streamText && (
          <div className="task-chat-msg assistant">
            <Markdown text={chat.streamText} />
          </div>
        )}
        {(chat.isRunning && !chat.streamText) || starting ? (
          <p className="task-chat-status" role="status">
            {starting ? "Agent bereitet sich vor …" : "Arbeitet …"}
          </p>
        ) : null}

        {startError && (
          <div className="task-chat-error" role="alert">
            <AlertTriangle size={13} aria-hidden="true" />
            <span>{startError}</span>
            <button type="button" onClick={() => setAttempt((count) => count + 1)}>
              Nochmal versuchen
            </button>
          </div>
        )}
        {chat.error && (
          <div className="task-chat-error" role="alert">
            <AlertTriangle size={13} aria-hidden="true" />
            <span>{chat.error}</span>
          </div>
        )}
      </div>

      <form className="task-chat-input" onSubmit={submit}>
        <textarea
          rows={1}
          value={draft}
          placeholder="Frag zur Aufgabe …"
          aria-label="Nachricht an den Agenten"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) submit(event);
          }}
        />
        {chat.isRunning ? (
          <button type="button" className="task-chat-send" onClick={chat.stop} aria-label="Abbrechen">
            <Square size={13} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className="task-chat-send" disabled={!draft.trim()} aria-label="Senden">
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </form>
    </section>
  );
}
