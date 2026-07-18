import { useState, useRef } from 'react';

export default function useCanvas() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;
    const context = canvasRef.current.getContext('2d');
    context.beginPath();
    context.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = nativeEvent;
    const context = canvasRef.current.getContext('2d');
    context.lineTo(offsetX, offsetY);
    context.stroke();
  };

  const stopDrawing = () => {
    const context = canvasRef.current.getContext('2d');
    context.closePath();
    setIsDrawing(false);
  };

  return { canvasRef, isDrawing, startDrawing, draw, stopDrawing };
}
