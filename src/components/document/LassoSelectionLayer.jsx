import React, { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { pagePointToViewport } from "../../ink/pageCoordinates.js";

const HANDLE = 14;

// Same move-writes-local-state-commit-once-on-release pattern as
// PageObjectLayer's useDrag, but for a whole lasso selection at once: one
// drag is one transform-selection command, not one per stroke/object.
function useSelectionDrag(bounds, onCommit, onDragChange) {
  const [draft, setDraft] = useState(null);
  const gesture = useRef(null);

  const start = (event, mode, zoom) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      mode,
      zoom,
      startX: event.clientX,
      startY: event.clientY,
      bounds,
    };
    setDraft(bounds);
  };

  const move = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = (event.clientX - active.startX) / active.zoom;
    const dy = (event.clientY - active.startY) / active.zoom;
    if (active.mode === "move") {
      setDraft({ ...active.bounds, x: active.bounds.x + dx, y: active.bounds.y + dy });
      onDragChange?.({ dx, dy, scaleX: 1, scaleY: 1, originX: 0, originY: 0 });
    } else {
      const width = Math.max(4, active.bounds.width + dx);
      const height = Math.max(4, active.bounds.height + dy);
      setDraft({ ...active.bounds, width, height });
      onDragChange?.({
        dx: 0,
        dy: 0,
        scaleX: width / active.bounds.width,
        scaleY: height / active.bounds.height,
        originX: active.bounds.x,
        originY: active.bounds.y,
      });
    }
  };

  const end = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    const committed = draft;
    setDraft(null);
    onDragChange?.(null);
    if (!committed) return;
    if (active.mode === "move") {
      const dx = committed.x - active.bounds.x;
      const dy = committed.y - active.bounds.y;
      if (dx !== 0 || dy !== 0)
        onCommit({ dx, dy, scaleX: 1, scaleY: 1, originX: 0, originY: 0 });
    } else {
      const scaleX = committed.width / active.bounds.width;
      const scaleY = committed.height / active.bounds.height;
      if (scaleX !== 1 || scaleY !== 1)
        onCommit({
          dx: 0,
          dy: 0,
          scaleX,
          scaleY,
          originX: active.bounds.x,
          originY: active.bounds.y,
        });
    }
  };

  return { draft, start, move, end };
}

export default function LassoSelectionLayer({
  bounds,
  pageLayout,
  onCommit,
  onDelete,
  onDragChange,
  mapOrigin = (layout, pageId) => pagePointToViewport(layout, pageId, { x: 0, y: 0 }),
}) {
  const zoom = pageLayout?.zoom || 1;
  const drag = useSelectionDrag(bounds, onCommit, onDragChange);
  if (!bounds) return null;
  const box = drag.draft || bounds;
  const origin = mapOrigin(pageLayout, bounds.pageId);
  if (!origin) return null;

  return (
    <div
      data-testid="lasso-selection-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
    >
      <div
        onPointerDown={(event) => drag.start(event, "move", zoom)}
        style={{
          position: "absolute",
          left: origin.x + box.x * zoom,
          top: origin.y + box.y * zoom,
          width: box.width * zoom,
          height: box.height * zoom,
          border: "1.5px dashed #3E7BD8",
          background: "rgba(62,123,216,0.08)",
          cursor: "move",
          pointerEvents: "auto",
          touchAction: "none",
        }}
      >
        <div
          onPointerDown={(event) => drag.start(event, "resize", zoom)}
          style={{
            position: "absolute",
            right: -HANDLE / 2,
            bottom: -HANDLE / 2,
            width: HANDLE,
            height: HANDLE,
            borderRadius: "50%",
            background: "#fff",
            border: "2px solid #3E7BD8",
            cursor: "nwse-resize",
            touchAction: "none",
          }}
        />
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDelete}
          title="Auswahl löschen"
          style={{
            position: "absolute",
            left: 0,
            top: -34,
            display: "grid",
            placeItems: "center",
            width: 26,
            height: 26,
            border: "none",
            borderRadius: 6,
            background: "rgba(20,20,24,0.92)",
            color: "#EFECE4",
            cursor: "pointer",
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
