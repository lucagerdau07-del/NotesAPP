import React, { useRef, useState } from "react";
import { ArrowLeft, Sparkles, Share, MoreHorizontal, Maximize2, Minimize2 } from "lucide-react";
import "./styles/main.css";
import SplitLayout from "./components/SplitLayout";
import Library from "./components/Library";
import Settings from "./components/Settings";
import AiChatPanel from "./components/AiChatPanel";
import useLiquidGlass from "./hooks/useLiquidGlass";

function Editor({ activeNote, onBack }) {
  const glassRootRef = useRef(null);
  // The rail is rendered here so it is a direct child of the glass root (the
  // library only picks up ":scope > [data-liquid-glass-control]"); DocumentView
  // portals its buttons in. Keeping it as a state-backed element rather than a
  // ref means the portal target is available on the render after mount.
  const [railSlot, setRailSlot] = useState(null);
  const [isChatOpen, setChatOpen] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isImmersive, setIsImmersive] = useState(false);
  const inkControllerRef = useRef(null);

  const glassInstanceRef = useLiquidGlass(glassRootRef, activeNote?.id || "note");

  return (
    <div
      className={`editor-shell ${isImmersive ? "immersive" : ""}`}
      ref={glassRootRef}
    >
      <div className="liquid-glass-scene" />
      {isImmersive && (
        <button
          className="immersive-exit-btn"
          onClick={() => setIsImmersive(false)}
          title="Vollbild verlassen"
        >
          <Minimize2 size={16} />
        </button>
      )}
      <div
        className={`editor-title-pill ${isChatOpen ? "chat-open" : ""}`}
        data-liquid-glass-control="title"
      >
        {onBack && (
          <button
            className="editor-back-btn"
            onClick={onBack}
            title="Zurück zur Bibliothek"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <span className="editor-title">
          {activeNote?.title || "Neue Notiz"}
        </span>
        <span
          style={{
            width: 1,
            height: 18,
            background: "rgba(255,255,255,.14)",
          }}
        />
        <span className="editor-subject">
          {activeNote?.subject ? `${activeNote.subject} · ` : ""}{currentPage}/{pageCount}
        </span>
      </div>
      <div className="editor-actions-pill" data-liquid-glass-control="actions">
        <button
          className="rail-btn"
          title="Vollbild"
          onClick={() => setIsImmersive(true)}
        >
          <Maximize2 size={16} />
        </button>
        <button className="rail-btn" title="Teilen">
          <Share size={16} />
        </button>
        <button className="rail-btn" title="Mehr">
          <MoreHorizontal size={16} />
        </button>
      </div>
      {/* One glass control: the library re-measures each control's own
          offsetWidth/Height every frame and keeps the canvas content in
          step with the CSS width transition below — but its per-frame path
          only marks *content* dirty on a size change, not the shader render
          itself, so the panel sits blank until something marks it dirty.
          Calling markChanged() on just this element (rather than dispatching
          a global "resize", which forces a full re-capture of every glass
          control on the page and shows as a page-wide flash) triggers that
          redraw for the rail alone. */}
      <div
        className={`editor-sidebar ${isChatOpen ? "chat-open" : ""}`}
        data-liquid-glass-control="rail"
        // The glass shader bevels to its own cornerRadius (default 65px,
        // clamped to half the box) regardless of the CSS clip, so the wide
        // open panel needs a smaller radius here or its highlight still
        // arcs like a pill even though the CSS corner is tight.
        data-config={isChatOpen ? '{"cornerRadius":30}' : undefined}
        onTransitionEnd={(event) => {
          if (event.propertyName === "width")
            glassInstanceRef.current?.markChanged(event.currentTarget);
        }}
      >
        <div className="rail-tools" ref={setRailSlot}>
          <button
            className={`rail-btn rail-ai-btn ${isChatOpen ? "active" : ""}`}
            onClick={() => setChatOpen((open) => !open)}
            title="KI-Assistent"
          >
            <Sparkles size={19} />
          </button>
          <div className="rail-divider" />
        </div>
        {isChatOpen && (
          <AiChatPanel
            onClose={() => setChatOpen(false)}
            noteTitle={activeNote?.title}
            subject={activeNote?.subject}
            documentId={String(activeNote?.id ?? "default")}
            inkControllerRef={inkControllerRef}
          />
        )}
      </div>
      <div className="editor-body">
        <SplitLayout
          activeTab="smartCanvas"
          note={activeNote}
          documentId={activeNote.id}
          onBack={onBack}
          railSlot={railSlot}
          onPageCountChange={setPageCount}
          onCurrentPageChange={setCurrentPage}
          isImmersive={isImmersive}
          inkControllerRef={inkControllerRef}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("library");
  const [activeNote, setActiveNote] = useState(null);

  const openNote = (note) => {
    const id = String(
      note?.id ?? globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}`,
    );
    setActiveNote({ ...note, id });
    setScreen("editor");
  };

  if (screen === "settings") {
    return <Settings onBack={() => setScreen("library")} />;
  }

  if (screen === "library") {
    return (
      <Library
        onOpenNote={openNote}
        onOpenSettings={() => setScreen("settings")}
      />
    );
  }

  return <Editor activeNote={activeNote} onBack={() => setScreen("library")} />;
}
