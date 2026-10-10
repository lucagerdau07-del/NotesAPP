import React, { useRef } from "react";
import {
  Undo2,
  Redo2,
  Hand,
  PenLine,
  PenTool,
  Highlighter,
  Pencil,
  Eraser,
  PaintBucket,
  LassoSelect,
  Lasso,
  Shapes,
  Type,
  MessageSquare,
  Layers,
} from "lucide-react";

// The text tool is armed from its own rail button, not from the shapes
// popover, so it keeps its settings visible while placing.
// A plain click starts this small and grows to fit as you type — no reason
// to seed it with a wide placeholder box first. A dragged box keeps whatever
// size the drag defined instead (see draftPlacement handling in the editors).
export const TEXT_TOOL = {
  id: "text",
  name: "Text",
  icon: <Type size={15} />,
  width: 24,
  height: 34,
};

// Rail button icon mirrors whichever pen type is currently picked, so the
// standalone marker button (now folded into the pen popover) isn't missed.
export const PEN_TOOL_ICONS = {
  pen: PenLine,
  fountain: PenTool,
  highlighter: Highlighter,
  pencil: Pencil,
};

export function ColorSlot({
  colorValue,
  index,
  isActive,
  isEraser,
  onSelect,
  onOpenPicker,
}) {
  const isLongPressRef = useRef(false);
  const timerRef = useRef(null);

  const handlePointerDown = (e) => {
    isLongPressRef.current = false;
    const wrapperEl = e.currentTarget;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onOpenPicker?.(wrapperEl);
    }, 450);
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = (e) => {
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }
    onSelect(e.currentTarget);
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

