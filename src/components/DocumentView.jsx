import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  Eraser,
  Trash2,
  Undo2,
  Redo2,
  Lasso,
  Highlighter,
  PenLine,
  Layers,
  AlignJustify,
  File,
  Grid,
  Columns2,
  ArrowLeft,
  X,
  Palette,
  Sliders,
  PenTool,
  Pencil,
  Sparkles,
  Infinity,
  Files,
  Plus,
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import useLongPress from "../hooks/useLongPress";
import useInkPointer from "../hooks/useInkPointer";
import { mapViewportPoint, pagePointToViewport } from "../ink/pageCoordinates";
import { renderInkDocument, renderInkStroke, resizeInkCanvas } from "../ink/renderInk";
import { calculateDocumentMetrics } from "../documents/documentLayout";
import DocumentPage from "./document/DocumentPage";

function PenSettingsPopover({
  tool,
  setTool,
  rawLineWidth,
  setLineWidth,
  penColor,
  onClose,
  setIsEraser,
  setIsSelectMode,
}) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !e.target.closest?.(".pen-rail-btn")
      ) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  const isHighlighter = tool === "highlighter";
  const thicknessPresets = isHighlighter
    ? [10, 16, 24, 32, 44]
    : [1.5, 3, 5, 8, 14];

  const tools = [
    { id: "pen", name: "Stift", icon: <PenLine size={15} /> },
    { id: "fountain", name: "Füller", icon: <PenTool size={15} /> },
    { id: "highlighter", name: "Marker", icon: <Highlighter size={15} /> },
    { id: "pencil", name: "Bleistift", icon: <Pencil size={15} /> },
  ];

  return (
    <div
      ref={popoverRef}
      className="editor-popover pen-settings-popover"
      style={{ top: 120, width: 250 }}
      data-testid="pen-settings-popover"
    >
      <div className="editor-popover-header">
        <span className="editor-popover-title">
          <Sliders size={14} /> Stift-Einstellungen
        </span>
        <button
          className="editor-popover-close"
          onClick={onClose}
          title="Schließen"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tool selector */}
      <div className="tool-types-grid">
        {tools.map((t) => (
          <button
            key={t.id}
            className={`tool-type-btn ${tool === t.id ? "active" : ""}`}
            onClick={() => {
              setTool?.(t.id);
              setIsEraser?.(false);
              setIsSelectMode?.(false);
            }}
          >
            {t.icon}
            <span>{t.name}</span>
          </button>
        ))}
      </div>

      {/* Thickness Presets */}
      <div
        style={{
          font: "600 10px ui-monospace, monospace",
          letterSpacing: ".06em",
          color: "rgba(233,230,223,0.5)",
          marginBottom: 6,
        }}
      >
        STRICHSTÄRKE ({rawLineWidth || 3}px)
      </div>
      <div className="thickness-presets">
        {thicknessPresets.map((val) => (
          <button
            key={val}
            className={`thickness-preset-btn ${Math.abs((rawLineWidth || 3) - val) < 0.5 ? "active" : ""}`}
            onClick={() => setLineWidth?.(val)}
            title={`${val}px`}
          >
            <span
              className="thickness-dot"
              style={{
                width: Math.max(
                  3,
                  Math.min(20, val * (isHighlighter ? 0.38 : 1.3)),
                ),
                height: Math.max(
                  3,
                  Math.min(20, val * (isHighlighter ? 0.38 : 1.3)),
                ),
                background: penColor,
              }}
            />
          </button>
        ))}
      </div>

      {/* Continuous Slider */}
      <div className="thickness-slider-wrap">
        <input
          type="range"
          min={isHighlighter ? "8" : "1"}
          max={isHighlighter ? "48" : "20"}
          step={isHighlighter ? "1" : "0.5"}
          value={rawLineWidth || 3}
          onChange={(e) => setLineWidth?.(parseFloat(e.target.value))}
          className="thickness-slider"
        />
        <span className="thickness-val">{rawLineWidth || 3}px</span>
      </div>

      {/* Stroke Preview */}
      <div className="stroke-preview-box">
        <svg
          width="220"
          height="36"
          viewBox="0 0 220 36"
          style={{ overflow: "visible" }}
        >
          <path
            d="M 15 18 Q 65 4, 110 18 T 205 18"
            fill="none"
            stroke={penColor}
            strokeWidth={
              isHighlighter ? (rawLineWidth || 3) * 1.5 : rawLineWidth || 3
            }
            strokeOpacity={isHighlighter ? 0.45 : tool === "pencil" ? 0.75 : 1}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

function EraserSettingsPopover({
  eraserMode,
  setEraserMode,
  eraserWidth,
  setEraserWidth,
  onClose,
}) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !e.target.closest?.(".eraser-rail-btn")
      ) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="editor-popover pen-settings-popover"
      style={{ top: 120, width: 220 }}
      data-testid="eraser-settings-popover"
    >
      <div className="editor-popover-header">
        <span className="editor-popover-title">
          <Eraser size={14} /> Radiergummi
        </span>
        <button
          className="editor-popover-close"
          onClick={onClose}
          title="Schließen"
        >
          <X size={14} />
        </button>
      </div>

      <div className="tool-types-grid">
        <button
          className={`tool-type-btn ${eraserMode !== "stroke" ? "active" : ""}`}
          onClick={() => setEraserMode?.("pixel")}
        >
          <Eraser size={15} />
          <span>Pixel</span>
        </button>
        <button
          className={`tool-type-btn ${eraserMode === "stroke" ? "active" : ""}`}
          onClick={() => setEraserMode?.("stroke")}
        >
          <Eraser size={15} />
          <span>Strich</span>
        </button>
      </div>

      <div
        style={{
          font: "600 10px ui-monospace, monospace",
          letterSpacing: ".06em",
          color: "rgba(233,230,223,0.5)",
          marginBottom: 6,
        }}
      >
        GRÖSSE ({eraserWidth || 15}px)
      </div>
      <div className="thickness-slider-wrap">
        <input
          type="range"
          min="4"
          max="60"
          step="1"
          value={eraserWidth || 15}
          onChange={(e) => setEraserWidth?.(parseFloat(e.target.value))}
          className="thickness-slider"
        />
        <span className="thickness-val">{eraserWidth || 15}px</span>
      </div>
    </div>
  );
}

