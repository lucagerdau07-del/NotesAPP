import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Trash2,
  Undo2,
  Wand2,
  Lock,
  Unlock,
  Layers,
  ChevronUp,
  ChevronDown,
  ArrowUpToLine,
  ArrowDownToLine,
  Check,
  X,
  Plus,
} from "lucide-react";
import { hitTestObject, objectBounds, objectLayoutBounds, curveControlPoint, elbowBendX } from "../../ink/pageObjects.js";
import { FLOW_MARGIN, baselineOffset, fontStackOf, snapTextToGrid } from "../../ink/textStyle.js";
import { cropPatch, dragCropEdge, naturalSizeOf, rememberNaturalSize, sourceRect, visibleRect } from "../../ink/imageCrop.js";
import {
  dashArrayFor,
  roughRectPaths,
  roughEllipsePaths,
  roughLinePaths,
  roughCurvePaths,
  roughElbowPaths,
  roughArrowheadPaths,
} from "../../ink/handDrawn.js";
import { pagePointToViewport } from "../../ink/pageCoordinates.js";
import {
  applyAutoformat,
  checkboxAt,
  cutFrom,
  markCaret,
  placeCaret,
  placeCaretAtPoint,
  promptLink,
  richHtmlOf,
  runRichCommand,
  sanitizeRichHtml,
  shortcutCommand,
  splitPointBelow,
  toggleCheckbox,
  untickNewItem,
} from "../../ink/richText.js";
import { renderInline } from "../Markdown.jsx";
import { useChemKeyboardEnabled } from "../chemKeyboard/chemKeyboardState.js";
import RichTextToolbar from "./RichTextToolbar.jsx";
import "../../styles/richText.css";

// AI-written text only: renders **bold**/_italic_/`code`/~~strike~~ instead of
// showing the raw markdown syntax. User-typed text always stays literal.
function renderAiText(text) {
  return String(text)
    .split("\n")
    .map((line, index, lines) => (
      <React.Fragment key={index}>
        {renderInline(line, `t${index}`)}
        {index < lines.length - 1 ? <br /> : null}
      </React.Fragment>
    ));
}

const HANDLE = 14;
// Touch target only — the visible dot stays HANDLE, but a finger is much
// wider than a mouse cursor, so the hit area extends past it on all sides.
const HANDLE_HIT = 36;
const MIN_TEXT_WIDTH = 24;
const TEXT_HIT_PAD = 10;
const TEXT_WIDTH_BUFFER = 6;
const PAGE_EDGE_MARGIN = 16;

// Measures how wide a text box would need to be to hold its content on one
// line, and how tall it ends up once that's capped to maxWidth and the rest
// innerText keeps the line breaks Enter inserts; textContent flattens them
// away. The fallback is for jsdom, which does not implement innerText.
const readText = (node) => node.innerText ?? node.textContent;

// wraps — via an offscreen clone, so the real field never flickers or loses
// its caret while this runs on every keystroke.
// fixedWidth skips the natural-width measurement entirely — a box the user
// pinned by hand (autoWidth: false) wraps inside whatever width it already
// has instead of growing to fit a long word or line.
function measureTextBox(node, maxWidth, fixedWidth = null) {
  // A deep clone keeps the line breaks and the rich structure (headings,
  // lists) that decide the height; its own inline styles bring the typography.
  const clone = node.cloneNode(true);
  const computed = window.getComputedStyle(node);
  clone.removeAttribute("contenteditable");
  clone.style.position = "absolute";
  clone.style.visibility = "hidden";
  clone.style.height = "auto";
  clone.style.overflow = "visible";
  clone.style.letterSpacing = computed.letterSpacing;
  // Matches the real box's own wrapping (see its overflowWrap) so a fixed
  // width that's narrower than one word measures the same broken height.
  clone.style.overflowWrap = "break-word";
  if (!node.firstChild) clone.textContent = " ";
  let width;
  if (fixedWidth != null) {
    width = fixedWidth;
  } else {
    clone.style.whiteSpace = "pre";
    clone.style.width = "auto";
    document.body.appendChild(clone);
    width = Math.max(
      MIN_TEXT_WIDTH,
      Math.min(clone.scrollWidth + TEXT_WIDTH_BUFFER, maxWidth),
    );
    document.body.removeChild(clone);
  }
  clone.style.whiteSpace = "pre-wrap";
  clone.style.width = `${width}px`;
  document.body.appendChild(clone);
  const height = clone.scrollHeight;
  document.body.removeChild(clone);
  return { width, height };
}

// The size a text box needs for its content, hugging it (fixedWidth null) or
// wrapped inside a given width. Snapped text keeps whole ruled rows; the row
// height and baseline padding come off the field's own inline style.
function fitTextBox(field, maxWidth, fixedWidth, snapToLines) {
  const { width, height } = measureTextBox(field, maxWidth, fixedWidth);
  if (!snapToLines) return { width, height };
  const pad = parseFloat(field.style.paddingTop) || 0;
  const line = parseFloat(field.style.lineHeight) || height;
  return { width, height: Math.max(1, Math.round((height - pad) / line)) * line + pad };
}

const textFieldOf = (event) =>
  event.currentTarget.closest('[data-testid="object-container"]')?.querySelector(".rich-text") ?? null;

// Dragging writes to local state and commits once on release, so a move is one
// undo step instead of one per pointermove.
// Distinguishes a real tap on an unselected object from a pan/scroll/pinch
// that merely passes over its hitbox: a finger panning or zooming touches
// down and moves (or a second finger joins for a pinch) before it lifts,
// where a tap stays still and stays alone. Only gates the FIRST select — once
// an object is already selected, dragging it further is deliberate and keeps
// firing immediately (see the onPointerDown handler below).
const TAP_MOVE_THRESHOLD = 8;

function useTapSelect(onSelect) {
  const pending = useRef(null);

  const start = (event, objectId) => {
    // Carried through to onSelect on release — a ctrl/cmd-held tap adds the
    // object to the current selection instead of replacing it.
    pending.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      objectId,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };

    const cancel = () => {
      pending.current = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("pointerdown", handleOtherDown);
    };
    const handleMove = (e) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_MOVE_THRESHOLD) cancel();
    };
    const handleUp = (e) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.pointerId) return;
      cancel();
      onSelect?.(p.objectId, { ctrlKey: p.ctrlKey, metaKey: p.metaKey });
    };
    // A second finger touching down mid-gesture means this was the start of a
    // pinch, not a tap — even if the first finger never moved.
    const handleOtherDown = (e) => {
      if (e.pointerId !== pending.current?.pointerId) cancel();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("pointerdown", handleOtherDown);
  };

  return start;
}

// Crop rect is tracked in the object's own unscaled units (same space as
// object.x/y/width/height) so confirming it is a plain page-space patch —
// only the CSS positions below multiply by zoom.
const CROP_MIN = 20;
const CROP_HANDLE = 22;

