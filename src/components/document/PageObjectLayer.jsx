import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Trash2, Undo2, Wand2 } from "lucide-react";
import { hitTestObject, objectBounds } from "../../ink/pageObjects.js";
import { fontStackOf, snapTextToGrid } from "../../ink/textStyle.js";
import { pagePointToViewport } from "../../ink/pageCoordinates.js";

const HANDLE = 14;
const MIN_TEXT_WIDTH = 24;
const TEXT_WIDTH_BUFFER = 6;
const PAGE_EDGE_MARGIN = 16;

// Measures how wide a text box would need to be to hold its content on one
// line, and how tall it ends up once that's capped to maxWidth and the rest
// innerText keeps the line breaks Enter inserts; textContent flattens them
// away. The fallback is for jsdom, which does not implement innerText.
const readText = (node) => node.innerText ?? node.textContent;

// wraps — via an offscreen clone, so the real field never flickers or loses
// its caret while this runs on every keystroke.
function measureTextBox(node, maxWidth) {
  const computed = getComputedStyle(node);
  const clone = document.createElement("div");
  clone.style.position = "fixed";
  clone.style.visibility = "hidden";
  clone.style.top = "-9999px";
  clone.style.left = "-9999px";
  clone.style.boxSizing = computed.boxSizing;
  clone.style.font = computed.font;
  clone.style.letterSpacing = computed.letterSpacing;
  clone.style.padding = computed.padding;
  clone.style.whiteSpace = "pre";
  clone.style.width = "auto";
  // Must keep the breaks, or the clone measures one long line and the box
  // never grows for the row Enter just added.
  clone.textContent = readText(node) || " ";
  document.body.appendChild(clone);
  const width = Math.max(
    MIN_TEXT_WIDTH,
    Math.min(clone.scrollWidth + TEXT_WIDTH_BUFFER, maxWidth),
  );
  clone.style.whiteSpace = "pre-wrap";
  clone.style.width = `${width}px`;
  const height = clone.scrollHeight;
  document.body.removeChild(clone);
  return { width, height };
}

// Dragging writes to local state and commits once on release, so a move is one
// undo step instead of one per pointermove.
function useDrag(onCommit) {
  const [draft, setDraft] = useState(null);
  const gesture = useRef(null);

  const start = (event, object, mode, zoom, center = null) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      mode,
      zoom,
      startX: event.clientX,
      startY: event.clientY,
      center,
      object,
    };
    setDraft(object);
  };

  const move = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const { object, mode } = active;

    if (mode === "rotate") {
      const cx = active.center?.x ?? active.startX;
      const cy = active.center?.y ?? active.startY;
      const rawDeg =
        (Math.atan2(event.clientY - cy, event.clientX - cx) * 180) / Math.PI + 90;
      let normalized = ((rawDeg % 360) + 360) % 360;

      // Cardinal snapping (+/- 4 degrees)
      const SNAP_TOLERANCE = 4;
      for (const cardinal of [0, 90, 180, 270, 360]) {
        if (Math.abs(normalized - cardinal) <= SNAP_TOLERANCE) {
          normalized = cardinal % 360;
          break;
        }
      }
      setDraft({ ...object, rotation: Math.round(normalized) });
      return;
    }

    const dx = (event.clientX - active.startX) / active.zoom;
    const dy = (event.clientY - active.startY) / active.zoom;
    if (mode === "move")
      setDraft({ ...object, x: object.x + dx, y: object.y + dy });
    else if (mode === "start")
      setDraft({
        ...object,
        x: object.x + dx,
        y: object.y + dy,
        width: object.width - dx,
        height: object.height - dy,
      });
    else
      setDraft({
        ...object,
        width: object.width + dx,
        height: object.height + dy,
      });
  };

  const end = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    const committed = draft;
    setDraft(null);
    if (committed) {
      if (active.mode === "rotate") {
        onCommit?.(active.object.id, { rotation: committed.rotation ?? 0 });
      } else {
        const { x, y, width, height } = committed;
        onCommit?.(active.object.id, { x, y, width, height });
      }
    }
  };

  return { draft, start, move, end };
}

