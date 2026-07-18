import useCanvas from '../hooks/useCanvas';

export default function WritingZone({ masterCanvasState, focusBoxState }) {
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
    
    masterCanvasState.drawLine(masterX1, masterY1, masterX2, masterY2, color, lineWidth, isEraser);
  };

  const onAdvance = (lastX) => {
    if (!focusBoxState) return;
    focusBoxState.setFocusBox(prev => ({
      ...prev,
      x: prev.x + prev.width * 0.8
    }));
  };

  const canvasState = useCanvas(onStroke, onAdvance);
  const { canvasRef, startDrawing, draw, stopDrawing } = canvasState || {};

  return (
    <div className="writing-zone" data-testid="writing-zone">
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
