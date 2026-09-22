import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Globe2, Share, MoreHorizontal, Maximize2, Minimize2, Image as ImageIcon, FileText, FolderOpen, Files, Presentation, Calculator, Check, Trash2, Columns3, X } from "lucide-react";
import "./styles/main.css";
import SplitLayout from "./components/SplitLayout";
import Library from "./components/Library";
import SplitPicker from "./components/SplitPicker";
import { createBrowserBridge } from "./browser/browserBridge";
import { createBrowserRepository } from "./browser/browserRepository";
import { BrowserLinkProvider } from "./browser/BrowserLinkContext";
import { isInternalBrowserUrl } from "./browser/browserInput";
import useLiquidGlass from "./hooks/useLiquidGlass";
import { browserNoteRepository } from "./storage/noteRepository.js";
import { browserDocumentRepository } from "./storage/documentRepository.js";
import { exportDocumentAsPdf, exportPageAsPng } from "./documents/exportDocument.js";
import { isLightBackground } from "./documents/pageStyles.js";

// These screens/panels are not needed on initial load (library or a plain
// note), so they're split into their own chunks and fetched on demand.
const Settings = lazy(() => import("./components/Settings"));
const PlanScreen = lazy(() => import("./components/PlanScreen"));
const AiChatPanel = lazy(() => import("./components/AiChatPanel"));
const BrowserPanel = lazy(() => import("./components/BrowserPanel"));
const PagesPanel = lazy(() => import("./components/PagesPanel"));
const CalculatorPanel = lazy(() => import("./components/CalculatorPanel"));

const RAIL_WIDTH_STORAGE_KEY = "notes.editor.rail-width";
const RAIL_LEFT_INSET = 8;
// Split-screen: up to this many documents side by side, like iPad Split View.
const MAX_PANES = 3;

function constrainedRailWidth(value, containerWidth) {
  // containerWidth is the editor pane's own width. In split view that pane
  // is narrower than the window, so clamping against the full viewport
  // (as a single full-screen editor always was) would let the rail grow
  // wider than the pane itself.
  const viewportLimit = Math.max(360, (containerWidth || globalThis.innerWidth || 1024) - 100);
  return Math.round(Math.min(800, viewportLimit, Math.max(360, value)));
}

function savedRailWidth() {
  const stored = Number(globalThis.localStorage?.getItem(RAIL_WIDTH_STORAGE_KEY));
  return Number.isFinite(stored) ? constrainedRailWidth(stored) : null;
}

