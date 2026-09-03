import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Eraser,
  Trash2,
  Undo2,
  Redo2,
  Lasso,
  LassoSelect,
  Highlighter,
  PenLine,
  Layers,
  AlignJustify,
  File,
  Grid,
  Columns2,
  X,
  Palette,
  Sliders,
  PenTool,
  Pencil,
  Sparkles,
  Infinity,
  Files,
  Plus,
  Move,
  Pointer,
  ArrowUpRight,
  Minus,
  Square,
  Circle,
  Type,
  Image as ImageIcon,
  Link2,
  Shapes,
  PaintBucket,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Baseline,
} from "lucide-react";
import { HexColorPicker } from "react-colorful";
import useLongPress from "../hooks/useLongPress";
import useInkPointer from "../hooks/useInkPointer";
import { loadPalmProfile, palmGuardFromProfile } from "../ink/palmSettings.js";
import { mapViewportPoint, pagePointToViewport } from "../ink/pageCoordinates";
import { renderInkDocument, renderInkStroke, resizeInkCanvas } from "../ink/renderInk";
import { calculateDocumentMetrics } from "../documents/documentLayout";
import { INPUT_MODES } from "../ink/inputPolicy";
import DocumentPage from "./document/DocumentPage";
import PageObjectLayer from "./document/PageObjectLayer";
import LassoSelectionLayer from "./document/LassoSelectionLayer";
import WhiteboardEditor from "./WhiteboardEditor.jsx";
import { pageObjectsOf, isPointInsideObject } from "../ink/pageObjects";
import { readImageObjectSource } from "../ink/imageObject";
import { FONT_STACKS, snapTextToGrid } from "../ink/textStyle";
import { rasterizePageWalls, floodFill, fillResultToDataUrl, hexToRgb } from "../ink/bucketFill";
import { strokesInLasso, objectsInLasso, selectionBounds } from "../ink/lasso";

const INPUT_MODE_LABELS = {
  stylus: "Stift",
  finger: "Finger",
  move: "Bewegen",
};
const INPUT_MODE_ICONS = {
  stylus: PenTool,
  finger: Pointer,
  move: Move,
};

// Default footprint per type, in page units. Inserts land centered on the
// visible area, so these only decide how big the thing starts out.
const DESIGN_TOOLS = [
  { id: "arrow", name: "Pfeil", icon: <ArrowUpRight size={15} />, width: 180, height: 90 },
  { id: "line", name: "Linie", icon: <Minus size={15} />, width: 200, height: 0 },
  { id: "rect", name: "Rahmen", icon: <Square size={15} />, width: 200, height: 130 },
  { id: "ellipse", name: "Kreis", icon: <Circle size={15} />, width: 170, height: 170 },
  { id: "image", name: "Bild", icon: <ImageIcon size={15} />, width: 260, height: 180 },
  { id: "link", name: "Link", icon: <Link2 size={15} />, width: 230, height: 30 },
];

// The text tool is armed from its own rail button, not from the shapes
// popover, so it keeps its settings visible while placing.
// A plain click starts this small and grows to fit as you type — no reason
// to seed it with a wide placeholder box first. A dragged box keeps whatever
// size the drag defined instead (see draftPlacement handling below).
const TEXT_TOOL = {
  id: "text",
  name: "Text",
  icon: <Type size={15} />,
  width: 24,
  height: 34,
};

const TEXT_SIZE_PRESETS = [14, 18, 24, 32, 48];

// Rail button icon mirrors whichever pen type is currently picked, so the
// standalone marker button (now folded into the pen popover) isn't missed.
const PEN_TOOL_ICONS = {
  pen: PenLine,
  fountain: PenTool,
  highlighter: Highlighter,
  pencil: Pencil,
};

