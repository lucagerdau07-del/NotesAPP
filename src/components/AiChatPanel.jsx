import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowUp,
  Square,
  Trash2,
  Copy,
  Check,
  Wand2,
  MessageSquare,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import Markdown from "./Markdown";
import useAgent from "../hooks/useAgent";

const SUGGESTIONS = [
  "Fasse diese Notiz zusammen",
  "Erstelle mir eine Übersichtsseite dazu",
  "Erkläre mir das Thema Schritt für Schritt",
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rail-chat-copy"
      title="Antwort kopieren"
      onClick={() => {
        globalThis.navigator?.clipboard?.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          },
          () => {},
        );
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export default function AiChatPanel({ active = true, onClose, noteTitle, subject, documentId, inkControllerRef }) {
  const [draft, setDraft] = useState("");
  // Two modes, one conversation: "Agent" hands the model the document tools,
  // "Chat" keeps it to talking. Same rail, no second panel.
  const [editDocument, setEditDocument] = useState(true);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const { messages, steps, isRunning, error, send, stop, clear } = useAgent({
    documentId,
    noteTitle,
    subject,
    inkControllerRef,
  });

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, steps, isRunning]);

  const submit = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isRunning) return;
    setDraft("");
    send(text, { editDocument });
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="rail-chat" hidden={!active} aria-hidden={!active}>
      <div className="rail-chat-head">
        <div className="rail-chat-head-text">
          <span className="rail-chat-title">KI-Assistent</span>
          {noteTitle && <span className="rail-chat-subtitle">{noteTitle}</span>}
        </div>
        <div className="rail-chat-head-actions">
          {messages.length > 0 && (
            <button
              className="rail-btn rail-chat-close"
              onClick={clear}
              title="Unterhaltung löschen"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button className="rail-btn rail-chat-close" onClick={onClose} title="Schließen">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="rail-chat-modes" role="group" aria-label="Modus">
        <button
          type="button"
          className={editDocument ? "active" : ""}
          onClick={() => setEditDocument(true)}
          title="Der Agent darf die Notiz selbst bearbeiten"
        >
          <Wand2 size={13} /> Agent
        </button>
        <button
          type="button"
          className={editDocument ? "" : "active"}
          onClick={() => setEditDocument(false)}
          title="Nur reden, nichts am Dokument ändern"
        >
          <MessageSquare size={13} /> Chat
        </button>
      </div>

      <div className="rail-chat-messages" ref={scrollRef}>
        {messages.length === 0 && !isRunning && (
          <div className="rail-chat-empty-wrap">
            <p className="rail-chat-empty">
              Frag etwas zu dieser Notiz — oder gib dem Agenten einen Auftrag.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rail-chat-suggestion"
                onClick={() => send(suggestion, { editDocument })}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`rail-chat-msg ${message.role}`}>
            {message.role === "assistant" ? (
              <>
                <Markdown text={message.content} />
                <CopyButton text={message.content} />
              </>
            ) : (
              message.content
            )}
          </div>
        ))}

        {steps.length > 0 && (
          <ul className="rail-chat-steps">
            {steps.map((step) => (
              <li key={step.id} className={step.state}>
                <div className="rail-chat-step-line">
                  {step.state === "running" ? (
                    <Loader2 size={12} className="rail-chat-spin" />
                  ) : step.state === "failed" ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <Check size={12} />
                  )}
                  <span>{step.label}</span>
                </div>
                {step.detail && (
                  <div className="rail-chat-step-detail">
                    <span aria-hidden="true">⎿</span>
                    <span>{step.detail}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {isRunning && (
          <div className="rail-chat-typing" aria-label="Der Assistent arbeitet">
            <span />
            <span />
            <span />
          </div>
        )}

        {error && (
          <div className="rail-chat-error">
            <AlertTriangle size={13} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <form className="rail-chat-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={editDocument ? "Auftrag an den Agenten…" : "Nachricht…"}
          aria-label="Nachricht an den KI-Assistenten"
        />
        {isRunning ? (
          <button type="button" title="Stoppen" onClick={stop}>
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" title="Senden" disabled={!draft.trim()}>
            <ArrowUp size={16} />
          </button>
        )}
      </form>
    </div>
  );
}
