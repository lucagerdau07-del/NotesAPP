import { useState, useRef, useLayoutEffect, useCallback } from 'react';

export default function useCanvas(onStroke = null, toolbarState = null, onStrokeEnd = null, fbWidth = 800) {
  const canvasRef = useRef(null);
  const lastPosRef = useRef(null);
  const currentStrokeRef = useRef([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [localColor, setLocalColor] = useState('#2C2825');
  const [localIsEraser, setLocalIsEraser] = useState(false);
  const [localLineWidth, setLocalLineWidth] = useState(3);
  const [localEraserWidth, setLocalEraserWidth] = useState(15);

  const color = toolbarState?.color ?? localColor;
  const setColor = toolbarState?.setColor ?? setLocalColor;
  const isEraser = toolbarState?.isEraser ?? localIsEraser;
  const setIsEraser = toolbarState?.setIsEraser ?? setLocalIsEraser;
  const lineWidth = toolbarState?.lineWidth ?? localLineWidth;
  const setLineWidth = toolbarState?.setLineWidth ?? setLocalLineWidth;
  const eraserWidth = toolbarState?.eraserWidth ?? localEraserWidth;
  const setEraserWidth = toolbarState?.setEraserWidth ?? setLocalEraserWidth;

  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
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

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    saveSnapshot({ isClear: true });
  }, [saveSnapshot]);

  const restoreSnapshot = useCallback((index) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    
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

    if (currentStrokeRef.current && currentStrokeRef.current.length > 0) {
      currentStrokeRef.current.forEach(({ x1, y1, x2, y2, color, lineWidth, isEraser }) => {
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
    const canvas = canvasRef.current;
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
      
      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      
      restoreSnapshot(historyIndexRef.current);
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    resizeObserver.observe(canvas);
    updateCanvasSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const startDrawing = ({ nativeEvent }) => {
    if (nativeEvent.pointerType !== 'touch' && nativeEvent.pointerType !== 'mouse' && nativeEvent.pointerType !== 'pen') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = nativeEvent.clientX - rect.left;
    const y = nativeEvent.clientY - rect.top;
    const context = canvasRef.current.getContext('2d');
    
    const magnification = rect.width / fbWidth;
    const currentWidth = (isEraser ? eraserWidth : lineWidth) * magnification;
    context.strokeStyle = color;
    context.lineWidth = currentWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';

    context.beginPath();
    context.moveTo(x, y);
    setIsDrawing(true);
    lastPosRef.current = { x, y };
    currentStrokeRef.current = [];
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    if (nativeEvent.pointerType !== 'touch' && nativeEvent.pointerType !== 'mouse' && nativeEvent.pointerType !== 'pen') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = nativeEvent.clientX - rect.left;
    const y = nativeEvent.clientY - rect.top;
    const context = canvasRef.current.getContext('2d');
    context.lineTo(x, y);
    context.stroke();

    const magnification = rect.width / fbWidth;

    if (onStroke && lastPosRef.current) {
      onStroke(lastPosRef.current.x, lastPosRef.current.y, x, y, color, (isEraser ? eraserWidth : lineWidth) * magnification, isEraser);
    }
    
    if (lastPosRef.current) {
      currentStrokeRef.current.push({
        x1: lastPosRef.current.x,
        y1: lastPosRef.current.y,
        x2: x,
        y2: y,
        color,
        lineWidth: (isEraser ? eraserWidth : lineWidth) * magnification,
        isEraser
      });
    }
    
    lastPosRef.current = { x, y };
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const context = canvasRef.current.getContext('2d');
    context.closePath();
    setIsDrawing(false);
    if (currentStrokeRef.current.length > 0) {
      saveSnapshot({ id: Date.now() + Math.random(), points: [...currentStrokeRef.current] });
    }

    if (onStrokeEnd) {
      onStrokeEnd();
    }

    currentStrokeRef.current = [];
    lastPosRef.current = null;
  };

    const getHistory = useCallback(() => {
      return historyRef.current.slice(0, historyIndexRef.current + 1);
    }, []);

    const loadStrokes = useCallback((strokes) => {
      historyRef.current = strokes;
      historyIndexRef.current = strokes.length - 1;
      restoreSnapshot(historyIndexRef.current);
      updateHistoryState();
    }, [restoreSnapshot, updateHistoryState]);

    const shiftLiveStroke = useCallback((dx, dy) => {
      if (!isDrawing) return;
      currentStrokeRef.current = currentStrokeRef.current.map(p => ({
        ...p,
        x1: p.x1 + dx,
        x2: p.x2 + dx,
        y1: p.y1 + dy,
        y2: p.y2 + dy
      }));
      if (lastPosRef.current) {
        lastPosRef.current = {
          x: lastPosRef.current.x + dx,
          y: lastPosRef.current.y + dy
        };
      }
    }, [isDrawing]);

  return { 
    canvasRef, 
    isDrawing, 
    startDrawing, 
    draw, 
    stopDrawing,
    color,
    setColor,
    isEraser,
    setIsEraser,
    lineWidth,
    setLineWidth,
    eraserWidth,
    setEraserWidth,
    clearCanvas,
    undo,
    redo,
    canUndo,
    canRedo,
    getHistory,
    loadStrokes,
    shiftLiveStroke
  };
}
