import { useEffect, useRef } from 'react';
import useCanvas from '../hooks/useCanvas';

export default function WritingZone({ masterCanvasState, focusBoxState, toolbarState, padActionsRef }) {
  const loadedStateRef = useRef({ fb: null, ids: [], liveAddedIds: [] });

  const onAdvance = (lastX) => {
    if (!focusBoxState) return;
    flushChanges();
    focusBoxState.setFocusBox(prev => ({
      ...prev,
      x: prev.x + prev.width * 0.8
    }));
  };

  const onStrokeEnd = () => {
    if (masterCanvasState?.endStroke) {
      const id = masterCanvasState.endStroke({ isCollegeBlock: toolbarState?.isCollegeBlock });
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

  const canvasState = useCanvas(onStroke, onAdvance, toolbarState, onStrokeEnd);

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
      const points = stroke.points || stroke;
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
          points: points.map(p => ({
            ...p,
            x1: (p.x1 - fb.x) * scaleX,
            y1: (p.y1 - fb.y) * scaleY,
            x2: (p.x2 - fb.x) * scaleX,
            y2: (p.y2 - fb.y) * scaleY,
            lineWidth: p.lineWidth / scaleX
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

  return (
    <div className={`writing-zone ${toolbarState?.isCollegeBlock ? 'college-block' : ''}`} data-testid="writing-zone">
      <canvas
        ref={canvasRef}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerOut={stopDrawing}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      />
    </div>
  );
}