// The editor rail shared by DocumentView and WhiteboardEditor: undo/redo, the
// tools, color slots, comment and layers. All state lives in the editor; this
// only renders the buttons and wires the tool-switching rules, so a change to
// a tool's behavior lands in both editors at once.
//
// DocumentView-only extras are optional: `isSelectMode`/`setIsSelectMode`
// (focus box drag) and the focus-box button (`showFocusBoxButton`).
export default function ToolRail({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  tool,
  setInputMode,
  isMoveMode,
  isEraser,
  setIsEraser,
  isSelectMode = false,
  setIsSelectMode,
  isBucketMode,
  setIsBucketMode,
  isLassoMode,
  setIsLassoMode,
  setLassoSelection,
  placingTool,
  setPlacingTool,
  isDesignToolsOpen,
  setIsDesignToolsOpen,
  designButtonRef,
  isTextSettingsOpen,
  setIsTextSettingsOpen,
  setIsPenSettingsOpen,
  setIsEraserSettingsOpen,
  setIsColorPickerOpen,
  anchorPopoverToButton,
  customColors,
  penColor,
  applyPenColor,
  setActivePickerIndex,
  showFocusBoxButton = false,
  onFocusBoxArm,
  isCommentMode,
  setIsCommentMode,
  isLayersOpen,
  toggleLayers,
}) {
  const penLongPressTimer = useRef(null);
  const penLongPressFired = useRef(false);
  const textLongPressTimer = useRef(null);
  const textLongPressFired = useRef(false);

  const isDesignPlacing = Boolean(placingTool) && placingTool.id !== "text";
  const isPenActive =
    Boolean(PEN_TOOL_ICONS[tool]) &&
    !isEraser &&
    !isSelectMode &&
    !isMoveMode &&
    !isBucketMode &&
    !isLassoMode &&
    !placingTool &&
    !isDesignToolsOpen;
  const PenIcon = PEN_TOOL_ICONS[tool] || PenLine;
  const eraserActive = isEraser && !isSelectMode;

  return (
    <>
      <button
        className="rail-btn"
        onClick={onUndo}
        disabled={!canUndo}
        style={{ opacity: canUndo ? 1 : 0.35 }}
        title="Rückgängig"
      >
        <Undo2 size={19} />
      </button>
      <button
        className="rail-btn"
        onClick={onRedo}
        disabled={!canRedo}
        style={{ opacity: canRedo ? 1 : 0.35 }}
        title="Wiederholen"
      >
        <Redo2 size={19} />
      </button>
      <div className="rail-divider" />
      <button
        className={`rail-btn ${isMoveMode ? "active" : ""}`}
        onClick={() => {
          setIsEraser?.(false);
          setIsSelectMode?.(false);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
          setPlacingTool(null);
          setIsDesignToolsOpen(false);
          setIsPenSettingsOpen(false);
          setInputMode?.(isMoveMode ? "stylus" : "move");
        }}
        title="Bewegen (Seite verschieben)"
        aria-pressed={isMoveMode}
        data-testid="move-tool-btn"
      >
        <Hand size={18} />
      </button>
      <button
        className={`rail-btn has-settings pen-rail-btn ${isPenActive ? "active" : ""}`}
        onPointerDown={(e) => {
          penLongPressFired.current = false;
          const buttonEl = e.currentTarget;
          penLongPressTimer.current = setTimeout(() => {
            penLongPressFired.current = true;
            anchorPopoverToButton(buttonEl);
            setIsPenSettingsOpen(true);
            setIsBucketMode(false);
            setIsLassoMode(false);
            setLassoSelection(null);
            setIsColorPickerOpen(false);
            setIsEraserSettingsOpen(false);
          }, 500);
        }}
        onPointerUp={() => clearTimeout(penLongPressTimer.current)}
        onPointerLeave={() => clearTimeout(penLongPressTimer.current)}
        onClick={(e) => {
          if (penLongPressFired.current) return;
          if (isPenActive) {
            anchorPopoverToButton(e.currentTarget);
            setIsPenSettingsOpen((prev) => !prev);
            setIsColorPickerOpen(false);
            setIsEraserSettingsOpen(false);
            setIsTextSettingsOpen(false);
            return;
          }
          setIsEraser?.(false);
          setIsSelectMode?.(false);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
          setPlacingTool(null);
          setIsDesignToolsOpen(false);
          setIsPenSettingsOpen(false);
          if (isMoveMode) setInputMode?.("stylus");
        }}
        title="Stift: Nochmal tippen = Einstellungen"
        data-testid="pen-tool-btn"
      >
        <PenIcon size={18} />
      </button>
      <button
        className={`rail-btn has-settings eraser-rail-btn ${eraserActive ? "active" : ""}`}
        onClick={(e) => {
          if (eraserActive) {
            anchorPopoverToButton(e.currentTarget);
            setIsEraserSettingsOpen((prev) => !prev);
          } else {
            setIsEraser?.(true);
            setIsSelectMode?.(false);
            setIsPenSettingsOpen(false);
            setIsColorPickerOpen(false);
            if (isMoveMode) setInputMode?.("stylus");
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
          setIsBucketMode((prev) => {
            const next = !prev;
            if (next && isMoveMode) setInputMode?.("stylus");
            return next;
          });
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
        ref={designButtonRef}
        className={`rail-btn design-rail-btn ${isDesignToolsOpen || isDesignPlacing ? "active" : ""}`}
        onClick={(e) => {
          if (isDesignPlacing) {
            setPlacingTool(null);
            return;
          }
          setPlacingTool(null);
          anchorPopoverToButton(e.currentTarget);
          setIsDesignToolsOpen((prev) => !prev);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title={
          isDesignPlacing
            ? `${placingTool.name} ziehen zum Platzieren (Klick zum Abbrechen)`
            : "Pfeile, Formen, Bilder & Links einfügen"
        }
        data-testid="design-tools-btn"
      >
        {isDesignPlacing ? placingTool.icon : <Shapes size={18} />}
      </button>
      <button
        className={`rail-btn has-settings text-rail-btn ${
          isTextSettingsOpen || placingTool?.id === "text" ? "active" : ""
        }`}
        onPointerDown={(e) => {
          textLongPressFired.current = false;
          const buttonEl = e.currentTarget;
          textLongPressTimer.current = setTimeout(() => {
            textLongPressFired.current = true;
            anchorPopoverToButton(buttonEl);
            setIsTextSettingsOpen(true);
            setIsDesignToolsOpen(false);
            setIsPenSettingsOpen(false);
            setIsEraserSettingsOpen(false);
            setIsColorPickerOpen(false);
          }, 500);
        }}
        onPointerUp={() => clearTimeout(textLongPressTimer.current)}
        onPointerLeave={() => clearTimeout(textLongPressTimer.current)}
        onClick={(e) => {
          if (textLongPressFired.current) return;
          if (placingTool?.id === "text") {
            anchorPopoverToButton(e.currentTarget);
            setIsTextSettingsOpen((prev) => !prev);
            setIsDesignToolsOpen(false);
            setIsPenSettingsOpen(false);
            setIsEraserSettingsOpen(false);
            setIsColorPickerOpen(false);
            return;
          }
          setPlacingTool(TEXT_TOOL);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
          setIsEraser?.(false);
          setIsSelectMode?.(false);
          setIsTextSettingsOpen(false);
        }}
        title={
          placingTool?.id === "text"
            ? "Text ziehen zum Platzieren, nochmal tippen = Einstellungen"
            : "Text: Tippen = Platzieren"
        }
        data-testid="text-tool-btn"
      >
        <Type size={18} />
      </button>
      {showFocusBoxButton && (
        <button
          className={`rail-btn ${isSelectMode ? "active" : ""}`}
          onClick={() => {
            const newMode = !isSelectMode;
            setIsSelectMode?.(newMode);
            setIsEraser?.(false);
            setIsBucketMode(false);
            setIsLassoMode(false);
            setLassoSelection(null);
            if (newMode) onFocusBoxArm?.();
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
          onSelect={(buttonEl) => {
            if (penColor === c && !isEraser && !isSelectMode) {
              anchorPopoverToButton(buttonEl);
              setIsColorPickerOpen((prev) => !prev);
              setActivePickerIndex(index);
            } else {
              applyPenColor(c);
              setIsEraser?.(false);
              setIsSelectMode?.(false);
              setActivePickerIndex(index);
            }
            setIsPenSettingsOpen(false);
          }}
          onOpenPicker={(buttonEl) => {
            anchorPopoverToButton(buttonEl);
            setActivePickerIndex(index);
            setIsColorPickerOpen(true);
            setIsPenSettingsOpen(false);
          }}
        />
      ))}
      <div className="rail-divider" />
      <button
        className={`rail-btn ${isCommentMode ? "active" : ""}`}
        title="Kommentar"
        aria-pressed={isCommentMode}
        data-testid="comment-btn"
        onClick={() => setIsCommentMode((on) => !on)}
      >
        <MessageSquare size={18} />
      </button>
      <button
        className={`rail-btn ${isLayersOpen ? "active" : ""}`}
        title="Ebenen"
        data-testid="layers-toggle-btn"
        onClick={toggleLayers}
      >
        <Layers size={19} />
      </button>
    </>
  );
}