function ObjectContent({ object, editable, onCommitText, onResize, paperStyle, pageWidth = 800, isProcessing = false }) {
  const editableRef = useRef(null);
  const bounds = objectBounds(object);
  const strokeStyle = {
    stroke: object.color,
    strokeWidth: object.strokeWidth,
    fill: "none",
    strokeLinecap: "round",
  };

  if (object.type === "arrow" || object.type === "line") {
    // Signed extents decide which corner the line runs from, so an arrow drawn
    // leftwards keeps its head at the end the user dragged to.
    const pad = object.strokeWidth * 4;
    const headId = `head-${object.id}`;
    return (
      <svg
        width={bounds.width + pad * 2}
        height={bounds.height + pad * 2}
        viewBox={`${-pad} ${-pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`}
        style={{ position: "absolute", left: -pad, top: -pad, overflow: "visible" }}
      >
        {object.type === "arrow" && (
          <defs>
            <marker
              id={headId}
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L5,2.5 L0,5 z" fill={object.color} />
            </marker>
          </defs>
        )}
        <line
          x1={object.width < 0 ? bounds.width : 0}
          y1={object.height < 0 ? bounds.height : 0}
          x2={object.width < 0 ? 0 : bounds.width}
          y2={object.height < 0 ? 0 : bounds.height}
          markerEnd={object.type === "arrow" ? `url(#${headId})` : undefined}
          {...strokeStyle}
        />
      </svg>
    );
  }

  if (object.type === "rect" || object.type === "ellipse") {
    const inset = object.strokeWidth / 2;
    return (
      <svg width="100%" height="100%" style={{ overflow: "visible" }}>
        {object.type === "rect" ? (
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, bounds.width - object.strokeWidth)}
            height={Math.max(0, bounds.height - object.strokeWidth)}
            rx="6"
            {...strokeStyle}
            fill={object.fillColor || "none"}
          />
        ) : (
          <ellipse
            cx={bounds.width / 2}
            cy={bounds.height / 2}
            rx={Math.max(0, bounds.width / 2 - inset)}
            ry={Math.max(0, bounds.height / 2 - inset)}
            {...strokeStyle}
            fill={object.fillColor || "none"}
          />
        )}
      </svg>
    );
  }

  if (object.type === "image" || object.type === "fill") {
    return (
      <img
        src={object.src}
        alt={object.text || "Bild"}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          pointerEvents: "none",
          opacity: isProcessing ? 0.5 : 1,
          transition: "opacity 0.25s ease",
        }}
      />
    );
  }

  if (object.type === "link") {
    return (
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          height: "100%",
          padding: "0 10px",
          borderRadius: 999,
          background: "rgba(62,123,216,0.14)",
          border: `1px solid ${object.color}`,
          color: object.color,
          font: "500 13px/1 system-ui, sans-serif",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <ExternalLink size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {object.text || object.href}
        </span>
      </span>
    );
  }

  const snapped = object.snapToLines ? snapTextToGrid(object, paperStyle) : null;
  const fontSize = snapped ? snapped.fontSize : object.fontSize;
  const lineHeight = snapped
    ? snapped.lineHeight
    : object.lineHeight || Math.round(object.fontSize * 1.35);
  // Snapped text is positioned by its baseline, not its box top: push the
  // first line down so its baseline lands on the rule at the box bottom.
  // snapTextToGrid already bakes this into the box's stored height — reusing
  // its value here (rather than recomputing) keeps the two from drifting apart.
  const paddingTop = snapped ? snapped.topPadding : 0;

  // Entering edit mode opens the keyboard right where the box was placed: focus
  // the field and drop the caret at the end of whatever text it starts with
  // (empty for a freshly clicked box, so the caret just blinks at the start).
  // Growing the box (below) commits `text` early too, which re-renders this
  // field from React's (now matching) state — that re-render would otherwise
  // reset the caret to the start, so this also re-runs then to put it back.
  useEffect(() => {
    if (!editable || !editableRef.current) return;
    editableRef.current.focus();
    const range = document.createRange();
    range.selectNodeContents(editableRef.current);
    range.collapse(false);
    const selection = globalThis.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editable, object.text]);

  // The box hugs its content horizontally as you type — it only wraps (and
  // grows downward instead) once it would run past the page's right edge.
  // Enter also starts a new line outright. Either way the box needs to grow
  // to reveal it, one row at a time so a snapped box's new lines stay on the
  // ruling. Only fires (and only then commits `text`, ahead of the usual
  // on-blur commit) when the size actually changes, so most keystrokes cause
  // no re-render — and no caret disruption — at all.
  const handleInput = (event) => {
    const node = event.currentTarget;
    const maxWidth = Math.max(MIN_TEXT_WIDTH, pageWidth - object.x - PAGE_EDGE_MARGIN);
    const { width, height } = measureTextBox(node, maxWidth);
    // Snapped text still needs whole rows (plus the same baseline padding
    // snapTextToGrid adds — see above) so the box lands back on a rule once
    // this reaches the reducer; unsnapped text just takes the measured height.
    const rows = Math.max(1, Math.round((height - paddingTop) / lineHeight));
    const nextHeight = snapped ? rows * lineHeight + paddingTop : height;
    const patch = {};
    if (Math.abs(nextHeight - bounds.height) > 0.5) patch.height = nextHeight;
    if (Math.abs(width - bounds.width) > 0.5) patch.width = width;
    if (Object.keys(patch).length > 0)
      onResize?.(object.id, { ...patch, text: readText(node) });
  };

  return (
    <div
      ref={editableRef}
      contentEditable={editable}
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={(event) => onCommitText(object.id, readText(event.currentTarget))}
      style={{
        width: "100%",
        height: "100%",
        color: object.color,
        fontSize,
        lineHeight: `${lineHeight}px`,
        paddingTop,
        fontFamily: fontStackOf(object.fontFamily),
        fontWeight: object.bold ? 700 : 400,
        fontStyle: object.italic ? "italic" : "normal",
        // currentColor + a thickness/offset tied to fontSize: the line always
        // matches the text's own (theme-aware) color and sits close under the
        // glyphs, instead of a hand-drawn shape guessing both.
        textDecorationLine: object.underline ? "underline" : "none",
        textDecorationColor: "currentColor",
        textDecorationThickness: Math.max(1.5, fontSize * 0.06),
        // Just enough clearance for descenders (g, y, p) to stay clear of the
        // line — any more and the line reads as detached from the word above it.
        textUnderlineOffset: Math.max(1, fontSize * 0.04),
        textAlign: object.textAlign || "left",
        // Renders stored newlines as real breaks (and still wraps long lines),
        // so a hard break advances exactly one line-height — which is a whole
        // rule, keeping the next line on the ruling.
        whiteSpace: "pre-wrap",
        outline: "none",
        overflow: "hidden",
        cursor: editable ? "text" : "inherit",
      }}
    >
      {object.text}
    </div>
  );
}

