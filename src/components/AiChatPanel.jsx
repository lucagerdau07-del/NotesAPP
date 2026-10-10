import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  X,
  Square,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  ChevronDown,
  History,
  Plus,
  Pencil,
  ScanSearch,
  Globe,
  FileText,
  ExternalLink,
  SquareDashedMousePointer,
  BookOpen,
  Eye,
  FolderOpen,
  Search,
  Puzzle,
  Sigma,
  PenLine,
  Shapes,
  Eraser,
  FilePlus,
  Table,
  Network,
  Wrench,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import { ATTACHMENT_ACCEPT, readAgentAttachment } from "../agent/attachments";
import Markdown, { renderInline } from "./Markdown";
import useAgent from "../hooks/useAgent";
import { CHAT_MODELS, loadChatModel, saveChatModel, loadFastMode, saveFastMode } from "../agent/agentSettings";

// Composer icons drawn on one 24px grid with round caps, so they match the Lucide set next to them.
const iconProps = {
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function BoltIcon({ filled }) {
  return (
    <svg {...iconProps} width="18" height="18" strokeWidth="1.75" fill={filled ? "currentColor" : "none"}>
      <path d="M13.2 2.8 5.4 13.2h5.6l-1.2 8 7.8-10.6h-5.4z" />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg {...iconProps} width="20" height="20" strokeWidth="2.25" fill="none">
      <path d="M12 19.5v-15M5.8 10.6 12 4.4l6.2 6.2" />
    </svg>
  );
}

const SUGGESTIONS = [
  "Fasse das zusammen",
  "Löse die Aufgaben",
  "Erkläre mir das",
];

// The open assistant is one glass control shaped like an L: the tool rail on
// the left plus a band along the bottom that carries the input. The WebGL glass
// is a rectangle, so the L is cut out of it with a clip-path and the messages
// float over the document in the open corner.
const SHAPE_OUTER_RADIUS = 30; // the open rail's cornerRadius (data-config in App.jsx)
const SHAPE_INNER_RADIUS = 22;
const BAND_PADDING = 12; // glass above the input box, same as its inset on the sides
const REVEAL_MS = 520;

// Outline of the L in the sidebar's padding-box pixels, shifted by (dx, dy)
// for the glass canvas, which the library places outside that box. `reveal`
// grows the band out of the rail: 0 is the bare rail, 1 the full width.
export function lShapePath({ width, height, rail, band, reveal = 1, dx = 0, dy = 0 }) {
  const R = SHAPE_OUTER_RADIUS;
  const ri = SHAPE_INNER_RADIUS;
  const top = height - band;
  const right = rail + (width - rail) * reveal;
  const r = Math.max(0, Math.min(ri, (right - rail) / 2, top / 2));
  const x = (v) => Math.round((v + dx) * 10) / 10;
  const y = (v) => Math.round((v + dy) * 10) / 10;
  return [
    `M${x(0)} ${y(R)}`,
    `A${R} ${R} 0 0 1 ${x(R)} ${y(0)}`,
    `H${x(rail - ri)}`,
    `A${ri} ${ri} 0 0 1 ${x(rail)} ${y(ri)}`,
    `V${y(top - r)}`,
    `A${r} ${r} 0 0 0 ${x(rail + r)} ${y(top)}`,
    `H${x(right - r)}`,
    `A${r} ${r} 0 0 1 ${x(right)} ${y(top + r)}`,
    `V${y(height - R)}`,
    `A${R} ${R} 0 0 1 ${x(right - R)} ${y(height)}`,
    `H${x(R)}`,
    `A${R} ${R} 0 0 1 ${x(0)} ${y(height - R)}`,
    "Z",
  ].join(" ");
}

// Keeps the L fitted to the sidebar and the input dock (the band grows with a
// multi-line draft or an attachment), and plays the band's reveal each time
// the panel opens.
function useLShape(active, rootRef, dockRef, shapeRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const dock = dockRef.current;
    const sidebar = root?.parentElement;
    if (!active || !root || !dock || !sidebar) return undefined;

    const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let geometry = null;
    let reveal = reduceMotion ? 1 : 0;
    let frame = 0;
    let settle = 0;

    const paint = () => {
      if (!geometry) return;
      shapeRef.current?.setAttribute("d", lShapePath({ ...geometry, reveal }));
      sidebar.style.setProperty(
        "--agent-clip",
        `path("${lShapePath({ ...geometry, reveal, dx: geometry.cx, dy: geometry.cy })}")`,
      );
      sidebar.style.setProperty("--agent-band", `${geometry.band}px`);
    };

    const measure = () => {
      const canvas = sidebar.querySelector(":scope > canvas");
      const height = sidebar.clientHeight;
      geometry = {
        width: sidebar.clientWidth,
        height,
        rail: root.offsetLeft,
        band: height - dock.offsetTop + BAND_PADDING,
        cx: canvas ? -canvas.offsetLeft : 0,
        cy: canvas ? -canvas.offsetTop : 0,
      };
      paint();
    };

    const observer = new ResizeObserver(measure);
    observer.observe(sidebar);
    observer.observe(dock);
    measure();

    if (!reduceMotion) {
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / REVEAL_MS);
        reveal = 1 - Math.pow(2, -10 * t) * (1 - t); // expo-out, lands exactly on 1
        paint();
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      // rAF doesn't run in a hidden tab; never leave the band stuck closed.
      settle = setTimeout(() => {
        cancelAnimationFrame(frame);
        reveal = 1;
        paint();
      }, REVEAL_MS + 100);
    }

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      sidebar.style.removeProperty("--agent-clip");
      sidebar.style.removeProperty("--agent-band");
    };
  }, [active, rootRef, dockRef, shapeRef]);
}

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

