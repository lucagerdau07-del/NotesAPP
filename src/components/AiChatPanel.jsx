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
  ScanSearch,
  Globe,
  Zap,
} from "lucide-react";
import Markdown, { renderInline } from "./Markdown";
import useAgent from "../hooks/useAgent";
import { CHAT_MODELS, loadChatModel, saveChatModel, loadFastMode, saveFastMode } from "../agent/agentSettings";

const SUGGESTIONS = [
  "Fasse das zusammen",
  "Löse die Aufgaben",
  "Erkläre mir das",
];

// Formats token count: plain below 1000, "k" with one decimal from 1000, "M" from 1_000_000.
export function formatTokens(n) {
  if (n >= 1_000_000) {
    const val = Math.round(n / 100_000) / 10;
    return `${val}M`;
  }
  if (n >= 1000) {
    const val = Math.round(n / 100) / 10;
    return `${val}k`;
  }
  return String(n);
}

export function formatElapsed(ms) {
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
export function useCountUp(target, duration = 500) {
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
export function WritingPen() {
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

// Same status slot as WritingPen, shown instead of it while search_web runs.
export function WritingGlobe() {
  return <Globe size={13} className="rail-chat-status-globe" />;
}

export function StepList({ steps, elapsedMs }) {
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

export function HistoryMenu({ sessions, activeId, onSelect, onStartNew, onDelete, onRename }) {
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

export function CopyButton({ text }) {
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

export function ModelSelector({ selectedModel, onSelectModel }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const activeModel = CHAT_MODELS.find((m) => m.id === selectedModel) || CHAT_MODELS[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="rail-chat-model-selector" ref={menuRef}>
      <button
        type="button"
        className="rail-chat-model-btn"
        onClick={() => setOpen((v) => !v)}
        title="KI-Modell auswählen"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="rail-chat-model-name">{activeModel.name}</span>
        <ChevronDown size={12} className={`rail-chat-model-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="rail-chat-model-menu" role="listbox">
          {CHAT_MODELS.map((m) => {
            const isSelected = m.id === activeModel.id;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`rail-chat-model-option ${isSelected ? "active" : ""}`}
                onClick={() => {
                  onSelectModel(m.id);
                  setOpen(false);
                }}
              >
                <span className="rail-chat-model-option-name">{m.name}</span>
                {isSelected && <Check size={13} className="rail-chat-model-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AiChatPanel({
  active = true,
  onClose,
  noteTitle,
  subject,
  documentId,
  inkControllerRef,
  pendingImage,
  onPendingImageHandled,
  onRequestCircleSearch,
  model,
  onModelChange,
  onFinished,
}) {
  const [draft, setDraft] = useState("");
  const [internalModel, setInternalModel] = useState(() => loadChatModel());
  const currentModelId = model ?? internalModel;
  const [fast, setFast] = useState(() => loadFastMode());
  const toggleFast = () => {
    setFast((v) => {
      const next = !v;
      saveFastMode(next);
      return next;
    });
  };

  const handleSelectModel = (modelId) => {
    if (!model) {
      setInternalModel(modelId);
    }
    saveChatModel(modelId);
    onModelChange?.(modelId);
  };

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
    streamText,
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
    model: currentModelId,
    fast,
  });
  const displayedTokens = useCountUp(tokens);

  // Tells the toolbar to badge the AI button when a run finishes while this
  // panel is closed — the agent itself keeps working either way (the hook
  // above stays mounted regardless of `active`), this just surfaces "done".
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (isRunning) {
      wasRunningRef.current = true;
    } else if (wasRunningRef.current) {
      wasRunningRef.current = false;
      if (!active) onFinished?.();
    }
  }, [isRunning, active, onFinished]);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [draft]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, steps, isRunning]);

  const submit = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isRunning) return;
    setDraft("");
    const image = pendingImage?.dataUrl;
    if (pendingImage) onPendingImageHandled?.();
    send(text, { image });
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

        {isRunning && streamText && (
          <div className="rail-chat-msg assistant">
            <Markdown text={streamText} />
          </div>
        )}

        {isRunning && !streamText && (() => {
          const researching = steps.some((step) => step.state === "running" && step.name === "search_web");
          return (
            <div className="rail-chat-status" aria-label="Der Assistent arbeitet">
              {researching ? <WritingGlobe /> : <WritingPen />}
              <span className="rail-chat-status-shimmer">{researching ? "Recherchiert…" : "Arbeitet…"}</span>
              <span className="rail-chat-status-meta">
                {formatElapsed(elapsedMs)} · {formatTokens(displayedTokens)} Tokens
              </span>
            </div>
          );
        })()}

        {error && (
          <div className="rail-chat-error">
            <AlertTriangle size={13} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {pendingImage && (
        <div className="rail-chat-attachment">
          <img src={pendingImage.dataUrl} alt="Markierter Bereich" />
          <span className="rail-chat-attachment-label">
            <ScanSearch size={12} /> Markierter Bereich
          </span>
          <button
            type="button"
            className="rail-chat-attachment-remove"
            title="Anhang entfernen"
            onClick={() => onPendingImageHandled?.()}
          >
            <X size={12} />
          </button>
        </div>
      )}
      <form className="rail-chat-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={pendingImage ? "Was ist im markierten Bereich?" : "Frag etwas oder gib einen Auftrag…"}
          aria-label="Nachricht an den KI-Assistenten"
        />
        <div className="rail-chat-input-controls">
          <div className="rail-chat-input-tools">
            <button
              type="button"
              className="rail-chat-circle-search"
              title="Bereich einkreisen und an den Assistenten geben"
              onClick={() => onRequestCircleSearch?.()}
            >
              <ScanSearch size={15} />
            </button>
            <ModelSelector
              selectedModel={currentModelId}
              onSelectModel={handleSelectModel}
            />
            <button
              type="button"
              className={`rail-chat-fast-btn ${fast ? "active" : ""}`}
              title={fast ? "Fast-Modus an: recherchiert nur bei Bedarf" : "Fast-Modus aus: recherchiert bei Unsicherheit"}
              aria-pressed={fast}
              onClick={toggleFast}
            >
              <Zap size={14} />
            </button>
          </div>
          {isRunning ? (
            <button type="button" className="rail-chat-send-btn" title="Stoppen" onClick={stop}>
              <Square size={13} />
            </button>
          ) : (
            <button type="submit" className="rail-chat-send-btn" title="Senden" disabled={!draft.trim()}>
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