function Handle({ position, onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: position.left - HANDLE / 2,
        top: position.top - HANDLE / 2,
        width: HANDLE,
        height: HANDLE,
        borderRadius: "50%",
        background: "#fff",
        border: "2px solid #3E7BD8",
        cursor: "nwse-resize",
        touchAction: "none",
      }}
    />
  );
}

function RotateHandle({ position, onPointerDown }) {
  return (
    <div
      data-testid="rotate-handle"
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: position.left,
        top: position.top,
        transform: "translate(-50%, -100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "auto",
        cursor: "grab",
        touchAction: "none",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          border: "2px solid #3E7BD8",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        }}
      />
      <div
        style={{
          width: 1.5,
          height: 14,
          background: "#3E7BD8",
        }}
      />
    </div>
  );
}

function IconButton({ label, onClick, disabled = false, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      style={{
        display: "grid",
        placeItems: "center",
        width: 26,
        height: 26,
        border: "none",
        borderRadius: 6,
        background: "transparent",
        color: disabled ? "rgba(239, 236, 228, 0.35)" : "#EFECE4",
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "none",
      }}
    >
      {children}
    </button>
  );
}

export default function PageObjectLayer({
  objects = [],
  pageLayout,
  selectedId = null,
  paperStyle = "lined",
  editingId = null,
  processingObjectId = null,
  onEditingChange,
  onSelect,
  onChange,
  onOpenLink,
  onDelete,
  onRemoveBackground,
  onRestoreBackground,
  mapOrigin = (layout, pageId) => pagePointToViewport(layout, pageId, { x: 0, y: 0 }),
}) {
  const drag = useDrag(onChange);
  const zoom = pageLayout?.zoom || 1;
  if (objects.length === 0) return null;

  return (
    <div
      data-testid="page-object-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
    >
      {objects.map((stored) => {
        const object = drag.draft?.id === stored.id ? drag.draft : stored;
        const origin = mapOrigin(pageLayout, object.pageId);
        if (!origin) return null;
        const bounds = objectBounds(object);
        const isSelected = selectedId === object.id;

        return (
          <div
            key={object.id}
            data-object-id={object.id}
            data-object-type={object.type}
            onPointerDown={(event) => {
              if (object.type === "link" && !isSelected && editingId !== object.id && onOpenLink) {
                event.stopPropagation();
                onOpenLink(object.href);
                return;
              }
              // An empty rect/ellipse only grabs the pointer near its outline —
              // missing that band lets the click fall through to the canvas
              // underneath instead of stopping propagation.
              const rect = event.currentTarget.getBoundingClientRect();
              const localX = bounds.x + (event.clientX - rect.left) / zoom;
              const localY = bounds.y + (event.clientY - rect.top) / zoom;
              if (!hitTestObject(object, localX, localY)) return;
              onSelect?.(object.id);
              if (editingId !== object.id) drag.start(event, object, "move", zoom);
            }}
            onDoubleClick={() => object.type === "text" && onEditingChange?.(object.id)}
            style={{
              position: "absolute",
              left: origin.x + bounds.x * zoom,
              top: origin.y + bounds.y * zoom,
              width: bounds.width * zoom,
              height: bounds.height * zoom,
              pointerEvents: "auto",
              touchAction: "none",
              cursor: "move",
              transform: `rotate(${object.rotation || 0}deg)`,
              transformOrigin: "50% 50%",
              outline: isSelected ? "1.5px solid #3E7BD8" : "none",
              outlineOffset: 3,
            }}
          >
            {/* Content is authored in page units and scaled as a whole, so one
                zoom factor covers strokes, text and images alike. */}
            <div
              style={{
                width: bounds.width,
                height: bounds.height,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <ObjectContent
                object={object}
                onResize={onChange}
                paperStyle={paperStyle}
                pageWidth={pageLayout?.pageWidth}
                editable={editingId === object.id}
                isProcessing={processingObjectId === object.id}
                onCommitText={(id, text) => {
                  onEditingChange?.(null);
                  // An empty text box has nothing to show and nothing to
                  // select later — leaving it would just be an invisible
                  // click trap sitting on the page forever.
                  if (!text.trim()) onDelete?.(id);
                  else onChange?.(id, { text });
                }}
              />
            </div>

            {isSelected && (
              <>
                {/* Lines resize from both ends; boxes only from the far corner. */}
                {(object.type === "arrow" || object.type === "line") && (
                  <Handle
                    position={{
                      left: (object.width < 0 ? bounds.width : 0) * zoom,
                      top: (object.height < 0 ? bounds.height : 0) * zoom,
                    }}
                    onPointerDown={(event) => drag.start(event, object, "start", zoom)}
                  />
                )}
                <Handle
                  position={{
                    left: (object.width < 0 ? 0 : bounds.width) * zoom,
                    top: (object.height < 0 ? 0 : bounds.height) * zoom,
                  }}
                  onPointerDown={(event) => drag.start(event, object, "end", zoom)}
                />
                {object.type !== "arrow" && object.type !== "line" && (
                  <RotateHandle
                    position={{
                      left: (bounds.width * zoom) / 2,
                      top: 0,
                    }}
                    onPointerDown={(event) => {
                      const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                      const cx = rect ? rect.left + rect.width / 2 : event.clientX;
                      const cy = rect ? rect.top + rect.height / 2 : event.clientY;
                      drag.start(event, object, "rotate", zoom, { x: cx, y: cy });
                    }}
                  />
                )}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: -34,
                    display: "flex",
                    gap: 2,
                    padding: 3,
                    borderRadius: 8,
                    background: "rgba(20,20,24,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {object.href && (
                    <IconButton
                      label="Link öffnen"
                      onClick={() => onOpenLink?.(object.href) ?? globalThis.open?.(object.href, "_blank", "noopener")}
                    >
                      <ExternalLink size={14} />
                    </IconButton>
                  )}
                  {object.type === "image" && (
                    object.originalSrc ? (
                      <IconButton
                        label="Original wiederherstellen"
                        onClick={() => onRestoreBackground?.(object)}
                        disabled={processingObjectId === object.id}
                      >
                        <Undo2 size={14} />
                      </IconButton>
                    ) : (
                      <IconButton
                        label={
                          processingObjectId === object.id
                            ? "Hintergrund wird entfernt..."
                            : "Hintergrund entfernen"
                        }
                        onClick={() => onRemoveBackground?.(object)}
                        disabled={processingObjectId === object.id}
                      >
                        {processingObjectId === object.id ? (
                          <Loader2
                            size={14}
                            className="rail-chat-spin"
                            style={{ display: "block", transformOrigin: "50% 50%" }}
                          />
                        ) : (
                          <Wand2 size={14} />
                        )}
                      </IconButton>
                    )
                  )}
                  <IconButton label="Löschen" onClick={() => onDelete?.(object.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
