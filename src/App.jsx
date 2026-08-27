import React, { useRef, useState } from "react";
import { Sparkles, Share, MoreHorizontal } from "lucide-react";
import "./styles/main.css";
import SplitLayout from "./components/SplitLayout";
import Library from "./components/Library";
import Settings from "./components/Settings";
import useLiquidGlass from "./hooks/useLiquidGlass";

function Editor({ activeNote, onBack }) {
  const glassRootRef = useRef(null);
  // The rail is rendered here so it is a direct child of the glass root (the
  // library only picks up ":scope > [data-liquid-glass-control]"); DocumentView
  // portals its buttons in. Keeping it as a state-backed element rather than a
  // ref means the portal target is available on the render after mount.
  const [railSlot, setRailSlot] = useState(null);

  useLiquidGlass(glassRootRef, activeNote?.id || "note");

  return (
    <div className="editor-shell" ref={glassRootRef}>
      <div className="liquid-glass-scene" />
      <div className="editor-title-pill" data-liquid-glass-control="title">
        <span className="editor-title">
          {activeNote?.title || "Neue Notiz"}
        </span>
        {activeNote?.subject && (
          <>
            <span
              style={{
                width: 1,
                height: 18,
                background: "rgba(255,255,255,.14)",
              }}
            />
            <span className="editor-subject">
              {activeNote.subject} · Seite 1
            </span>
          </>
        )}
      </div>
      <div className="editor-actions-pill" data-liquid-glass-control="actions">
        <button className="editor-ai-btn" title="Erklären (KI)">
          <Sparkles size={14} />
        </button>
        <button className="rail-btn" title="Teilen">
          <Share size={16} />
        </button>
        <button className="rail-btn" title="Mehr">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div
        className="editor-sidebar"
        data-liquid-glass-control="rail"
        ref={setRailSlot}
      />
      <div className="editor-body">
        <SplitLayout
          activeTab="smartCanvas"
          note={activeNote}
          documentId={activeNote.id}
          onBack={onBack}
          railSlot={railSlot}
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
