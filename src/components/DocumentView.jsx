import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { 
  Eraser, Trash2, Undo2, Redo2, Lasso, Highlighter, PenLine, 
  Layers, AlignJustify, File, Grid, Columns2, ArrowLeft, 
  X, Palette, Sliders, PenTool, Pencil, Sparkles, Infinity, Files, Plus 
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import useLongPress from '../hooks/useLongPress';
import useInkPointer from '../hooks/useInkPointer';
import { mapViewportPoint } from '../ink/pageCoordinates';
import { renderInkDocument, resizeInkCanvas } from '../ink/renderInk';

function PenSettingsPopover({
  tool,
  setTool,
  rawLineWidth,
  setLineWidth,
  penColor,
  onClose,
  setIsEraser,
  setIsSelectMode
}) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !e.target.closest?.('.pen-rail-btn')) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handleDown);
    return () => document.removeEventListener('pointerdown', handleDown);
  }, [onClose]);

  const isHighlighter = tool === 'highlighter';
  const thicknessPresets = isHighlighter ? [10, 16, 24, 32, 44] : [1.5, 3, 5, 8, 14];

  const tools = [
    { id: 'pen', name: 'Stift', icon: <PenLine size={15} /> },
    { id: 'fountain', name: 'Füller', icon: <PenTool size={15} /> },
    { id: 'highlighter', name: 'Marker', icon: <Highlighter size={15} /> },
    { id: 'pencil', name: 'Bleistift', icon: <Pencil size={15} /> },
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
        <button className="editor-popover-close" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </div>

      {/* Tool selector */}
      <div className="tool-types-grid">
        {tools.map(t => (
          <button
            key={t.id}
            className={`tool-type-btn ${tool === t.id ? 'active' : ''}`}
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
      <div style={{ font: '600 10px ui-monospace, monospace', letterSpacing: '.06em', color: 'rgba(233,230,223,0.5)', marginBottom: 6 }}>
        STRICHSTÄRKE ({rawLineWidth || 3}px)
      </div>
      <div className="thickness-presets">
        {thicknessPresets.map((val) => (
          <button
            key={val}
            className={`thickness-preset-btn ${Math.abs((rawLineWidth || 3) - val) < 0.5 ? 'active' : ''}`}
            onClick={() => setLineWidth?.(val)}
            title={`${val}px`}
          >
            <span
              className="thickness-dot"
              style={{
                width: Math.max(3, Math.min(20, val * (isHighlighter ? 0.38 : 1.3))),
                height: Math.max(3, Math.min(20, val * (isHighlighter ? 0.38 : 1.3))),
                background: penColor
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
        <svg width="220" height="36" viewBox="0 0 220 36" style={{ overflow: 'visible' }}>
          <path
            d="M 15 18 Q 65 4, 110 18 T 205 18"
            fill="none"
            stroke={penColor}
            strokeWidth={isHighlighter ? (rawLineWidth || 3) * 1.5 : (rawLineWidth || 3)}
            strokeOpacity={isHighlighter ? 0.45 : tool === 'pencil' ? 0.75 : 1}
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

function ColorWheelPopover({
  customColors,
  activePickerIndex,
  setActivePickerIndex,
  onColorChange,
  onClose
}) {
  const popoverRef = useRef(null);
  const curColor = customColors[activePickerIndex] || '#EFECE4';
  const [hexInputValue, setHexInputValue] = useState(curColor);

  useEffect(() => {
    setHexInputValue(curColor);
  }, [curColor]);

  useEffect(() => {
    const handleDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !e.target.closest?.('.rail-color-wrapper')) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handleDown);
    return () => document.removeEventListener('pointerdown', handleDown);
  }, [onClose]);

  const presetPalette = [
    '#EFECE4', '#A09D95', '#484441', '#3E7BD8', '#2AA9DF', '#4FA66B',
    '#84CC16', '#D4A937', '#E87A38', '#D8615B', '#E05285', '#9353D3'
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
        <button className="editor-popover-close" onClick={onClose} title="Schließen">
          <X size={14} />
        </button>
      </div>

      {/* Quick Slot Selector */}
      <div className="color-slots-selector">
        {customColors.map((col, idx) => (
          <div
            key={idx}
            className={`slot-circle ${activePickerIndex === idx ? 'active' : ''}`}
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
            className={`color-preset-btn ${curColor.toLowerCase() === pCol.toLowerCase() ? 'active' : ''}`}
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
        <span className="hex-preview-dot" style={{ backgroundColor: curColor }} />
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

function ColorSlot({ colorValue, index, isActive, isEraser, onSelect, onOpenPicker }) {
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
      className={`rail-color-wrapper ${isActive && !isEraser ? 'active' : ''}`}
      title="Klicken zum Auswählen, gedrückt halten für Farbrad"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      data-testid={`color-slot-${index}`}
    >
      <div className={`rail-color ${index === 0 ? 'rail-color-light' : ''}`} style={{ backgroundColor: colorValue, pointerEvents: 'none' }} />
    </div>
  );
}

const baseWidth = 800;
const pageHeight = baseWidth * 1.414;
const PAGE_GAP = 28;
const maxPages = 20;
const emptyDocument = {
  version: 1,
  documentId: '',
  pages: [{ id: 'empty-page-1' }],
  strokes: [],
  updatedAt: 0,
};

function relativePoint(element, event) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export default function DocumentView({ inkController, focusBoxState, toolbarState, onBack }) {
  const { 
    color, setColor, 
    isEraser, setIsEraser, 
    lineWidth, rawLineWidth, setLineWidth,
    eraserWidth, setEraserWidth,
    isSelectMode, setIsSelectMode,
    paperStyle, setPaperStyle,
    layoutMode, setLayoutMode,
    rawColor, tool, setTool,
    showPageBreaks, setShowPageBreaks
  } = toolbarState || {};
  const inkDocument = inkController?.document || emptyDocument;
  const pageIds = inkDocument.pages.map(page => page.id);
  const pagesCount = pageIds.length;
  const canUndo = inkController?.canUndo;
  const canRedo = inkController?.canRedo;
  const penColor = rawColor ?? color;
  const isFullMode = layoutMode !== 'split';
  const [customColors, setCustomColors] = useState(['#EFECE4', '#3E7BD8', '#D8615B', '#4FA66B', '#D4A937']);
  const [activePickerIndex, setActivePickerIndex] = useState(0);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [paperToast, setPaperToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const pagesCountRef = useRef(1);
  useEffect(() => { pagesCountRef.current = pagesCount; }, [pagesCount]);

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
    let nextStyle = 'lined';
    let label = 'Liniert';
    if (paperStyle === 'lined') {
      nextStyle = 'grid';
      label = 'Kariert';
    } else if (paperStyle === 'grid') {
      nextStyle = 'dotted';
      label = 'Punktiert';
    } else if (paperStyle === 'dotted') {
      nextStyle = 'blank';
      label = 'Blanko';
    } else {
      nextStyle = 'lined';
      label = 'Liniert';
    }
    setPaperStyle?.(nextStyle);
    setPaperToast(label);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setPaperToast(null);
    }, 1600);
  };

  const getPaperStyleIcon = () => {
    if (paperStyle === 'lined') return <AlignJustify size={18} />;
    if (paperStyle === 'grid') return <Grid size={18} />;
    if (paperStyle === 'dotted') return <Sparkles size={18} />;
    return <File size={18} />;
  };

  const [draftFocusBox, setDraftFocusBox] = useState(null);
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const inkCanvasRef = useRef(null);
  const documentHeight = pageHeight * pagesCount;
  const totalDocumentHeight = showPageBreaks
    ? pagesCount * pageHeight * zoom + (pagesCount - 1) * PAGE_GAP
    : documentHeight * zoom;
  const pageLayout = {
    pageIds,
    pageWidth: baseWidth,
    pageHeight,
    pageGap: PAGE_GAP,
    zoom,
    showPageBreaks: Boolean(showPageBreaks),
  };
  const inkTool = isEraser
    ? (inkController?.eraserMode === 'stroke' ? 'stroke-eraser' : 'pixel-eraser')
    : (tool || 'pen');
  const inkPointer = useInkPointer({
    inputMode: inkController?.inputMode || 'stylus',
    tool: inkTool,
    eraserMode: inkController?.eraserMode || 'pixel',
    color: penColor || '#EFECE4',
    width: isEraser ? (eraserWidth || 15) : (rawLineWidth ?? lineWidth ?? 3),
    mapPoint: event => mapViewportPoint(pageLayout, relativePoint(containerRef.current, event)),
    document: inkDocument,
    commitStroke: inkController?.commitStroke,
    removeStrokes: inkController?.removeStrokes,
  });
  const redrawInkCanvasRef = useRef(null);
  redrawInkCanvasRef.current = () => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const cssWidth = baseWidth * zoom;
    const cssHeight = totalDocumentHeight;
    const dpr = globalThis.devicePixelRatio || 1;
    resizeInkCanvas(canvas, cssWidth, cssHeight, dpr);
    const previewDocument = inkPointer.draftStroke && inkTool !== 'stroke-eraser'
      ? { ...inkDocument, strokes: [...inkDocument.strokes, inkPointer.draftStroke] }
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
  }, [inkDocument, inkPointer.draftStroke, inkTool, pagesCount, showPageBreaks, totalDocumentHeight, zoom]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    let mediaQuery = null;
    let disposed = false;

    const removeListener = () => {
      if (!mediaQuery) return;
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDprChange);
      } else {
        mediaQuery.removeListener?.(handleDprChange);
      }
    };
    const observeCurrentDpr = () => {
      removeListener();
      if (disposed) return;
      const dpr = globalThis.devicePixelRatio || 1;
      mediaQuery = globalThis.matchMedia(`(resolution: ${dpr}dppx)`);
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleDprChange);
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

  const handlePointerDown = (e) => {
    if (!isSelectMode) { inkPointer.onPointerDown(e); return; }
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setDraftFocusBox({ x, y, width: 0, height: 0, startX: x, startY: y });
  };

  const handlePointerMove = (e) => {
    if (!isSelectMode) { inkPointer.onPointerMove(e); return; }
    if (!draftFocusBox) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(baseWidth, (e.clientX - rect.left) / zoom));
    const currentY = (e.clientY - rect.top) / zoom;
    
    setDraftFocusBox(prev => {
      const x = Math.min(prev.startX, currentX);
      const y = Math.min(prev.startY, currentY);
      const width = Math.abs(currentX - prev.startX);
      const height = Math.abs(currentY - prev.startY);
      return { ...prev, x, y, width, height };
    });
  };

  const handlePointerUp = (e) => {
    if (!isSelectMode) { inkPointer.onPointerUp(e); return; }
    if (!draftFocusBox) return;
    if (draftFocusBox.width > 10 && draftFocusBox.height > 10) {
      focusBoxState.setFocusBox({
        x: draftFocusBox.x,
        y: draftFocusBox.y,
        width: draftFocusBox.width,
        height: draftFocusBox.height
      });
    }
    setDraftFocusBox(null);
    setIsSelectMode?.(false);
  };

  const handlePointerCancel = (e) => {
    if (!isSelectMode) inkPointer.onPointerCancel(e);
    else setDraftFocusBox(null);
  };

  const activePointers = useRef(new Map());
  const pinchInitialData = useRef(null);
  const touchPanInitialData = useRef(null);
  const focusBoxRef = useRef(null);
  const pendingFocusBox = useRef(null);
  const wheelTimeout = useRef(null);

  const handleGestureStart = (e) => {
    if (e.pointerType !== 'touch') return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1
      && isFullMode
      && inkController?.inputMode !== 'finger') {
      const scrollContainer = containerRef.current?.parentElement;
      if (scrollContainer) {
        touchPanInitialData.current = {
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          scrollTop: scrollContainer.scrollTop,
          scrollLeft: scrollContainer.scrollLeft,
        };
      }
    }
    
    if (activePointers.current.size === 2) {
      touchPanInitialData.current = null;
      const pointers = Array.from(activePointers.current.values());
      const distance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      const scrollContainer = containerRef.current?.parentElement;
      if (!scrollContainer) return;

      pinchInitialData.current = {
        distance,
        zoom: zoom,
        focusBox: focusBoxState?.focusBox ? { ...focusBoxState.focusBox } : null,
        centerX: (pointers[0].x + pointers[1].x) / 2,
        centerY: (pointers[0].y + pointers[1].y) / 2,
        scrollTop: scrollContainer.scrollTop,
        scrollLeft: scrollContainer.scrollLeft
      };
    }
  };

  const handleGestureMove = (e) => {
    if (e.pointerType !== 'touch') return;
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.current.size === 1
      && touchPanInitialData.current?.pointerId === e.pointerId) {
      const scrollContainer = containerRef.current?.parentElement;
      if (scrollContainer) {
        scrollContainer.scrollLeft = touchPanInitialData.current.scrollLeft
          - (e.clientX - touchPanInitialData.current.x);
        scrollContainer.scrollTop = touchPanInitialData.current.scrollTop
          - (e.clientY - touchPanInitialData.current.y);
      }
      return;
    }

    if (activePointers.current.size === 2 && pinchInitialData.current) {
      if (pinchInitialData.current.ticking) return;
      pinchInitialData.current.ticking = true;

      requestAnimationFrame(() => {
        if (!pinchInitialData.current) return;
        const pointers = Array.from(activePointers.current.values());
        if (pointers.length < 2) {
          pinchInitialData.current.ticking = false;
          return;
        }

        const currentDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        const currentCenterX = (pointers[0].x + pointers[1].x) / 2;
        const currentCenterY = (pointers[0].y + pointers[1].y) / 2;
        
        const { distance: startDist, zoom: startZoom, centerX: startX, centerY: startY, scrollTop: startScrollTop, scrollLeft: startScrollLeft, focusBox: startFb } = pinchInitialData.current;
        
        const newZoom = Math.max(0.5, Math.min(3, startZoom * (currentDistance / startDist)));
        setZoom(newZoom);
        
        if (startFb) {
          const ratio = startZoom / newZoom;
          let newY = startFb.y + startFb.height / 2 - (startFb.height * ratio) / 2;
          const currentDocHeight = pageHeight * pagesCountRef.current;
          const newHeight = startFb.height * ratio;
          if (newY < 0) newY = 0;
          if (newY + newHeight > currentDocHeight) newY = Math.max(0, currentDocHeight - newHeight);
          
          const newFb = {
            ...startFb,
            x: startFb.x + startFb.width / 2 - (startFb.width * ratio) / 2,
            y: newY,
            width: startFb.width * ratio,
            height: newHeight
          };
          pendingFocusBox.current = newFb;
          if (focusBoxRef.current) {
            focusBoxRef.current.style.left = `${newFb.x * newZoom}px`;
            focusBoxRef.current.style.top = `${newFb.y * newZoom}px`;
            focusBoxRef.current.style.width = `${newFb.width * newZoom}px`;
            focusBoxRef.current.style.height = `${newFb.height * newZoom}px`;
          }
        }
        
        const scrollContainer = containerRef.current?.parentElement;
        if (scrollContainer) {
          const zoomRatio = newZoom / startZoom;
          const dx = currentCenterX - startX;
          const dy = currentCenterY - startY;
          scrollContainer.scrollLeft = startScrollLeft * zoomRatio - dx;
          scrollContainer.scrollTop = startScrollTop * zoomRatio - dy;
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
            setZoom(prev => {
              const newZoom = Math.max(0.5, Math.min(3, prev - e.deltaY * 0.01));
              if (focusBoxState?.focusBox && newZoom !== prev) {
                const ratio = prev / newZoom;
                let newY = focusBoxState.focusBox.y + focusBoxState.focusBox.height / 2 - (focusBoxState.focusBox.height * ratio) / 2;
                const currentDocHeight = pageHeight * pagesCountRef.current;
                const newHeight = focusBoxState.focusBox.height * ratio;
                if (newY < 0) newY = 0;
                if (newY + newHeight > currentDocHeight) newY = Math.max(0, currentDocHeight - newHeight);

                const newFb = {
                  ...focusBoxState.focusBox,
                  x: focusBoxState.focusBox.x + focusBoxState.focusBox.width / 2 - (focusBoxState.focusBox.width * ratio) / 2,
                  y: newY,
                  width: focusBoxState.focusBox.width * ratio,
                  height: newHeight
                };
                pendingFocusBox.current = newFb;
                if (focusBoxRef.current) {
                  focusBoxRef.current.style.left = `${newFb.x * newZoom}px`;
                  focusBoxRef.current.style.top = `${newFb.y * newZoom}px`;
                  focusBoxRef.current.style.width = `${newFb.width * newZoom}px`;
                  focusBoxRef.current.style.height = `${newFb.height * newZoom}px`;
                }
                
                clearTimeout(wheelTimeout.current);
                wheelTimeout.current = setTimeout(() => {
                  if (pendingFocusBox.current) {
                    focusBoxState.setFocusBox(pendingFocusBox.current);
                    pendingFocusBox.current = null;
                  }
                }, 150);
              }
              return newZoom;
            });
            wheelTicking = false;
          });
        }
      }
    };
    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    return () => scrollContainer.removeEventListener('wheel', handleWheel);
  }, [focusBoxState]);

  const handleGestureEnd = (e) => {
    if (e.pointerType !== 'touch') return;
    const wasMultiTouch = activePointers.current.size > 1;
    activePointers.current.delete(e.pointerId);
    if (touchPanInitialData.current?.pointerId === e.pointerId) {
      touchPanInitialData.current = null;
    }
    if (activePointers.current.size < 2) {
      pinchInitialData.current = null;
      if (wasMultiTouch && activePointers.current.size === 1 && isFullMode) {
        const [[pointerId, point]] = activePointers.current.entries();
        const scrollContainer = containerRef.current?.parentElement;
        if (scrollContainer) {
          touchPanInitialData.current = {
            pointerId,
            x: point.x,
            y: point.y,
            scrollTop: scrollContainer.scrollTop,
            scrollLeft: scrollContainer.scrollLeft,
          };
        }
      }
      if (pendingFocusBox.current) {
        focusBoxState.setFocusBox(pendingFocusBox.current);
        pendingFocusBox.current = null;
      }
    }
  };

  const handleFocusBoxDragStart = (e) => {
    e.stopPropagation();
    if (isSelectMode) return;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const startBoxX = focusBoxState.focusBox.x;
    const startBoxY = focusBoxState.focusBox.y;
    const boxWidth = focusBoxState.focusBox.width;
    
    let currentX = startX;
    let currentY = startY;
    let animationFrameId = null;
    
    const scrollContainer = containerRef.current?.parentElement;
    if (!scrollContainer) return;
    const startScrollTop = scrollContainer.scrollTop;
    const startScrollLeft = scrollContainer.scrollLeft;

    const updateBoxDOM = (dx, dy) => {
      let newX = startBoxX + dx;
      if (newX < 0) newX = 0;
      if (newX + boxWidth > baseWidth) newX = baseWidth - boxWidth;
      
      let newY = startBoxY + dy;
      if (newY < 0) newY = 0;
      
      const currentDocHeight = pageHeight * pagesCountRef.current;
      const boxHeight = focusBoxState.focusBox.height;
      if (newY + boxHeight > currentDocHeight) {
        newY = currentDocHeight - boxHeight;
      }
      
      focusBoxState.setFocusBox(prev => ({
        ...prev,
        x: newX,
        y: newY
      }));
      
      return newY;
    };

    const doScroll = () => {
      if (!scrollContainer) return;
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
        const dx = (currentX - startX + (scrollContainer.scrollLeft - startScrollLeft)) / zoom;
        const dy = (currentY - startY + (scrollContainer.scrollTop - startScrollTop)) / zoom;
        
        const newY = updateBoxDOM(dx, dy);
        
        // Auto-expand in continuous mode if near the document bottom
        if (!showPageBreaks) {
          const currentBoxBottom = newY + focusBoxState.focusBox.height;
          const currentDocHeight = pageHeight * pagesCountRef.current;
          if (pagesCountRef.current < maxPages && currentBoxBottom > currentDocHeight - 400) {
            inkController?.addPage?.();
          }
        }
      }
      animationFrameId = requestAnimationFrame(doScroll);
    };
    
    animationFrameId = requestAnimationFrame(doScroll);

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      currentX = moveEvent.clientX;
      currentY = moveEvent.clientY;
      const dx = (currentX - startX + (scrollContainer.scrollLeft - startScrollLeft)) / zoom;
      const dy = (currentY - startY + (scrollContainer.scrollTop - startScrollTop)) / zoom;
      updateBoxDOM(dx, dy);
    };

    const onPointerUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  };

  const getStaticBackgroundStyles = () => {
    const redMarginLine = `linear-gradient(to right, transparent, transparent 88px, oklch(0.62 0.09 26/.38) 88px, oklch(0.62 0.09 26/.38) 89.5px, transparent 89.5px)`;

    if (paperStyle === 'blank') {
      return { backgroundImage: 'none' };
    }

    if (paperStyle === 'lined') {
      return {
        backgroundImage: `${redMarginLine}, linear-gradient(to bottom, transparent calc(100% - 1px), rgba(255,255,255,.07) calc(100% - 1px))`,
        backgroundSize: '100% 100%, 100% 34px',
        backgroundPosition: '0 0, 0 92px',
        backgroundRepeat: 'no-repeat, repeat-y'
      };
    }

    if (paperStyle === 'grid') {
      return {
        backgroundImage: `${redMarginLine}, linear-gradient(to bottom, transparent calc(100% - 1px), rgba(255,255,255,.065) calc(100% - 1px)), linear-gradient(to right, transparent calc(100% - 1px), rgba(255,255,255,.065) calc(100% - 1px))`,
        backgroundSize: '100% 100%, 100% 24px, 24px 100%',
        backgroundPosition: '0 0, 0 92px, 88px 0',
        backgroundRepeat: 'no-repeat, repeat-y, repeat-x'
      };
    }

    if (paperStyle === 'dotted') {
      return {
        backgroundImage: `${redMarginLine}, radial-gradient(circle, rgba(255,255,255,.18) 1.2px, transparent 1.3px)`,
        backgroundSize: '100% 100%, 24px 24px',
        backgroundPosition: '0 0, 16px 92px',
        backgroundRepeat: 'no-repeat, repeat'
      };
    }

    return { backgroundImage: 'none' };
  };

  return (
    <div
      className={`document-view paper-style-${paperStyle}`}
      data-testid="document-view"
      data-document-id={inkController?.document?.documentId}
      data-input-mode={inkController?.inputMode}
      data-eraser-mode={inkController?.eraserMode}
      data-stroke-count={inkDocument.strokes.length}
      style={{ display: 'flex', height: '100%' }}
    >
      <div className="editor-sidebar" style={{ flexShrink: 0, zIndex: 20 }}>
        {onBack && (
          <button className="rail-btn active" onClick={onBack} title="Zurück zur Bibliothek">
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
          className={`rail-btn pen-rail-btn ${tool !== 'highlighter' && !isEraser && !isSelectMode ? 'active' : ''}`}
          onClick={() => {
            if (tool !== 'highlighter' && !isEraser && !isSelectMode) {
              setIsPenSettingsOpen(prev => !prev);
            } else {
              setTool?.('pen');
              setIsEraser?.(false);
              setIsSelectMode?.(false);
              setIsPenSettingsOpen(true);
            }
            setIsColorPickerOpen(false);
          }}
          title="Stift & Einstellungen"
          data-testid="pen-tool-btn"
        >
          <PenLine size={18} />
        </button>
        <button
          className={`rail-btn ${tool === 'highlighter' && !isEraser && !isSelectMode ? 'active' : ''}`}
          onClick={() => {
            setTool?.('highlighter');
            setIsEraser?.(false);
            setIsSelectMode?.(false);
            setIsPenSettingsOpen(true);
            setIsColorPickerOpen(false);
          }}
          title="Textmarker"
        >
          <Highlighter size={18} />
        </button>
        <button
          className={`rail-btn ${isEraser && !isSelectMode ? 'active' : ''}`}
          onClick={() => {
            setIsEraser?.(true);
            setIsSelectMode?.(false);
            setIsPenSettingsOpen(false);
            setIsColorPickerOpen(false);
          }}
          title="Radiergummi"
        >
          <Eraser size={18} />
        </button>
        <button
          className={`rail-btn ${inkController?.inputMode === 'finger' ? 'active' : ''}`}
          onClick={() => inkController?.setInputMode?.(
            inkController.inputMode === 'finger' ? 'stylus' : 'finger'
          )}
          aria-label="Fingermodus"
          aria-pressed={inkController?.inputMode === 'finger'}
          title="Fingermodus"
        >
          <Pencil size={18} />
        </button>
        <button
          className={`rail-btn ${inkController?.eraserMode === 'stroke' ? 'active' : ''}`}
          onClick={() => inkController?.setEraserMode?.(
            inkController.eraserMode === 'stroke' ? 'pixel' : 'stroke'
          )}
          aria-label={`Radiermodus: ${inkController?.eraserMode === 'stroke' ? 'Strich' : 'Pixel'}`}
          aria-pressed={inkController?.eraserMode === 'stroke'}
          title={`Radiermodus: ${inkController?.eraserMode === 'stroke' ? 'Strich' : 'Pixel'}`}
        >
          <Eraser size={16} />
        </button>
        {!isFullMode && (
          <button
            className={`rail-btn ${isSelectMode ? 'active' : ''}`}
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
                setIsColorPickerOpen(prev => !prev);
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
          className={`rail-btn ${paperStyle !== 'blank' ? 'active' : ''}`}
          onClick={cyclePaperStyle}
          title={`Papierstil: ${paperStyle} (Klicken zum Wechseln)`}
          data-testid="paper-style-btn"
        >
          {getPaperStyleIcon()}
        </button>
        <button
          className={`rail-btn ${showPageBreaks ? 'active' : ''}`}
          onClick={() => {
            const next = !showPageBreaks;
            setShowPageBreaks?.(next);
            setPaperToast(next ? 'Einzelseiten aktiv' : 'Unendliches Dokument aktiv');
            setTimeout(() => setPaperToast(null), 1800);
          }}
          title={showPageBreaks ? 'Seitenmodus: Einzelseiten (Klicken für unendliches Dokument)' : 'Seitenmodus: Unendliches Dokument (Klicken für Einzelseiten)'}
          data-testid="page-mode-toggle-btn"
        >
          {showPageBreaks ? <Files size={18} /> : <Infinity size={18} />}
        </button>
        <button className="rail-btn" onClick={handleClearCanvas} title="Leeren">
          <Trash2 size={18} />
        </button>
        <div className="rail-divider" />
        <button
          className={`rail-btn ${!isFullMode ? 'active' : ''}`}
          onClick={() => {
            setIsSelectMode?.(false);
            setLayoutMode?.(isFullMode ? 'split' : 'full');
          }}
          title={isFullMode ? 'Geteilte Ansicht (Fokus-Box) einschalten' : 'Geteilte Ansicht ausschalten'}
          data-testid="layout-mode-btn"
        >
          <Columns2 size={18} />
        </button>
        <button className="rail-btn" style={{ marginTop: 'auto' }} title="Ebenen (bald verfügbar)" disabled>
          <Layers size={19} />
        </button>
      </div>

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
          overflowY: 'auto',
          overflowX: isFullMode ? 'hidden' : 'auto',
          position: 'relative',
          textAlign: isFullMode ? 'left' : 'center',
          touchAction: 'pan-x pan-y',
          // Vollmodus: der Scroll-Container IST das Papier.
          // Startet unterhalb der Pill-Buttons (top: 78px) und schließt bündig am unteren Bildschirmrand ab.
          margin: isFullMode ? '78px 26px 0 104px' : '78px 12px 0 104px',
          background: 'transparent',
          color: '#FFFFFF',
        }}
        onPointerDown={handleGestureStart}
        onPointerMove={handleGestureMove}
        onPointerUp={handleGestureEnd}
        onPointerCancel={handleGestureEnd}
        onScroll={(e) => {
          // Notes-App: am unteren Ende wächst das Papier NUR im unendlichen Modus nach.
          if (!showPageBreaks) {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollHeight - scrollTop - clientHeight < 200 && pagesCount < maxPages) {
              inkController?.addPage?.();
            }
          }
        }}
      >
        <div 
          data-testid="document-page"
          style={{
            display: 'inline-block',
            textAlign: 'left',
            width: `${baseWidth * zoom}px`,
            height: `${totalDocumentHeight}px`,
            position: 'relative',
            backgroundColor: 'transparent',
            boxShadow: 'none',
            margin: isFullMode ? 0 : '96px 0 24px 0',
            touchAction: (isSelectMode || isFullMode) ? 'none' : 'auto',
          }}
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {/* Paper Background: 1 continuous paper for infinite mode, or discrete page cards with real gaps */}
          {!showPageBreaks ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${documentHeight * zoom}px`,
                borderRadius: isFullMode ? '22px 22px 0 0' : '20px',
                background: 'linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)',
                boxShadow: 'inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 34px 74px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)',
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${baseWidth}px`,
                  height: `${documentHeight}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: '0 0',
                  ...getStaticBackgroundStyles(),
                  pointerEvents: 'none',
                  willChange: 'transform'
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
                    position: 'absolute',
                    top: `${pageTop}px`,
                    left: 0,
                    width: '100%',
                    height: `${pageHeight * zoom}px`,
                    borderRadius: '20px',
                    background: 'linear-gradient(170deg, rgba(26,26,31,0.97) 0%, rgba(14,14,18,0.98) 40%, rgba(7,7,10,0.99) 100%)',
                    boxShadow: 'inset 0 1.5px 1px 0 rgba(255,255,255,.1), 0 24px 50px -16px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.08)',
                    overflow: 'hidden',
                    pointerEvents: 'none',
                  }}
                >
                  <div 
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${baseWidth}px`,
                      height: `${pageHeight}px`,
                      transform: `scale(${zoom})`,
                      transformOrigin: '0 0',
                      ...getStaticBackgroundStyles(),
                      pointerEvents: 'none',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: 18,
                      top: 16,
                      font: '600 10.5px ui-monospace, monospace',
                      letterSpacing: '.08em',
                      color: 'rgba(255,255,255,0.45)',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '3px 10px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.09)',
                      backdropFilter: 'blur(10px)',
                      pointerEvents: 'none',
                    }}
                  >
                    SEITE {i + 1} / {pagesCount}
                  </span>
                </div>
              );
            })
          )}
          <canvas
            ref={inkCanvasRef}
            className="master-canvas"
            data-testid="ink-canvas"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              left: 0,
              top: 0,
              touchAction: 'none',
              pointerEvents: 'none'
            }}
          />
          {!isFullMode && focusBoxState && focusBoxState.focusBox && (
            <div
              ref={focusBoxRef}
              className="focus-box"
              data-testid="focus-box"
              style={{
                left: focusBoxState.focusBox.x * zoom,
                top: focusBoxState.focusBox.y * zoom,
                width: focusBoxState.focusBox.width * zoom,
                height: focusBoxState.focusBox.height * zoom,
                position: 'absolute',
                border: '2px solid #1976D2',
                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                cursor: 'move',
                zIndex: 10,
                touchAction: 'none'
              }}
              onPointerDown={handleFocusBoxDragStart}
            />
          )}
          {draftFocusBox && (
            <div 
              data-testid="draft-focus-box"
              style={{
                position: 'absolute',
                border: '2px dashed #1976D2',
                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                pointerEvents: 'none',
                left: draftFocusBox.x * zoom,
                top: draftFocusBox.y * zoom,
                width: draftFocusBox.width * zoom,
                height: draftFocusBox.height * zoom,
                zIndex: 1000
              }}
            />
          )}
        </div>
        {/* Plus Button under the page (only in showPageBreaks mode) */}
        {showPageBreaks && pagesCount < maxPages && (
          <div 
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '24px 0 54px',
              position: 'relative',
              zIndex: 10
            }}
          >
            <button
              className="add-page-btn"
              onClick={() => {
                inkController?.addPage?.();
                setTimeout(() => {
                  if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                  }
                }, 50);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                borderRadius: 9999,
                background: 'linear-gradient(180deg, rgba(42, 42, 48, 0.78) 0%, rgba(18, 18, 22, 0.9) 100%)',
                backdropFilter: 'blur(24px) saturate(1.8)',
                WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                boxShadow: 'inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.45), inset 0 -1px 2px 0 rgba(0, 0, 0, 0.85), 0 16px 36px -12px rgba(0, 0, 0, 0.9)',
                color: '#FFFFFF',
                font: '600 13px Manrope, sans-serif',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              title="Neue Seite hinzufügen"
              data-testid="add-page-btn"
            >
              <Plus size={16} strokeWidth={2.4} />
              <span>Neue Seite hinzufügen ({pagesCount + 1}/{maxPages})</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
