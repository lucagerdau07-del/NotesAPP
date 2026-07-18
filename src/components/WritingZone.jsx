import useCanvas from '../hooks/useCanvas';

export default function WritingZone() {
  const { canvasRef, startDrawing, draw, stopDrawing } = useCanvas();

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