function ColorWheelPopover({
  customColors,
  activePickerIndex,
  setActivePickerIndex,
  onColorChange,
  onClose,
}) {
  const popoverRef = useRef(null);
  const curColor = customColors[activePickerIndex] || "#EFECE4";
  const [hexInputValue, setHexInputValue] = useState(curColor);

  useEffect(() => {
    setHexInputValue(curColor);
  }, [curColor]);

  useEffect(() => {
    const handleDown = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !e.target.closest?.(".rail-color-wrapper")
      ) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  const presetPalette = [
    "#EFECE4",
    "#A09D95",
    "#484441",
    "#3E7BD8",
    "#2AA9DF",
    "#4FA66B",
    "#84CC16",
    "#D4A937",
    "#E87A38",
    "#D8615B",
    "#E05285",
    "#9353D3",
  ];

  const handleHexSubmit = (val) => {
    setHexInputValue(val);
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      onColorChange(activePickerIndex, val);
    }
  };

  return (
    <div
      ref={popoverRef}
      className="editor-popover color-wheel-popover"
      style={{ top: 220, width: 232 }}
      data-testid="color-wheel-popover"
    >
      <div className="editor-popover-header">
        <span className="editor-popover-title">
          <Palette size={14} /> Farbrad & Palette
        </span>
        <button
          className="editor-popover-close"
          onClick={onClose}
          title="Schließen"
        >
          <X size={14} />
        </button>
      </div>

      {/* Quick Slot Selector */}
      <div className="color-slots-selector">
        {customColors.map((col, idx) => (
          <div
            key={idx}
            className={`slot-circle ${activePickerIndex === idx ? "active" : ""}`}
            style={{ backgroundColor: col }}
            onClick={() => setActivePickerIndex(idx)}
            title={`Slot ${idx + 1} anpassen`}
          />
        ))}
      </div>

      {/* Color Wheel Picker */}
      <HexColorPicker
        color={curColor}
        onChange={(newColor) => {
          onColorChange(activePickerIndex, newColor);
          setHexInputValue(newColor.toUpperCase());
        }}
      />

      {/* Color Presets Palette */}
      <div className="color-presets-grid">
        {presetPalette.map((pCol) => (
          <button
            key={pCol}
            className={`color-preset-btn ${curColor.toLowerCase() === pCol.toLowerCase() ? "active" : ""}`}
            style={{ backgroundColor: pCol }}
            onClick={() => {
              onColorChange(activePickerIndex, pCol);
              setHexInputValue(pCol);
            }}
            title={pCol}
          />
        ))}
      </div>

      {/* Hex Code Input */}
      <div className="hex-input-row">
        <span
          className="hex-preview-dot"
          style={{ backgroundColor: curColor }}
        />
        <input
          type="text"
          className="hex-text-input"
          value={hexInputValue}
          onChange={(e) => handleHexSubmit(e.target.value)}
          placeholder="#FFFFFF"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function ColorSlot({
  colorValue,
  index,
  isActive,
  isEraser,
  onSelect,
  onOpenPicker,
}) {
  const isLongPressRef = useRef(false);
  const timerRef = useRef(null);

  const handlePointerDown = () => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onOpenPicker?.();
    }, 450);
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = () => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    onSelect();
  };

  return (
    <div
      className={`rail-color-wrapper ${isActive && !isEraser ? "active" : ""}`}
      title="Klicken zum Auswählen, gedrückt halten für Farbrad"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      data-testid={`color-slot-${index}`}
    >
      <div
        className={`rail-color ${index === 0 ? "rail-color-light" : ""}`}
        style={{ backgroundColor: colorValue, pointerEvents: "none" }}
      />
    </div>
  );
}

const baseWidth = 800;
const pageHeight = baseWidth * 1.414;
const PAGE_GAP = 28;
const maxPages = 20;
const emptyDocument = {
  version: 1,
  documentId: "",
  pages: [{ id: "empty-page-1" }],
  strokes: [],
  updatedAt: 0,
};

function clampFocusBoxToPage(focusBox) {
  const width = Math.min(baseWidth, Math.max(0, focusBox.width));
  const height = Math.min(pageHeight, Math.max(0, focusBox.height));
  return {
    ...focusBox,
    x: Math.min(baseWidth - width, Math.max(0, focusBox.x)),
    y: Math.min(pageHeight - height, Math.max(0, focusBox.y)),
    width,
    height,
  };
}

function moveFocusBoxWithinPage(focusBox, dx, dy) {
  return clampFocusBoxToPage({
    ...focusBox,
    x: focusBox.x + dx,
    y: focusBox.y + dy,
  });
}

function relativePoint(element, event) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function focusRectToViewport(layout, focusBox) {
  if (!focusBox) return null;
  const origin = pagePointToViewport(layout, focusBox.pageId, focusBox);
  if (!origin) return null;
  return {
    x: origin.x,
    y: origin.y,
    width: focusBox.width * layout.zoom,
    height: focusBox.height * layout.zoom,
  };
}

