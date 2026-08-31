import React, { useState } from "react";
import { X, ArrowUp } from "lucide-react";

// ponytail: UI shell only — there is no assistant backend yet (see
// docs/superpowers/plans/2026-08-28-document-ai-agent.md). Wire `send` to the
// agent once it exists; the message list already renders both roles.
export default function AiChatPanel({ onClose, noteTitle }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");

  const send = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { role: "user", text },
      { role: "assistant", text: "Der KI-Assistent ist noch nicht angebunden." },
    ]);
    setDraft("");
  };

  return (
    <div className="rail-chat">
      <div className="rail-chat-head">
        <div className="rail-chat-head-text">
          <span className="rail-chat-title">KI-Assistent</span>
          {noteTitle && <span className="rail-chat-subtitle">{noteTitle}</span>}
        </div>
        <button className="rail-btn rail-chat-close" onClick={onClose} title="Schließen">
          <X size={16} />
        </button>
      </div>
      <div className="rail-chat-messages">
        {messages.length === 0 ? (
          <p className="rail-chat-empty">Frag etwas zu dieser Notiz.</p>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`rail-chat-msg ${message.role}`}>
              {message.text}
            </div>
          ))
        )}
      </div>
      <form className="rail-chat-input" onSubmit={send}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Nachricht…"
          aria-label="Nachricht an den KI-Assistenten"
        />
        <button type="submit" title="Senden" disabled={!draft.trim()}>
          <ArrowUp size={16} />
        </button>
      </form>
    </div>
  );
}