// A document the agent created online (create_google_doc): a tappable card
// that opens it in Google Docs / the browser.
export function DocCard({ card }) {
  return (
    <a className="rail-chat-doccard" href={card.url} target="_blank" rel="noreferrer noopener">
      <span className="rail-chat-doccard-icon">
        <FileText size={20} />
      </span>
      <span className="rail-chat-doccard-text">
        <span className="rail-chat-doccard-title">{card.title}</span>
        <span className="rail-chat-doccard-sub">Google Docs · Zum Öffnen tippen</span>
      </span>
      <ExternalLink size={15} className="rail-chat-doccard-open" />
    </a>
  );
}

// Cards sit outside the collapsible step list, so they stay visible after the
// run's steps are folded away. Library.jsx renders StepList too, so it gets
// them for free.
export function StepList({ steps, elapsedMs }) {
  const cards = steps.filter((step) => step.card);
  return (
    <>
      <Steps steps={steps} elapsedMs={elapsedMs} />
      {cards.map((step) => (
        <DocCard key={step.id} card={step.card} />
      ))}
    </>
  );
}

function Steps({ steps, elapsedMs }) {
  const [expanded, setExpanded] = useState(elapsedMs == null);
  // The live list stays mounted into the finished message (AiChatPanel keeps
  // the same instance), so fold it here once the run reports its time.
  const finished = elapsedMs != null;
  useEffect(() => {
    if (finished) setExpanded(false);
  }, [finished]);

  const failed = steps.filter((step) => step.state === "failed").length;
  // One icon per kind of work, so the folded summary hints at what was done.
  const kinds = [...new Set(steps.map((step) => toolIcon(step.name)))].slice(0, 4);

  return (
    <div className={`rail-chat-steps${finished && !expanded ? " folded" : ""}`}>
      {finished && (
        <button
          type="button"
          className="rail-chat-steps-head"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="rail-chat-steps-stack" aria-hidden="true">
            {kinds.map((Icon, index) => (
              <span key={index}>
                <Icon size={11} strokeWidth={2.2} />
              </span>
            ))}
          </span>
          <span className="rail-chat-steps-title">
            {steps.length} {steps.length === 1 ? "Schritt" : "Schritte"} · {formatWorked(elapsedMs)}
            {failed > 0 && <span className="rail-chat-steps-failed"> · {failed} fehlgeschlagen</span>}
          </span>
          <ChevronDown size={14} className={`rail-chat-steps-chevron${expanded ? " open" : ""}`} />
        </button>
      )}
      {(!finished || expanded) && (
        <ol className="rail-chat-steps-list">
          {steps.map((step) => {
            const Icon = toolIcon(step.name);
            return (
              <li key={step.id} className={`rail-chat-step ${step.state}`}>
                <span className="rail-chat-step-badge">
                  <Icon size={13} strokeWidth={2} />
                  {step.state !== "running" && (
                    <span className="rail-chat-step-mark">
                      {step.state === "failed" ? <X size={8} strokeWidth={4} /> : <Check size={8} strokeWidth={4} />}
                    </span>
                  )}
                </span>
                <span className="rail-chat-step-text">
                  <span className="rail-chat-step-label">{renderInline(step.label, `sl${step.id}`)}</span>
                  {step.detail && (
                    <span className="rail-chat-step-detail">{renderInline(step.detail, `sd${step.id}`)}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const TOOL_ICONS = {
  read_document: BookOpen,
  read_source: BookOpen,
  read_component: BookOpen,
  see_document: Eye,
  list_folders: FolderOpen,
  list_notes: FolderOpen,
  search_sources: Search,
  list_components: Puzzle,
  insert_component: Puzzle,
  define_component: Puzzle,
  search_web: Globe,
  wolfram_alpha: Sigma,
  write_text: PenLine,
  edit_text: PenLine,
  insert_section_header: PenLine,
  insert_callout: PenLine,
  draw: Shapes,
  add_shape: Shapes,
  erase: Eraser,
  delete_objects: Trash2,
  add_page: FilePlus,
  create_file: FilePlus,
  create_google_doc: FileText,
  insert_table: Table,
  edit_table_cell: Table,
  insert_diagram: Network,
  insert_mindmap: Network,
  enable_tools: Wrench,
  done: CheckCheck,
};

function toolIcon(name) {
  return TOOL_ICONS[name] || Sparkles;
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

// Don't split a surrogate pair (emoji) when cutting the revealed text.
export function revealCut(text, cut) {
  let end = Math.min(cut, text.length);
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end += 1;
  return end;
}

const oddCount = (text, marker) => (text.split(marker).length - 1) % 2 === 1;

// The revealed text usually ends mid-markup. Close whatever is still open so
// it renders styled while it grows: bold and code instead of raw asterisks or
// backticks, and a formula as KaTeX that builds up token by token (Markdown
// keeps the last renderable state while the TeX itself is incomplete), rather
// than raw TeX that flips into a formula once its closing delimiter arrives.
export function closeOpenMarkers(text) {
  const line = text.slice(text.lastIndexOf("\n") + 1);
  let closed = text;
  if (oddCount(line, "`")) closed += "`";
  if (oddCount(line, "**") && !line.endsWith("*")) closed += "**";
  if (line.lastIndexOf("\\(") > line.lastIndexOf("\\)")) closed += "\\)";
  else if (oddCount(line.replaceAll("$$", ""), "$") && !line.endsWith("$")) closed += "$";
  if (text.lastIndexOf("\\[") > text.lastIndexOf("\\]")) closed += "\n\\]";
  else if (text.split("\n").filter((l) => l.trim() === "$$").length % 2 === 1) closed += "\n$$";
  return closed;
}

// Streamed deltas land in network-sized bursts with pauses between them.
// Revealing at a pace proportional to the backlog keeps a buffer of about
// REVEAL_LAG_LIVE_MS while the model is still writing, which carries the
// reveal through those pauses instead of catching up and then standing still.
// A finished answer drains faster; the floor keeps a burst's tail from crawling.
const REVEAL_LAG_LIVE_MS = 900;
const REVEAL_LAG_DONE_MS = 250;
const REVEAL_MIN_CHARS_PER_MS = 0.03;

export function useSmoothText(text, live) {
  const [shown, setShown] = useState(live ? "" : text);
  const shownRef = useRef(shown);

  useEffect(() => {
    if (!text.startsWith(shownRef.current)) {
      shownRef.current = text;
      setShown(text);
      return undefined;
    }
    let frame = 0;
    let timer = 0;
    let last = performance.now();
    // rAF paces the reveal with the display; the timeout keeps it moving where
    // rAF is paused (hidden or backgrounded view) so text never stays blank.
    const schedule = () => {
      frame = requestAnimationFrame(tick);
      timer = setTimeout(tick, 100);
    };
    function tick() {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      const now = performance.now();
      const backlog = text.length - shownRef.current.length;
      if (backlog <= 0) return;
      const elapsed = now - last;
      const lag = live ? REVEAL_LAG_LIVE_MS : REVEAL_LAG_DONE_MS;
      const step = Math.max(
        1,
        Math.ceil(elapsed * REVEAL_MIN_CHARS_PER_MS),
        Math.ceil(backlog * Math.min(1, elapsed / lag)),
      );
      last = now;
      const next = text.slice(0, revealCut(text, shownRef.current.length + step));
      if (next.length > shownRef.current.length) {
        shownRef.current = next;
        setShown(next);
      }
      schedule();
    }
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [text, live]);

  return shown;
}

// An assistant answer. While streaming it is the same instance that later
// shows the finished message, so the text keeps flowing across that switch.
// Its height follows the content with a transition: a new line grows the card
// instead of snapping it (and everything stacked above it) a line taller.
function AssistantAnswer({ text, live = false }) {
  const shown = useSmoothText(text, live);
  const cardRef = useRef(null);
  const bodyRef = useRef(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const body = bodyRef.current;
    const fit = () => {
      // 0 while the panel is hidden; keep the last height so reopening doesn't grow every card.
      const height = body.offsetHeight;
      if (height > 0) card.style.height = `${height}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={cardRef} className="rail-chat-msg assistant rail-chat-answer">
      <div ref={bodyRef}>
        <Markdown text={shown === text ? text : closeOpenMarkers(shown)} streaming={live || shown !== text} />
      </div>
      {!live && <CopyButton text={text} />}
    </div>
  );
}

export function ModelSelector({ selectedModel, onSelectModel, variant }) {
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
    <div className={`rail-chat-model-selector${variant ? ` ${variant}` : ""}`} ref={menuRef}>
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
  const rootRef = useRef(null);
  const dockRef = useRef(null);
  const shapeRef = useRef(null);
  useLShape(active, rootRef, dockRef, shapeRef);

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

  // Follows the thread as it grows — every streamed line and every frame of a
  // card's height transition — unless the user has scrolled up to read.
  const threadRef = useRef(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
    stickRef.current = true;
  }, [messages, steps, isRunning]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    const thread = threadRef.current;
    if (!node || !thread) return undefined;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, []);

  // Uploaded files (Bild / PDF / Text), kept until the next message is sent.
  const [attachments, setAttachments] = useState([]);
  const [attachError, setAttachError] = useState("");
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef(null);

  const handleFiles = async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (picked.length === 0) return;
    setAttachError("");
    setIsReadingFile(true);
    for (const file of picked) {
      try {
        const attachment = await readAgentAttachment(file);
        setAttachments((current) => [...current, { id: `${Date.now()}-${Math.random()}`, ...attachment }]);
      } catch (e) {
        setAttachError(e.message || "Datei konnte nicht gelesen werden.");
      }
    }
    setIsReadingFile(false);
  };

  const submit = (event) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || isRunning || isReadingFile) return;
    setDraft("");
    const images = [
      ...(pendingImage ? [pendingImage.dataUrl] : []),
      ...attachments.flatMap((a) => a.images),
    ];
    if (pendingImage) onPendingImageHandled?.();
    send(text, {
      images,
      files: attachments.filter((a) => a.text),
      names: attachments.map((a) => a.name),
    });
    setAttachments([]);
    setAttachError("");
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="rail-chat" hidden={!active} aria-hidden={!active} ref={rootRef}>
      <svg className="rail-chat-shape" aria-hidden="true">
        <defs>
          <linearGradient id="rail-chat-shape-fill" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="rgb(38, 38, 44)" stopOpacity="0.9" />
            <stop offset="0.35" stopColor="rgb(16, 16, 20)" stopOpacity="0.94" />
            <stop offset="1" stopColor="rgb(8, 8, 12)" stopOpacity="0.97" />
          </linearGradient>
          <linearGradient id="rail-chat-shape-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="0.3" stopColor="#fff" stopOpacity="0.1" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.04" />
            <stop offset="0.7" stopColor="#fff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.4" />
          </linearGradient>
        </defs>
        <path ref={shapeRef} />
      </svg>

      <div className="rail-chat-head">
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

      <div
        className="rail-chat-messages"
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
      >
        <div className="rail-chat-thread" ref={threadRef}>
          {messages.length === 0 && !isRunning && (
            <div className="rail-chat-empty-wrap">
              <div className="rail-chat-msg assistant rail-chat-welcome">
                <span className="rail-chat-welcome-title">Worum geht's?</span>
                <p className="rail-chat-empty">
                  Frag etwas zu {noteTitle ? `„${noteTitle}“` : "dieser Notiz"} — oder gib dem Agenten einen Auftrag.
                </p>
              </div>
              {SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rail-chat-suggestion"
                  style={{ "--i": index }}
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* The running turn is one more entry in the same list, keyed by the
              index its finished message will take — so its step list and its
              streaming answer stay the same instances when the run completes. */}
          {(isRunning && (steps.length > 0 || streamText)
            ? [...messages, { role: "assistant", content: streamText.trimStart(), steps, live: true }]
            : messages
          ).map((message, index) => (
            <React.Fragment key={index}>
              {message.role === "assistant" && message.steps?.length > 0 && (
                <StepList steps={message.steps} elapsedMs={message.elapsedMs} />
              )}
              {message.role === "assistant" ? (
                message.content && <AssistantAnswer text={message.content} live={message.live} />
              ) : (
                <div className="rail-chat-msg user">
                  {message.content}
                  <CopyButton text={message.content} />
                </div>
              )}
            </React.Fragment>
          ))}

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
      </div>

      <div className="rail-chat-dock" ref={dockRef}>
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
        {attachments.map((attachment) => (
          <div key={attachment.id} className="rail-chat-attachment">
            {attachment.images[0] && <img src={attachment.images[0]} alt="" />}
            <span className="rail-chat-attachment-label">
              {!attachment.images[0] && <FileText size={12} />}
              {attachment.name}
              {attachment.images.length > 1 ? ` (${attachment.images.length} Seiten)` : ""}
            </span>
            <button
              type="button"
              className="rail-chat-attachment-remove"
              title="Anhang entfernen"
              onClick={() => setAttachments((current) => current.filter((a) => a.id !== attachment.id))}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {(isReadingFile || attachError) && (
          <div className={attachError ? "rail-chat-error" : "rail-chat-status"}>
            {attachError ? <AlertTriangle size={13} /> : <Loader2 size={13} className="rail-chat-spin" />}
            <span>{attachError || "Datei wird gelesen…"}</span>
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
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                style={{ display: "none" }}
                onChange={handleFiles}
              />
              <button
                type="button"
                className="rail-chat-circle-search"
                title="Bild, PDF oder Datei anhängen"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={20} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="rail-chat-circle-search"
                title="Bereich einkreisen und an den Assistenten geben"
                onClick={() => onRequestCircleSearch?.()}
              >
                <SquareDashedMousePointer size={19} strokeWidth={1.75} />
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
                <BoltIcon filled={fast} />
              </button>
            </div>
            {isRunning ? (
              <button type="button" className="rail-chat-send-btn" title="Stoppen" onClick={stop}>
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button type="submit" className="rail-chat-send-btn" title="Senden" disabled={!draft.trim()}>
                <SendArrowIcon />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
