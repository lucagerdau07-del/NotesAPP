import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowUp,
  Square,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  History,
  Plus,
  Pencil,
} from "lucide-react";
import Markdown, { renderInline } from "./Markdown";
import useAgent from "../hooks/useAgent";

const SUGGESTIONS = [
  "Fasse diese Notiz zusammen",
  "Erstelle mir eine Übersichtsseite dazu",
  "Erkläre mir das Thema Schritt für Schritt",
];

// Rounds to the unit Claude Code itself uses in its status line: plain below
// 1000, "K" from 1000, "M" from 1_000_000.
function formatTokens(n) {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function formatElapsed(ms) {
  return `${Math.round(ms / 1000)}s`;
}

function formatWorked(ms) {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 1000)}s`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelativeWhen(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < MINUTE) return "gerade eben";
  if (diff < HOUR) return `vor ${Math.round(diff / MINUTE)} Min.`;
  if (diff < DAY) return `vor ${Math.round(diff / HOUR)} Std.`;
  const days = Math.round(diff / DAY);
  return days === 1 ? "gestern" : `vor ${days} Tagen`;
}

// Eases the displayed number toward `target` instead of jumping straight to
// it, so a big token update after a slow request still reads as motion.
function useCountUp(target, duration = 500) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    // Tokens only ever climb within a run; a drop means a new run reset the
    // counter, and that should snap, not count down.
    if (target < from) {
      fromRef.current = target;
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(from + (target - from) * t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

// Same glyph as lucide's PenLine, split in two: the pen tilts (animated
// group), the paper line underneath stays put.
function WritingPen() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="rail-chat-status-pen"
    >
      <path d="M13 21h8" />
      <g className="rail-chat-pen-glyph">
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      </g>
    </svg>
  );
}

function StepList({ steps, elapsedMs }) {
  const [expanded, setExpanded] = useState(elapsedMs == null);

  if (elapsedMs != null && !expanded) {
    return (
      <button
        type="button"
        className="rail-chat-steps-collapsed"
        onClick={() => setExpanded(true)}
      >
        <ChevronRight size={12} />
        <span>{formatWorked(elapsedMs)} gearbeitet</span>
      </button>
    );
  }

  return (
    <ul className="rail-chat-steps">
      {elapsedMs != null && (
        <button
          type="button"
          className="rail-chat-steps-collapse"
          onClick={() => setExpanded(false)}
        >
          <ChevronDown size={12} />
          <span>{formatWorked(elapsedMs)} gearbeitet</span>
        </button>
      )}
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
            <span>{renderInline(step.label, `sl${step.id}`)}</span>
          </div>
          {step.detail && (
            <div className="rail-chat-step-detail">
              <span aria-hidden="true">⎿</span>
              <span>{renderInline(step.detail, `sd${step.id}`)}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function HistoryMenu({ sessions, activeId, onSelect, onStartNew, onDelete, onRename }) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const boxRef = useRef(null);

  const commitRename = (id) => {
    onRename(id, renameDraft);
    setRenamingId(null);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="rail-chat-history" ref={boxRef}>
      <button
        className="rail-btn rail-chat-close"
        onClick={() => setOpen((v) => !v)}
        title="Chat-Verlauf"
      >
        <History size={15} />
      </button>
      {open && (
        <div className="rail-chat-history-menu">
          <button
            type="button"
            className="rail-chat-history-new"
            onClick={() => {
              onStartNew();
              setOpen(false);
            }}
          >
            <Plus size={13} /> Neue Unterhaltung
          </button>
          {sessions.length === 0 ? (
            <div className="rail-chat-history-empty">Noch keine gespeicherten Chats.</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`rail-chat-history-item ${session.id === activeId ? "active" : ""}`}
              >
                {renamingId === session.id ? (
                  <input
                    autoFocus
                    className="rail-chat-history-rename-input"
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(session.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => commitRename(session.id)}
                  />
                ) : (
                  <button
                    type="button"
                    className="rail-chat-history-item-main"
                    onClick={() => {
                      onSelect(session.id);
                      setOpen(false);
                    }}
                  >
                    <span className="rail-chat-history-item-title">
                      {session.title || "Unbenannter Chat"}
                    </span>
                    <span className="rail-chat-history-item-when">
                      {formatRelativeWhen(session.savedAt)}
                    </span>
                  </button>
                )}
                {renamingId !== session.id && (
                  <div className="rail-chat-history-item-actions">
                    <button
                      type="button"
                      title="Umbenennen"
                      onClick={() => {
                        setRenamingId(session.id);
                        setRenameDraft(session.title || "");
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      title="Löschen"
                      className="rail-chat-history-item-delete"
                      onClick={() => onDelete(session.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

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
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const {
    messages,
    sessions,
    activeId,
    steps,
    isRunning,
    error,
    tokens,
    elapsedMs,
    send,
    stop,
    clear,
    selectSession,
    startNew,
    deleteSession,
    renameSession,
  } = useAgent({
    documentId,
    noteTitle,
    subject,
    inkControllerRef,
  });
  const displayedTokens = useCountUp(tokens);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, steps, isRunning]);

  const submit = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isRunning) return;
    setDraft("");
    send(text);
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
          <HistoryMenu
            sessions={sessions}
            activeId={activeId}
            onSelect={selectSession}
            onStartNew={startNew}
            onDelete={deleteSession}
            onRename={renameSession}
          />
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
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {messages.map((message, index) => (
          <React.Fragment key={index}>
            {message.role === "assistant" && message.steps?.length > 0 && (
              <StepList steps={message.steps} elapsedMs={message.elapsedMs} />
            )}
            <div className={`rail-chat-msg ${message.role}`}>
              {message.role === "assistant" ? (
                <>
                  <Markdown text={message.content} />
                  <CopyButton text={message.content} />
                </>
              ) : (
                <>
                  {message.content}
                  <CopyButton text={message.content} />
                </>
              )}
            </div>
          </React.Fragment>
        ))}

        {isRunning && steps.length > 0 && <StepList steps={steps} />}

        {isRunning && (
          <div className="rail-chat-status" aria-label="Der Assistent arbeitet">
            <WritingPen />
            <span className="rail-chat-status-shimmer">Arbeitet…</span>
            <span className="rail-chat-status-meta">
              {formatElapsed(elapsedMs)} · {formatTokens(displayedTokens)} Tokens
            </span>
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
          placeholder="Frag etwas oder gib einen Auftrag…"
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
