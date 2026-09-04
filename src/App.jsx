import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Globe2, Sparkles, Share, MoreHorizontal, Maximize2, Minimize2 } from "lucide-react";
import "./styles/main.css";
import SplitLayout from "./components/SplitLayout";
import Library from "./components/Library";
import Settings from "./components/Settings";
import AiChatPanel from "./components/AiChatPanel";
import BrowserPanel from "./components/BrowserPanel";
import { createBrowserBridge } from "./browser/browserBridge";
import { createBrowserRepository } from "./browser/browserRepository";
import { BrowserLinkProvider } from "./browser/BrowserLinkContext";
import { isInternalBrowserUrl } from "./browser/browserInput";
import useLiquidGlass from "./hooks/useLiquidGlass";
import { browserNoteRepository } from "./storage/noteRepository.js";

const RAIL_WIDTH_STORAGE_KEY = "notes.editor.rail-width";
const RAIL_LEFT_INSET = 8;

function constrainedRailWidth(value) {
  const viewportLimit = Math.max(360, (globalThis.innerWidth || 1024) - 100);
  return Math.round(Math.min(800, viewportLimit, Math.max(360, value)));
}

function savedRailWidth() {
  const stored = Number(globalThis.localStorage?.getItem(RAIL_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored) ? constrainedRailWidth(stored) : null;
}

function Editor({ activeNote, onBack }) {
  const glassRootRef = useRef(null);
  // The rail is rendered here so it is a direct child of the glass root (the
  // library only picks up ":scope > [data-liquid-glass-control]"); DocumentView
  // portals its buttons in. Keeping it as a state-backed element rather than a
  // ref means the portal target is available on the render after mount.
  const [railSlot, setRailSlot] = useState(null);
  const [railWidth, setRailWidth] = useState(savedRailWidth);
  const [isRailResizing, setRailResizing] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [isBrowserFullscreen, setBrowserFullscreen] = useState(false);
  const [browserNavigation, setBrowserNavigation] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [isImmersive, setIsImmersive] = useState(false);
  const inkControllerRef = useRef(null);
  const browserBridge = useMemo(() => createBrowserBridge(), []);
  const browserRepository = useMemo(
    () => createBrowserRepository(globalThis.localStorage),
    [],
  );
  const [imageDropRequest, setImageDropRequest] = useState(null);
  useEffect(() => {
    return browserBridge.subscribe((event) => {
      if (event.type !== "image-drop") return;
      setImageDropRequest({
        id: `${Date.now()}-${Math.random()}`,
        dataUrl: event.dataUrl,
        x: event.x,
        y: event.y,
      });
    });
  }, [browserBridge]);
  const isPanelOpen = panelMode !== null;
  const navigationSequenceRef = useRef(0);
  const railWidthRef = useRef(railWidth);
  const resizePointerRef = useRef(null);
  const openAppLink = (url) => {
    if (!isInternalBrowserUrl(url)) return;
    navigationSequenceRef.current += 1;
    setBrowserNavigation({ id: navigationSequenceRef.current, url });
    setBrowserFullscreen(false);
    setPanelMode("browser");
  };

  const glassInstanceRef = useLiquidGlass(glassRootRef, activeNote?.id || "note");

  useEffect(() => {
    railWidthRef.current = railWidth;
  }, [railWidth]);

  useEffect(() => {
    if (!isRailResizing) return undefined;
    const move = (event) => {
      if (event.pointerId !== resizePointerRef.current) return;
      const nextWidth = constrainedRailWidth(event.clientX - RAIL_LEFT_INSET);
      railWidthRef.current = nextWidth;
      setRailWidth(nextWidth);
    };
    const finish = (event) => {
      if (event.pointerId !== resizePointerRef.current) return;
      globalThis.localStorage?.setItem(RAIL_WIDTH_STORAGE_KEY, String(railWidthRef.current));
      resizePointerRef.current = null;
      setRailResizing(false);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
    };
  }, [isRailResizing]);

  return (
    <BrowserLinkProvider openLink={openAppLink}>
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
        className={`editor-title-pill ${isPanelOpen ? "panel-open" : ""}`}
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
      <div className="editor-actions-pill">
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
        className={`editor-sidebar ${isPanelOpen ? "panel-open" : ""} ${isBrowserFullscreen ? "browser-fullscreen" : ""} ${isRailResizing ? "is-resizing" : ""}`}
        data-testid="editor-sidebar"
        data-mode={panelMode || "closed"}
        data-liquid-glass-control="rail"
        // The glass shader bevels to its own cornerRadius (default 65px,
        // clamped to half the box) regardless of the CSS clip, so the wide
        // open panel needs a smaller radius here or its highlight still
        // arcs like a pill even though the CSS corner is tight.
        data-config={isPanelOpen ? '{"cornerRadius":30}' : undefined}
        style={isPanelOpen && !isBrowserFullscreen && railWidth ? { width: `${railWidth}px` } : undefined}
        onTransitionEnd={(event) => {
          if (event.propertyName === "width")
            glassInstanceRef.current?.markChanged(event.currentTarget);
        }}
      >
        <div className="rail-tools" ref={setRailSlot}>
          <button
            className={`rail-btn rail-ai-btn ${panelMode === "agent" ? "active" : ""}`}
            onClick={() => {
              setBrowserFullscreen(false);
              setPanelMode((mode) => (mode === "agent" ? null : "agent"));
            }}
            title="KI-Assistent"
          >
            <Sparkles size={19} />
          </button>
          <button
            className={`rail-btn rail-browser-btn ${panelMode === "browser" ? "active" : ""}`}
            onClick={() => setPanelMode((mode) => (mode === "browser" ? null : "browser"))}
            title="Browser"
          >
            <Globe2 size={19} />
          </button>
          <div className="rail-divider" />
        </div>
        <AiChatPanel
          active={panelMode === "agent"}
          onClose={() => setPanelMode(null)}
          noteTitle={activeNote?.title}
          subject={activeNote?.subject}
          documentId={String(activeNote?.id ?? "default")}
          inkControllerRef={inkControllerRef}
        />
        <BrowserPanel
          active={panelMode === "browser"}
          bridge={browserBridge}
          repository={browserRepository}
          navigationRequest={browserNavigation}
          onClose={() => {
            setBrowserFullscreen(false);
            setPanelMode(null);
          }}
          onFullscreenChange={setBrowserFullscreen}
        />
        {isPanelOpen && !isBrowserFullscreen && (
          <div
            className="rail-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Seitenfenster-Breite ändern"
            onPointerDown={(event) => {
              event.preventDefault();
              resizePointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              setRailResizing(true);
            }}
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
          imageDropRequest={imageDropRequest}
          onImageDropHandled={(id) =>
            setImageDropRequest((current) => (current?.id === id ? null : current))
          }
        />
      </div>
    </div>
    </BrowserLinkProvider>
  );
}

export default function App() {
  const [screen, setScreen] = useState("library");
  const [activeNote, setActiveNote] = useState(null);

  const openNote = (note) => {
    const id = String(
      note?.id ?? globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}`,
    );
    const fullNote = { ...note, id };
    // Imported documents (PDF/image) already have their own record in
    // documentRepository.js - only notes started from scratch need indexing
    // here so the library can find and re-open them.
    if (fullNote.kind !== "imported") {
      const { title, subject, pageKind, format, background, ruling } = fullNote;
      browserNoteRepository.saveNote({ id, title, subject, pageKind, format, background, ruling });
    }
    setActiveNote(fullNote);
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
