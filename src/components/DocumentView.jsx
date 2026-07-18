import { useState, useRef, useEffect } from 'react';
import { Eraser, Trash2, Undo2, Redo2 } from 'lucide-react';
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

export default function DocumentView({ canvasState, masterCanvasState, focusBoxState }) {
  const { 
    color, setColor, 
    isEraser, setIsEraser, 
    clearCanvas, undo, redo, canUndo, canRedo,
    lineWidth, setLineWidth,
    eraserWidth, setEraserWidth
  } = canvasState || {};
  const [customColors, setCustomColors] = useState(['#2C2825', '#D32F2F', '#1976D2', '#388E3C', '#F57C00']);
  const [activePickerIndex, setActivePickerIndex] = useState(null);


  const handleColorChange = (index, newColor) => {
    const newColors = [...customColors];
    newColors[index] = newColor;
    setCustomColors(newColors);
    setColor?.(newColor);
    setIsEraser?.(false);
  };


  return (
    <div className="document-view" data-testid="document-view" style={{ position: 'relative' }}>
      <div className="writing-toolbar">
        <button 
          className="tool-btn icon-btn"
          onClick={undo}
          disabled={!canUndo}
          style={{ opacity: canUndo ? 1 : 0.3, cursor: canUndo ? 'pointer' : 'default' }}
          title="Rückgängig"
        >
          <Undo2 size={24} />
        </button>
        <button 
          className="tool-btn icon-btn"
          onClick={redo}
          disabled={!canRedo}
          style={{ opacity: canRedo ? 1 : 0.3, cursor: canRedo ? 'pointer' : 'default' }}
          title="Wiederholen"
        >
          <Redo2 size={24} />
        </button>
        <div className="toolbar-divider" />
        {customColors.map((c, index) => (
          <ColorSlot
            key={index}
            index={index}
            colorValue={c}
            isActive={color === c}
            isEraser={isEraser}
            onSelect={() => { setColor?.(c); setIsEraser?.(false); }}
            onChange={(newColor) => handleColorChange(index, newColor)}
            activePickerIndex={activePickerIndex}
            setActivePickerIndex={setActivePickerIndex}
          />
        ))}
        <div className="toolbar-divider" />
        <button 
          className={`tool-btn icon-btn ${isEraser ? 'active' : ''}`}
          onClick={() => setIsEraser?.(true)}
          title="Radiergummi"
        >
          <Eraser size={24} />
        </button>
        <button className="tool-btn icon-btn danger" onClick={clearCanvas} title="Leeren">
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
      </div>
      <div style={{ padding: '80px 24px' }}>
        Document Area
      </div>
      {masterCanvasState && (
        <canvas 
          ref={masterCanvasState.masterCanvasRef} 
          className="master-canvas"
          data-testid="master-canvas"
        />
      )}
      {focusBoxState && focusBoxState.focusBox && (
        <div 
          className="focus-box"
          data-testid="focus-box"
          style={{
            left: focusBoxState.focusBox.x,
            top: focusBoxState.focusBox.y,
            width: focusBoxState.focusBox.width,
            height: focusBoxState.focusBox.height
          }}
          onPointerDown={focusBoxState.handleDrag}
        />
      )}
    </div>
  );
}