function ImageCropOverlay({ object, boxWidth, boxHeight, zoom, pointerScale = zoom, onConfirm, onCancel }) {
  const [natural, setNatural] = useState(null);
  const [rect, setRect] = useState(null);
  const rootRef = useRef(null);

  // Pressing anywhere outside the crop (its own frame and buttons included)
  // abandons it, same as the cancel button. The press is swallowed: it only
  // leaves the crop, it must not also start a stroke on the canvas below.
  useEffect(() => {
    const handleDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("pointerdown", handleDown, true);
    return () => document.removeEventListener("pointerdown", handleDown, true);
  }, [onCancel]);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = object.src;
    return () => {
      cancelled = true;
    };
  }, [object.src]);

  // Where the whole source sits in the box (a cropped one reaches past it) and
  // the part of the box that shows image: the crop can only shrink inside that
  // here; pulling it back out is what the edge handles are for.
  const src = natural ? sourceRect(object, natural) : null;
  const containRect = src ? visibleRect(object, src) : null;

  useEffect(() => {
    if (containRect && !rect) {
      const { x, y, width, height } = containRect;
      setRect({ x, y, width, height });
    }
  }, [containRect, rect]);

  if (!containRect || !rect) return null;

  const clamp = (r) => {
    const x = Math.max(containRect.x, Math.min(r.x, containRect.x + containRect.width - CROP_MIN));
    const y = Math.max(containRect.y, Math.min(r.y, containRect.y + containRect.height - CROP_MIN));
    const maxWidth = containRect.x + containRect.width - x;
    const maxHeight = containRect.y + containRect.height - y;
    return {
      x,
      y,
      width: Math.max(CROP_MIN, Math.min(r.width, maxWidth)),
      height: Math.max(CROP_MIN, Math.min(r.height, maxHeight)),
    };
  };

  const startCornerDrag = (corner) => (event) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, rect: { ...rect } };
    const move = (e) => {
      const dx = (e.clientX - start.x) / pointerScale;
      const dy = (e.clientY - start.y) / pointerScale;
      const next = { ...start.rect };
      if (corner.includes("w")) {
        next.x = start.rect.x + dx;
        next.width = start.rect.width - dx;
      }
      if (corner.includes("e")) next.width = start.rect.width + dx;
      if (corner.includes("n")) {
        next.y = start.rect.y + dy;
        next.height = start.rect.height - dy;
      }
      if (corner.includes("s")) next.height = start.rect.height + dy;
      setRect(clamp(next));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const confirm = () => onConfirm(cropPatch(object, src, rect));

  return (
    <div
      ref={rootRef}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ position: "absolute", inset: 0, cursor: "default", zIndex: 50 }}
    >
      {/* Only the dimming is clipped to the object's box; the corner handles
          sit outside this wrapper, so those on the box edge stay whole. */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: rect.x * zoom,
          top: rect.y * zoom,
          width: rect.width * zoom,
          height: rect.height * zoom,
          boxShadow: "0 0 0 2000px rgba(0,0,0,0.5)",
          outline: "2px solid #3E7BD8",
          overflow: "hidden",
        }}
      >
        <img
          src={object.src}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: -(rect.x - src.x) * zoom,
            top: -(rect.y - src.y) * zoom,
            width: src.width * zoom,
            height: src.height * zoom,
            pointerEvents: "none",
          }}
        />
      </div>
      </div>
      {["nw", "ne", "sw", "se"].map((corner) => (
        <div
          key={corner}
          onPointerDown={startCornerDrag(corner)}
          style={{
            position: "absolute",
            left: (corner.includes("w") ? rect.x : rect.x + rect.width) * zoom - HANDLE_HIT / 2,
            top: (corner.includes("n") ? rect.y : rect.y + rect.height) * zoom - HANDLE_HIT / 2,
            width: HANDLE_HIT,
            height: HANDLE_HIT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: `${corner}-resize`,
            touchAction: "none",
          }}
        >
          <div
            style={{
              width: CROP_HANDLE,
              height: CROP_HANDLE,
              borderRadius: "50%",
              background: "#fff",
              border: "3px solid #3E7BD8",
              // Dark halo so the dot also reads on a white image.
              boxShadow: "0 0 0 2px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.5)",
            }}
          />
        </div>
      ))}
      <div style={{ position: "absolute", left: rect.x * zoom, top: rect.y * zoom - 34, display: "flex", gap: 4 }}>
        <IconButton label="Zuschnitt übernehmen" onClick={confirm}>
          <Check size={14} />
        </IconButton>
        <IconButton label="Abbrechen" onClick={onCancel}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function useDrag(onCommit) {
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  const gesture = useRef(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const start = (event, object, mode, zoom, center = null, extra = null) => {
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
      extra,
      object,
    };
    draftRef.current = object;
    setDraft(object);
  };

  const move = useCallback((event) => {
    const active = gesture.current;
    if (!active) return;
    if (event.pointerId !== undefined && active.pointerId !== event.pointerId) return;
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
      const next = { ...object, rotation: Math.round(normalized) };
      draftRef.current = next;
      setDraft(next);
      return;
    }

    let dx = (event.clientX - active.startX) / active.zoom;
    let dy = (event.clientY - active.startY) / active.zoom;
    const rad = ((object.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // A rotated object's handles move in its own frame, so the pointer delta
    // has to be un-rotated first.
    if (rad && mode !== "move") [dx, dy] = [dx * cos + dy * sin, -dx * sin + dy * cos];
    let next;
    if (mode === "move") {
      next = { ...object, x: object.x + dx, y: object.y + dy };
    } else if (mode === "crop") {
      next = { ...object, ...dragCropEdge(object, active.extra?.natural, active.extra?.edge, dx, dy) };
    } else if (mode === "start") {
      next = {
        ...object,
        x: object.x + dx,
        y: object.y + dy,
        width: object.width - dx,
        height: object.height - dy,
      };
    } else if (mode === "bow") {
      // The handle sits at the curve's peak, which is free to move in both
      // directions: perpendicular to the chord (bow, a pixel offset) and
      // along it (curveBend, a 0-1 fraction) — decompose the raw drag into
      // those two components.
      const ldx = object.width;
      const ldy = object.height;
      const len = Math.hypot(ldx, ldy) || 1;
      const perpX = -ldy / len;
      const perpY = ldx / len;
      const paraX = ldx / len;
      const paraY = ldy / len;
      const baseBow = typeof object.bow === "number" ? object.bow : Math.min(40, len * 0.2);
      const baseT = typeof object.curveBend === "number" ? object.curveBend : 0.5;
      next = {
        ...object,
        bow: baseBow + dx * perpX + dy * perpY,
        curveBend: baseT + (dx * paraX + dy * paraY) / len,
      };
    } else if (mode === "elbow") {
      // The bend is a fraction (0-1) along the chord, not a pixel offset, so
      // it stays put relative to the endpoints if they're later moved/resized.
      const baseT = typeof object.elbowBend === "number" ? object.elbowBend : 0.5;
      next = { ...object, elbowBend: object.width ? baseT + dx / object.width : baseT };
    } else if (mode === "scale") {
      // Canva corner: text, box and font grow together and the opposite
      // corner stays put. The drag counts along the box's diagonal, so the
      // wrapping (and with it the shape) never changes.
      const { sx, sy } = active.extra;
      const w = object.width;
      const h = object.height;
      const s = Math.max(
        1 + (sx * dx * w + sy * dy * h) / (w * w + h * h || 1),
        6 / object.fontSize,
        MIN_TEXT_WIDTH / w,
      );
      next = {
        ...object,
        x: sx < 0 ? object.x + w * (1 - s) : object.x,
        y: sy < 0 ? object.y + h * (1 - s) : object.y,
        width: w * s,
        height: h * s,
        fontSize: Math.round(object.fontSize * s * 10) / 10,
      };
      if (object.lineHeight > 0) next.lineHeight = Math.round(object.lineHeight * s * 10) / 10;
    } else if (mode === "side") {
      // Canva side: only the width changes; the text rewraps and the box
      // follows it down or up.
      const { sx, field } = active.extra;
      const width = Math.max(MIN_TEXT_WIDTH, object.width + sx * dx);
      next = { ...object, width, x: sx < 0 ? object.x + object.width - width : object.x };
      if (field) next.height = fitTextBox(field, width, width, object.snapToLines).height;
    } else if (object.type === "image" && object.width && object.height) {
      // A picture scales as a whole; making it another shape is what the edge
      // handles (crop) are for.
      const ratio = Math.max(0.05, (object.width + dx) / object.width, (object.height + dy) / object.height);
      next = { ...object, width: object.width * ratio, height: object.height * ratio };
    } else {
      next = { ...object, width: object.width + dx, height: object.height + dy };
    }
    // Which corner of the box stays where it is, as a fraction of its size.
    const anchor =
      mode === "start" ? [1, 1]
      : mode === "end" ? [0, 0]
      : mode === "scale" ? [active.extra.sx < 0 ? 1 : 0, active.extra.sy < 0 ? 1 : 0]
      : mode === "side" ? [active.extra.sx < 0 ? 1 : 0, 0]
      : null;
    if (rad && anchor) {
      // Resizing moves the rotation center, which would drag the opposite,
      // untouched corner/endpoint along — shift it back to where it was.
      const pinned = (o) => {
        const px = o.x + anchor[0] * o.width;
        const py = o.y + anchor[1] * o.height;
        const vx = px - (o.x + o.width / 2);
        const vy = py - (o.y + o.height / 2);
        return { x: o.x + o.width / 2 + vx * cos - vy * sin, y: o.y + o.height / 2 + vx * sin + vy * cos };
      };
      const before = pinned(object);
      const after = pinned(next);
      next.x += before.x - after.x;
      next.y += before.y - after.y;
    }
    draftRef.current = next;
    setDraft(next);
  }, []);

  const end = useCallback((event) => {
    const active = gesture.current;
    if (!active) return;
    if (event && event.pointerId !== undefined && active.pointerId !== event.pointerId) return;
    gesture.current = null;
    const committed = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (committed) {
      if (active.mode === "rotate") {
        onCommitRef.current?.(active.object.id, { rotation: committed.rotation ?? 0 });
      } else if (active.mode === "bow") {
        onCommitRef.current?.(active.object.id, { bow: committed.bow, curveBend: committed.curveBend });
      } else if (active.mode === "elbow") {
        onCommitRef.current?.(active.object.id, { elbowBend: committed.elbowBend });
      } else {
        const { x, y, width, height, fontSize, lineHeight } = committed;
        const patch = { x, y, width, height };
        if (active.mode === "crop") patch.crop = committed.crop;
        if (active.object.type === "text") {
          patch.fontSize = fontSize;
          if (active.object.lineHeight > 0) patch.lineHeight = lineHeight;
          // A side handle is the user picking a width by hand — from here
          // on, typing wraps inside it rather than stretching it wider again.
          if (active.mode === "side") patch.autoWidth = false;
          if (active.mode === "scale" && active.object.snapToLines === false) patch.snapToLines = false;
          // Scaling only rounds its way to the right size; the field now
          // shows the final font, so measure the exact box once.
          const field = active.extra?.field;
          if (active.mode === "scale" && field) {
            const hug = active.object.autoWidth !== false;
            const fitted = fitTextBox(field, Infinity, hug ? null : width, active.object.snapToLines);
            patch.height = fitted.height;
            if (hug) patch.width = fitted.width;
          }
        }
        onCommitRef.current?.(active.object.id, patch);
      }
    }
  }, []);

  useEffect(() => {
    if (!draft) return;
    const handlePointerMove = (e) => move(e);
    const handlePointerUp = (e) => end(e);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draft, move, end]);

  // A second finger arriving mid-drag means the gesture just became a
  // page pan/zoom, not an object move — drop the draft with nothing
  // committed instead of leaving it to fight the gesture for the same
  // finger's moves.
  const cancel = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = null;
    draftRef.current = null;
    setDraft(null);
  }, []);

  return { draft, start, move, end, cancel };
}

