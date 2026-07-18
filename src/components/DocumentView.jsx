import { useState, useRef, useEffect } from 'react';
import { Eraser, Trash2, Undo2, Redo2, SquareDashed, AlignJustify, File, Grid } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import useLongPress from '../hooks/useLongPress';

function ColorSlot({ colorValue, index, isActive, isEraser, onSelect, onChange, activePickerIndex, setActivePickerIndex }) {
  const wrapperRef = useRef(null);
  const isPickerOpen = activePickerIndex === index;

  const longPressHandlers = useLongPress(
    () => { setActivePickerIndex(index); },
    () => { onSelect(); }
  );

  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setActivePickerIndex(null);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isPickerOpen, setActivePickerIndex]);

  return (
    <div 
      ref={wrapperRef}
      className={`color-btn-wrapper ${isActive && !isEraser ? 'active' : ''}`}
      title="Klicken zum Auswählen, gedrückt halten für Farbrad"
      style={{ touchAction: 'none' }}
      {...longPressHandlers}
    >
      <div className="color-btn" style={{ backgroundColor: colorValue, pointerEvents: 'none' }} />
      {isPickerOpen && (
        <div className="color-picker-popover">
          <HexColorPicker color={colorValue} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

const baseWidth = 800;
const pageHeight = baseWidth * 1.414;

export default function DocumentView({ masterCanvasState, focusBoxState, toolbarState, padActionsRef }) {
  const { 
    clearCanvas, undo, redo, canUndo, canRedo
  } = masterCanvasState || {};
  const { 
    color, setColor, 
    isEraser, setIsEraser, 
    lineWidth, setLineWidth,
    eraserWidth, setEraserWidth,
    isSelectMode, setIsSelectMode,
    paperStyle, setPaperStyle
  } = toolbarState || {};
  const [customColors, setCustomColors] = useState(['#2C2825', '#D32F2F', '#1976D2', '#388E3C', '#F57C00']);
  const [activePickerIndex, setActivePickerIndex] = useState(null);
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
    if (paperStyle === 'blank') setPaperStyle?.('lined');
    else if (paperStyle === 'lined') setPaperStyle?.('grid');
    else setPaperStyle?.('blank');
  };

  const getPaperStyleIcon = () => {
    if (paperStyle === 'lined') return <AlignJustify size={24} />;
    if (paperStyle === 'grid') return <Grid size={24} />;
    return <File size={24} />;
  };

  const [draftFocusBox, setDraftFocusBox] = useState(null);
  const containerRef = useRef(null);

  const handlePointerDown = (e) => {
    if (!isSelectMode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setDraftFocusBox({ x, y, width: 0, height: 0, startX: x, startY: y });
  };

  const handlePointerMove = (e) => {
    if (!isSelectMode || !draftFocusBox) return;
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
    if (!isSelectMode || !draftFocusBox) return;
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
    if (paperStyle === 'blank') return { backgroundImage: 'none', backgroundSize: 'auto', backgroundPositionY: '0px' };

    const marginLineLeft = `linear-gradient(to right, transparent, transparent calc(80px - 1px), #ccc calc(80px - 1px), #ccc calc(80px + 1px), transparent calc(80px + 1px))`;
    const marginLineRight = `linear-gradient(to left, transparent, transparent calc(80px - 1px), #ccc calc(80px - 1px), #ccc calc(80px + 1px), transparent calc(80px + 1px))`;
    
    const horizLines = `linear-gradient(to bottom, transparent, transparent calc(100% - 1px), #ccc calc(100% - 1px), #ccc 100%)`;
    const vertLines = `linear-gradient(to right, transparent, transparent calc(100% - 1px), #ccc calc(100% - 1px), #ccc 100%)`;

    if (paperStyle === 'lined') {
      return {
        backgroundImage: `${marginLineLeft}, ${marginLineRight}, ${horizLines}`,
        backgroundSize: `100% 100%, 100% 100%, 100% 40px`,
        backgroundPositionY: '0px, 0px, 0px',
        backgroundRepeat: 'no-repeat, no-repeat, repeat-y'
      };
    }
    if (paperStyle === 'grid') {
      return {
        backgroundImage: `${marginLineLeft}, ${marginLineRight}, ${horizLines}, ${vertLines}`,
        backgroundSize: `100% 100%, 100% 100%, 100% 20px, 20px 100%`,
        backgroundPositionY: '0px, 0px, 0px, 0px',
        backgroundRepeat: 'no-repeat, no-repeat, repeat, repeat'
      };
    }
    return { backgroundImage: 'none' };
  };

  return (
    <div className={`document-view paper-style-${paperStyle}`} data-testid="document-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="writing-toolbar" style={{ flexShrink: 0, zIndex: 20 }}>
        <button 
          className="tool-btn icon-btn"
          onClick={handleUndo}
          disabled={!canUndo}
          style={{ opacity: canUndo ? 1 : 0.3, cursor: canUndo ? 'pointer' : 'default' }}
          title="Rückgängig"
        >
          <Undo2 size={24} />
        </button>
        <button 
          className="tool-btn icon-btn"
          onClick={handleRedo}
          disabled={!canRedo}
          style={{ opacity: canRedo ? 1 : 0.3, cursor: canRedo ? 'pointer' : 'default' }}
          title="Wiederholen"
        >
          <Redo2 size={24} />
        </button>
        <div className="toolbar-divider" />
        <button 
          className={`tool-btn icon-btn ${isSelectMode ? 'active' : ''}`}
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
          <SquareDashed size={24} />
        </button>
        <button 
          className={`tool-btn icon-btn ${paperStyle !== 'blank' ? 'active' : ''}`}
          onClick={cyclePaperStyle}
          title="Papierstil ändern"
          data-testid="paper-style-btn"
        >
          {getPaperStyleIcon()}
        </button>
        <div className="toolbar-divider" />
        {customColors.map((c, index) => (
          <ColorSlot
            key={index}
            index={index}
            colorValue={c}
            isActive={color === c && !isSelectMode}
            isEraser={isEraser}
            onSelect={() => { setColor?.(c); setIsEraser?.(false); setIsSelectMode?.(false); }}
            onChange={(newColor) => handleColorChange(index, newColor)}
            activePickerIndex={activePickerIndex}
            setActivePickerIndex={setActivePickerIndex}
          />
        ))}
        <div className="toolbar-divider" />
        <button 
          className={`tool-btn icon-btn ${isEraser && !isSelectMode ? 'active' : ''}`}
          onClick={() => { setIsEraser?.(true); setIsSelectMode?.(false); }}
          title="Radiergummi"
        >
          <Eraser size={24} />
        </button>
        <button className="tool-btn icon-btn danger" onClick={handleClearCanvas} title="Leeren">
          <Trash2 size={24} />
        </button>
        <div className="toolbar-divider" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '4px' }}>
          <input 
            type="range" 
            min="1" 
            max={isEraser ? "50" : "20"}
            value={isEraser ? eraserWidth : lineWidth}
            onChange={(e) => isEraser ? setEraserWidth(Number(e.target.value)) : setLineWidth(Number(e.target.value))}
            style={{ width: '80px', accentColor: isEraser ? '#666' : color }}
            title={isEraser ? "Radierergröße" : "Stiftgröße"}
          />
        </div>
        <div className="toolbar-divider" />
        <button className="tool-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} title="Herauszoomen">-</button>
        <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="tool-btn" onClick={() => setZoom(z => Math.min(3, z + 0.1))} title="Hineinzoomen">+</button>
        <div className="toolbar-divider" />
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPageBreaks} onChange={(e) => setShowPageBreaks?.(e.target.checked)} />
          Seiten
        </label>
      </div>
      
      <div 
        style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', backgroundColor: '#e0e0e0', position: 'relative', textAlign: 'center', touchAction: 'pan-x pan-y' }}
        onPointerDown={handleGestureStart}
        onPointerMove={handleGestureMove}
        onPointerUp={handleGestureEnd}
        onPointerCancel={handleGestureEnd}
        onScroll={(e) => {
          if (!showPageBreaks) {
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
            backgroundColor: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            margin: '96px 0 24px 0',
            touchAction: isSelectMode ? 'none' : 'auto',
            WebkitMaskImage: showPageBreaks ? `repeating-linear-gradient(to bottom, black 0px, black ${(pageHeight - 16) * zoom}px, transparent ${(pageHeight - 16) * zoom}px, transparent ${pageHeight * zoom}px)` : 'none',
            maskImage: showPageBreaks ? `repeating-linear-gradient(to bottom, black 0px, black ${(pageHeight - 16) * zoom}px, transparent ${(pageHeight - 16) * zoom}px, transparent ${pageHeight * zoom}px)` : 'none'
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
          {focusBoxState && focusBoxState.focusBox && (
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
                backgroundColor: '#fff',
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