function Editor({ activeNote, onBack, isActive = true, paneCount = 1, onSplit, onClosePane }) {
  const glassRootRef = useRef(null);
  // The rail is rendered here so it is a direct child of the glass root (the
  // library only picks up ":scope > [data-liquid-glass-control]"); DocumentView
  // portals its buttons in. Keeping it as a state-backed element rather than a
  // ref means the portal target is available on the render after mount.
  const [railSlot, setRailSlot] = useState(null);
  const [panelSlot, setPanelSlot] = useState(null);
  const [railWidth, setRailWidth] = useState(savedRailWidth);
  const [isRailResizing, setRailResizing] = useState(false);
  const [panelMode, setPanelMode] = useState(null);
  const [isBrowserFullscreen, setBrowserFullscreen] = useState(false);
  const [browserNavigation, setBrowserNavigation] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [navigatePageRequest, setNavigatePageRequest] = useState(null);
  const [isImmersive, setIsImmersive] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  // "Öffnen": the picked PDF is handed down to whichever editor is showing.
  const [openRequest, setOpenRequest] = useState(null);
  const openInputRef = useRef(null);
  // An imported note's pages are fixed by its source file.
  const canOpenPdf = activeNote?.kind !== "imported";
  const inkControllerRef = useRef(null);
  // A pane's keyboard/paste shortcuts must only act while it is the focused
  // one - otherwise e.g. Ctrl+O would try to open a file dialog in every
  // open pane at once. Kept as a ref (rather than an effect dependency) so
  // the listener below doesn't need to be torn down and rebuilt on focus
  // changes.
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const browserBridge = useMemo(() => createBrowserBridge(), []);
  const browserRepository = useMemo(
    () => createBrowserRepository(globalThis.localStorage),
    [],
  );
  const [imageDropRequest, setImageDropRequest] = useState(null);
  // Circle-to-search: DocumentView crops the circled region and hands the
  // data URL up here; the chat panel picks it up as a pending attachment for
  // the next message it sends. Mirrors imageDropRequest's bridge, just the
  // other direction (canvas -> chat instead of browser -> canvas).
  const [pendingAgentImage, setPendingAgentImage] = useState(null);
  // Armed from the chat input's own button: closes the panel so the canvas
  // has room, DocumentView picks this up to arm the drag tool, and
  // onCircleToSearch (below) reopens the panel once a region comes back.
  const [armCircleSearchRequest, setArmCircleSearchRequest] = useState(null);
  useEffect(() => {
    const id = setTimeout(() => {
      import("./backup/cloudBackup.js").then((m) => m.runWeeklyBackupIfDue());
    }, 5000);
    return () => clearTimeout(id);
  }, []);
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
  // AiChatPanel/BrowserPanel stay mounted (toggled via `active`/`hidden`) so
  // their in-memory state survives closing, but they shouldn't be mounted -
  // and their chunks fetched - before the user opens them the first time.
  const [hasOpenedAgent, setHasOpenedAgent] = useState(false);
  const [hasOpenedBrowser, setHasOpenedBrowser] = useState(false);
  const [hasOpenedPages, setHasOpenedPages] = useState(false);
  const [hasOpenedCalculator, setHasOpenedCalculator] = useState(false);
  const [agentDone, setAgentDone] = useState(false);
  useEffect(() => {
    if (panelMode === "agent") {
      setHasOpenedAgent(true);
      setAgentDone(false);
    }
    if (panelMode === "browser") setHasOpenedBrowser(true);
    if (panelMode === "pages") setHasOpenedPages(true);
    if (panelMode === "calculator") setHasOpenedCalculator(true);
  }, [panelMode]);
  const navigationSequenceRef = useRef(0);
  const railWidthRef = useRef(railWidth);
  const resizePointerRef = useRef(null);
  const exportMenuRef = useRef(null);
  const moreMenuRef = useRef(null);

  useEffect(() => {
    if (!isExportMenuOpen && !isMoreMenuOpen) return undefined;
    const handleDown = (event) => {
      if (!exportMenuRef.current?.contains(event.target)) setIsExportMenuOpen(false);
      if (!moreMenuRef.current?.contains(event.target)) setIsMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [isExportMenuOpen, isMoreMenuOpen]);

  useEffect(() => {
    if (!canOpenPdf) return undefined;
    const handleKeyDown = (event) => {
      if (!isActiveRef.current) return;
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== "o") return;
      event.preventDefault();
      openInputRef.current?.click();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canOpenPdf]);

  const openAppLink = (url) => {
    if (!isInternalBrowserUrl(url)) return;
    navigationSequenceRef.current += 1;
    setBrowserNavigation({ id: navigationSequenceRef.current, url });
    setBrowserFullscreen(false);
    setPanelMode("browser");
  };

  const handleExport = async (kind) => {
    setIsExportMenuOpen(false);
    const controller = inkControllerRef.current;
    const inkDoc = controller?.getDocument?.();
    if (!inkDoc) return;
    setIsExporting(true);
    try {
      const filenameBase = title || "Notiz";
      if (kind === "pdf") {
        await exportDocumentAsPdf(inkDoc, filenameBase);
      } else {
        const pageId = inkDoc.pages[currentPage - 1]?.id || inkDoc.pages[0]?.id;
        await exportPageAsPng(inkDoc, pageId, filenameBase);
      }
    } catch (error) {
      globalThis.alert?.(`Export fehlgeschlagen: ${error.message || error}`);
    } finally {
      setIsExporting(false);
    }
  };

  const [title, setTitle] = useState(activeNote?.title || "Neue Notiz");
  const [isRenaming, setRenaming] = useState(false);
  const commitTitle = (value) => {
    setRenaming(false);
    const next = value.trim();
    if (!next || next === title) return;
    setTitle(next);
    if (activeNote.kind === "imported") {
      browserDocumentRepository.renameImportedNote(activeNote.id, next).catch(() => {});
    } else {
      const { subject, pageKind, format, background, ruling } = activeNote;
      browserNoteRepository.saveNote({ id: activeNote.id, title: next, subject, pageKind, format, background, ruling });
    }
  };

  const glassInstanceRef = useLiquidGlass(glassRootRef, activeNote?.id || "note");

  useEffect(() => {
    railWidthRef.current = railWidth;
  }, [railWidth]);

  useEffect(() => {
    if (!isRailResizing) return undefined;
    const move = (event) => {
      if (event.pointerId !== resizePointerRef.current) return;
      // In split view this editor's shell doesn't start at the window's
      // left edge, so the rail's own left inset has to be measured from the
      // pane, not from clientX directly.
      const paneLeft = glassRootRef.current?.getBoundingClientRect().left || 0;
      const nextWidth = constrainedRailWidth(
        event.clientX - paneLeft - RAIL_LEFT_INSET,
        glassRootRef.current?.clientWidth,
      );
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

  const isLightDoc = useMemo(() => {
    const bg = activeNote?.background || activeNote?.pages?.[0]?.background;
    return isLightBackground(bg, activeNote?.kind);
  }, [activeNote]);

  return (
    <BrowserLinkProvider openLink={openAppLink}>
    <div
      className={`editor-shell ${isImmersive ? "immersive" : ""} ${isLightDoc ? "light-doc" : ""}`}
      data-document-theme={isLightDoc ? "light" : "dark"}
      data-whiteboard={activeNote?.pageKind === "whiteboard" ? "" : undefined}
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
        {isRenaming ? (
          <input
            className="editor-title editor-title-input"
            autoFocus
            defaultValue={title}
            size={Math.max(8, title.length)}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <span
            className="editor-title"
            style={{ cursor: "text" }}
            onClick={() => setRenaming(true)}
          >
            {title}
          </span>
        )}
        <span
          style={{
            width: 1,
            height: 18,
            background: "rgba(255,255,255,.14)",
          }}
        />
        {/* min-width 5ch reserves room for the page counter; the icon needs none. */}
        <span
          className="editor-subject"
          style={activeNote?.pageKind === "whiteboard" ? { minWidth: 0 } : undefined}
        >
          {activeNote?.subject ? `${activeNote.subject} · ` : ""}
          {/* A whiteboard has no pages to count. */}
          {activeNote?.pageKind === "whiteboard" ? (
            <Presentation size={13} aria-label="Whiteboard" style={{ verticalAlign: "-2px" }} />
          ) : (
            `${currentPage}/${pageCount}`
          )}
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
        {onSplit && (
          <button
            className="rail-btn"
            title={
              paneCount >= MAX_PANES
                ? `Maximal ${MAX_PANES} Dokumente im Split-Screen`
                : "Weiteres Dokument im Split-Screen öffnen"
            }
            disabled={paneCount >= MAX_PANES}
            onClick={onSplit}
            data-testid="split-add-btn"
          >
            <Columns3 size={16} />
          </button>
        )}
        {paneCount > 1 && (
          <button
            className="rail-btn"
            title="Dieses Dokument schließen"
            onClick={onClosePane}
            data-testid="split-close-pane-btn"
          >
            <X size={16} />
          </button>
        )}
        <div style={{ position: "relative" }} ref={exportMenuRef}>
          <button
            className={`rail-btn ${isExportMenuOpen ? "active" : ""}`}
            title="Exportieren"
            disabled={isExporting}
            onClick={() => setIsExportMenuOpen((prev) => !prev)}
          >
            <Share size={16} />
          </button>
          {isExportMenuOpen && (
            <div className="export-menu">
              <button onClick={() => handleExport("png")}>
                <ImageIcon size={15} /> Seite als PNG
              </button>
              <button onClick={() => handleExport("pdf")}>
                <FileText size={15} /> Dokument als PDF
              </button>
            </div>
          )}
        </div>
        <div style={{ position: "relative" }} ref={moreMenuRef}>
          <button
            className={`rail-btn ${isMoreMenuOpen ? "active" : ""}`}
            title="Mehr"
            onClick={() => setIsMoreMenuOpen((prev) => !prev)}
          >
            <MoreHorizontal size={16} />
          </button>
          {isMoreMenuOpen && (
            <div className="export-menu">
              <button
                disabled={!canOpenPdf}
                style={{ whiteSpace: "nowrap" }}
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  openInputRef.current?.click();
                }}
              >
                <FolderOpen size={15} /> PDF als Hintergrund öffnen
                <span style={{ marginLeft: "auto", opacity: 0.55 }}>Strg+O</span>
              </button>
              <button
                style={{ whiteSpace: "nowrap" }}
                onClick={() => {
                  setIsMoreMenuOpen(false);
                  if (window.confirm("Alles auf dieser Notiz löschen?"))
                    inkControllerRef.current?.clearDocument?.();
                }}
              >
                <Trash2 size={15} /> Alles löschen
              </button>
            </div>
          )}
          <input
            ref={openInputRef}
            type="file"
            accept="application/pdf,.pdf"
            data-testid="open-pdf-input"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) setOpenRequest({ id: `${Date.now()}-${Math.random()}`, file });
            }}
          />
        </div>
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
          <div style={{ order: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button
            className={`rail-btn rail-ai-btn ${panelMode === "agent" ? "active" : ""}`}
            onClick={() => {
              setBrowserFullscreen(false);
              setPanelMode((mode) => (mode === "agent" ? null : "agent"));
            }}
            title="KI-Assistent"
          >
            {agentDone && (
              <span className="rail-btn-badge" aria-label="Agent fertig">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
            <svg width="31" height="31" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <g id="ai-bubble-group" transform="translate(12 12) scale(0.65) translate(-12 -11.25)">
                <path d="M6 4h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-4 3.5V15a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
                <path d="M8 8h8M8 11.3h5" />
              </g>
              <g id="ai-star-group" transform="translate(20.64 12) scale(0.62) translate(-18.6 -10.1)">
                <path
                  d="M20 1.5q0 4.6 3.5 5.5-3.5.9-3.5 5.5-0-4.6-3.5-5.5 3.5-.9 3.5-5.5Z"
                  fill="currentColor"
                  stroke="none"
                />
                <path
                  d="M15.8 12.3q0 2.7 2.1 3.2-2.1.5-2.1 3.2-0-2.7-2.1-3.2 2.1-.5 2.1-3.2Z"
                  fill="currentColor"
                  stroke="none"
                />
              </g>
            </svg>
          </button>
          <button
            className={`rail-btn rail-browser-btn ${panelMode === "browser" ? "active" : ""}`}
            onClick={() => setPanelMode((mode) => (mode === "browser" ? null : "browser"))}
            title="Browser"
          >
            <Globe2 size={19} />
          </button>
          <button
            className={`rail-btn rail-pages-btn ${panelMode === "pages" ? "active" : ""}`}
            onClick={() => setPanelMode((mode) => (mode === "pages" ? null : "pages"))}
            title="Seiten"
          >
            <Files size={18} />
          </button>
          <button
            className={`rail-btn rail-calculator-btn ${panelMode === "calculator" ? "active" : ""}`}
            onClick={() => setPanelMode((mode) => (mode === "calculator" ? null : "calculator"))}
            title="Taschenrechner (CASIO fx-991DEX)"
          >
            <Calculator size={18} />
          </button>
          </div>
        </div>
        <div
          className="rail-layers-slot"
          hidden={panelMode !== "layers"}
          ref={setPanelSlot}
        />
        {hasOpenedAgent && (
          <Suspense fallback={null}>
            <AiChatPanel
              active={panelMode === "agent"}
              onClose={() => setPanelMode(null)}
              noteTitle={activeNote?.title}
              subject={activeNote?.subject}
              documentId={String(activeNote?.id ?? "default")}
              inkControllerRef={inkControllerRef}
              pendingImage={pendingAgentImage}
              onPendingImageHandled={() => setPendingAgentImage(null)}
              onRequestCircleSearch={() => {
                setPanelMode(null);
                setArmCircleSearchRequest({ id: `${Date.now()}-${Math.random()}` });
              }}
              onFinished={() => setAgentDone(true)}
            />
          </Suspense>
        )}
        {hasOpenedBrowser && (
          <Suspense fallback={null}>
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
          </Suspense>
        )}
        {hasOpenedPages && (
          <Suspense fallback={null}>
            <PagesPanel
              active={panelMode === "pages"}
              pages={pages}
              currentPage={currentPage}
              inkControllerRef={inkControllerRef}
              onNavigate={(pageId) =>
                setNavigatePageRequest({ id: `${Date.now()}-${Math.random()}`, pageId })
              }
              onAddPage={() => inkControllerRef.current?.addPage?.()}
              onRemovePage={(pageId) => inkControllerRef.current?.removePage?.(pageId)}
              onReorderPages={(newIds) => inkControllerRef.current?.reorderPages?.(newIds)}
              onClose={() => setPanelMode(null)}
            />
          </Suspense>
        )}
        {hasOpenedCalculator && (
          <Suspense fallback={null}>
            <CalculatorPanel
              active={panelMode === "calculator"}
              isActive={isActive}
              onClose={() => setPanelMode(null)}
              onInsertToDocument={({ dataUrl }) => {
                setImageDropRequest({
                  id: `${Date.now()}-${Math.random()}`,
                  dataUrl,
                  x: null,
                  y: null,
                });
              }}
            />
          </Suspense>
        )}
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
          isActive={isActive}
          onBack={onBack}
          railSlot={railSlot}
          panelSlot={panelSlot}
          panelMode={panelMode}
          setPanelMode={setPanelMode}
          onPageCountChange={setPageCount}
          onCurrentPageChange={setCurrentPage}
          onPagesChange={setPages}
          navigatePageRequest={navigatePageRequest}
          onNavigatePageHandled={(id) =>
            setNavigatePageRequest((current) => (current?.id === id ? null : current))
          }
          isImmersive={isImmersive}
          inkControllerRef={inkControllerRef}
          imageDropRequest={imageDropRequest}
          onImageDropHandled={(id) =>
            setImageDropRequest((current) => (current?.id === id ? null : current))
          }
          onCircleToSearch={(dataUrl) => {
            setPendingAgentImage({ id: `${Date.now()}`, dataUrl });
            setPanelMode("agent");
          }}
          armCircleSearchRequest={armCircleSearchRequest}
          onArmCircleSearchHandled={(id) =>
            setArmCircleSearchRequest((current) => (current?.id === id ? null : current))
          }
          openRequest={openRequest}
          onOpenHandled={(id) => setOpenRequest((current) => (current?.id === id ? null : current))}
        />
      </div>
    </div>
    </BrowserLinkProvider>
  );
}

function equalPaneWidths(count) {
  return Array.from({ length: count }, () => 1 / count);
}

// iPad-style Split View: up to MAX_PANES documents open side by side, each
// its own fully independent Editor (own rail, own toolbars, own ink
// document), separated by draggable dividers.
function Workspace({ notes, widths, onWidthsChange, activePaneId, onFocusPane, onBack, onClosePane, onAddPane }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return undefined;
    const MIN_FRACTION = 0.22;
    const move = (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const containerWidth = containerRef.current?.getBoundingClientRect().width || 1;
      const deltaFraction = (event.clientX - drag.startX) / containerWidth;
      const next = [...drag.startWidths];
      let a = drag.startWidths[drag.index] + deltaFraction;
      let b = drag.startWidths[drag.index + 1] - deltaFraction;
      if (a < MIN_FRACTION) {
        b -= MIN_FRACTION - a;
        a = MIN_FRACTION;
      } else if (b < MIN_FRACTION) {
        a -= MIN_FRACTION - b;
        b = MIN_FRACTION;
      }
      next[drag.index] = a;
      next[drag.index + 1] = b;
      onWidthsChange(next);
    };
    const finish = (event) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setIsResizing(false);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
    };
  }, [isResizing, onWidthsChange]);

  const startResize = (index) => (event) => {
    event.preventDefault();
    dragRef.current = { index, startX: event.clientX, startWidths: [...widths], pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsResizing(true);
  };

  return (
    <div className="workspace" ref={containerRef} data-testid="workspace" data-pane-count={notes.length}>
      {notes.map((note, index) => (
        <React.Fragment key={note.id}>
          <div
            className="workspace-pane"
            data-testid={`workspace-pane-${note.id}`}
            style={{ flexGrow: widths[index] ?? 1 / notes.length, flexBasis: 0 }}
            onPointerDownCapture={() => onFocusPane(note.id)}
          >
            <Editor
              activeNote={note}
              onBack={onBack}
              isActive={notes.length === 1 || activePaneId === note.id}
              paneCount={notes.length}
              onSplit={onAddPane}
              onClosePane={notes.length > 1 ? () => onClosePane(note.id) : undefined}
            />
          </div>
          {index < notes.length - 1 && (
            <div
              className={`workspace-divider ${isResizing && dragRef.current?.index === index ? "is-resizing" : ""}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="Bereichsbreite ändern"
              onPointerDown={startResize(index)}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("library");
  // Up to MAX_PANES notes open side by side in the split-screen workspace.
  const [openNotes, setOpenNotes] = useState([]);
  const [paneWidths, setPaneWidths] = useState([]);
  const [activePaneId, setActivePaneId] = useState(null);
  const [isPickerOpen, setPickerOpen] = useState(false);

  const normalizeNote = (note) => {
    const id = String(
      note?.id ?? globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}`,
    );
    return { ...note, id };
  };

  // Opens a note full-screen, replacing whatever workspace was open before -
  // the ordinary way in from the library.
  const openNote = (note) => {
    const fullNote = normalizeNote(note);
    // New scratch notes are indexed on their first edit (SplitLayout), so an
    // untouched blank note never shows up in the library.
    setOpenNotes([fullNote]);
    setPaneWidths([1]);
    setActivePaneId(fullNote.id);
    setScreen("editor");
  };

  // Adds a note as a new split-screen pane alongside whatever is already
  // open, up to MAX_PANES. Picking a note that's already open just brings
  // its pane into focus instead of opening a duplicate.
  const addPane = (note) => {
    const fullNote = normalizeNote(note);
    setPickerOpen(false);
    if (openNotes.some((n) => n.id === fullNote.id)) {
      setActivePaneId(fullNote.id);
      return;
    }
    if (openNotes.length >= MAX_PANES) return;
    const nextNotes = [...openNotes, fullNote];
    setOpenNotes(nextNotes);
    setPaneWidths(equalPaneWidths(nextNotes.length));
    setActivePaneId(fullNote.id);
  };

  const closePane = (id) => {
    const nextNotes = openNotes.filter((n) => n.id !== id);
    if (nextNotes.length === 0) {
      setOpenNotes([]);
      setScreen("library");
      return;
    }
    setOpenNotes(nextNotes);
    setPaneWidths(equalPaneWidths(nextNotes.length));
    if (activePaneId === id) setActivePaneId(nextNotes[nextNotes.length - 1].id);
  };

  const closeWorkspace = () => {
    setOpenNotes([]);
    setScreen("library");
  };

  if (screen === "settings") {
    return (
      <Suspense fallback={null}>
        <Settings onBack={() => setScreen("library")} />
      </Suspense>
    );
  }

  if (screen === "plan") {
    return (
      <Suspense fallback={null}>
        <PlanScreen onBack={() => setScreen("library")} />
      </Suspense>
    );
  }

  if (screen === "library") {
    return (
      <Library
        onOpenNote={openNote}
        onOpenSettings={() => setScreen("settings")}
        onOpenPlan={() => setScreen("plan")}
      />
    );
  }

  return (
    <>
      <Workspace
        notes={openNotes}
        widths={paneWidths}
        onWidthsChange={setPaneWidths}
        activePaneId={activePaneId}
        onFocusPane={setActivePaneId}
        onBack={closeWorkspace}
        onClosePane={closePane}
        onAddPane={() => setPickerOpen(true)}
      />
      {isPickerOpen && (
        <SplitPicker
          excludeIds={openNotes.map((n) => n.id)}
          onPick={addPane}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