// A real <table>: one shared grid of borders instead of separate rect+text
// objects glued together cell by cell. Cells are only committed on blur (not
// per keystroke), so cellText in the object never changes mid-edit and React
// never stomps on a caret mid-word — same trick the text object above relies on.
function TableContent({ object, editable, onResize, focusCell, onExitEdit }) {
  const chemKeyboard = useChemKeyboardEnabled();
  const tableRef = useRef(null);
  const rows = object.rows || 1;
  const cols = object.cols || 1;

  // Wrapped cell text can render taller than the stored height (set at insert
  // time from a uniform rowHeight guess) — keep object.height following the
  // real layout so the selection outline, hit-test box and the row/col +/-
  // controls (all positioned off object.height) land where the table actually
  // ends instead of cutting through a row.
  // A ResizeObserver on the table itself would loop forever here: the table's
  // own CSS height is `min-height: 100%` of the box we're setting from this
  // measurement, so patching height changes the table's box, which changes
  // its measured height again. Keying off the content instead (not height,
  // not a live observer of the element we're resizing) breaks that cycle —
  // it only re-measures when something that could actually change the
  // rendered height changed.
  // cellTextKey (not object.cellText itself): createPageObject rebuilds the
  // cellText grid into fresh row arrays on every single update — including
  // our own height-only patch — so the array reference never stabilizes and
  // would retrigger this effect forever. A content string only changes when
  // a cell's actual text does.
  const cellTextKey = object.cellText?.map((row) => row.join(" ")).join("") ?? "";
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const height = table.offsetHeight;
    if (Math.abs(height - object.height) > 0.5) onResize?.(object.id, { height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.id, object.width, cellTextKey, object.cols, object.rows, object.fontSize]);

  // Entering edit mode (double-click) drops the caret in the cell that was
  // actually double-clicked (focusCell), falling back to the first cell —
  // mirroring the text object's own focus-on-edit behavior above.
  useEffect(() => {
    if (!editable) return;
    const row = focusCell?.row ?? 0;
    const col = focusCell?.col ?? 0;
    const cell = tableRef.current?.querySelectorAll("td")[row * cols + col];
    if (!cell) return;
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = globalThis.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  const commitCell = (row, col, value) => {
    const cellText = object.cellText.map((r) => [...r]);
    if (!cellText[row]) cellText[row] = [];
    cellText[row][col] = value;
    onResize?.(object.id, { cellText });
  };

  return (
    <table
      ref={tableRef}
      onBlur={(event) => {
        // Unlike the single-box text object, a table has many focusable td's
        // — only leaving the last one (focus landing outside the whole table,
        // or nowhere) actually ends editing. Without this, editingId stayed
        // pinned to the table forever after the first double-click, so every
        // later plain click hit a still-contentEditable cell and place a
        // caret instead of selecting the table.
        if (editable && !event.currentTarget.contains(event.relatedTarget)) onExitEdit?.();
      }}
      style={{
        width: "100%",
        // Fills the object's box at minimum but is free to grow if a cell's
        // wrapped content needs more room than the stored row heights give it
        // — clipping would lose text the user just typed.
        height: "100%",
        minHeight: "100%",
        borderCollapse: "collapse",
        tableLayout: "fixed",
      }}
    >
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row}>
            {Array.from({ length: cols }, (_, col) => (
              <td
                key={col}
                contentEditable={editable}
                inputMode={chemKeyboard ? "none" : undefined}
                suppressContentEditableWarning
                onPointerDown={(event) => {
                  // Stops the object container's own handler from starting a
                  // drag/select underneath a click meant to place the caret.
                  if (editable) event.stopPropagation();
                }}
                onBlur={(event) => {
                  if (editable) commitCell(row, col, readText(event.currentTarget));
                }}
                style={{
                  border: `${Math.max(1, object.strokeWidth)}px solid ${object.color}`,
                  padding: "4px 8px",
                  fontSize: object.fontSize,
                  fontFamily: "system-ui, sans-serif",
                  fontWeight: object.headerRow && row === 0 ? 700 : 400,
                  color: object.color,
                  verticalAlign: "top",
                  outline: "none",
                  overflowWrap: "break-word",
                  cursor: editable ? "text" : "inherit",
                }}
              >
                {object.cellText?.[row]?.[col] ?? ""}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Set right before a text box starts editing and read once by it: the tap
// point the caret goes to. Module-level because that box may sit in the other
// layer instance (above or below the ink) than the one that started the edit.
let pendingCaret = null;

// Aligning a whole box overrides the per-paragraph alignment typed in earlier
// (inline text-align), or those paragraphs would keep their own and the
// change would seem to do nothing.
function alignWholeBox(object, textAlign) {
  if (!object?.html) return { textAlign };
  const html = sanitizeRichHtml(object.html);
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("[style]").forEach((node) => {
    node.style.removeProperty("text-align");
    if (!node.getAttribute("style")) node.removeAttribute("style");
  });
  return { textAlign, html: doc.body.innerHTML };
}

const contentOf = (field) => ({ text: readText(field), html: sanitizeRichHtml(field.innerHTML) });

// A text object: rich text (see richText.js) edited in place.
function TextContent({ object, editable, resizing = false, paperStyle, pageWidth = 800, pageHeight, onResize, onCommitText, onOverflow, onOpenLink }) {
  const fieldRef = useRef(null);
  const chemKeyboard = useChemKeyboardEnabled();
  const bounds = objectLayoutBounds(object);
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
  // A heading's glyphs sit at another height in its line box than body text
  // (bigger font, same line height), so it is nudged until its baseline is on
  // the same ruling as the lines around it. See richText.css.
  const bodyBaseline = baselineOffset(fontSize, lineHeight, object.fontFamily, object.bold);
  const headingShifts = Object.fromEntries(
    [["h1", 1.6, 2], ["h2", 1.25, 1], ["h3", 1.1, 1]].map(([tag, size, rows]) => {
      const own = baselineOffset(fontSize * size, lineHeight * rows, object.fontFamily, true);
      const target = bodyBaseline + Math.round((own - bodyBaseline) / lineHeight) * lineHeight;
      return [`--rt-${tag}-shift`, `${Math.round((target - own) * 100) / 100}px`];
    }),
  );
  // Snapped text still needs whole rows (plus the same baseline padding
  // snapTextToGrid adds — see above) so the box lands back on a rule once
  // this reaches the reducer; unsnapped text just takes the measured height.
  const fitHeight = (measured) =>
    snapped ? Math.max(1, Math.round((measured - paddingTop) / lineHeight)) * lineHeight + paddingTop : measured;

  // What React writes into the field. Frozen for the whole edit session, so
  // React never touches the field under the caret (or the browser's undo
  // stack), and a little longer: the blur that saves an edit can land after
  // the re-render that ends editing, and rewriting the field before it would
  // drop what was typed. The next saved change thaws it. Frozen means the
  // same object, not just the same string: React 19 rewrites innerHTML
  // whenever the dangerouslySetInnerHTML object changes.
  const contentKey = `${object.html}\u0000${object.text}`;
  const session = useRef(null);
  // Thawed before anything else: a box can get new content and start editing
  // again in the same render (text flowing in from the page before), and must
  // not carry on editing the old content then.
  if (session.current?.endedAt != null && session.current.endedAt !== contentKey) session.current = null;
  if (editable) {
    session.current ??= { inner: { __html: richHtmlOf(object) }, endedAt: null };
    session.current.endedAt = null;
  } else if (session.current?.endedAt === null) {
    session.current.endedAt = contentKey;
  }
  const viewInner = useMemo(() => (object.html ? { __html: sanitizeRichHtml(object.html) } : null), [object.html]);
  const inner = session.current ? session.current.inner : viewInner;

  // Entering edit mode opens the keyboard right where the box is: focus the
  // field and put the caret under the tap (see pendingCaret), on the marker a
  // continuation brought along (see markCaret), else at the end of the text.
  useEffect(() => {
    const field = fieldRef.current;
    if (!editable || !field) return;
    field.focus();
    const point = pendingCaret?.objectId === object.id ? pendingCaret.point : null;
    if (point) pendingCaret = null;
    if (!point || !placeCaretAtPoint(field, point.x, point.y)) placeCaret(field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);

  // A page-width box never runs past its page: what no longer fits above the
  // bottom margin is cut off and continues on the next page. onOverflow
  // decides whether it can take it and only then makes the cut, so a refusal
  // (no page left to add) leaves the field untouched. Runs after every saved
  // change: typing saves as the box grows, and text pushed in from the page
  // before lands here the same way.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!object.flow || object.rotation || !pageHeight || !onOverflow || !field) return;
    const room = pageHeight - FLOW_MARGIN - object.y;
    const height = fitHeight(measureTextBox(field, bounds.width, bounds.width).height);
    if (height <= room + 0.5) {
      // Text pushed in or cut away from outside still sizes the box.
      if (Math.abs(height - bounds.height) > 0.5) onResize?.(object.id, { height });
      return;
    }
    const rect = field.getBoundingClientRect();
    const scale = field.offsetHeight ? rect.height / field.offsetHeight : 1;
    const at = splitPointBelow(field, rect.top + room * scale);
    if (!at) return;
    onOverflow(object.id, () => {
      // A live range: the caret marker going in next shifts it along.
      const from = document.createRange();
      from.setStart(at.node, at.offset);
      const marker = editable ? markCaret(field) : null;
      const moved = sanitizeRichHtml(cutFrom(field, from));
      // Typing past the page bottom carries the caret over with the text.
      const caret = Boolean(marker) && !field.contains(marker);
      marker?.remove();
      const rest = { ...contentOf(field), height: fitHeight(measureTextBox(field, bounds.width, bounds.width).height) };
      return { rest, moved, caret };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, object.flow, object.y, object.width, object.fontSize, object.lineHeight, pageHeight, editable]);

  // The box hugs its content horizontally as you type — it only wraps (and
  // grows downward instead) once it would run past the page's right edge.
  // Enter also starts a new line outright. Either way the box needs to grow
  // to reveal it, one row at a time so a snapped box's new lines stay on the
  // ruling. Only fires (and only then saves the content, ahead of the usual
  // on-blur save) when the size actually changes, so most keystrokes cause
  // no re-render at all.
  const sizePatch = (field) => {
    const maxWidth = Math.max(MIN_TEXT_WIDTH, pageWidth - object.x - PAGE_EDGE_MARGIN);
    // A hand-pinned width (see autoWidth on the object) wraps inside itself —
    // that's the whole point of dragging a text box narrower — instead of
    // growing back out to fit whatever was just typed.
    const fixedWidth = object.autoWidth === false ? bounds.width : null;
    const { width, height } = measureTextBox(field, maxWidth, fixedWidth);
    const nextHeight = fitHeight(height);
    const patch = {};
    if (Math.abs(nextHeight - bounds.height) > 0.5) patch.height = nextHeight;
    if (!fixedWidth && Math.abs(width - bounds.width) > 0.5) patch.width = width;
    return Object.keys(patch).length > 0 ? patch : null;
  };

  const handleInput = (event) => {
    const field = event.currentTarget;
    const { inputType = "", data, isComposing } = event.nativeEvent;
    if (!isComposing && inputType.startsWith("insert") && /\s$/.test(data ?? "")) applyAutoformat(field);
    if (inputType === "insertParagraph") untickNewItem();
    const patch = sizePatch(field);
    if (patch) onResize?.(object.id, { ...patch, ...contentOf(field) });
  };

  // Like Canva, the box always hugs its text: a new width, font or style
  // re-measures it, so the frame (and with it the grab area) never shows
  // blank space or cuts text off. Not on mount — a stored box keeps its saved
  // size — and not while a handle drag owns the size. Page-width boxes size
  // themselves in the overflow effect above.
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const field = fieldRef.current;
    if (resizing || object.flow || !field) return;
    const patch = sizePatch(field);
    if (patch) onResize?.(object.id, patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing, object.width, object.autoWidth, fontSize, lineHeight, paddingTop, object.fontFamily, object.bold, object.italic]);

  const handleKeyDown = (event) => {
    const field = event.currentTarget;
    if (event.key === "Escape") {
      event.preventDefault();
      field.blur();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      runRichCommand(event.shiftKey ? "outdent" : "indent", field);
      return;
    }
    const command = shortcutCommand(event);
    if (!command) return;
    event.preventDefault();
    if (command === "link") promptLink(field);
    else runRichCommand(command, field);
  };

  // Web pages paste with their own colors, and black text vanishes on dark
  // paper: keep the structure, drop the colors.
  const handlePaste = (event) => {
    const pastedHtml = event.clipboardData?.getData("text/html");
    const pastedText = event.clipboardData?.getData("text/plain");
    if (!pastedHtml && !pastedText) return;
    event.preventDefault();
    if (pastedHtml) document.execCommand("insertHTML", false, sanitizeRichHtml(pastedHtml, { colors: false }));
    else document.execCommand("insertText", false, pastedText);
  };

  // Tapping a checklist box ticks it without moving the caret.
  const handlePointerDown = (event) => {
    const item = checkboxAt(event, event.currentTarget);
    if (!item) return;
    event.preventDefault();
    toggleCheckbox(item);
  };

  const handleBlur = (event) => {
    if (!session.current) return;
    const field = event.currentTarget;
    // The window losing focus (a native prompt, switching apps) blurs the
    // field too while it stays the active element: save, but keep editing.
    onCommitText(object.id, contentOf(field), document.activeElement !== field);
  };

  // A link in the text never navigates the app away: on the page it opens in
  // the side browser, while editing a tap only places the caret.
  const handleClick = (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    event.preventDefault();
    if (!editable) onOpenLink?.(link.getAttribute("href"));
  };

  return (
    <div
      ref={fieldRef}
      className="rich-text"
      contentEditable={editable}
      inputMode={chemKeyboard ? "none" : undefined}
      suppressContentEditableWarning
      onInput={editable ? handleInput : undefined}
      onKeyDown={editable ? handleKeyDown : undefined}
      onPaste={editable ? handlePaste : undefined}
      onPointerDown={editable ? handlePointerDown : undefined}
      onBlur={handleBlur}
      onClick={handleClick}
      style={{
        "--rt-line": `${lineHeight}px`,
        ...headingShifts,
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
        // pre-wrap alone only wraps at spaces — a box dragged narrower than
        // one word (or one big enough font) needs this to break mid-word
        // instead of just overflowing past the edge.
        overflowWrap: "break-word",
        outline: "none",
        // Hidden only mid-edit, where handleInput is about to grow the box to
        // match — a finished box stays visible so a stale height estimate
        // (insert_table/write_text) never crops real text at the bottom.
        overflow: editable ? "hidden" : "visible",
        cursor: editable ? "text" : "inherit",
      }}
      {...(inner
        ? { dangerouslySetInnerHTML: inner }
        : { children: object.aiGenerated ? renderAiText(object.text) : object.text })}
    />
  );
}

function ObjectContent({ object, editable, resizing = false, onCommitText, onResize, paperStyle, pageWidth = 800, pageHeight, onOverflow, onOpenLink, isProcessing = false, focusCell = null, onExitEdit }) {
  const bounds = objectLayoutBounds(object);
  const dashArray = dashArrayFor(object.strokeStyle);
  const opacity = (object.opacity ?? 100) / 100;

  if (object.type === "arrow" || object.type === "line") {
    // Signed extents decide which corner the line runs from, so an arrow drawn
    // leftwards keeps its head at the end the user dragged to. Measured from
    // bounds directly (not a width-sign shortcut) because a curved arrow's
    // layout box isn't the straight chord — see objectLayoutBounds.
    const pad = object.strokeWidth * 4 + 12;
    const x1 = object.x - bounds.x;
    const y1 = object.y - bounds.y;
    const x2 = object.x + object.width - bounds.x;
    const y2 = object.y + object.height - bounds.y;
    // Each arrowhead points along this end's actual tangent, not the
    // straight start-to-end direction — a curved/elbow path approaches its
    // endpoints from a different angle than a straight line would.
    let endAngle = Math.atan2(y2 - y1, x2 - x1);
    let startAngle = endAngle + Math.PI;
    if (object.arrowType === "curved") {
      const { x: cx, y: cy } = curveControlPoint(x1, y1, x2, y2, object.bow, object.curveBend);
      endAngle = Math.atan2(y2 - cy, x2 - cx);
      startAngle = Math.atan2(y1 - cy, x1 - cx);
    } else if (object.arrowType === "elbow") {
      const midX = elbowBendX(x1, x2, object.elbowBend);
      endAngle = Math.atan2(0, x2 - midX);
      startAngle = Math.atan2(0, x1 - midX);
    }
    const linePaths =
      object.arrowType === "curved"
        ? roughCurvePaths(object, x1, y1, x2, y2)
        : object.arrowType === "elbow"
          ? roughElbowPaths(object, x1, y1, x2, y2)
          : roughLinePaths(object, x1, y1, x2, y2);
    const headPaths = [];
    if (object.endArrowhead === "arrow")
      headPaths.push(...roughArrowheadPaths(object, x2, y2, endAngle));
    if (object.startArrowhead === "arrow")
      headPaths.push(...roughArrowheadPaths(object, x1, y1, startAngle));
    return (
      <svg
        width={bounds.width + pad * 2}
        height={bounds.height + pad * 2}
        viewBox={`${-pad} ${-pad} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`}
        style={{ position: "absolute", left: -pad, top: -pad, overflow: "visible", opacity }}
      >
        {linePaths.map((p, i) => (
          <path key={`l${i}`} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill="none" strokeLinecap="round" strokeDasharray={dashArray} />
        ))}
        {headPaths.map((p, i) => (
          <path key={`h${i}`} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill="none" strokeLinecap="round" />
        ))}
      </svg>
    );
  }

  if (object.type === "rect" || object.type === "ellipse") {
    const paths =
      object.type === "rect"
        ? roughRectPaths(object, bounds.width, bounds.height)
        : roughEllipsePaths(object, bounds.width, bounds.height);
    return (
      <svg width="100%" height="100%" style={{ overflow: "visible", opacity }}>
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            stroke={p.stroke}
            strokeWidth={p.strokeWidth}
            fill={p.fill || "none"}
            fillRule={p.fillRule}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={p.fill ? undefined : dashArray}
          />
        ))}
      </svg>
    );
  }

  if (object.type === "image" || object.type === "fill") {
    const crop = object.type === "image" ? object.crop : null;
    const image = (
      <img
        src={object.src}
        alt={object.text || "Bild"}
        draggable={false}
        onLoad={(event) =>
          rememberNaturalSize(object.src, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
        }
        style={
          crop
            ? {
                // The whole source, sized and offset so only the crop window
                // falls inside the (clipping) box.
                position: "absolute",
                width: `${100 / crop.width}%`,
                height: `${100 / crop.height}%`,
                left: `${(-crop.x / crop.width) * 100}%`,
                top: `${(-crop.y / crop.height) * 100}%`,
                pointerEvents: "none",
                opacity: isProcessing ? 0.5 : 1,
                transition: "opacity 0.25s ease",
              }
            : {
                width: "100%",
                height: "100%",
                objectFit: "contain",
                pointerEvents: "none",
                opacity: isProcessing ? 0.5 : 1,
                transition: "opacity 0.25s ease",
              }
        }
      />
    );
    return crop ? (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>{image}</div>
    ) : (
      image
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

  if (object.type === "table") {
    return (
      <TableContent
        object={object}
        editable={editable}
        onResize={onResize}
        focusCell={focusCell}
        onExitEdit={onExitEdit}
      />
    );
  }

  return (
    <TextContent
      object={object}
      editable={editable}
      resizing={resizing}
      paperStyle={paperStyle}
      pageWidth={pageWidth}
      pageHeight={pageHeight}
      onResize={onResize}
      onCommitText={onCommitText}
      onOverflow={onOverflow}
      onOpenLink={onOpenLink}
    />
  );
}

// Chrome-sized in screen pixels, not object units: when the wrapper scales the
// whole layer, everything in it scales too, which would leave grab handles
// 1px wide zoomed out and huge zoomed in. Undoing the scale around their own
// centre keeps them put and keeps them grabbable at any zoom.
function counterScale(containerScale, transformOrigin = "center") {
  if (containerScale === 1) return null;
  return { transform: `scale(${1 / containerScale})`, transformOrigin };
}

function Handle({ position, onPointerDown, containerScale = 1, cursor = "nwse-resize", testId }) {
  return (
    <div
      data-testid={testId}
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: position.left - HANDLE_HIT / 2,
        top: position.top - HANDLE_HIT / 2,
        width: HANDLE_HIT,
        height: HANDLE_HIT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor,
        touchAction: "none",
        ...counterScale(containerScale),
      }}
    >
      <div
        style={{
          width: HANDLE,
          height: HANDLE,
          borderRadius: "50%",
          background: "#fff",
          border: "2px solid #3E7BD8",
        }}
      />
    </div>
  );
}

// Canva-style side handle: a pill on the middle of an edge. Dragging it crops
// an image or sets a text box's width.
function EdgeHandle({ edge, bounds, zoom, onPointerDown, containerScale = 1, testId = `crop-edge-${edge}` }) {
  const vertical = edge === "e" || edge === "w";
  const long = 30;
  const short = 10;
  const cx = edge === "w" ? 0 : edge === "e" ? bounds.width * zoom : (bounds.width * zoom) / 2;
  const cy = edge === "n" ? 0 : edge === "s" ? bounds.height * zoom : (bounds.height * zoom) / 2;
  return (
    <div
      data-testid={testId}
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: cx - HANDLE_HIT / 2,
        top: cy - HANDLE_HIT / 2,
        width: HANDLE_HIT,
        height: HANDLE_HIT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: vertical ? "ew-resize" : "ns-resize",
        touchAction: "none",
        ...counterScale(containerScale),
      }}
    >
      <div
        style={{
          width: vertical ? short : long,
          height: vertical ? long : short,
          borderRadius: 5,
          background: "#fff",
          border: "2px solid #3E7BD8",
          boxShadow: "0 0 0 1.5px rgba(0,0,0,0.35)",
        }}
      />
    </div>
  );
}

function RotateHandle({ position, onPointerDown, containerScale = 1, gap = 0 }) {
  return (
    <div
      data-testid="rotate-handle"
      onPointerDown={onPointerDown}
      style={{
        position: "absolute",
        left: position.left - HANDLE_HIT / 2,
        top: position.top - HANDLE_HIT - gap,
        width: HANDLE_HIT,
        height: HANDLE_HIT,
        transform:
          containerScale === 1
            ? "translateX(-50%)"
            : `translateX(-50%) scale(${1 / containerScale})`,
        transformOrigin: "50% 100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
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

// Sits above a selected text box like a zoom-percent readout — click it to
// type an exact size instead of eyeballing a resize drag.
function FontSizeBadge({ fontSize, containerScale = 1, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(fontSize));
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setValue(String(fontSize));
  }, [fontSize, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = Math.max(6, Math.round(Number(value)));
    if (Number.isFinite(next) && next !== fontSize) onCommit(next);
  };

  return (
    <div
      data-testid="text-font-size-badge"
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: "50%",
        top: -84,
        transform:
          containerScale === 1 ? "translateX(-50%)" : `translateX(-50%) scale(${1 / containerScale})`,
        transformOrigin: "50% 100%",
        zIndex: 1000,
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min={6}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setEditing(false);
              setValue(String(fontSize));
            }
          }}
          style={{
            width: 48,
            textAlign: "center",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(20,20,24,0.92)",
            color: "#EFECE4",
            padding: "3px 0",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Schriftgröße"
          style={{
            display: "block",
            padding: "3px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(20,20,24,0.92)",
            color: "#EFECE4",
            fontSize: 12,
            fontWeight: 600,
            cursor: "text",
            whiteSpace: "nowrap",
          }}
        >
          {fontSize}px
        </button>
      )}
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

const PageObjectLayer = forwardRef(function PageObjectLayer({
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
  onToggleLock,
  onShiftOrder,
  onOpenLayers,
  mapOrigin = (layout, pageId) => pagePointToViewport(layout, pageId, { x: 0, y: 0 }),
  // DocumentView's page ancestor toggles touch-action between "none" and
  // "auto" by mode, so each object needs its own "none" to stay draggable
  // regardless of that. The whiteboard surface is unconditionally "none"
  // already, so there each per-object region is pure duplication — one
  // touch-action region per object instead of one for the whole surface,
  // which is exactly the kind of thing Chromium has to re-resolve against
  // every touch point. Off by default to leave DocumentView's behavior
  // untouched; WhiteboardEditor passes false.
  perObjectTouchAction = true,
  // The part of every object's screen position that is identical for all of
  // them, hoisted onto a single wrapper transform. Only valid when all objects
  // share an origin — true for the whiteboard's one infinite surface, not for
  // DocumentView, where each page sits at its own offset. Omitted there, which
  // leaves positioning exactly as it was.
  containerOffset = null,
  // Same idea for scale: with this set, objects lay out at their unscaled size
  // and the wrapper scales them, so zooming — like panning — never rewrites a
  // single child style. The caller then passes pageLayout.zoom as 1, since the
  // zoom lives here instead.
  containerScale = 1,
  // DocumentView's outer scroll container arms two-finger pan/zoom from
  // touch pointerdowns that bubble up to it — but every object stops that
  // bubbling once it recognizes a hit, so a gesture whose finger lands on an
  // object (near-certain on a page full of text blocks) never gets counted.
  // Called directly so the object can still register the touch for gesture
  // purposes while keeping its own hit-test/stopPropagation behavior.
  onGestureStart,
  // True while space is held (see DocumentView / WhiteboardEditor).
  panMode = false,
  // True while the pen is writing/erasing (not move, lasso or a placing tool).
  penDrawsThrough = false,
  // Wider than penDrawsThrough: the text, lasso and fill tools must reach
  // the canvas through a locked object too, not just writing.
  lockedPassesThrough = penDrawsThrough,
  // The text tool is armed: a tap on a text box types into it, caret under
  // the finger, instead of selecting it.
  textToolArmed = false,
  // A page-width text box ran past its page (see TextContent). Gets the box
  // id and a cut() to call once there is somewhere for the overflow to go;
  // returns { id, caret }: the box that took it, and whether the caret went
  // along.
  onTextOverflow,
}, forwardedRef) {
  const [layersMenuOpen, setLayersMenuOpen] = useState(false);
  const [croppingId, setCroppingId] = useState(null);
  // Which table cell a double-click should drop the caret into once edit mode
  // turns on — read once by TableContent's own focus effect, not reactive
  // state, since it only ever matters for the instant editable flips true.
  const pendingTableFocus = useRef(null);
  const drag = useDrag(onChange);
  const tapSelect = useTapSelect(onSelect);
  const zoom = pageLayout?.zoom || 1;
  // How many screen pixels one object unit spans, wherever the scaling happens
  // — in the children (`zoom`) or on the wrapper (`containerScale`). Anything
  // converting a pointer position into object space has to use this, not zoom.
  const pointerScale = zoom * containerScale;
  const containerRef = useRef(null);

  useEffect(() => {
    setLayersMenuOpen(false);
  }, [selectedId]);

  // Same live-preview trick as WhiteboardCanvas: a pinch/pan gesture moves this
  // whole layer with one cheap CSS transform instead of waiting for `camera`
  // state to commit and re-laying-out every object div. Without this, ink
  // strokes pan smoothly while text/table/callout content — everything an
  // AI-built note is actually made of — sits frozen until the gesture ends.
  useImperativeHandle(forwardedRef, () => ({
    setViewportPreview(translateX, translateY, scale) {
      const node = containerRef.current;
      if (!node) return;
      node.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    },
    clearViewportPreview() {
      const node = containerRef.current;
      if (!node) return;
      node.style.transform = "";
    },
    cancelDrag() {
      drag.cancel();
    },
  }), []);

  if (objects.length === 0) return null;
  const toolbarTextId = objects.find(
    (object) => object.type === "text" && (object.id === editingId || object.id === selectedId),
  )?.id;

  return (
    <div
      ref={containerRef}
      data-testid="page-object-layer"
      // Camera layers: the glass background shifts its capture by these
      // transforms instead of re-capturing the page on every pan/zoom.
      data-glass-viewport="outer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        // Kept on permanently rather than toggled per gesture — see the same
        // comment in WhiteboardCanvas.jsx. This layer holds every text/table/
        // callout div on the page, so re-promoting it from scratch at the
        // start of every pinch/pan is the actual freeze users were seeing.
        transformOrigin: "0 0",
        willChange: "transform",
      }}
      onPointerMove={drag.move}
      onPointerUp={drag.end}
      onPointerCancel={drag.end}
    >
      {toolbarTextId && <RichTextToolbar objectId={toolbarTextId} onEdit={onEditingChange} onAlign={(id, textAlign) => onChange?.(id, alignWholeBox(objects.find((o) => o.id === id), textAlign))} />}
      <div
        data-glass-viewport="inner"
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "0 0",
          // Pan and zoom both move this one transform instead of rewriting
          // left/top/width/height on every child. Both produce the same
          // picture, but changing children dirties the promoted layer's
          // contents, so the GPU has to re-raster the whole thing — every
          // glyph on screen — before the next frame. Moving and scaling the
          // layer itself is compositor-only work.
          ...(containerOffset || containerScale !== 1
            ? {
                transform:
                  `translate(${containerOffset?.x ?? 0}px, ${containerOffset?.y ?? 0}px)` +
                  ` scale(${containerScale})`,
              }
            : null),
        }}
      >
      {objects.map((stored) => {
        if (stored.hidden === true) return null;
        const object = drag.draft?.id === stored.id ? drag.draft : stored;
        const mapped = mapOrigin(pageLayout, object.pageId);
        if (!mapped) return null;
        // With the offset lifted onto the wrapper above, children position
        // relative to it — otherwise it would be applied twice.
        const origin = containerOffset
          ? { x: mapped.x - containerOffset.x, y: mapped.y - containerOffset.y }
          : mapped;
        const bounds = objectLayoutBounds(object);
        // While cropping, the crop frame replaces the selection frame; it
        // comes back when the crop ends (confirmed, cancelled or clicked away).
        const isSelected = selectedId === object.id && croppingId !== object.id;

        return (
          <div
            key={object.id}
            data-testid="object-container"
            data-object-id={object.id}
            data-object-type={object.type}
            onPointerDown={(event) => {
              // Right-click is the whiteboard's marquee gesture now — let it
              // pass through untouched instead of selecting/dragging.
              if (event.pointerType === "mouse" && event.button !== 0) return;
              // Space held: the drag pans the view, wherever it starts — an
              // object under the cursor must not take it as a select/move.
              if (panMode) return;
              // A locked object is paper: whatever draws writes on it, and only
              // unlocking (layers drawer, or the lock button in move mode) lets it be grabbed.
              if (lockedPassesThrough && object.locked) return;
              // A pen-down on an unselected object starts ink, not a select:
              // otherwise every text/table/image box is a dead zone for writing.
              // Select it with a finger/mouse; a selected or editing one keeps the pen.
              if (
                penDrawsThrough &&
                event.pointerType === "pen" &&
                !isSelected &&
                editingId !== object.id
              )
                return;
              // The page's two-finger pan/zoom is armed from touches that
              // bubble up to the scroll container — but a hit here is about
              // to stopPropagation below, and on a page full of text blocks
              // almost every finger lands on an object. Register it with the
              // gesture tracker directly so it still counts even though it
              // never bubbles.
              if (event.pointerType === "touch") onGestureStart?.(event);
              // A second finger landing on an object mid-gesture is a pinch/pan
              // point, not a tap on that object — isPrimary is false for every
              // touch after the first, so this is exactly the signal. Skip the
              // hit test and stopPropagation and let it bubble to the page's
              // gesture handler instead, or a dense page would swallow every
              // two-finger gesture whose second contact happens to land on an
              // element.
              if (event.pointerType === "touch" && !event.isPrimary) return;
              if (croppingId === object.id) return;
              if (object.type === "link" && !isSelected && editingId !== object.id && onOpenLink) {
                event.stopPropagation();
                onOpenLink(object.href);
                return;
              }
              // An empty rect/ellipse only grabs the pointer near its outline —
              // missing that band lets the click fall through to the canvas
              // underneath instead of stopping propagation.
              // Measured from the center: a rotated wrapper's client rect is its
              // axis-aligned hull, so only the center still maps onto bounds.
              const rect = event.currentTarget.getBoundingClientRect();
              const localX =
                bounds.x + bounds.width / 2 + (event.clientX - (rect.left + rect.width / 2)) / pointerScale;
              const localY =
                bounds.y + bounds.height / 2 + (event.clientY - (rect.top + rect.height / 2)) / pointerScale;
              // Text grabs its whole box plus the margin around it (see the
              // hit pad below), so it skips the exact-bounds test.
              if (object.type !== "text" && !hitTestObject(object, localX, localY)) return;
              // Past this point the click is a genuine hit, not a fallthrough
              // — stop it here so the canvas underneath (ink draw, marquee
              // select) never also reacts to the same press.
              event.stopPropagation();
              if (object.type === "text" && !object.locked && editingId !== object.id) {
                // The text tool types where it taps, like a word processor.
                if (textToolArmed) {
                  pendingCaret = { objectId: object.id, point: { x: event.clientX, y: event.clientY } };
                  onSelect?.(object.id);
                  onEditingChange?.(object.id);
                  return;
                }
                // A checklist box ticks right on the page, no edit mode needed.
                const item = checkboxAt(event, event.currentTarget);
                if (item) {
                  const field = item.closest(".rich-text");
                  toggleCheckbox(item);
                  onChange?.(object.id, contentOf(field));
                  return;
                }
              }
              // A ctrl/cmd-held click always goes through tapSelect to toggle
              // group membership, even on an already-selected object — plain
              // clicks alone start a move drag.
              const additive = event.ctrlKey || event.metaKey;
              if (isSelected && !additive) {
                if (!object.locked && editingId !== object.id) drag.start(event, object, "move", pointerScale);
              } else {
                tapSelect(event, object.id);
              }
            }}
            onDoubleClick={(event) => {
              if (object.type === "table") {
                // Which cell the click actually landed on, so edit mode drops
                // the caret there instead of always the first cell.
                const rect = event.currentTarget.getBoundingClientRect();
                const localX = (event.clientX - rect.left) / pointerScale;
                const localY = (event.clientY - rect.top) / pointerScale;
                const col = Math.min(
                  object.cols - 1,
                  Math.max(0, Math.floor((localX / bounds.width) * object.cols)),
                );
                const row = Math.min(
                  object.rows - 1,
                  Math.max(0, Math.floor((localY / bounds.height) * object.rows)),
                );
                pendingTableFocus.current = { objectId: object.id, row, col };
                onEditingChange?.(object.id);
              } else if (object.type === "text") {
                pendingCaret = { objectId: object.id, point: { x: event.clientX, y: event.clientY } };
                onEditingChange?.(object.id);
              } else if (object.type === "image") {
                setCroppingId(object.id);
              }
            }}
            style={{
              position: "absolute",
              left: origin.x + bounds.x * zoom,
              top: origin.y + bounds.y * zoom,
              width: bounds.width * zoom,
              height: bounds.height * zoom,
              pointerEvents: "auto",
              ...(perObjectTouchAction ? { touchAction: "none" } : null),
              cursor: object.locked ? "default" : "move",
              transform: `rotate(${object.rotation || 0}deg)`,
              transformOrigin: "50% 50%",
              outline: isSelected ? "1.5px solid #3E7BD8" : "none",
              outlineOffset: 3,
              zIndex: isSelected || croppingId === object.id ? 20 : 1,
            }}
          >
            {/* A short word is a tiny target for a finger: like in Canva, the
                text box is grabbable a little past its edges too. */}
            {object.type === "text" && (
              <div
                aria-hidden
                style={{ position: "absolute", inset: -TEXT_HIT_PAD / containerScale }}
              />
            )}
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
                pageHeight={pageLayout?.pageLayouts?.find((page) => page.id === object.pageId)?.height}
                editable={editingId === object.id}
                resizing={object === drag.draft}
                isProcessing={processingObjectId === object.id}
                focusCell={
                  pendingTableFocus.current?.objectId === object.id ? pendingTableFocus.current : null
                }
                onOpenLink={onOpenLink}
                onOverflow={
                  onTextOverflow &&
                  ((id, cut) => {
                    // The typing moved on to the next page: so does the edit.
                    const next = onTextOverflow(id, cut);
                    if (!next?.caret) return;
                    onSelect?.(next.id);
                    onEditingChange?.(next.id);
                  })
                }
                onCommitText={(id, content, leaving) => {
                  // A box that lost editing to another (its continuation)
                  // only saves; the edit itself carries on over there.
                  if (leaving && editingId === id) onEditingChange?.(null);
                  // An empty text box has nothing to show and nothing to
                  // select later — leaving it would just be an invisible
                  // click trap sitting on the page forever.
                  if (leaving && !content.text.trim()) onDelete?.(id);
                  else onChange?.(id, content);
                }}
                onExitEdit={() => onEditingChange?.(null)}
              />
            </div>

            {object.locked && (
              <button
                type="button"
                data-testid="lock-badge-btn"
                title="Objekt entsperren"
                aria-label="Objekt entsperren"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock?.("object", object.id, false);
                }}
                style={{
                  position: "absolute",
                  top: -10,
                  right: -10,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#f59e0b",
                  border: "2px solid #ffffff",
                  color: "#0f172a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  zIndex: 30,
                  boxShadow: "0 2px 5px rgba(0,0,0,0.4)",
                  padding: 0,
                  ...counterScale(containerScale),
                }}
              >
                <Lock size={12} strokeWidth={2.5} />
              </button>
            )}

            {croppingId === object.id && (
              <ImageCropOverlay
                object={object}
                boxWidth={bounds.width}
                boxHeight={bounds.height}
                zoom={zoom}
                pointerScale={pointerScale}
                onConfirm={(patch) => {
                  onChange?.(object.id, patch);
                  setCroppingId(null);
                }}
                onCancel={() => setCroppingId(null)}
              />
            )}

            {isSelected && (
              <>
                {/* Resize & rotate handles only visible when not locked */}
                {!object.locked && (
                  <>
                    {(object.type === "arrow" || object.type === "line") && (
                      <Handle
                        position={{
                          left: (object.x - bounds.x) * zoom,
                          top: (object.y - bounds.y) * zoom,
                        }}
                        onPointerDown={(event) => drag.start(event, object, "start", pointerScale)}
                        containerScale={containerScale}
                      />
                    )}
                    {object.type !== "text" && (
                      <Handle
                        position={{
                          left: (object.x + object.width - bounds.x) * zoom,
                          top: (object.y + object.height - bounds.y) * zoom,
                        }}
                        onPointerDown={(event) => drag.start(event, object, "end", pointerScale)}
                        containerScale={containerScale}
                      />
                    )}
                    {/* Text sizes like in Canva: corners scale it, sides set
                        its width. A page-width box takes its width from the
                        page, so it has neither. Sides go last: on a one-line
                        box their grab area wins over the corners'. */}
                    {object.type === "text" && !object.flow && (
                      <>
                        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => (
                          <Handle
                            key={`${sx}${sy}`}
                            testId="text-corner-handle"
                            cursor={sx === sy ? "nwse-resize" : "nesw-resize"}
                            position={{ left: sx < 0 ? 0 : bounds.width * zoom, top: sy < 0 ? 0 : bounds.height * zoom }}
                            onPointerDown={(event) => {
                              const field = textFieldOf(event);
                              // Text on the ruling takes its size from the
                              // lines; scaling it frees it, from the size it
                              // shows right now.
                              const from =
                                object.snapToLines && field
                                  ? {
                                      ...object,
                                      snapToLines: false,
                                      fontSize: parseFloat(field.style.fontSize),
                                      lineHeight: parseFloat(field.style.lineHeight),
                                    }
                                  : object;
                              drag.start(event, from, "scale", pointerScale, null, { sx, sy, field });
                            }}
                            containerScale={containerScale}
                          />
                        ))}
                        {[-1, 1].map((sx) => (
                          <EdgeHandle
                            key={sx}
                            edge={sx < 0 ? "w" : "e"}
                            testId={`text-edge-${sx < 0 ? "w" : "e"}`}
                            bounds={bounds}
                            zoom={zoom}
                            containerScale={containerScale}
                            onPointerDown={(event) =>
                              drag.start(event, object, "side", pointerScale, null, { sx, field: textFieldOf(event) })
                            }
                          />
                        ))}
                      </>
                    )}
                    {object.type === "image" && !object.rotation && object.width > 0 && object.height > 0 &&
                      ["n", "e", "s", "w"].map((edge) => (
                        <EdgeHandle
                          key={edge}
                          edge={edge}
                          bounds={bounds}
                          zoom={zoom}
                          containerScale={containerScale}
                          onPointerDown={(event) =>
                            drag.start(event, object, "crop", pointerScale, null, {
                              edge,
                              natural: naturalSizeOf(object.src),
                            })
                          }
                        />
                      ))}
                    <RotateHandle
                      position={{
                        left: (bounds.width * zoom) / 2,
                        top: 0,
                      }}
                      onPointerDown={(event) => {
                        const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                        const cx = rect ? rect.left + rect.width / 2 : event.clientX;
                        const cy = rect ? rect.top + rect.height / 2 : event.clientY;
                        drag.start(event, object, "rotate", pointerScale, { x: cx, y: cy });
                      }}
                      containerScale={containerScale}
                      // A line/arrow can run right along the top edge of its own
                      // bounding box (either endpoint may sit at local y=0), so
                      // the rotate handle's hit zone needs real clearance there
                      // — otherwise a click meant for the line grabs the handle
                      // instead, since rect/ellipse's default zero-gap placement
                      // only works because their own hit area never reaches y=0.
                      // A curved arrow's peak can bow further still (up to 40px,
                      // see curveControlPoint), so when it bows upward past y=0
                      // the base 22px isn't enough clearance — extend the gap to
                      // clear the actual peak for this object.
                      gap={
                        object.type === "arrow" || object.type === "line"
                          ? (() => {
                              if (object.arrowType !== "curved") return 22;
                              const x1 = object.x - bounds.x;
                              const y1 = object.y - bounds.y;
                              const x2 = object.x + object.width - bounds.x;
                              const y2 = object.y + object.height - bounds.y;
                              const { y: cy } = curveControlPoint(x1, y1, x2, y2, object.bow, object.curveBend);
                              return cy < 0 ? 22 - cy : 22;
                            })()
                          : 0
                      }
                    />
                    {object.arrowType === "curved" && (
                      <Handle
                        position={(() => {
                          const x1 = object.x - bounds.x;
                          const y1 = object.y - bounds.y;
                          const x2 = object.x + object.width - bounds.x;
                          const y2 = object.y + object.height - bounds.y;
                          const { x: cx, y: cy } = curveControlPoint(x1, y1, x2, y2, object.bow, object.curveBend);
                          return { left: cx * zoom, top: cy * zoom };
                        })()}
                        onPointerDown={(event) => drag.start(event, object, "bow", pointerScale)}
                        containerScale={containerScale}
                      />
                    )}
                    {object.arrowType === "elbow" && (
                      <Handle
                        position={(() => {
                          const x1 = object.x - bounds.x;
                          const y1 = object.y - bounds.y;
                          const x2 = object.x + object.width - bounds.x;
                          const y2 = object.y + object.height - bounds.y;
                          const midX = elbowBendX(x1, x2, object.elbowBend);
                          return { left: midX * zoom, top: ((y1 + y2) / 2) * zoom };
                        })()}
                        onPointerDown={(event) => drag.start(event, object, "elbow", pointerScale)}
                        containerScale={containerScale}
                      />
                    )}
                  </>
                )}

                {object.type === "text" && !object.locked && (
                  <FontSizeBadge
                    fontSize={object.fontSize}
                    containerScale={containerScale}
                    onCommit={(nextFontSize) => {
                      const scale = nextFontSize / object.fontSize;
                      const patch = { fontSize: nextFontSize };
                      if (object.lineHeight > 0) patch.lineHeight = Math.round(object.lineHeight * scale);
                      onChange?.(object.id, patch);
                    }}
                  />
                )}

                {object.type === "table" && !object.locked && (
                  <>
                    {/* Column controls: centered on the right edge, like Google
                        Docs' hover affordance for adding/removing a column. */}
                    <div
                      style={{
                        position: "absolute",
                        left: bounds.width * zoom + 8,
                        top: (bounds.height * zoom) / 2,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        padding: 3,
                        borderRadius: 8,
                        background: "rgba(20,20,24,0.92)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        transform: "translateY(-50%)",
                        ...counterScale(containerScale, "0 50%"),
                        zIndex: 1000,
                      }}
                    >
                      <IconButton
                        label="Spalte hinzufügen"
                        onClick={() => {
                          const colWidth = object.width / object.cols;
                          onChange?.(object.id, {
                            cols: object.cols + 1,
                            width: object.width + colWidth,
                            cellText: object.cellText.map((row) => [...row, ""]),
                          });
                        }}
                      >
                        <Plus size={14} />
                      </IconButton>
                      <IconButton
                        label="Spalte entfernen"
                        disabled={object.cols <= 1}
                        onClick={() => {
                          if (object.cols <= 1) return;
                          const colWidth = object.width / object.cols;
                          onChange?.(object.id, {
                            cols: object.cols - 1,
                            width: object.width - colWidth,
                            cellText: object.cellText.map((row) => row.slice(0, -1)),
                          });
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>

                    {/* Row controls: centered under the bottom edge. */}
                    <div
                      style={{
                        position: "absolute",
                        left: (bounds.width * zoom) / 2,
                        top: bounds.height * zoom + 8,
                        display: "flex",
                        gap: 2,
                        padding: 3,
                        borderRadius: 8,
                        background: "rgba(20,20,24,0.92)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        transform: "translateX(-50%)",
                        ...counterScale(containerScale, "50% 0"),
                        zIndex: 1000,
                      }}
                    >
                      <IconButton
                        label="Zeile hinzufügen"
                        onClick={() => {
                          const rowHeight = object.height / object.rows;
                          onChange?.(object.id, {
                            rows: object.rows + 1,
                            height: object.height + rowHeight,
                            cellText: [...object.cellText, new Array(object.cols).fill("")],
                          });
                        }}
                      >
                        <Plus size={14} />
                      </IconButton>
                      <IconButton
                        label="Zeile entfernen"
                        disabled={object.rows <= 1}
                        onClick={() => {
                          if (object.rows <= 1) return;
                          const rowHeight = object.height / object.rows;
                          onChange?.(object.id, {
                            rows: object.rows - 1,
                            height: object.height - rowHeight,
                            cellText: object.cellText.slice(0, -1),
                          });
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  </>
                )}

                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: -44,
                    display: "flex",
                    gap: 2,
                    padding: 3,
                    borderRadius: 8,
                    background: "rgba(20,20,24,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    // Anchored at its bottom-left so it stays tucked against
                    // the object's top edge as it scales back to screen size.
                    ...counterScale(containerScale, "0 100%"),
                    zIndex: 1000,
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

                  <IconButton
                    label={object.locked ? "Objekt entsperren" : "Objekt sperren"}
                    onClick={() => onToggleLock?.("object", object.id, !object.locked)}
                  >
                    {object.locked ? (
                      <Lock size={14} style={{ color: "#f59e0b" }} />
                    ) : (
                      <Unlock size={14} />
                    )}
                  </IconButton>

                  <div style={{ position: "relative" }}>
                    <IconButton
                      label="Ebene anordnen"
                      onClick={() => setLayersMenuOpen((prev) => !prev)}
                    >
                      <Layers size={14} />
                    </IconButton>
                    {layersMenuOpen && (
                      <div
                        className="layer-quick-menu"
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          marginTop: 6,
                          background: "rgba(24, 24, 29, 0.96)",
                          backdropFilter: "blur(20px)",
                          WebkitBackdropFilter: "blur(20px)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          borderRadius: 8,
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.65)",
                          padding: 4,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          minWidth: 175,
                          zIndex: 100,
                          userSelect: "none",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="layer-menu-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                          }}
                          onClick={() => {
                            setLayersMenuOpen(false);
                            onShiftOrder?.(object.id, "front");
                          }}
                        >
                          <ArrowUpToLine size={14} />
                          <span>Ganz nach vorne</span>
                        </button>
                        <button
                          type="button"
                          className="layer-menu-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                          }}
                          onClick={() => {
                            setLayersMenuOpen(false);
                            onShiftOrder?.(object.id, "forward");
                          }}
                        >
                          <ChevronUp size={14} />
                          <span>Eine Ebene nach vorne</span>
                        </button>
                        <button
                          type="button"
                          className="layer-menu-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                          }}
                          onClick={() => {
                            setLayersMenuOpen(false);
                            onShiftOrder?.(object.id, "backward");
                          }}
                        >
                          <ChevronDown size={14} />
                          <span>Eine Ebene nach hinten</span>
                        </button>
                        <button
                          type="button"
                          className="layer-menu-item"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            background: "none",
                            border: "none",
                            color: "#e2e8f0",
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: "pointer",
                            textAlign: "left",
                            width: "100%",
                          }}
                          onClick={() => {
                            setLayersMenuOpen(false);
                            onShiftOrder?.(object.id, "back");
                          }}
                        >
                          <ArrowDownToLine size={14} />
                          <span>Ganz nach hinten</span>
                        </button>
                        {onOpenLayers && (
                          <>
                            <div
                              style={{
                                height: 1,
                                background: "rgba(255, 255, 255, 0.08)",
                                margin: "3px 2px",
                              }}
                            />
                            <button
                              type="button"
                              className="layer-menu-item"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "6px 10px",
                                background: "none",
                                border: "none",
                                color: "#38bdf8",
                                fontSize: 12,
                                fontWeight: 500,
                                borderRadius: 6,
                                cursor: "pointer",
                                textAlign: "left",
                                width: "100%",
                              }}
                              onClick={() => {
                                setLayersMenuOpen(false);
                                onOpenLayers();
                              }}
                            >
                              <Layers size={14} />
                              <span>Ebenen-Panel öffnen</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

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
    </div>
  );
});

export default PageObjectLayer;