function DesignToolsPopover({ onInsert, onClose }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !e.target.closest?.(".design-rail-btn")
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
      className="editor-popover design-tools-popover"
      style={{ top: 120, width: 250 }}
      data-testid="design-tools-popover"
    >
      <div className="editor-popover-header">
        <span className="editor-popover-title">
          <Shapes size={14} /> Einfügen
        </span>
        <button className="editor-popover-close" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </div>
      <div className="tool-types-grid">
        {DESIGN_TOOLS.map((item) => (
          <button
            key={item.id}
            className="tool-type-btn"
            data-testid={`insert-${item.id}`}
            onClick={() => onInsert(item)}
          >
            {item.icon}
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const TEXT_COLORS = ["#EFECE4", "#3E7BD8", "#D8615B", "#4FA66B", "#D4A937", "#141418"];

// Edits the selected text object when there is one, otherwise the defaults the
// next insert will use — same controls either way.
function TextSettingsPopover({ style, onStyleChange, paperStyle, onInsert, hasSelection, onClose }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !e.target.closest?.(".text-rail-btn")
      ) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  const alignments = [
    { id: "left", icon: <AlignLeft size={14} /> },
    { id: "center", icon: <AlignCenter size={14} /> },
    { id: "right", icon: <AlignRight size={14} /> },
  ];
  const snapHint = { lined: "Linien", grid: "Karo", dotted: "Punktraster" }[paperStyle] ||
    "unsichtbarem Raster";

  return (
    <div
      ref={popoverRef}
      className="editor-popover text-settings-popover"
      style={{ top: 120, width: 250 }}
      data-testid="text-settings-popover"
    >
      <div className="editor-popover-header">
        <span className="editor-popover-title">
          <Type size={14} /> {hasSelection ? "Text bearbeiten" : "Text-Einstellungen"}
        </span>
        <button className="editor-popover-close" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </div>

      <div className="tool-types-grid">
        {FONT_STACKS.map((font) => (
          <button
            key={font.id}
            className={`tool-type-btn ${style.fontFamily === font.id ? "active" : ""}`}
            data-testid={`text-font-${font.id}`}
            onClick={() => onStyleChange({ fontFamily: font.id })}
          >
            <span style={{ fontFamily: font.stack, fontSize: 15 }}>Ag</span>
            <span>{font.name}</span>
          </button>
        ))}
      </div>

      <div className="text-setting-label">
        SCHRIFTGRÖSSE ({style.snapToLines ? "vom Raster" : `${style.fontSize}px`})
      </div>
      <div className="thickness-presets">
        {TEXT_SIZE_PRESETS.map((size) => (
          <button
            key={size}
            className={`thickness-preset-btn ${style.fontSize === size ? "active" : ""}`}
            disabled={style.snapToLines}
            onClick={() => onStyleChange({ fontSize: size })}
            title={`${size}px`}
          >
            <span style={{ fontSize: Math.min(18, size * 0.42), lineHeight: 1 }}>A</span>
          </button>
        ))}
      </div>
      <div className="thickness-slider-wrap">
        <input
          type="range"
          min="8"
          max="96"
          step="1"
          value={style.fontSize}
          disabled={style.snapToLines}
          onChange={(e) => onStyleChange({ fontSize: parseInt(e.target.value, 10) })}
          className="thickness-slider"
          data-testid="text-size-slider"
        />
        <span className="thickness-val">{style.fontSize}px</span>
      </div>

      <div className="text-setting-label">AUSRICHTUNG & STIL</div>
      <div className="text-style-row">
        {alignments.map((item) => (
          <button
            key={item.id}
            className={`text-style-btn ${style.textAlign === item.id ? "active" : ""}`}
            data-testid={`text-align-${item.id}`}
            onClick={() => onStyleChange({ textAlign: item.id })}
          >
            {item.icon}
          </button>
        ))}
        <button
          className={`text-style-btn ${style.bold ? "active" : ""}`}
          data-testid="text-bold"
          onClick={() => onStyleChange({ bold: !style.bold })}
        >
          <Bold size={14} />
        </button>
        <button
          className={`text-style-btn ${style.italic ? "active" : ""}`}
          data-testid="text-italic"
          onClick={() => onStyleChange({ italic: !style.italic })}
        >
          <Italic size={14} />
        </button>
      </div>

      <div className="text-setting-label">FARBE</div>
      <div className="text-style-row">
        {TEXT_COLORS.map((swatch) => (
          <button
            key={swatch}
            className={`text-color-btn ${
              style.color?.toLowerCase() === swatch.toLowerCase() ? "active" : ""
            }`}
            style={{ background: swatch }}
            title={swatch}
            onClick={() => onStyleChange({ color: swatch })}
          />
        ))}
      </div>

      <div className="text-setting-label">AUF LINIEN SCHREIBEN</div>
      <button
        className={`text-snap-toggle ${style.snapToLines ? "active" : ""}`}
        data-testid="text-snap-toggle"
        onClick={() => onStyleChange({ snapToLines: !style.snapToLines })}
      >
        <Baseline size={14} />
        <span>{style.snapToLines ? `Rastet auf ${snapHint}` : "Frei platzieren"}</span>
      </button>
      {style.snapToLines && (
        <div className="text-style-row" style={{ marginTop: 6 }}>
          {[1, 2].map((step) => (
            <button
              key={step}
              className={`text-style-btn ${style.lineStep === step ? "active" : ""}`}
              data-testid={`text-line-step-${step}`}
              onClick={() => onStyleChange({ lineStep: step })}
              style={{ flex: 1 }}
            >
              {step === 1 ? "1 Zeile" : "2 Zeilen"}
            </button>
          ))}
        </div>
      )}

      {!hasSelection && (
        <button className="text-insert-btn" data-testid="text-insert-btn" onClick={onInsert}>
          <Plus size={14} /> Text einfügen
        </button>
      )}
    </div>
  );
}

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

function PresetSwatch({ color, isActive, onSelect, onDelete }) {
  const isLongPressRef = useRef(false);
  const timerRef = useRef(null);

  const handlePointerDown = () => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onDelete();
    }, 450);
  };

  const cancelPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      className={`color-preset-btn ${isActive ? "active" : ""}`}
      style={{ backgroundColor: color }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onClick={() => {
        if (isLongPressRef.current) {
          isLongPressRef.current = false;
          return;
        }
        onSelect();
      }}
      title={`${color} (gedrückt halten zum Löschen)`}
    />
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
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [savedColors, setSavedColors] = useState([
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
  ]);

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

  const handleHexSubmit = (val) => {
    setHexInputValue(val);
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      onColorChange(activePickerIndex, val);
      setSelectedPreset(null);
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
            onClick={() => {
              setActivePickerIndex(idx);
              setSelectedPreset(null);
            }}
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
          setSelectedPreset(null);
        }}
      />

      {/* Color Presets Palette */}
      <div className="color-presets-grid">
        {savedColors.map((pCol) => (
          <PresetSwatch
            key={pCol}
            color={pCol}
            isActive={selectedPreset?.toLowerCase() === pCol.toLowerCase()}
            onSelect={() => {
              onColorChange(activePickerIndex, pCol);
              setHexInputValue(pCol);
              setSelectedPreset(pCol);
            }}
            onDelete={() =>
              setSavedColors((prev) => prev.filter((c) => c !== pCol))
            }
          />
        ))}
        <button
          className="color-preset-btn color-preset-add"
          onClick={() =>
            setSavedColors((prev) =>
              prev.some((c) => c.toLowerCase() === curColor.toLowerCase())
                ? prev
                : [...prev, curColor],
            )
          }
          title="Aktuelle Farbe speichern"
        >
          <Plus size={12} />
        </button>
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
const DEFAULT_PAGE_BACKGROUND =
  "linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)";

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
  onCurrentPageChange,
  isImmersive,
}) {
  if (inkController?.document?.pages?.[0]?.kind === "whiteboard") {
    return <WhiteboardEditor inkController={inkController} railSlot={railSlot} />;
  }

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
  const pageObjects = pageObjectsOf(inkDocument);
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
  ]);
  const [activePickerIndex, setActivePickerIndex] = useState(0);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState(false);
  const [isEraserSettingsOpen, setIsEraserSettingsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isDesignToolsOpen, setIsDesignToolsOpen] = useState(false);
  const [isTextSettingsOpen, setIsTextSettingsOpen] = useState(false);
  // Defaults for the next text insert. Editing a selected text writes to the
  // object instead, so the popover always shows what the next edit affects.
  const [textStyle, setTextStyle] = useState({
    fontSize: 20,
    fontFamily: "sans",
    textAlign: "left",
    bold: false,
    italic: false,
    snapToLines: true,
    lineStep: 1,
    color: "#EFECE4",
  });
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  // A text object placed by a plain click (not dragged into size) enters edit
  // mode immediately, so the keyboard opens with the caret already blinking
  // where the user tapped instead of requiring a separate double-click.
  const [editingObjectId, setEditingObjectId] = useState(null);
  // Set while a design-tool button is armed: the next drag on the page draws
  // that object instead of an ink stroke. draftPlacement tracks that drag.
  const [placingTool, setPlacingTool] = useState(null);
  const [draftPlacement, setDraftPlacement] = useState(null);
  // A pen of its own: stays on until another tool is picked, fills whatever
  // ink/shape outlines enclose the next click.
  const [isBucketMode, setIsBucketMode] = useState(false);
  // Lasso: lassoDraft is the loop being dragged right now; lassoSelection is
  // what it resolved to (strokes + objects), kept until the next lasso, a
  // delete, or another tool takes over.
  const [isLassoMode, setIsLassoMode] = useState(false);
  const [lassoDraft, setLassoDraft] = useState(null);
  const [lassoSelection, setLassoSelection] = useState(null);
  const imageInputRef = useRef(null);
  const [paperToast, setPaperToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const pagesCountRef = useRef(1);
  useEffect(() => {
    pagesCountRef.current = pagesCount;
  }, [pagesCount]);

  const [zoomToast, setZoomToast] = useState(null);
  const zoomToastTimeoutRef = useRef(null);
  const zoomMountedRef = useRef(false);
  useEffect(() => {
    if (!zoomMountedRef.current) {
      zoomMountedRef.current = true;
      return;
    }
    setZoomToast(Math.round(zoom * 100));
    clearTimeout(zoomToastTimeoutRef.current);
    zoomToastTimeoutRef.current = setTimeout(() => setZoomToast(null), 1200);
  }, [zoom]);

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
  const resolvedPageWidth = inkDocument.pages[0]?.width || baseWidth;
  const resolvedPageHeight = inkDocument.pages[0]?.height || pageHeight;
  const pageBackground = inkDocument.pages[0]?.background || DEFAULT_PAGE_BACKGROUND;
  const documentHeight = resolvedPageHeight * pagesCount;
  const pageDescriptors =
    note?.kind === "imported" &&
    Array.isArray(note.pages) &&
    note.pages.length > 0
      ? note.pages
      : pageIds.map((id, index) => ({
          id,
          index,
          width: inkDocument.pages[index]?.width || resolvedPageWidth,
          height: inkDocument.pages[index]?.height || resolvedPageHeight,
        }));
  const documentMetrics = calculateDocumentMetrics(pageDescriptors);
  const totalDocumentHeight = showPageBreaks
    ? note?.kind === "imported"
      ? documentMetrics.totalHeight * zoom
      : pagesCount * resolvedPageHeight * zoom + (pagesCount - 1) * PAGE_GAP
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
  const normalizedDraftPlacement = draftPlacement
    ? {
        pageId: draftPlacement.pageId,
        x: Math.min(draftPlacement.startX, draftPlacement.startX + draftPlacement.width),
        y: Math.min(draftPlacement.startY, draftPlacement.startY + draftPlacement.height),
        width: Math.abs(draftPlacement.width),
        height: Math.abs(draftPlacement.height),
      }
    : null;
  const draftPlacementViewport = focusRectToViewport(pageLayout, normalizedDraftPlacement);
  const lassoDraftViewportPoints = lassoDraft
    ? lassoDraft.points
        .map((point) => pagePointToViewport(pageLayout, lassoDraft.pageId, point))
        .filter(Boolean)
    : null;
  const lassoSelectionBox = lassoSelection
    ? (() => {
        const bounds = selectionBounds(
          inkDocument.strokes,
          pageObjects,
          lassoSelection.strokeIds,
          lassoSelection.objectIds,
        );
        return bounds ? { ...bounds, pageId: lassoSelection.pageId } : null;
      })()
    : null;
  // Reicht das Papier über die ganze Fensterbreite, verliert der eingerückte
  // Rahmen seinen Sinn: die Seite läuft randlos unter Rail und Pills durch.
  const isFullBleed =
    isImmersive ||
    (isFullMode && baseWidth * zoom >= (globalThis.innerWidth ?? Infinity));
  const isFullBleedRef = useRef(false);
  isFullBleedRef.current = isFullBleed;
  const inputMode = INPUT_MODES.includes(inkController?.inputMode)
    ? inkController.inputMode
    : "stylus";
  const isMoveMode = inputMode === "move";
  const InputModeIcon = INPUT_MODE_ICONS[inputMode];
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

  // Contact geometry is reported in CSS px, so the palm threshold is panel
  // specific; the settings profile is the calibration knob for it. Settings
  // unmounts the document, so reading it once per mount is enough.
  const palmGuard = useMemo(() => palmGuardFromProfile(loadPalmProfile()), []);

  // A snapped text box may not land wherever the drag left it: re-snap on every
  // geometry change so moving and resizing keep the lines aligned.
  const handleObjectChange = (objectId, changes) => {
    const target = pageObjects.find((o) => o.id === objectId);
    const next =
      target?.type === "text" && (target.snapToLines || changes.snapToLines)
        ? { ...changes, ...snapTextToGrid({ ...target, ...changes }, paperStyle) }
        : changes;
    inkController?.updateObject?.(objectId, next);
  };

  const selectedTextObject =
    pageObjects.find((o) => o.id === selectedObjectId && o.type === "text") || null;

  const handleTextStyleChange = (patch) => {
    setTextStyle((prev) => ({ ...prev, ...patch }));
    if (selectedTextObject) handleObjectChange(selectedTextObject.id, patch);
  };
  const handleObjectDelete = (objectId) => {
    setSelectedObjectId(null);
    setEditingObjectId((prev) => (prev === objectId ? null : prev));
    inkController?.removeObjects?.([objectId]);
  };

  const handleLassoCommit = (transform) => {
    if (!lassoSelection) return;
    inkController?.transformSelection?.(
      lassoSelection.strokeIds,
      lassoSelection.objectIds,
      transform,
    );
  };
  const handleLassoDelete = () => {
    if (!lassoSelection) return;
    if (lassoSelection.strokeIds.length > 0)
      inkController?.removeStrokes?.(lassoSelection.strokeIds);
    if (lassoSelection.objectIds.length > 0)
      inkController?.removeObjects?.(lassoSelection.objectIds);
    setLassoSelection(null);
  };

  // Bluetooth/USB keyboard shortcuts. Skipped while a text object is being
  // edited so Delete/Backspace/Escape keep editing the text instead of
  // deleting the selection or leaving the tool.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (editingObjectId) return;
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable)
        return;

      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedo =
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z") ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y");
      if (isUndo) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (isRedo) {
        event.preventDefault();
        handleRedo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && lassoSelection) {
        event.preventDefault();
        handleLassoDelete();
        return;
      }
      if (event.key === "Escape") {
        if (lassoSelection) setLassoSelection(null);
        else if (isLassoMode) setIsLassoMode(false);
        else if (placingTool) setPlacingTool(null);
        else if (selectedObjectId) setSelectedObjectId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingObjectId, lassoSelection, isLassoMode, placingTool, selectedObjectId]);

  // New objects land in the middle of what the user is currently looking at,
  // not at the top of the document they may have scrolled far past.
  const viewportCenterOnPage = () => {
    const content = containerRef.current;
    if (!content) return null;
    const contentRect = content.getBoundingClientRect();
    const viewRect = scrollRef.current?.getBoundingClientRect() || contentRect;
    return mapViewportPoint(pageLayout, {
      x: viewRect.left + viewRect.width / 2 - contentRect.left,
      y: viewRect.top + viewRect.height / 2 - contentRect.top,
    });
  };

  const insertObject = (type, size, extra = {}) => {
    const anchor = viewportCenterOnPage();
    if (!anchor) return null;
    const object = {
      id: globalThis.crypto?.randomUUID?.() || `object-${Date.now()}`,
      type,
      pageId: anchor.pageId,
      x: anchor.x - size.width / 2,
      y: anchor.y - size.height / 2,
      width: size.width,
      height: size.height,
      color: penColor || "#3E7BD8",
      strokeWidth: rawLineWidth ?? lineWidth ?? 3,
      ...extra,
    };
    inkController?.addObject?.(object);
    setSelectedObjectId(object.id);
    return object;
  };

  // Rasterizes this page's ink + shape outlines as walls, floods out from the
  // click, and drops the cropped result in as a "fill" object sized to match.
  const handleBucketFill = (point) => {
    if (!point) return;

    // Clicking inside a drawn rect/ellipse recolors that one object instead —
    // stroke and fill are then the same shape, so they always move, resize
    // and delete together rather than drifting apart as two separate things.
    const target = [...pageObjects]
      .reverse()
      .find(
        (object) =>
          object.pageId === point.pageId &&
          (object.type === "rect" || object.type === "ellipse") &&
          isPointInsideObject(object, point.x, point.y),
      );
    if (target) {
      inkController?.updateObject?.(target.id, { fillColor: penColor || "#3E7BD8" });
      return;
    }

    const width = Math.round(baseWidth);
    const height = Math.round(pageHeight);
    const canvas = document.createElement("canvas");
    const wallData = rasterizePageWalls(canvas, {
      strokes: inkDocument.strokes,
      objects: pageObjects,
      pageId: point.pageId,
      width,
      height,
    });
    const result = floodFill(wallData, width, height, Math.round(point.x), Math.round(point.y));
    if (!result) return;
    const { dataUrl, x, y, width: w, height: h } = fillResultToDataUrl(
      result,
      width,
      hexToRgb(penColor || "#3E7BD8"),
    );
    inkController?.addObject?.({
      id: globalThis.crypto?.randomUUID?.() || `object-${Date.now()}`,
      type: "fill",
      pageId: point.pageId,
      x,
      y,
      width: w,
      height: h,
      color: penColor || "#3E7BD8",
      strokeWidth: 1,
      src: dataUrl,
    });
  };

  const handleInsertTool = (item) => {
    if (item.id === "image") {
      imageInputRef.current?.click();
      setIsDesignToolsOpen(false);
      return;
    }
    if (item.id === "link") {
      const href = globalThis.prompt?.("Link-Adresse (URL)")?.trim();
      if (!href) return;
      const label = globalThis.prompt?.("Beschriftung", href)?.trim();
      const url = /^[a-z][\w+.-]*:/i.test(href) ? href : `https://${href}`;
      insertObject("link", item, { href: url, text: label || url });
      setIsDesignToolsOpen(false);
      return;
    }
    // Arrows, lines and shapes land where the user drags on the page; a plain
    // click (no drag) falls back to the tool's default size, centered there.
    setPlacingTool(item);
    setIsDesignToolsOpen(false);
  };

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { src, width, height } = await readImageObjectSource(file);
      const maxWidth = Math.min(baseWidth * 0.8, width);
      const scale = maxWidth / width;
      insertObject("image", { width: maxWidth, height: height * scale }, { src });
      setIsDesignToolsOpen(false);
    } catch {
      // A file the browser cannot decode simply inserts nothing.
    }
  };

  const inkPointer = useInkPointer({
    inputMode,
    palmGuard,
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
    const cssWidth = resolvedPageWidth * zoom;
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
  const lastFitWidthRef = useRef(null);
  useEffect(() => {
    if (!isFullMode) return;
    const el = scrollRef.current;
    if (!el) return;
    lastFitWidthRef.current = null;
    const fit = () => {
      // Randlos zoomt der Nutzer bewusst über die Passbreite hinaus, und das
      // Wegfallen der Ränder verbreitert den Container — ohne diese Sperre
      // würde das Auto-Fit den Zoom sofort wieder einfangen.
      if (isFullBleedRef.current) return;
      const width = el.clientWidth;
      if (width <= 0) return;
      // Zooming out past a certain point can make the scrollbar disappear,
      // which nudges clientWidth by ~15-20px and fires this observer — without
      // filtering that noise the "fit" below snaps the zoom straight back in.
      const prevWidth = lastFitWidthRef.current;
      lastFitWidthRef.current = width;
      if (prevWidth !== null && Math.abs(width - prevWidth) < 40) return;
      setZoom(width / baseWidth);
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
      commitLivePinchRef.current?.();
    }
  };
  // clearAllGestures runs before commitLivePinch is defined, so reach it late.
  const commitLivePinchRef = useRef(null);

  const handlePointerDown = (e) => {
    if (e.pointerType === "pen") {
      clearAllGestures();
    }

    // A click never starts on an object — those stop propagation before it
    // reaches here — so any page pointerdown means "away", clearing selection.
    setSelectedObjectId(null);

    if (isBucketMode) {
      inkPointer.onPointerDown(e, { preventDraw: true });
      const point = mapViewportPoint(
        pageLayout,
        relativePoint(containerRef.current, e),
      );
      handleBucketFill(point);
      return;
    }

    // The selection box (if any) lives above this and stops its own
    // pointerdowns, so getting here means the click landed on open page —
    // start a fresh loop and drop whatever was selected before.
    if (isLassoMode) {
      inkPointer.onPointerDown(e, { preventDraw: true });
      const point = mapViewportPoint(
        pageLayout,
        relativePoint(containerRef.current, e),
      );
      if (!point) return;
      setLassoSelection(null);
      setLassoDraft({
        pageId: point.pageId,
        pointerId: e.pointerId,
        points: [{ x: point.x, y: point.y }],
      });
      return;
    }

    if (placingTool) {
      inkPointer.onPointerDown(e, { preventDraw: true });
      const point = mapViewportPoint(
        pageLayout,
        relativePoint(containerRef.current, e),
      );
      if (!point) return;
      setDraftPlacement({
        type: placingTool.id,
        pageId: point.pageId,
        pointerId: e.pointerId,
        startX: point.x,
        startY: point.y,
        width: 0,
        height: 0,
      });
      return;
    }

    const isBlockedTouch = e.pointerType === "touch" && inkPointer.shouldBlockTouch(e);

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
    if (lassoDraft && lassoDraft.pointerId === e.pointerId) {
      inkPointer.onPointerMove(e);
      const point = mapViewportPoint(
        pageLayout,
        relativePoint(containerRef.current, e),
      );
      if (!point || point.pageId !== lassoDraft.pageId) return;
      setLassoDraft((prev) => ({
        ...prev,
        points: [...prev.points, { x: point.x, y: point.y }],
      }));
      return;
    }

    if (draftPlacement && draftPlacement.pointerId === e.pointerId) {
      inkPointer.onPointerMove(e);
      const point = mapViewportPoint(
        pageLayout,
        relativePoint(containerRef.current, e),
      );
      if (!point || point.pageId !== draftPlacement.pageId) return;
      setDraftPlacement((prev) => ({
        ...prev,
        // Signed on purpose: arrows and lines read the sign to know which way
        // they point, and objectBounds() already normalizes it for display.
        width: point.x - prev.startX,
        height: point.y - prev.startY,
      }));
      return;
    }

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
    if (lassoDraft && lassoDraft.pointerId === e.pointerId) {
      inkPointer.onPointerUp(e);
      const polygon = lassoDraft.points;
      if (polygon.length >= 3) {
        const strokeIds = strokesInLasso(inkDocument.strokes, lassoDraft.pageId, polygon);
        const objectIds = objectsInLasso(pageObjects, lassoDraft.pageId, polygon);
        if (strokeIds.length > 0 || objectIds.length > 0) {
          setLassoSelection({ pageId: lassoDraft.pageId, strokeIds, objectIds });
        }
      }
      setLassoDraft(null);
      return;
    }

    if (draftPlacement && draftPlacement.pointerId === e.pointerId) {
      inkPointer.onPointerUp(e);
      const tool = placingTool;
      const dragged =
        Math.abs(draftPlacement.width) > 8 || Math.abs(draftPlacement.height) > 8;
      const object = {
        id: globalThis.crypto?.randomUUID?.() || `object-${Date.now()}`,
        type: draftPlacement.type,
        pageId: draftPlacement.pageId,
        // A plain click (no drag) falls back to the tool's default size,
        // centered on where the user tapped — except text, which starts AT the tap:
        // the caret should appear right under the finger/pen, not to its left.
        x:
          dragged || tool.id === "text"
            ? draftPlacement.startX
            : draftPlacement.startX - tool.width / 2,
        // Text also skips the vertical centering: snapTextToGrid re-derives y
        // from the raw tap anyway, and centering first shifted its rounding by
        // half a row, so the snapped box always landed one line too high.
        y:
          dragged || tool.id === "text"
            ? draftPlacement.startY
            : draftPlacement.startY - tool.height / 2,
        width: dragged ? draftPlacement.width : tool.width,
        height: dragged ? draftPlacement.height : tool.height,
        color: penColor || "#3E7BD8",
        strokeWidth: rawLineWidth ?? lineWidth ?? 3,
        // A dragged box gets a "Text" placeholder so its size stays visible;
        // a plain click starts empty since the caret appears there right away.
        ...(draftPlacement.type === "text" ? { text: dragged ? "Text" : "", ...textStyle } : {}),
      };
      if (object.type === "text" && object.snapToLines)
        Object.assign(object, snapTextToGrid(object, paperStyle));
      inkController?.addObject?.(object);
      setSelectedObjectId(object.id);
      if (object.type === "text" && !dragged) setEditingObjectId(object.id);
      setDraftPlacement(null);
      setPlacingTool(null);
      return;
    }

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
    if (lassoDraft && lassoDraft.pointerId === e.pointerId) {
      inkPointer.onPointerCancel(e);
      setLassoDraft(null);
      return;
    }
    if (draftPlacement && draftPlacement.pointerId === e.pointerId) {
      inkPointer.onPointerCancel(e);
      setDraftPlacement(null);
      return;
    }
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
  // Zoom a live pinch is previewing via transform, and where the previewed
  // content sat on screen when it was committed (see commitLivePinch).
  const livePinchRef = useRef(null);
  const pinchCommitRef = useRef(null);

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

  // A lasso selection names specific stroke/object ids — meaningless (and
  // stale) the moment the user opens a different note.
  useEffect(() => {
    setLassoSelection(null);
    setLassoDraft(null);
  }, [inkDocument.documentId]);

  // Gutter drags only ever scrolled vertically; a move-mode drag pans both axes.
  const startPan = (event) => ({
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startScrollLeft: scrollRef.current?.scrollLeft ?? 0,
    startScrollTop: scrollRef.current?.scrollTop ?? 0,
    panX: isMoveMode,
    active: false,
  });

  const handleGestureStart = (event) => {
    if (event.pointerType === "pen") {
      clearAllGestures();
    }
    const startedOnPage = containerRef.current?.contains(event.target) ?? false;
    if (!startedOnPage) {
      inkPointer.onPointerDown(event, { preventDraw: true });
    }
    // Move mode drags with the pen too, which would otherwise stop at the
    // touch-only guard below. Touch keeps flowing through so it can still pinch.
    // An armed placement tool (text, shapes, …) owns this drag instead — left
    // over move-mode panning would otherwise fight it for the same gesture.
    if (isMoveMode && !placingTool && event.pointerType === "pen" && activePointers.current.size === 0) {
      gutterPanData.current = startPan(event);
      return;
    }
    if (event.pointerType !== 'touch') return;
    if (inkPointer.shouldBlockTouch(event)) return;
    activePointers.current.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startedOnPage,
    });

    if (activePointers.current.size === 1 && (!startedOnPage || (isMoveMode && !placingTool))) {
      gutterPanData.current = startPan(event);
    }

    if (activePointers.current.size !== 2) return;
    // Two touches only mean a pinch where every touch is a finger. Without a
    // digitizer the tip is a touch as well, so the ordinary pair here is the
    // hand landing beside it — and aborting both strokes for a zoom is the
    // stylus going dead the moment a palm touches down. The palm guard cannot
    // separate them at this point either: a contact that has not moved yet is
    // not recognisable as a hand, which is exactly when this runs. Zooming in
    // this mode goes through the finger or move tool, where a touch is only
    // ever a finger.
    if (inputMode === "stylus" && palmGuard.passiveStylus) return;
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
      // Only a focus box that is actually on screen (split mode — see its
      // render below) takes part in the pinch; useFocusBox hands us one in
      // full mode too, where it is invisible.
      focusBox:
        !isFullMode && focusBoxState?.focusBox
          ? { ...focusBoxState.focusBox }
          : null,
      ticking: false,
    };
  };

  const applyPan = (e) => {
    const pan = gutterPanData.current;
    const dx = pan.startX - e.clientX;
    const dy = pan.startY - e.clientY;
    if (!pan.active && Math.abs(pan.panX ? Math.hypot(dx, dy) : dy) > 15) {
      pan.active = true;
    }
    if (pan.active && scrollRef.current) {
      scrollRef.current.scrollTop = pan.startScrollTop + dy;
      if (pan.panX) scrollRef.current.scrollLeft = pan.startScrollLeft + dx;
    }
  };

  const handleGestureMove = (e) => {
    const startedOnPage = containerRef.current?.contains(e.target) ?? false;
    if (!startedOnPage) {
      inkPointer.onPointerMove(e);
    }
    if (gutterPanData.current?.pointerId === e.pointerId && e.pointerType === "pen") {
      applyPan(e);
      return;
    }
    if (e.pointerType !== "touch") return;

    if (inkPointer.shouldBlockTouch(e)) {
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
      applyPan(e);
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
        const zoomRatio = newZoom / startZoom;

        // Committing the zoom per frame relays out every page and forces a full
        // ink-canvas realloc plus a redraw of every stroke — that is the pinch
        // stutter. Preview it with a transform (content layout untouched, so the
        // anchor stays exact) and commit the real zoom once on release.
        // Focus-box pinches scale the box inversely to the zoom, which a plain
        // transform cannot express, so those keep the per-frame path.
        if (!startFb) {
          livePinchRef.current = {
            zoom: newZoom,
            scrollLeft: (startScrollLeft + startX) * zoomRatio - currentCenterX,
            scrollTop: (startScrollTop + startY) * zoomRatio - currentCenterY,
          };
          const content = containerRef.current;
          if (content) {
            const tx = currentCenterX + startScrollLeft - (startScrollLeft + startX) * zoomRatio;
            const ty = currentCenterY + startScrollTop - (startScrollTop + startY) * zoomRatio;
            content.style.transformOrigin = "0 0";
            content.style.willChange = "transform";
            content.style.transform = `translate(${tx}px, ${ty}px) scale(${zoomRatio})`;
          }
          pinchInitialData.current.ticking = false;
          return;
        }

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
              // Normalize to pixels first: a physical mouse wheel reports
              // deltaMode 1 (lines, deltaY ~3) while a trackpad reports mode 0
              // (pixels, deltaY ~100+) — without this the same factor makes
              // wheel zoom jump in huge steps while trackpad zoom stays fine.
              const normalizedDeltaY =
                e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
              const newZoom = Math.max(
                0.5,
                Math.min(3, prev - normalizedDeltaY * 0.0015),
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

  // Hand the previewed zoom over to React. The transform stays on until the new
  // layout exists, so the layout effect below is what drops it and applies the
  // scroll offset the preview was standing in for.
  const commitLivePinch = () => {
    const pending = livePinchRef.current;
    livePinchRef.current = null;
    if (!pending) return;
    pinchCommitRef.current = pending;
    // Same zoom means no re-render, so the layout effect would never run and
    // the transform would stick. Drop it here instead.
    if (pending.zoom === zoom) dropPinchPreviewRef.current?.();
    else setZoom(pending.zoom);
  };
  commitLivePinchRef.current = commitLivePinch;

  const dropPinchPreview = () => {
    const commit = pinchCommitRef.current;
    if (!commit) return;
    pinchCommitRef.current = null;
    const content = containerRef.current;
    if (content) {
      content.style.transform = "";
      content.style.transformOrigin = "";
      content.style.willChange = "";
    }
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollLeft = commit.scrollLeft;
    scroller.scrollTop = commit.scrollTop;
  };
  const dropPinchPreviewRef = useRef(null);
  dropPinchPreviewRef.current = dropPinchPreview;

  useLayoutEffect(() => {
    if (pinchCommitRef.current?.zoom !== zoom) return;
    dropPinchPreviewRef.current?.();
  }, [zoom]);

  const handleGestureEnd = (event) => {
    const startedOnPage = containerRef.current?.contains(event.target) ?? false;
    if (!startedOnPage) {
      if (event.type === 'pointercancel') {
        inkPointer.onPointerCancel(event);
      } else {
        inkPointer.onPointerUp(event);
      }
    }
    if (gutterPanData.current?.pointerId === event.pointerId) {
      gutterPanData.current = null;
    }
    if (event.pointerType !== 'touch') return;
    activePointers.current.delete(event.pointerId);
    
    if (pinchInitialData.current) {
      const [id1, id2] = pinchInitialData.current.pointerIds;
      if (event.pointerId === id1 || event.pointerId === id2) {
        if (pendingFocusBox.current) {
          focusBoxState?.setFocusBox?.(pendingFocusBox.current);
          pendingFocusBox.current = null;
        }
        pinchInitialData.current = null;
        commitLivePinch();
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
    const linesRgb = inkDocument.pages[0]?.linesRgb || "255,255,255";

    if (paperStyle === "blank") {
      return { backgroundImage: "none" };
    }

    if (paperStyle === "lined") {
      return {
        backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), rgba(${linesRgb},.07) calc(100% - 1px))`,
        backgroundSize: "100% 34px",
        backgroundPosition: "0 92px",
        backgroundRepeat: "repeat-y",
      };
    }

    if (paperStyle === "grid") {
      return {
        backgroundImage: `linear-gradient(to bottom, transparent calc(100% - 1px), rgba(${linesRgb},.065) calc(100% - 1px)), linear-gradient(to right, transparent calc(100% - 1px), rgba(${linesRgb},.065) calc(100% - 1px))`,
        backgroundSize: "100% 24px, 24px 100%",
        backgroundPosition: "0 92px, 88px 0",
        backgroundRepeat: "repeat-y, repeat-x",
      };
    }

    if (paperStyle === "dotted") {
      return {
        backgroundImage: `radial-gradient(circle, rgba(${linesRgb},.18) 1.2px, transparent 1.3px)`,
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
      {(() => {
        const isPenActive = Boolean(PEN_TOOL_ICONS[tool]) && !isEraser && !isSelectMode;
        const PenIcon = PEN_TOOL_ICONS[tool] || PenLine;
        return (
          <button
            className={`rail-btn pen-rail-btn ${isPenActive ? "active" : ""}`}
            onClick={() => {
              if (isPenActive) {
                setIsPenSettingsOpen((prev) => !prev);
              } else {
                setTool?.(PEN_TOOL_ICONS[tool] ? tool : "pen");
                setIsEraser?.(false);
                setIsSelectMode?.(false);
                setIsPenSettingsOpen(true);
              }
              setIsBucketMode(false);
              setIsLassoMode(false);
              setLassoSelection(null);
              setIsColorPickerOpen(false);
              setIsEraserSettingsOpen(false);
            }}
            title="Stift & Einstellungen"
            data-testid="pen-tool-btn"
          >
            <PenIcon size={18} />
          </button>
        );
      })()}
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
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title="Radiergummi"
      >
        <Eraser size={18} />
      </button>
      <button
        className={`rail-btn ${isBucketMode ? "active" : ""}`}
        onClick={() => {
          setIsBucketMode((prev) => !prev);
          setPlacingTool(null);
          setIsEraser?.(false);
          setIsSelectMode?.(false);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title="Eimer (Fläche füllen)"
        data-testid="bucket-tool-btn"
      >
        <PaintBucket size={18} />
      </button>
      <button
        className={`rail-btn ${isLassoMode ? "active" : ""}`}
        onClick={() => {
          const next = !isLassoMode;
          setIsLassoMode(next);
          if (!next) setLassoSelection(null);
          setPlacingTool(null);
          setIsBucketMode(false);
          setIsEraser?.(false);
          setIsSelectMode?.(false);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
        }}
        title="Lasso (markieren, verschieben, vergrößern)"
        data-testid="lasso-tool-btn"
      >
        <LassoSelect size={18} />
      </button>
      <button
        className={`rail-btn design-rail-btn ${isDesignToolsOpen || placingTool ? "active" : ""}`}
        onClick={() => {
          if (placingTool) {
            setPlacingTool(null);
            return;
          }
          setIsDesignToolsOpen((prev) => !prev);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title={
          placingTool
            ? `${placingTool.name} ziehen zum Platzieren (Klick zum Abbrechen)`
            : "Pfeile, Formen, Bilder & Links einfügen"
        }
        data-testid="design-tools-btn"
      >
        {placingTool ? placingTool.icon : <Shapes size={18} />}
      </button>
      <button
        className={`rail-btn text-rail-btn ${
          isTextSettingsOpen || placingTool?.id === "text" ? "active" : ""
        }`}
        onClick={() => {
          if (placingTool?.id === "text") {
            setPlacingTool(null);
            return;
          }
          setIsTextSettingsOpen((prev) => !prev);
          setIsDesignToolsOpen(false);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title={
          placingTool?.id === "text"
            ? "Text ziehen zum Platzieren (Klick zum Abbrechen)"
            : "Text: Schrift, Größe, Farbe & Linien-Modus"
        }
        data-testid="text-tool-btn"
      >
        <Type size={18} />
      </button>
      <button
        className={`rail-btn ${inputMode !== "stylus" ? "active" : ""}`}
        onClick={() =>
          inkController?.setInputMode?.(
            INPUT_MODES[(INPUT_MODES.indexOf(inputMode) + 1) % INPUT_MODES.length],
          )
        }
        aria-label={`Eingabe: ${INPUT_MODE_LABELS[inputMode]}`}
        title={`Eingabe: ${INPUT_MODE_LABELS[inputMode]} (Klicken zum Wechseln)`}
      >
        <InputModeIcon size={18} />
      </button>
      {!isFullMode && (
        <button
          className={`rail-btn ${isSelectMode ? "active" : ""}`}
          onClick={() => {
            const newMode = !isSelectMode;
            setIsSelectMode?.(newMode);
            setIsEraser?.(false);
            setIsBucketMode(false);
            setIsLassoMode(false);
            setLassoSelection(null);
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
      data-full-bleed={isFullBleed ? "true" : undefined}
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
      {isDesignToolsOpen && (
        <DesignToolsPopover
          onInsert={handleInsertTool}
          onClose={() => setIsDesignToolsOpen(false)}
        />
      )}
      {isTextSettingsOpen && (
        <TextSettingsPopover
          style={selectedTextObject || textStyle}
          onStyleChange={handleTextStyleChange}
          paperStyle={paperStyle}
          hasSelection={Boolean(selectedTextObject)}
          onInsert={() => {
            setPlacingTool(TEXT_TOOL);
            setIsTextSettingsOpen(false);
          }}
          onClose={() => setIsTextSettingsOpen(false)}
        />
      )}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFile}
        data-testid="object-image-input"
        style={{ display: "none" }}
      />
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
      {zoomToast !== null && (
        <div className="zoom-toast" data-testid="zoom-toast">
          <span>{zoomToast}%</span>
        </div>
      )}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: isFullMode ? "hidden" : "auto",
          position: "relative",
          textAlign: "center",
          touchAction: "none",
          // Vollmodus: der Scroll-Container IST das Papier.
          // Startet unterhalb der Pill-Buttons (top: 78px) und schließt bündig am unteren Bildschirmrand ab.
          margin: isFullBleed
            ? 0
            : isFullMode
              ? "4px 4px 0 88px"
              : "78px 12px 0 104px",
          background: "transparent",
          color: "#FFFFFF",
        }}
        onPointerDown={handleGestureStart}
        onPointerMove={handleGestureMove}
        onPointerUp={handleGestureEnd}
        onPointerCancel={handleGestureEnd}
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.target;
          // Notes-App: am unteren Ende wächst das Papier NUR im unendlichen Modus nach.
          if (!showPageBreaks && note?.kind !== 'imported') {
            if (
              scrollHeight - scrollTop - clientHeight < 200 &&
              pagesCount < maxPages
            ) {
              inkController?.addPage?.();
            }
          }
          const unit = showPageBreaks
            ? pageHeight * zoom + PAGE_GAP
            : pageHeight * zoom;
          const currentPage =
            Math.min(pagesCount - 1, Math.max(0, Math.round(scrollTop / unit))) + 1;
          onCurrentPageChange?.(currentPage);
        }}
      >
        <div
          data-testid="document-page"
          style={{
            display: "inline-block",
            textAlign: "left",
            width: `${resolvedPageWidth * zoom}px`,
            height: `${totalDocumentHeight}px`,
            position: "relative",
            backgroundColor: "transparent",
            boxShadow: "none",
            margin: isFullMode ? 0 : "96px 0 24px 0",
            touchAction:
              isSelectMode || isFullMode || placingTool || isBucketMode || isLassoMode
                ? "none"
                : "auto",
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
                borderRadius: isFullBleed ? 0 : isFullMode ? "22px 22px 0 0" : "20px",
                background: pageBackground,
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
                  width: `${resolvedPageWidth}px`,
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
              const pageTop = i * (resolvedPageHeight * zoom + PAGE_GAP);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: `${pageTop}px`,
                    left: 0,
                    width: "100%",
                    height: `${resolvedPageHeight * zoom}px`,
                    borderRadius: isFullBleed ? 0 : "20px",
                    background: pageBackground,
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
                      width: `${resolvedPageWidth}px`,
                      height: `${resolvedPageHeight}px`,
                      transform: `scale(${zoom})`,
                      transformOrigin: "0 0",
                      ...getStaticBackgroundStyles(),
                      pointerEvents: "none",
                    }}
                  />
                </div>
              );
            })
          )}
          {/* Bucket fills sit behind the ink canvas so hand-drawn outlines
              stay on top of the color wash; every other object type is
              layered above it as before. */}
          <PageObjectLayer
            objects={pageObjects.filter((o) => o.type === "fill")}
            pageLayout={pageLayout}
            selectedId={selectedObjectId}
            onSelect={setSelectedObjectId}
            onChange={handleObjectChange}
            onDelete={handleObjectDelete}
          />
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
          <PageObjectLayer
            objects={pageObjects.filter((o) => o.type !== "fill")}
            pageLayout={pageLayout}
            selectedId={selectedObjectId}
            paperStyle={paperStyle}
            editingId={editingObjectId}
            onEditingChange={setEditingObjectId}
            onSelect={setSelectedObjectId}
            onChange={handleObjectChange}
            onDelete={handleObjectDelete}
          />
          {lassoDraftViewportPoints && lassoDraftViewportPoints.length > 1 && (
            <svg
              data-testid="lasso-draft-path"
              style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
            >
              <polyline
                points={lassoDraftViewportPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(62,123,216,0.12)"
                stroke="#3E7BD8"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
            </svg>
          )}
          {isLassoMode && lassoSelectionBox && (
            <LassoSelectionLayer
              bounds={lassoSelectionBox}
              pageLayout={pageLayout}
              onCommit={handleLassoCommit}
              onDelete={handleLassoDelete}
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
          {draftPlacement && draftPlacementViewport && (
            <div
              data-testid="draft-placement-box"
              style={{
                position: "absolute",
                pointerEvents: "none",
                left: draftPlacementViewport.x,
                top: draftPlacementViewport.y,
                width: draftPlacementViewport.width,
                height: draftPlacementViewport.height,
                zIndex: 1000,
              }}
            >
              {draftPlacement.type === "line" || draftPlacement.type === "arrow" ? (
                <svg width="100%" height="100%" style={{ overflow: "visible" }}>
                  <line
                    x1={draftPlacement.width < 0 ? draftPlacementViewport.width : 0}
                    y1={draftPlacement.height < 0 ? draftPlacementViewport.height : 0}
                    x2={draftPlacement.width < 0 ? 0 : draftPlacementViewport.width}
                    y2={draftPlacement.height < 0 ? 0 : draftPlacementViewport.height}
                    stroke="#3E7BD8"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : draftPlacement.type === "ellipse" ? (
                <svg width="100%" height="100%" style={{ overflow: "visible" }}>
                  <ellipse
                    cx="50%"
                    cy="50%"
                    rx={draftPlacementViewport.width / 2}
                    ry={draftPlacementViewport.height / 2}
                    fill="rgba(62, 123, 216, 0.12)"
                    stroke="#3E7BD8"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                  />
                </svg>
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "2px dashed #3E7BD8",
                    backgroundColor: "rgba(62, 123, 216, 0.12)",
                    borderRadius: draftPlacement.type === "rect" ? 6 : 4,
                  }}
                />
              )}
            </div>
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
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 9999,
                background:
                  "linear-gradient(180deg, rgba(42, 42, 48, 0.78) 0%, rgba(18, 18, 22, 0.9) 100%)",
                backdropFilter: "blur(24px) saturate(1.8)",
                WebkitBackdropFilter: "blur(24px) saturate(1.8)",
                border: "1px solid rgba(255, 255, 255, 0.22)",
                boxShadow:
                  "inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 2px 0 rgba(0, 0, 0, 0.85), 0 16px 36px -12px rgba(0, 0, 0, 0.9)",
                color: "#FFFFFF",
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              title="Neue Seite hinzufügen"
              data-testid="add-page-btn"
            >
              <Plus size={18} strokeWidth={2.4} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