export default function DocumentView({
  note,
  sourceHandle,
  sourceLoading,
  sourceError,
  retrySource,
  inkController,
  focusBoxState,
  toolbarState,
  onBack,
  railSlot,
}) {
  const {
    color,
    setColor,
    isEraser,
    setIsEraser,
    lineWidth,
    rawLineWidth,
    setLineWidth,
    eraserWidth,
    setEraserWidth,
    isSelectMode,
    setIsSelectMode,
    paperStyle,
    setPaperStyle,
    layoutMode,
    setLayoutMode,
    rawColor,
    tool,
    setTool,
    showPageBreaks: rawShowPageBreaks,
    setShowPageBreaks,
  } = toolbarState || {};
  const showPageBreaks = note?.kind === 'imported' ? true : rawShowPageBreaks;
  const inkDocument = inkController?.document || emptyDocument;
  const pageIds = inkDocument.pages.map((page) => page.id);
  const pagesCount = pageIds.length;
  const canUndo = inkController?.canUndo;
  const canRedo = inkController?.canRedo;
  const penColor = rawColor ?? color;
  const isFullMode = layoutMode !== "split";
  const [customColors, setCustomColors] = useState([
    "#EFECE4",
    "#3E7BD8",
    "#D8615B",
    "#4FA66B",
    "#D4A937",
  ]);
  const [activePickerIndex, setActivePickerIndex] = useState(0);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState(false);
  const [isEraserSettingsOpen, setIsEraserSettingsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [paperToast, setPaperToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const pagesCountRef = useRef(1);
  useEffect(() => {
    pagesCountRef.current = pagesCount;
  }, [pagesCount]);

  const handleColorChange = (index, newColor) => {
    const newColors = [...customColors];
    newColors[index] = newColor;
    setCustomColors(newColors);
    setColor?.(newColor);
    setIsEraser?.(false);
  };

  const handleUndo = () => {
    inkController?.undo?.();
  };
  const handleRedo = () => {
    inkController?.redo?.();
  };
  const handleClearCanvas = () => {
    inkController?.clearDocument?.();
  };

  const cyclePaperStyle = () => {
    let nextStyle = "lined";
    let label = "Liniert";
    if (paperStyle === "lined") {
      nextStyle = "grid";
      label = "Kariert";
    } else if (paperStyle === "grid") {
      nextStyle = "dotted";
      label = "Punktiert";
    } else if (paperStyle === "dotted") {
      nextStyle = "blank";
      label = "Blanko";
    } else {
      nextStyle = "lined";
      label = "Liniert";
    }
    setPaperStyle?.(nextStyle);
    setPaperToast(label);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setPaperToast(null);
    }, 1600);
  };

  const getPaperStyleIcon = () => {
    if (paperStyle === "lined") return <AlignJustify size={18} />;
    if (paperStyle === "grid") return <Grid size={18} />;
    if (paperStyle === "dotted") return <Sparkles size={18} />;
    return <File size={18} />;
  };

  const [draftFocusBox, setDraftFocusBox] = useState(null);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const documentHeight = pageHeight * pagesCount;
  const pageDescriptors =
    note?.kind === "imported" &&
    Array.isArray(note.pages) &&
    note.pages.length > 0
      ? note.pages
      : pageIds.map((id, index) => ({
          id,
          index,
          width: baseWidth,
          height: pageHeight,
        }));
  const documentMetrics = calculateDocumentMetrics(pageDescriptors);
  const totalDocumentHeight = showPageBreaks
    ? note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : pagesCount * pageHeight * zoom + (pagesCount - 1) * PAGE_GAP
    : note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : documentHeight * zoom;
  const pageLayout = {
    pageIds,
    pageWidth: baseWidth,
    pageHeight,
    pageGap: PAGE_GAP,
    pageLayouts: documentMetrics.pageLayouts,
    zoom,
    showPageBreaks: Boolean(showPageBreaks),
  };
  const draftFocusBoxViewport = focusRectToViewport(pageLayout, draftFocusBox);
  const inkTool = isEraser
    ? inkController?.eraserMode === "stroke"
      ? "stroke-eraser"
      : "pixel-eraser"
    : tool || "pen";
  // Paint only the newly appended segment of the live stroke straight onto the
  // canvas that already renders that page. No React render, no full redraw.
  const drawDraftSegment = (draft, appendedFrom) => {
    if (inkTool === "stroke-eraser") return;
    const points = draft.points.slice(Math.max(0, appendedFrom - 1));
    if (points.length < 2) return;
    const segment = { ...draft, points };
    const pageBox = documentMetrics.pageLayouts.find((p) => p.id === draft.pageId);
    if (!pageBox) return;

    if (note?.kind === "imported") {
      const canvas = containerRef.current?.querySelector(
        `canvas[data-ink-page-id="${draft.pageId}"]`,
      );
      const context = canvas?.getContext("2d");
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      renderInkStroke(context, segment, {
        offsetX: 0,
        offsetY: 0,
        scaleX: canvas.width / pageBox.width,
        scaleY: canvas.height / pageBox.height,
      });
      return;
    }

    const context = inkCanvasRef.current?.getContext("2d");
    if (!context) return;
    const dpr = globalThis.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderInkStroke(context, segment, {
      offsetX: 0,
      offsetY: pageBox.top * zoom,
      scaleX: zoom,
      scaleY: zoom,
    });
  };

  const inkPointer = useInkPointer({
    inputMode: inkController?.inputMode || "stylus",
    tool: inkTool,
    eraserMode: inkController?.eraserMode || "pixel",
    color: penColor || "#EFECE4",
    width: isEraser ? eraserWidth || 15 : (rawLineWidth ?? lineWidth ?? 3),
    mapPoint: (event) =>
      mapViewportPoint(pageLayout, relativePoint(containerRef.current, event)),
    document: inkDocument,
    commitStroke: inkController?.commitStroke,
    removeStrokes: inkController?.removeStrokes,
    onDraftAppend: drawDraftSegment,
  });
  const redrawInkCanvasRef = useRef(null);
  redrawInkCanvasRef.current = () => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const cssWidth = baseWidth * zoom;
    const cssHeight = totalDocumentHeight;
    const dpr = globalThis.devicePixelRatio || 1;
    resizeInkCanvas(canvas, cssWidth, cssHeight, dpr);
    const previewDocument =
      inkPointer.draftStroke && inkTool !== "stroke-eraser"
        ? {
            ...inkDocument,
            strokes: [...inkDocument.strokes, inkPointer.draftStroke],
          }
        : inkDocument;
    renderInkDocument(context, previewDocument, {
      ...pageLayout,
      cssWidth,
      cssHeight,
      dpr,
    });
  };

  useLayoutEffect(() => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return undefined;

    redrawInkCanvasRef.current();
    const observer = new ResizeObserver(() => redrawInkCanvasRef.current?.());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    inkDocument,
    inkPointer.draftStroke,
    inkTool,
    pagesCount,
    showPageBreaks,
    totalDocumentHeight,
    zoom,
  ]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return undefined;
    let mediaQuery = null;
    let disposed = false;

    const removeListener = () => {
      if (!mediaQuery) return;
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleDprChange);
      } else {
        mediaQuery.removeListener?.(handleDprChange);
      }
    };
    const observeCurrentDpr = () => {
      removeListener();
      if (disposed) return;
      const dpr = globalThis.devicePixelRatio || 1;
      mediaQuery = globalThis.matchMedia(`(resolution: ${dpr}dppx)`);
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleDprChange);
      } else {
        mediaQuery.addListener?.(handleDprChange);
      }
    };
    function handleDprChange() {
      redrawInkCanvasRef.current?.();
      observeCurrentDpr();
    }

    observeCurrentDpr();
    return () => {
      disposed = true;
      removeListener();
    };
  }, []);

  // Im Vollmodus füllt das Papier immer die Breite; gescrollt wird vertikal.
  useEffect(() => {
    if (!isFullMode) return;
    const el = scrollRef.current;
    if (!el) return;
    const fit = () => {
      if (el.clientWidth > 0) setZoom(el.clientWidth / baseWidth);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullMode]);

  const clearAllGestures = () => {
    activePointers.current.clear();
    gutterPanData.current = null;
    if (pinchInitialData.current) {
      if (pendingFocusBox.current) {
        focusBoxState?.setFocusBox?.(pendingFocusBox.current);
        pendingFocusBox.current = null;
      }
      pinchInitialData.current = null;
    }
  };

  const handlePointerDown = (e) => {
    if (e.pointerType === "pen") {
      clearAllGestures();
    }
    
    const isBlockedTouch = e.pointerType === "touch" && inkPointer.shouldBlockTouch(e.timeStamp, e.pointerId);

    if (!isSelectMode || isBlockedTouch) {
      inkPointer.onPointerDown(e, { preventDraw: isBlockedTouch });
      return;
    }
    
    inkPointer.onPointerDown(e, { preventDraw: true });

    const point = mapViewportPoint(
      pageLayout,
      relativePoint(containerRef.current, e),
    );
    if (!point) return;
    setDraftFocusBox({
      pageId: point.pageId,
      pointerId: e.pointerId,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      startX: point.x,
      startY: point.y,
    });
  };

  const handlePointerMove = (e) => {
    if (!isSelectMode) {
      inkPointer.onPointerMove(e);
      return;
    }
    
    inkPointer.onPointerMove(e);
    
    if (!draftFocusBox || draftFocusBox.pointerId !== e.pointerId) return;
    const point = mapViewportPoint(
      pageLayout,
      relativePoint(containerRef.current, e),
    );
    if (!point || point.pageId !== draftFocusBox.pageId) return;
    const currentX = point.x;
    const currentY = point.y;

    setDraftFocusBox((prev) => {
      const x = Math.min(prev.startX, currentX);
      const y = Math.min(prev.startY, currentY);
      const width = Math.abs(currentX - prev.startX);
      const height = Math.abs(currentY - prev.startY);
      return { ...prev, x, y, width, height };
    });
  };

  const handlePointerUp = (e) => {
    if (!isSelectMode) {
      inkPointer.onPointerUp(e);
      return;
    }
    
    inkPointer.onPointerUp(e);
    
    if (!draftFocusBox || draftFocusBox.pointerId !== e.pointerId) return;
    if (draftFocusBox.width > 10 && draftFocusBox.height > 10) {
      focusBoxState.setFocusBox({
        pageId: draftFocusBox.pageId,
        x: draftFocusBox.x,
        y: draftFocusBox.y,
        width: draftFocusBox.width,
        height: draftFocusBox.height,
      });
    }
    setDraftFocusBox(null);
    setIsSelectMode?.(false);
  };

  const handlePointerCancel = (e) => {
    if (!isSelectMode) {
      inkPointer.onPointerCancel(e);
      return;
    }
    inkPointer.onPointerCancel(e);
    setDraftFocusBox(null);
  };

  const activePointers = useRef(new Map());
  const pinchInitialData = useRef(null);
  const gutterPanData = useRef(null);

  const focusBoxRef = useRef(null);
  const focusDragRef = useRef(null);
  const pendingFocusBox = useRef(null);
  const wheelTimeout = useRef(null);

  const activeFocusBox = pinchInitialData.current && pendingFocusBox.current
    ? pendingFocusBox.current
    : focusBoxState?.focusBox;

  const focusBoxViewport = focusRectToViewport(
    pageLayout,
    activeFocusBox,
  );

  const cancelFocusBoxDrag = () => {
    const drag = focusDragRef.current;
    if (!drag) return;
    focusDragRef.current = null;
    if (drag.animationFrameId !== null)
      cancelAnimationFrame(drag.animationFrameId);
    document.removeEventListener("pointermove", drag.onPointerMove);
    document.removeEventListener("pointerup", drag.onPointerUp);
    document.removeEventListener("pointercancel", drag.onPointerUp);
  };

  useEffect(() => {
    return () => {
      inkPointer.reset?.();
      cancelFocusBoxDrag();
      gutterPanData.current = null;
      activePointers.current.clear();
      pinchInitialData.current = null;
      pendingFocusBox.current = null;
    };
  }, [inkDocument.documentId]);

  const handleGestureStart = (event) => {
    if (event.pointerType === "pen") {
      clearAllGestures();
    }
    const startedOnPage = containerRef.current?.contains(event.target) ?? false;
    if (!startedOnPage) {
      inkPointer.onPointerDown(event, { preventDraw: true });
    }
    if (event.pointerType !== 'touch') return;
    if (inkPointer.shouldBlockTouch(event.timeStamp, event.pointerId)) return;
    activePointers.current.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startedOnPage,
    });

    if (activePointers.current.size === 1 && !startedOnPage) {
      gutterPanData.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: scrollRef.current?.scrollTop ?? 0,
        active: false,
      };
    }

    if (activePointers.current.size !== 2) return;
    gutterPanData.current = null;

    for (const pointerId of activePointers.current.keys()) {
      inkPointer.abortActiveStroke?.(pointerId, event.timeStamp);
    }

    const rect = scrollRef.current.getBoundingClientRect();
    const entries = Array.from(activePointers.current.entries());
    const [id1, first] = entries[0];
    const [id2, second] = entries[1];
    
    pinchInitialData.current = {
      pointerIds: [id1, id2],
      distance: Math.max(Math.hypot(first.x - second.x, first.y - second.y), 1),
      zoom,
      centerX: (first.x + second.x) / 2 - rect.left,
      centerY: (first.y + second.y) / 2 - rect.top,
      scrollTop: scrollRef.current.scrollTop,
      scrollLeft: scrollRef.current.scrollLeft,
      focusBox: focusBoxState?.focusBox ? { ...focusBoxState.focusBox } : null,
      ticking: false,
    };
  };

  const handleGestureMove = (e) => {
    const startedOnPage = containerRef.current?.contains(e.target) ?? false;
    if (!startedOnPage) {
      inkPointer.onPointerMove(e);
    }
    if (e.pointerType !== "touch") return;

    if (inkPointer.shouldBlockTouch(e.timeStamp, e.pointerId)) {
      if (activePointers.current.has(e.pointerId)) {
        handleGestureEnd(e);
      }
      return;
    }

    if (activePointers.current.has(e.pointerId)) {
      const prev = activePointers.current.get(e.pointerId);
      activePointers.current.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
    }

    if (activePointers.current.size === 1 && gutterPanData.current?.pointerId === e.pointerId) {
      const dy = gutterPanData.current.startY - e.clientY;
      if (!gutterPanData.current.active && Math.abs(dy) > 15) {
        gutterPanData.current.active = true;
      }
      if (gutterPanData.current.active && scrollRef.current) {
        scrollRef.current.scrollTop = gutterPanData.current.startScrollTop + dy;
      }
      return;
    }

    if (pinchInitialData.current) {
      if (pinchInitialData.current.ticking) return;
      pinchInitialData.current.ticking = true;

      requestAnimationFrame(() => {
        if (!pinchInitialData.current) return;
        const [id1, id2] = pinchInitialData.current.pointerIds;
        const p1 = activePointers.current.get(id1);
        const p2 = activePointers.current.get(id2);
        
        if (!p1 || !p2) {
          pinchInitialData.current.ticking = false;
          return;
        }

        const rect = scrollRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const currentDistance = Math.hypot(
          p1.x - p2.x,
          p1.y - p2.y,
        );
        const currentCenterX = (p1.x + p2.x) / 2 - rect.left;
        const currentCenterY = (p1.y + p2.y) / 2 - rect.top;

        const {
          distance: startDist,
          zoom: startZoom,
          centerX: startX,
          centerY: startY,
          scrollTop: startScrollTop,
          scrollLeft: startScrollLeft,
          focusBox: startFb,
        } = pinchInitialData.current;

        const newZoom = Math.max(
          0.5,
          Math.min(3, startZoom * (currentDistance / startDist)),
        );
        setZoom(newZoom);

        if (startFb) {
          const ratio = startZoom / newZoom;
          let newY =
            startFb.y + startFb.height / 2 - (startFb.height * ratio) / 2;
          const newHeight = startFb.height * ratio;
          if (newY < 0) newY = 0;
          if (newY + newHeight > pageHeight)
            newY = Math.max(0, pageHeight - newHeight);

          const newFb = clampFocusBoxToPage({
            ...startFb,
            x: startFb.x + startFb.width / 2 - (startFb.width * ratio) / 2,
            y: newY,
            width: startFb.width * ratio,
            height: newHeight,
          });
          pendingFocusBox.current = newFb;
          if (focusBoxRef.current) {
            const viewportRect = focusRectToViewport(
              { ...pageLayout, zoom: newZoom },
              newFb,
            );
            if (viewportRect) {
              focusBoxRef.current.style.left = `${viewportRect.x}px`;
              focusBoxRef.current.style.top = `${viewportRect.y}px`;
              focusBoxRef.current.style.width = `${viewportRect.width}px`;
              focusBoxRef.current.style.height = `${viewportRect.height}px`;
            }
          }
        }

        const scrollContainer = containerRef.current?.parentElement;
        if (scrollContainer) {
          const zoomRatio = newZoom / startZoom;
          scrollContainer.scrollLeft = (startScrollLeft + startX) * zoomRatio - currentCenterX;
          scrollContainer.scrollTop = (startScrollTop + startY) * zoomRatio - currentCenterY;
        }

        if (pinchInitialData.current) {
          pinchInitialData.current.ticking = false;
        }
      });
    }
  };

  useEffect(() => {
    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;
    let wheelTicking = false;
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (!wheelTicking) {
          wheelTicking = true;
          requestAnimationFrame(() => {
            setZoom((prev) => {
              const newZoom = Math.max(
                0.5,
                Math.min(3, prev - e.deltaY * 0.01),
              );
              if (focusBoxState?.focusBox && newZoom !== prev) {
                const ratio = prev / newZoom;
                let newY =
                  focusBoxState.focusBox.y +
                  focusBoxState.focusBox.height / 2 -
                  (focusBoxState.focusBox.height * ratio) / 2;
                const newHeight = focusBoxState.focusBox.height * ratio;
                if (newY < 0) newY = 0;
                if (newY + newHeight > pageHeight)
                  newY = Math.max(0, pageHeight - newHeight);

                const newFb = clampFocusBoxToPage({
                  ...focusBoxState.focusBox,
                  x:
                    focusBoxState.focusBox.x +
                    focusBoxState.focusBox.width / 2 -
                    (focusBoxState.focusBox.width * ratio) / 2,
                  y: newY,
                  width: focusBoxState.focusBox.width * ratio,
                  height: newHeight,
                });
                pendingFocusBox.current = newFb;
                if (focusBoxRef.current) {
                  const viewportRect = focusRectToViewport(
                    { ...pageLayout, zoom: newZoom },
                    newFb,
                  );
                  if (viewportRect) {
                    focusBoxRef.current.style.left = `${viewportRect.x}px`;
                    focusBoxRef.current.style.top = `${viewportRect.y}px`;
                    focusBoxRef.current.style.width = `${viewportRect.width}px`;
                    focusBoxRef.current.style.height = `${viewportRect.height}px`;
                  }
                }
              }
              clearTimeout(wheelTimeout.current);
              wheelTimeout.current = setTimeout(() => {
                if (pendingFocusBox.current) {
                  focusBoxState.setFocusBox(pendingFocusBox.current);
                  pendingFocusBox.current = null;
                }
              }, 150);
              return newZoom;
            });
            wheelTicking = false;
          });
        }
      }
    };
    scrollContainer.addEventListener("wheel", handleWheel, { passive: false });
    return () => scrollContainer.removeEventListener("wheel", handleWheel);
  }, [focusBoxState]);

  const handleGestureEnd = (event) => {
    const startedOnPage = containerRef.current?.contains(event.target) ?? false;
    if (!startedOnPage) {
      if (event.type === 'pointercancel') {
        inkPointer.onPointerCancel(event);
      } else {
        inkPointer.onPointerUp(event);
      }
    }
    if (event.pointerType !== 'touch') return;
    activePointers.current.delete(event.pointerId);
    if (gutterPanData.current?.pointerId === event.pointerId) {
      gutterPanData.current = null;
    }
    
    if (pinchInitialData.current) {
      const [id1, id2] = pinchInitialData.current.pointerIds;
      if (event.pointerId === id1 || event.pointerId === id2) {
        if (pendingFocusBox.current) {
          focusBoxState?.setFocusBox?.(pendingFocusBox.current);
          pendingFocusBox.current = null;
        }
        pinchInitialData.current = null;
      }
    }
  };

  const handleFocusBoxDragStart = (e) => {
    e.stopPropagation();
    if (isSelectMode) return;
    cancelFocusBoxDrag();
    if (!focusBoxState?.focusBox) return;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startBoxX = focusBoxState.focusBox.x;
    const startBoxY = focusBoxState.focusBox.y;
    const boxWidth = focusBoxState.focusBox.width;

    let currentX = startX;
    let currentY = startY;
    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;
    const startScrollTop = scrollContainer.scrollTop;
    const startScrollLeft = scrollContainer.scrollLeft;
    const drag = {
      pointerId,
      animationFrameId: null,
      onPointerMove: null,
      onPointerUp: null,
    };
    const isActiveDrag = () => focusDragRef.current === drag;

    const updateBoxDOM = (dx, dy) => {
      if (!isActiveDrag()) return startBoxY;
      const movedFocusBox = moveFocusBoxWithinPage(
        {
          ...focusBoxState.focusBox,
          x: startBoxX,
          y: startBoxY,
          width: boxWidth,
        },
        dx,
        dy,
      );
      focusBoxState.setFocusBox((prev) =>
        prev
          ? {
              ...prev,
              x: movedFocusBox.x,
              y: movedFocusBox.y,
            }
          : prev,
      );

      return movedFocusBox.y;
    };

    const doScroll = () => {
      if (!isActiveDrag()) return;
      const rect = scrollContainer.getBoundingClientRect();
      const scrollZone = 60;
      const speed = 15;

      let scrolled = false;
      if (currentY < rect.top + scrollZone) {
        scrollContainer.scrollTop -= speed;
        scrolled = true;
      } else if (currentY > rect.bottom - scrollZone) {
        scrollContainer.scrollTop += speed;
        scrolled = true;
      }

      if (currentX < rect.left + scrollZone) {
        scrollContainer.scrollLeft -= speed;
        scrolled = true;
      } else if (currentX > rect.right - scrollZone) {
        scrollContainer.scrollLeft += speed;
        scrolled = true;
      }

      if (scrolled) {
        const dx =
          (currentX - startX + (scrollContainer.scrollLeft - startScrollLeft)) /
          zoom;
        const dy =
          (currentY - startY + (scrollContainer.scrollTop - startScrollTop)) /
          zoom;

        const newY = updateBoxDOM(dx, dy);

        // Auto-expand in continuous mode if near the document bottom
        if (!showPageBreaks) {
          const currentBoxBottom = newY + focusBoxState.focusBox.height;
          const focusPageIndex = pageIds.indexOf(focusBoxState.focusBox.pageId);
          if (
            focusPageIndex === pagesCountRef.current - 1 &&
            pagesCountRef.current < maxPages &&
            currentBoxBottom > pageHeight - 400
          ) {
            inkController?.addPage?.();
          }
        }
      }
      drag.animationFrameId = requestAnimationFrame(doScroll);
    };

    const onPointerMove = (moveEvent) => {
      if (!isActiveDrag() || moveEvent.pointerId !== pointerId) return;
      currentX = moveEvent.clientX;
      currentY = moveEvent.clientY;
      const dx =
        (currentX - startX + (scrollContainer.scrollLeft - startScrollLeft)) /
        zoom;
      const dy =
        (currentY - startY + (scrollContainer.scrollTop - startScrollTop)) /
        zoom;
      updateBoxDOM(dx, dy);
    };

    const onPointerUp = (upEvent) => {
      if (!isActiveDrag() || upEvent.pointerId !== pointerId) return;
      cancelFocusBoxDrag();
    };

    drag.onPointerMove = onPointerMove;
    drag.onPointerUp = onPointerUp;
    focusDragRef.current = drag;
    drag.animationFrameId = requestAnimationFrame(doScroll);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
  };

  const handleFocusBoxKeyDown = (e) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (!direction) return;

    e.preventDefault();
    e.stopPropagation();
    const step = (e.shiftKey ? 50 : 10) / zoom;
    focusBoxState?.setFocusBox((prev) =>
      prev
        ? moveFocusBoxWithinPage(prev, direction[0] * step, direction[1] * step)
        : prev,
    );
  };

  const getStaticBackgroundStyles = () => {
    if (paperStyle === "blank") {
      return { backgroundImage: "none" };
    }

    if (paperStyle === "lined") {
      return {
        backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), rgba(255,255,255,.07) calc(100% - 1px))`,
        backgroundSize: "100% 34px",
        backgroundPosition: "0 92px",
        backgroundRepeat: "repeat-y",
      };
    }

    if (paperStyle === "grid") {
      return {
        backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), rgba(255,255,255,.065) calc(100% - 1px)), linear-gradient(to right, transparent calc(100% - 1px), rgba(255,255,255,.065) calc(100% - 1px))`,
        backgroundSize: "100% 24px, 24px 100%",
        backgroundPosition: "0 92px, 88px 0",
        backgroundRepeat: "repeat-y, repeat-x",
      };
    }

    if (paperStyle === "dotted") {
      return {
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,.18) 1.2px, transparent 1.3px)`,
        backgroundSize: "24px 24px",
        backgroundPosition: "16px 92px",
        backgroundRepeat: "repeat",
      };
    }

    return { backgroundImage: "none" };
  };

  // Portalled into the editor shell when a slot is given, so the rail is a
  // direct child of the Liquid Glass root and can be a glass control. Without a
  // slot (tests, standalone use) it renders in place as before.
  const railContent = (
    <>
      {onBack && (
        <button
          className="rail-btn active"
          onClick={onBack}
          title="Zurück zur Bibliothek"
        >
          <ArrowLeft size={19} />
        </button>
      )}
      <button
        className="rail-btn"
        onClick={handleUndo}
        disabled={!canUndo}
        style={{ opacity: canUndo ? 1 : 0.35 }}
        title="Rückgängig"
      >
        <Undo2 size={19} />
      </button>
      <button
        className="rail-btn"
        onClick={handleRedo}
        disabled={!canRedo}
        style={{ opacity: canRedo ? 1 : 0.35 }}
        title="Wiederholen"
      >
        <Redo2 size={19} />
      </button>
      <div className="rail-divider" />
      <button
        className={`rail-btn pen-rail-btn ${tool !== "highlighter" && !isEraser && !isSelectMode ? "active" : ""}`}
        onClick={() => {
          if (tool !== "highlighter" && !isEraser && !isSelectMode) {
            setIsPenSettingsOpen((prev) => !prev);
          } else {
            setTool?.("pen");
            setIsEraser?.(false);
            setIsSelectMode?.(false);
            setIsPenSettingsOpen(true);
          }
          setIsColorPickerOpen(false);
          setIsEraserSettingsOpen(false);
        }}
        title="Stift & Einstellungen"
        data-testid="pen-tool-btn"
      >
        <PenLine size={18} />
      </button>
      <button
        className={`rail-btn ${tool === "highlighter" && !isEraser && !isSelectMode ? "active" : ""}`}
        onClick={() => {
          setTool?.("highlighter");
          setIsEraser?.(false);
          setIsSelectMode?.(false);
          setIsPenSettingsOpen(true);
          setIsColorPickerOpen(false);
          setIsEraserSettingsOpen(false);
        }}
        title="Textmarker"
      >
        <Highlighter size={18} />
      </button>
      <button
        className={`rail-btn eraser-rail-btn ${isEraser && !isSelectMode ? "active" : ""}`}
        onClick={() => {
          if (isEraser && !isSelectMode) {
            setIsEraserSettingsOpen((prev) => !prev);
          } else {
            setIsEraser?.(true);
            setIsSelectMode?.(false);
            setIsPenSettingsOpen(false);
            setIsColorPickerOpen(false);
          }
        }}
        title="Radiergummi"
      >
        <Eraser size={18} />
      </button>
      <button
        className={`rail-btn ${inkController?.inputMode === "finger" ? "active" : ""}`}
        onClick={() =>
          inkController?.setInputMode?.(
            inkController.inputMode === "finger" ? "stylus" : "finger",
          )
        }
        aria-label="Fingermodus"
        aria-pressed={inkController?.inputMode === "finger"}
        title="Fingermodus"
      >
        <Pencil size={18} />
      </button>
      {!isFullMode && (
        <button
          className={`rail-btn ${isSelectMode ? "active" : ""}`}
          onClick={() => {
            const newMode = !isSelectMode;
            setIsSelectMode?.(newMode);
            setIsEraser?.(false);
            if (newMode) {
              focusBoxState?.setFocusBox(null);
            }
          }}
          title="Fokus Box ziehen"
          data-testid="select-mode-btn"
        >
          <Lasso size={18} />
        </button>
      )}
      <div className="rail-divider" />
      {customColors.map((c, index) => (
        <ColorSlot
          key={index}
          index={index}
          colorValue={c}
          isActive={penColor === c && !isEraser && !isSelectMode}
          isEraser={isEraser}
          onSelect={() => {
            if (penColor === c && !isEraser && !isSelectMode) {
              setIsColorPickerOpen((prev) => !prev);
              setActivePickerIndex(index);
            } else {
              setColor?.(c);
              setIsEraser?.(false);
              setIsSelectMode?.(false);
              setActivePickerIndex(index);
            }
            setIsPenSettingsOpen(false);
          }}
          onOpenPicker={() => {
            setActivePickerIndex(index);
            setIsColorPickerOpen(true);
            setIsPenSettingsOpen(false);
          }}
        />
      ))}
      <div className="rail-divider" />
      <button
        className={`rail-btn ${paperStyle !== "blank" ? "active" : ""}`}
        onClick={cyclePaperStyle}
        title={`Papierstil: ${paperStyle} (Klicken zum Wechseln)`}
        data-testid="paper-style-btn"
      >
        {getPaperStyleIcon()}
      </button>
      {note?.kind !== 'imported' && (
        <button
          className={`rail-btn ${showPageBreaks ? "active" : ""}`}
          onClick={() => {
            const next = !showPageBreaks;
            setShowPageBreaks?.(next);
            setPaperToast(
              next ? "Einzelseiten aktiv" : "Unendliches Dokument aktiv",
            );
            setTimeout(() => setPaperToast(null), 1800);
          }}
          title={
            showPageBreaks
              ? "Seitenmodus: Einzelseiten (Klicken für unendliches Dokument)"
              : "Seitenmodus: Unendliches Dokument (Klicken für Einzelseiten)"
          }
          data-testid="page-mode-toggle-btn"
        >
          {showPageBreaks ? <Files size={18} /> : <Infinity size={18} />}
        </button>
      )}
      <button className="rail-btn" onClick={handleClearCanvas} title="Leeren">
        <Trash2 size={18} />
      </button>
      <div className="rail-divider" />
      <button
        className={`rail-btn ${!isFullMode ? "active" : ""}`}
        onClick={() => {
          setIsSelectMode?.(false);
          setLayoutMode?.(isFullMode ? "split" : "full");
        }}
        title={
          isFullMode
            ? "Geteilte Ansicht (Fokus-Box) einschalten"
            : "Geteilte Ansicht ausschalten"
        }
        data-testid="layout-mode-btn"
      >
        <Columns2 size={18} />
      </button>
      <button
        className="rail-btn"
        style={{ marginTop: "auto" }}
        title="Ebenen (bald verfügbar)"
        disabled
      >
        <Layers size={19} />
      </button>
    </>
  );

  return (
    <div
      className={`document-view paper-style-${paperStyle}`}
      data-testid="document-view"
      data-document-id={inkController?.document?.documentId}
      data-document-kind={note?.kind || "blank"}
      data-page-count={pagesCount}
      data-tool={tool}
      data-color={penColor}
      data-pen-width={rawLineWidth ?? lineWidth}
      data-eraser-width={eraserWidth}
      data-input-mode={inkController?.inputMode}
      data-eraser-mode={inkController?.eraserMode}
      data-stroke-count={inkDocument.strokes.length}
      style={{ display: "flex", height: "100%" }}
    >
      {railSlot ? (
        createPortal(railContent, railSlot)
      ) : (
        <div className="editor-sidebar">
          {railContent}
        </div>
      )}

      {/* Floating Popovers */}
      {isPenSettingsOpen && (
        <PenSettingsPopover
          tool={tool}
          setTool={setTool}
          rawLineWidth={rawLineWidth ?? lineWidth}
          setLineWidth={setLineWidth}
          penColor={penColor}
          onClose={() => setIsPenSettingsOpen(false)}
          setIsEraser={setIsEraser}
          setIsSelectMode={setIsSelectMode}
        />
      )}
      {isEraserSettingsOpen && (
        <EraserSettingsPopover
          eraserMode={inkController?.eraserMode}
          setEraserMode={inkController?.setEraserMode}
          eraserWidth={eraserWidth}
          setEraserWidth={setEraserWidth}
          onClose={() => setIsEraserSettingsOpen(false)}
        />
      )}
      {isColorPickerOpen && (
        <ColorWheelPopover
          customColors={customColors}
          activePickerIndex={activePickerIndex ?? 0}
          setActivePickerIndex={setActivePickerIndex}
          onColorChange={handleColorChange}
          onClose={() => setIsColorPickerOpen(false)}
        />
      )}
      {paperToast && (
        <div className="paper-toast" data-testid="paper-toast">
          {getPaperStyleIcon()}
          <span>Papierstil: {paperToast}</span>
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: isFullMode ? "hidden" : "auto",
          position: "relative",
          textAlign: isFullMode ? "left" : "center",
          touchAction: "none",
          // Vollmodus: der Scroll-Container IST das Papier.
          // Startet unterhalb der Pill-Buttons (top: 78px) und schließt bündig am unteren Bildschirmrand ab.
          margin: isFullMode ? "78px 26px 0 104px" : "78px 12px 0 104px",
          background: "transparent",
          color: "#FFFFFF",
        }}
        onPointerDown={handleGestureStart}
        onPointerMove={handleGestureMove}
        onPointerUp={handleGestureEnd}
        onPointerCancel={handleGestureEnd}
        onScroll={(e) => {
          // Notes-App: am unteren Ende wächst das Papier NUR im unendlichen Modus nach.
          if (!showPageBreaks && note?.kind !== 'imported') {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (
              scrollHeight - scrollTop - clientHeight < 200 &&
              pagesCount < maxPages
            ) {
              inkController?.addPage?.();
            }
          }
        }}
      >
        <div
          data-testid="document-page"
          style={{
            display: "inline-block",
            textAlign: "left",
            width: `${baseWidth * zoom}px`,
            height: `${totalDocumentHeight}px`,
            position: "relative",
            backgroundColor: "transparent",
            boxShadow: "none",
            margin: isFullMode ? 0 : "96px 0 24px 0",
            touchAction: isSelectMode || isFullMode ? "none" : "auto",
          }}
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {sourceLoading && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                color: '#fff',
                zIndex: 100,
                borderRadius: isFullMode ? "22px 22px 0 0" : "20px",
              }}
              data-testid="source-loading"
            >
              <span>Dokument wird geladen...</span>
            </div>
          )}
          {sourceError && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                color: '#fff',
                zIndex: 100,
                borderRadius: isFullMode ? "22px 22px 0 0" : "20px",
              }}
              data-testid="source-error"
            >
              <span style={{ marginBottom: 12 }}>Fehler beim Laden des Dokuments</span>
              <button
                onClick={(e) => { e.stopPropagation(); retrySource?.(); }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#3E7BD8',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                Erneut versuchen
              </button>
            </div>
          )}
          {/* Paper Background: 1 continuous paper for infinite mode, discrete page cards with real gaps, or imported document */}
          {note?.kind === "imported" ? (
            documentMetrics.pageLayouts.map((pageLayout) => (
              <div
                key={pageLayout.id}
                style={{
                  position: "absolute",
                  top: `${pageLayout.top * zoom}px`,
                  left: 0,
                  width: `${pageLayout.width * zoom}px`,
                  height: `${pageLayout.height * zoom}px`,
                }}
              >
                <DocumentPage
                  page={pageLayout}
                  sourceType={note.source?.type}
                  sourceHandle={sourceHandle}
                  strokes={inkDocument.strokes}
                  zoom={zoom}
                  dpr={globalThis.devicePixelRatio || 1}
                />
              </div>
            ))
          ) : !showPageBreaks ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${documentHeight * zoom}px`,
                borderRadius: isFullMode ? "22px 22px 0 0" : "20px",
                background:
                  "linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)",
                boxShadow:
                  "inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 34px 74px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${baseWidth}px`,
                  height: `${documentHeight}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "0 0",
                  ...getStaticBackgroundStyles(),
                  pointerEvents: "none",
                  willChange: "transform",
                }}
              />
            </div>
          ) : (
            Array.from({ length: pagesCount }).map((_, i) => {
              const pageTop = i * (pageHeight * zoom + PAGE_GAP);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: `${pageTop}px`,
                    left: 0,
                    width: "100%",
                    height: `${pageHeight * zoom}px`,
                    borderRadius: "20px",
                    background:
                      "linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)",
                    boxShadow:
                      "inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 24px 50px -16px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)",
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: `${baseWidth}px`,
                      height: `${pageHeight}px`,
                      transform: `scale(${zoom})`,
                      transformOrigin: "0 0",
                      ...getStaticBackgroundStyles(),
                      pointerEvents: "none",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 18,
                      top: 16,
                      font: "600 10.5px ui-monospace, monospace",
                      letterSpacing: ".08em",
                      color: "rgba(255,255,255,0.45)",
                      background: "rgba(255,255,255,0.06)",
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.09)",
                      backdropFilter: "blur(10px)",
                      pointerEvents: "none",
                    }}
                  >
                    SEITE {i + 1} / {pagesCount}
                  </span>
                </div>
              );
            })
          )}
          {note?.kind !== 'imported' && (
            <canvas
              ref={inkCanvasRef}
              className="master-canvas"
              data-testid="ink-canvas"
              style={{
                width: "100%",
                height: "100%",
                position: "absolute",
                left: 0,
                top: 0,
                touchAction: "none",
                pointerEvents: "none",
              }}
            />
          )}
          {!isFullMode && focusBoxState?.focusBox && focusBoxViewport && (
            <div
              ref={focusBoxRef}
              className="focus-box"
              data-testid="focus-box"
              role="region"
              aria-label="Fokusbereich"
              tabIndex={0}
              style={{
                left: focusBoxViewport.x,
                top: focusBoxViewport.y,
                width: focusBoxViewport.width,
                height: focusBoxViewport.height,
                position: "absolute",
                border: "2px solid #1976D2",
                backgroundColor: "rgba(25, 118, 210, 0.1)",
                cursor: "move",
                zIndex: 10,
                touchAction: "none",
              }}
              onPointerDown={handleFocusBoxDragStart}
              onKeyDown={handleFocusBoxKeyDown}
            />
          )}
          {draftFocusBox && draftFocusBoxViewport && (
            <div
              data-testid="draft-focus-box"
              style={{
                position: "absolute",
                border: "2px dashed #1976D2",
                backgroundColor: "rgba(25, 118, 210, 0.1)",
                pointerEvents: "none",
                left: draftFocusBoxViewport.x,
                top: draftFocusBoxViewport.y,
                width: draftFocusBoxViewport.width,
                height: draftFocusBoxViewport.height,
                zIndex: 1000,
              }}
            />
          )}
        </div>
        {/* Plus Button under the page (only in showPageBreaks mode for regular notes) */}
        {showPageBreaks && note?.kind !== 'imported' && pagesCount < maxPages && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "24px 0 54px",
              position: "relative",
              zIndex: 10,
            }}
          >
            <button
              className="add-page-btn"
              onClick={() => {
                inkController?.addPage?.();
                setTimeout(() => {
                  if (scrollRef.current) {
                    scrollRef.current.scrollTo({
                      top: scrollRef.current.scrollHeight,
                      behavior: "smooth",
                    });
                  }
                }, 50);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 22px",
                borderRadius: 9999,
                background:
                  "linear-gradient(180deg, rgba(42, 42, 48, 0.78) 0%, rgba(18, 18, 22, 0.9) 100%)",
                backdropFilter: "blur(24px) saturate(1.8)",
                WebkitBackdropFilter: "blur(24px) saturate(1.8)",
                border: "1px solid rgba(255, 255, 255, 0.22)",
                boxShadow:
                  "inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 2px 0 rgba(0, 0, 0, 0.85), 0 16px 36px -12px rgba(0, 0, 0, 0.9)",
                color: "#FFFFFF",
                font: "600 13px Manrope, sans-serif",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title="Neue Seite hinzufügen"
              data-testid="add-page-btn"
            >
              <Plus size={16} strokeWidth={2.4} />
              <span>
                Neue Seite hinzufügen ({pagesCount + 1}/{maxPages})
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
