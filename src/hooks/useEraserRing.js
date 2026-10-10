import { useEffect, useRef } from "react";

// Ring that follows the pointer over `areaRef` at `diameter` CSS px, so the
// eraser's hit area is visible. Moves the node directly: no render per move.
// The ring must be a child of areaRef's positioned ancestor chain; it is
// placed in areaRef's own coordinates.
export default function useEraserRing(areaRef, active, diameter) {
  const ringRef = useRef(null);
  useEffect(() => {
    const area = areaRef.current;
    const ring = ringRef.current;
    if (!area || !ring) return undefined;
    const hide = () => { ring.style.display = "none"; };
    if (!active) {
      hide();
      return undefined;
    }
    ring.style.width = ring.style.height = `${diameter}px`;
    const move = (e) => {
      const rect = area.getBoundingClientRect();
      const x = e.clientX - rect.left - diameter / 2;
      const y = e.clientY - rect.top - diameter / 2;
      ring.style.transform = `translate(${x}px, ${y}px)`;
      ring.style.display = "block";
    };
    area.addEventListener("pointermove", move);
    area.addEventListener("pointerdown", move);
    area.addEventListener("pointerleave", hide);
    return () => {
      area.removeEventListener("pointermove", move);
      area.removeEventListener("pointerdown", move);
      area.removeEventListener("pointerleave", hide);
      hide();
    };
  }, [areaRef, active, diameter]);
  return ringRef;
}

export const eraserRingStyle = {
  display: "none",
  position: "absolute",
  left: 0,
  top: 0,
  pointerEvents: "none",
  zIndex: 60,
  boxSizing: "border-box",
  borderRadius: "50%",
  border: "1.5px solid rgba(255,255,255,0.9)",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.55)",
};
