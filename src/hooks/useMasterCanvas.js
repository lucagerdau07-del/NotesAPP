import { useState, useRef, useLayoutEffect, useCallback } from 'react';

export default function useMasterCanvas() {
  const masterCanvasRef = useRef(null);

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
        stroke.forEach(({ x1, y1, x2, y2, color, lineWidth, isEraser }) => {
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
      
      let imgData = null;
      if (canvas.width > 0 && canvas.height > 0) {
        imgData = context.getImageData(0, 0, canvas.width, canvas.height);
      }

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      
      if (imgData) {
        context.putImageData(imgData, 0, 0);
      }
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
    saveSnapshot([]);
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

    // In a real implementation we might batch these or handle them differently
    // For now we just push individual segments if saveSnapshot isn't explicitly called elsewhere
    saveSnapshot([{ x1, y1, x2, y2, color: strokeColor, lineWidth: width, isEraser }]);
  }, [saveSnapshot]);

  return {
    masterCanvasRef,
    drawLine,
    clearCanvas,
    undo,
    redo
  };
}
