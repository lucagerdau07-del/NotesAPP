import { useState, useRef, useLayoutEffect, useCallback } from 'react';

export default function useMasterCanvas() {
  const masterCanvasRef = useRef(null);

  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const currentStrokeRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryState = useCallback(() => {
    setCanUndo(historyIndexRef.current >= 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  const saveSnapshot = useCallback((strokeData) => {
    const nextIndex = historyIndexRef.current + 1;
    historyRef.current = historyRef.current.slice(0, nextIndex);
    historyRef.current.push(strokeData || []);
    historyIndexRef.current = nextIndex;
    updateHistoryState();
  }, [updateHistoryState]);

  const restoreSnapshot = useCallback((index) => {
    const canvas = masterCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();

    if (index >= 0 && index < historyRef.current.length) {
      for (let i = 0; i <= index; i++) {
        const stroke = historyRef.current[i];
        if (!stroke) continue;
        if (stroke.isClear) {
          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.restore();
          continue;
        }
        const points = stroke.points || stroke;
        if (!Array.isArray(points)) continue;
        points.forEach(({ x1, y1, x2, y2, color, lineWidth, isEraser }) => {
          context.strokeStyle = color;
          context.lineWidth = lineWidth;
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
          context.beginPath();
          context.moveTo(x1, y1);
          context.lineTo(x2, y2);
          context.stroke();
        });
      }
    }
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current < 0) return;
    historyIndexRef.current -= 1;
    restoreSnapshot(historyIndexRef.current);
    updateHistoryState();
  }, [restoreSnapshot, updateHistoryState]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    restoreSnapshot(historyIndexRef.current);
    updateHistoryState();
  }, [restoreSnapshot, updateHistoryState]);

  useLayoutEffect(() => {
    const canvas = masterCanvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const context = canvas.getContext('2d');
      if (!context) return;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      const zoomScale = rect.width / 800;
      context.scale(dpr * zoomScale, dpr * zoomScale);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      
      restoreSnapshot(historyIndexRef.current);
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    resizeObserver.observe(canvas);
    updateCanvasSize(); // Set initial size

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = masterCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    saveSnapshot({ isClear: true });
    currentStrokeRef.current = [];
  }, [saveSnapshot]);

  const drawLine = useCallback((x1, y1, x2, y2, strokeColor, width, isEraser = false) => {
    const canvas = masterCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');

    context.strokeStyle = strokeColor;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();

    currentStrokeRef.current.push({ x1, y1, x2, y2, color: strokeColor, lineWidth: width, isEraser });
  }, []);

  const getStrokesInRect = useCallback((rect) => {
    const intersecting = [];
    let lastClearIndex = -1;
    for (let i = 0; i <= historyIndexRef.current; i++) {
      if (historyRef.current[i] && historyRef.current[i].isClear) {
        lastClearIndex = i;
      }
    }

    for (let i = lastClearIndex + 1; i <= historyIndexRef.current; i++) {
      const stroke = historyRef.current[i];
      if (!stroke) continue;
      if (stroke.isClear) continue;
      const points = stroke.points || stroke;
      if (!Array.isArray(points)) continue;
      let inRect = false;
      for (const p of points) {
        if (p.x1 >= rect.x && p.x1 <= rect.x + rect.width &&
            p.y1 >= rect.y && p.y1 <= rect.y + rect.height) {
          inRect = true;
          break;
        }
      }
      if (inRect) intersecting.push(stroke);
    }
    return intersecting;
  }, []);

  const updateStrokes = useCallback((strokesToRemoveIds, newStrokesToAdd) => {
    const newHistory = [];
    for (let i = 0; i <= historyIndexRef.current; i++) {
      const stroke = historyRef.current[i];
      if (!stroke) continue;
      if (stroke.id && strokesToRemoveIds.includes(stroke.id)) continue;
      newHistory.push(stroke);
    }
    newHistory.push(...newStrokesToAdd);
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    restoreSnapshot(historyIndexRef.current);
    updateHistoryState();
  }, [restoreSnapshot, updateHistoryState]);

  const endStroke = useCallback(() => {
    if (currentStrokeRef.current.length > 0) {
      const strokeToSave = [...currentStrokeRef.current];
      const id = Date.now() + Math.random();
      saveSnapshot({ id, points: strokeToSave });
      currentStrokeRef.current = [];
      return id;
    }
    return null;
  }, [saveSnapshot]);

  return {
    masterCanvasRef,
    drawLine,
    endStroke,
    clearCanvas,
    undo,
    redo,
    canUndo,
    canRedo,
    getStrokesInRect,
    updateStrokes
  };
}

