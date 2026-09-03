// src/hooks/useWhiteboardCamera.js
import { useCallback, useState } from "react";

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

export function clampWhiteboardScale(scale) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export default function useWhiteboardCamera(initial = { x: 0, y: 0, scale: 1 }) {
  const [camera, setCamera] = useState(initial);

  const panBy = useCallback((dxScreen, dyScreen) => {
    setCamera((prev) => ({
      ...prev,
      x: prev.x - dxScreen / prev.scale,
      y: prev.y - dyScreen / prev.scale,
    }));
  }, []);

  const zoomBy = useCallback((screenPoint, factor) => {
    setCamera((prev) => {
      const scale = clampWhiteboardScale(prev.scale * factor);
      const worldX = screenPoint.x / prev.scale + prev.x;
      const worldY = screenPoint.y / prev.scale + prev.y;
      return {
        scale,
        x: worldX - screenPoint.x / scale,
        y: worldY - screenPoint.y / scale,
      };
    });
  }, []);

  const focusWorldPointAtScreen = useCallback((worldPoint, screenPoint, scale) => {
    const clamped = clampWhiteboardScale(scale);
    setCamera({
      scale: clamped,
      x: worldPoint.x - screenPoint.x / clamped,
      y: worldPoint.y - screenPoint.y / clamped,
    });
  }, []);

  return { camera, panBy, zoomBy, focusWorldPointAtScreen };
}
