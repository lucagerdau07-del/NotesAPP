import { useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";

const LOCK_PX = 8;
const COMMIT_PX = 56;
const MAX_PX = 96;

// Eine Zeile, die sich nach rechts ziehen lässt: links daneben erscheint ein
// Haken, ab COMMIT_PX gilt das Loslassen als Abhaken (onCommit). Senkrecht
// bleibt das Scrollen frei, ein kurzes Tippen geht an die Kinder durch.
export default function SwipeRow({ enabled = true, done = false, onCommit, children }) {
  const [offset, setOffset] = useState(0);
  // Der Versatz steht auch im Ref: Loslassen kann vor dem nächsten Rendern kommen.
  const dragged = useRef(0);
  const drag = useRef(null);
  const swiped = useRef(false);

  const finish = (commit) => {
    const armed = commit && drag.current?.axis === "x" && dragged.current >= COMMIT_PX;
    drag.current = null;
    dragged.current = 0;
    setOffset(0);
    if (armed) onCommit();
  };

  const move = (event) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return;
      start.axis = Math.abs(dx) > Math.abs(dy) && dx > 0 ? "x" : "y";
      if (start.axis === "x") {
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Ohne aktiven Zeiger (synthetische Ereignisse) läuft die Geste auch so.
        }
      }
    }
    if (start.axis !== "x") return;
    swiped.current = true;
    dragged.current = Math.min(MAX_PX, Math.max(0, dx));
    setOffset(dragged.current);
  };

  if (!enabled) return children;

  return (
    <div
      className="cal-swipe"
      data-armed={offset >= COMMIT_PX}
      onPointerDown={(event) => {
        swiped.current = false;
        drag.current = { x: event.clientX, y: event.clientY, axis: null };
      }}
      onPointerMove={move}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      // Nach einer Wischgeste soll das Loslassen den Eintrag nicht auch noch öffnen.
      onClickCapture={(event) => {
        if (!swiped.current) return;
        swiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <span className="cal-swipe-check" aria-hidden="true" style={{ opacity: Math.min(1, offset / COMMIT_PX) }}>
        {done ? <RotateCcw size={18} /> : <Check size={20} />}
      </span>
      <div className="cal-swipe-body" style={{ transform: `translateX(${offset}px)`, transition: offset ? "none" : undefined }}>
        {children}
      </div>
    </div>
  );
}
