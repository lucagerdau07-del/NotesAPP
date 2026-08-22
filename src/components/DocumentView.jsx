import { useState, useRef, useEffect } from 'react';
import { 
  Eraser, Trash2, Undo2, Redo2, Lasso, Highlighter, PenLine, 
  Layers, AlignJustify, File, Grid, Columns2, ArrowLeft, 
  X, Palette, Sliders, PenTool, Pencil, Sparkles 
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import useLongPress from '../hooks/useLongPress';

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

export default function DocumentView({ masterCanvasState, focusBoxState, toolbarState, padActionsRef, onBack }) {
  const { 
    clearCanvas, undo, redo, canUndo, canRedo
  } = masterCanvasState || {};
  const { 
    color, setColor, 
    isEraser, setIsEraser, 
    lineWidth, rawLineWidth, setLineWidth,
    eraserWidth, setEraserWidth,
    isSelectMode, setIsSelectMode,
    paperStyle, setPaperStyle,
    layoutMode, setLayoutMode,
    rawColor, tool, setTool
  } = toolbarState || {};
  const penColor = rawColor ?? color;
  const isFullMode = layoutMode !== 'split';
  const [customColors, setCustomColors] = useState(['#EFECE4', '#3E7BD8', '#D8615B', '#4FA66B', '#D4A937']);
  const [activePickerIndex, setActivePickerIndex] = useState(0);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [paperToast, setPaperToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pagesCount, setPagesCount] = useState(1);
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
    undo?.();
    padActionsRef?.current?.undo?.();
  };
  const handleRedo = () => {
    redo?.();
    padActionsRef?.current?.redo?.();
  };
  const handleClearCanvas = () => {
    clearCanvas?.();
    padActionsRef?.current?.clearCanvas?.();
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
  const drawStateRef = useRef({ active: false, x: 0, y: 0 });
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

  const handleDrawStart = (e) => {
    if (!isFullMode || isSelectMode || !masterCanvasState) return;
    e.target.setPointerCapture?.(e.pointerId);
    const rect = containerRef.current.getBoundingClientRect();
    drawStateRef.current = { active: true, x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const handleDrawMove = (e) => {
    if (!drawStateRef.current.active || !masterCanvasState) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const width = isEraser ? eraserWidth : lineWidth;
    masterCanvasState.drawLine(drawStateRef.current.x, drawStateRef.current.y, x, y, color, width, isEraser);
    drawStateRef.current = { active: true, x, y };
  };

  const handleDrawEnd = () => {
    if (drawStateRef.current.active) {
      masterCanvasState?.endStroke?.();
    }
    drawStateRef.current = { active: false, x: 0, y: 0 };
  };

  const handlePointerDown = (e) => {
    if (!isSelectMode) { handleDrawStart(e); return; }
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setDraftFocusBox({ x, y, width: 0, height: 0, startX: x, startY: y });
  };

  const handlePointerMove = (e) => {
    if (!isSelectMode) { handleDrawMove(e); return; }
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
    if (!isSelectMode) { handleDrawEnd(e); return; }
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

  const activePointers = useRef(new Map());
  const pinchInitialData = useRef(null);
  const focusBoxRef = useRef(null);
  const pendingFocusBox = useRef(null);
  const wheelTimeout = useRef(null);

  const handleGestureStart = (e) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (activePointers.current.size === 2) {
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
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      pinchInitialData.current = null;
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
          setPagesCount(prevCount => {
            if (prevCount >= maxPages) return prevCount;
            const currentDocHeight = pageHeight * prevCount;
            if (currentBoxBottom > currentDocHeight - 400) {
              return prevCount + 1;
            }
            return prevCount;
          });
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


  const { showPageBreaks, setShowPageBreaks } = toolbarState || {};
  const maxPages = 20;
  const documentHeight = pageHeight * pagesCount;

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
    <div className={`document-view paper-style-${paperStyle}`} data-testid="document-view" style={{ display: 'flex', height: '100%' }}>
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
          // Vollmodus: der Scroll-Container IST das Papier (Design: left:96 right:24 top/bottom:22).
          margin: isFullMode ? '22px 24px 22px 96px' : 0,
          borderRadius: isFullMode ? '22px' : 0,
          backgroundColor: isFullMode ? '#1D1B21' : 'transparent',
          boxShadow: isFullMode
            ? '0 34px 74px -30px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.06)'
            : 'none'
        }}
        onPointerDown={handleGestureStart}
        onPointerMove={handleGestureMove}
        onPointerUp={handleGestureEnd}
        onPointerCancel={handleGestureEnd}
        onScroll={(e) => {
          // Notes-App: am unteren Ende wächst das Papier nach.
          if (!showPageBreaks || isFullMode) {
            const { scrollTop, scrollHeight, clientHeight } = e.target;
            if (scrollHeight - scrollTop - clientHeight < 200) {
              setPagesCount(prev => Math.min(maxPages, prev + 1));
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
            height: `${documentHeight * zoom}px`,
            position: 'relative',
            backgroundColor: isFullMode ? 'transparent' : '#1D1B21',
            boxShadow: isFullMode ? 'none' : '0 4px 12px rgba(0,0,0,0.15)',
            margin: isFullMode ? 0 : '96px 0 24px 0',
            touchAction: (isSelectMode || isFullMode) ? 'none' : 'auto',
            WebkitMaskImage: (showPageBreaks && !isFullMode) ? `repeating-linear-gradient(to bottom, black 0px, black ${(pageHeight - 16) * zoom}px, transparent ${(pageHeight - 16) * zoom}px, transparent ${pageHeight * zoom}px)` : 'none',
            maskImage: (showPageBreaks && !isFullMode) ? `repeating-linear-gradient(to bottom, black 0px, black ${(pageHeight - 16) * zoom}px, transparent ${(pageHeight - 16) * zoom}px, transparent ${pageHeight * zoom}px)` : 'none'
          }}
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
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
          {masterCanvasState && (
            <canvas 
              ref={masterCanvasState.masterCanvasRef} 
              className="master-canvas"
              data-testid="master-canvas"
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
          )}
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
        {showPageBreaks && pagesCount < maxPages && (
          <div 
            style={{
              position: 'absolute',
              top: `${96 + documentHeight * zoom + 24}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              paddingBottom: '48px'
            }}
          >
            <button
              onClick={() => setPagesCount(p => Math.min(maxPages, p + 1))}
              style={{
                backgroundColor: 'rgba(255,255,255,.14)',
                border: 'none',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                fontSize: '24px',
                color: '#1976D2'
              }}
              title="Neue Seite hinzufügen"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
