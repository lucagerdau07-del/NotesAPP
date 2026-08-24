import { useEffect, useRef, useState } from 'react';
import useCanvas from '../hooks/useCanvas';

export default function WritingZone({ inkController, masterCanvasState, focusBoxState, toolbarState, padActionsRef }) {
  const loadedStateRef = useRef({ fb: null, ids: [], liveAddedIds: [] });



  const onStrokeEnd = () => {
    if (masterCanvasState?.endStroke) {
      const id = masterCanvasState.endStroke();
      if (id) loadedStateRef.current.liveAddedIds.push(id);
    }
  };

  const onStroke = (x1, y1, x2, y2, color, lineWidth, isEraser) => {
    if (!masterCanvasState || !focusBoxState) return;
    const canvas = document.querySelector('.writing-zone canvas');
    if (!canvas) return;
    const pad = canvas.getBoundingClientRect();
    const fb = focusBoxState.focusBox;
    const scaleX = fb.width / pad.width;
    const scaleY = fb.height / pad.height;
    const masterX1 = fb.x + x1 * scaleX;
    const masterY1 = fb.y + y1 * scaleY;
    const masterX2 = fb.x + x2 * scaleX;
    const masterY2 = fb.y + y2 * scaleY;
    
    masterCanvasState.drawLine(masterX1, masterY1, masterX2, masterY2, color, lineWidth * scaleX, isEraser);
  };

  const fbWidth = focusBoxState?.focusBox ? focusBoxState.focusBox.width : 800;
  const canvasState = useCanvas(onStroke, toolbarState, onStrokeEnd, fbWidth);

  const flushChanges = () => {
    if (!loadedStateRef.current.fb) return;
    const fb = loadedStateRef.current.fb;
    const canvas = document.querySelector('.writing-zone canvas');
    if (!canvas) return;
    const pad = canvas.getBoundingClientRect();
    const scaleX = fb.width / pad.width;
    const scaleY = fb.height / pad.height;
    
    const localStrokes = canvasState?.getHistory ? canvasState.getHistory() : [];
    const masterStrokesToAdd = localStrokes.map(stroke => {
      if (stroke.isClear) return { ...stroke, id: stroke.id || (Date.now() + Math.random()) };
      if (stroke.masterStroke) return stroke.masterStroke; // Prevent drift by using original
      const points = stroke.points || stroke;
      if (!Array.isArray(points)) return stroke;
      return {
        id: stroke.id || (Date.now() + Math.random()),
        points: points.map(p => ({
          ...p,
          x1: fb.x + p.x1 * scaleX,
          y1: fb.y + p.y1 * scaleY,
          x2: fb.x + p.x2 * scaleX,
          y2: fb.y + p.y2 * scaleY,
          lineWidth: p.lineWidth * scaleX
        }))
      };
    });

    const idsToRemove = [...loadedStateRef.current.ids, ...loadedStateRef.current.liveAddedIds];
    if (masterCanvasState?.updateStrokes) {
      masterCanvasState.updateStrokes(idsToRemove, masterStrokesToAdd);
    }
    loadedStateRef.current = { fb: null, ids: [], liveAddedIds: [] };
  };

  useEffect(() => {
    if (!focusBoxState?.focusBox || !masterCanvasState?.getStrokesInRect || !canvasState?.loadStrokes) return;
    
    const currentFb = focusBoxState.focusBox;
    const prevFb = loadedStateRef.current.fb;

    if (prevFb && (prevFb.x !== currentFb.x || prevFb.y !== currentFb.y || prevFb.width !== currentFb.width || prevFb.height !== currentFb.height)) {
      if (canvasState?.isDrawing) {
        const dx = currentFb.x - prevFb.x;
        const dy = currentFb.y - prevFb.y;
        const canvas = document.querySelector('.writing-zone canvas');
        if (canvas) {
          const pad = canvas.getBoundingClientRect();
          const scaleX = pad.width / currentFb.width;
          const scaleY = pad.height / currentFb.height;
          canvasState.shiftLiveStroke(-dx * scaleX, -dy * scaleY);
        }
      }
      flushChanges();
    }

    if (!loadedStateRef.current.fb) {
      const fb = currentFb;
      const intersecting = masterCanvasState.getStrokesInRect(fb);
      
      const canvas = document.querySelector('.writing-zone canvas');
      if (!canvas) return;
      const pad = canvas.getBoundingClientRect();
      const scaleX = pad.width / fb.width;
      const scaleY = pad.height / fb.height;

      const localStrokes = intersecting.map(stroke => {
        const points = stroke.points || stroke;
        return {
          id: stroke.id || (Date.now() + Math.random()),
          masterStroke: stroke, // Store reference for flushChanges
          points: points.map(p => ({
            ...p,
            x1: (p.x1 - fb.x) * scaleX,
            y1: (p.y1 - fb.y) * scaleY,
            x2: (p.x2 - fb.x) * scaleX,
            y2: (p.y2 - fb.y) * scaleY,
            lineWidth: p.lineWidth * scaleX
          }))
        };
      });

      loadedStateRef.current = { fb, ids: localStrokes.map(s => s.id), liveAddedIds: [] };
      canvasState.loadStrokes(localStrokes);
    }

    return () => {};
  }, [focusBoxState?.focusBox]);

  const { canvasRef, startDrawing, draw, stopDrawing, undo, redo, clearCanvas } = canvasState || {};

  useEffect(() => {
    if (padActionsRef) {
      padActionsRef.current = { undo, redo, clearCanvas };
    }
  }, [undo, redo, clearCanvas, padActionsRef]);

  const fbAspectRatio = focusBoxState?.focusBox ? focusBoxState.focusBox.width / focusBoxState.focusBox.height : 1;

  const [padHeight, setPadHeight] = useState(1);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      setPadHeight(entries[0].contentRect.height);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  const fb = focusBoxState?.focusBox;
  const scaleY = padHeight && fb ? padHeight / fb.height : 1;

  const paperStyle = toolbarState?.paperStyle || 'blank';
  const baseWidth = 800;
  
  const getPadBackgroundStyles = () => {
    if (paperStyle === 'blank') return { backgroundImage: 'none', backgroundSize: 'auto', backgroundPosition: '0px 0px' };

    const scaleX = padHeight && fb ? padHeight * fbAspectRatio / fb.width : 1;
    const offsetX = fb ? -(fb.x * scaleX) : 0;
    const offsetY = fb ? -(fb.y * scaleY) : 0;

    const marginLineLeft = `linear-gradient(to right, transparent, transparent calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px + 1px), transparent calc(${80 * scaleX}px + 1px))`;
    const marginLineRight = `linear-gradient(to left, transparent, transparent calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px + 1px), transparent calc(${80 * scaleX}px + 1px))`;
    
    const horizLines = `linear-gradient(to bottom, transparent, transparent calc(100% - 1px), rgba(255,255,255,.14) calc(100% - 1px), rgba(255,255,255,.14) 100%)`;
    const vertLines = `linear-gradient(to right, transparent, transparent calc(100% - 1px), rgba(255,255,255,.14) calc(100% - 1px), rgba(255,255,255,.14) 100%)`;

    if (paperStyle === 'lined') {
      return {
        backgroundImage: `${marginLineLeft}, ${marginLineRight}, ${horizLines}`,
        backgroundSize: `${baseWidth * scaleX}px 100%, ${baseWidth * scaleX}px 100%, 100% ${40 * scaleY}px`,
        backgroundPosition: `${offsetX}px 0px, ${offsetX}px 0px, 0px ${offsetY}px`,
        backgroundRepeat: 'no-repeat, no-repeat, repeat-y'
      };
    }
    if (paperStyle === 'grid') {
      return {
        backgroundImage: `${marginLineLeft}, ${marginLineRight}, ${horizLines}, ${vertLines}`,
        backgroundSize: `${baseWidth * scaleX}px 100%, ${baseWidth * scaleX}px 100%, 100% ${20 * scaleY}px, ${20 * scaleX}px 100%`,
        backgroundPosition: `${offsetX}px 0px, ${offsetX}px 0px, 0px ${offsetY}px, ${offsetX}px 0px`,
        backgroundRepeat: 'no-repeat, no-repeat, repeat, repeat'
      };
    }
    return { backgroundImage: 'none' };
  };

  const showPageBreaks = toolbarState?.showPageBreaks;
  const padPageHeight = 800 * 1.414 * scaleY;
  const maskImage = showPageBreaks ? `linear-gradient(to bottom, black 0px, black ${padPageHeight - 16 * scaleY}px, transparent ${padPageHeight - 16 * scaleY}px, transparent ${padPageHeight}px)` : 'none';
  const maskSize = showPageBreaks ? `100% ${padPageHeight}px` : 'auto';
  const maskPosition = showPageBreaks && fb ? `0px ${-(fb.y * scaleY)}px` : '0px 0px';
  const maskRepeat = showPageBreaks ? 'repeat-y' : 'repeat';

  const paperBgColor = paperStyle === 'grid' ? '#1a1820' : '#1D1B21';

  return (
    <div
      className="writing-zone"
      data-testid="writing-zone"
      data-document-id={inkController?.document?.documentId}
      data-input-mode={inkController?.inputMode}
      data-eraser-mode={inkController?.eraserMode}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0e11', backgroundImage: 'none' }}
    >
      <div style={{ 
        position: 'relative',
        maxWidth: '100%', 
        maxHeight: '100%', 
        width: '100%',
        height: 'auto',
        aspectRatio: fbAspectRatio,
        filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.15))'
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: paperBgColor,
          WebkitMaskImage: maskImage,
          maskImage: maskImage,
          WebkitMaskSize: maskSize,
          maskSize: maskSize,
          WebkitMaskPosition: maskPosition,
          maskPosition: maskPosition,
          WebkitMaskRepeat: maskRepeat,
          maskRepeat: maskRepeat,
          ...getPadBackgroundStyles()
        }}>
          <canvas
            ref={canvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerOut={stopDrawing}
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%', 
              touchAction: 'none'
            }}
          />

        </div>
      </div>
    </div>
  );
}
