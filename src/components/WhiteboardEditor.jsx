// src/components/WhiteboardEditor.jsx
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Undo2, Redo2, PenLine, Eraser, Palette, X, Lasso, Shapes, PaintBucket } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import useInkPointer from "../hooks/useInkPointer.js";
import useWhiteboardCamera, { clampWhiteboardScale } from "../hooks/useWhiteboardCamera.js";
import { loadPalmProfile, palmGuardFromProfile } from "../ink/palmSettings.js";
import { screenToWorld, worldToScreen } from "../ink/whiteboardCoordinates.js";
import { strokesInLasso, objectsInLasso, selectionBounds } from "../ink/lasso.js";
import { createPageObject, objectBounds, pageObjectsOf, isPointInsideObject } from "../ink/pageObjects.js";
import { rasterizePageWalls, floodFill, fillResultToDataUrl, hexToRgb } from "../ink/bucketFill.js";
import { readImageObjectSource } from "../ink/imageObject.js";
import { tryRecognizeLink } from "../ink/linkRecognizer.js";
import { removeImageBackground } from "../ink/imageBackground.js";
import WhiteboardCanvas from "./document/WhiteboardCanvas.jsx";
import LassoSelectionLayer from "./document/LassoSelectionLayer.jsx";
import PageObjectLayer from "./document/PageObjectLayer.jsx";
import {
  DESIGN_TOOLS,
  TEXT_TOOL,
  DesignToolsPopover,
  TextSettingsPopover,
  ShapeSettingsPopover,
} from "./DocumentView.jsx";

// No page boundary on an infinite whiteboard — autoWidth text must never wrap
// against the 800px default ObjectContent assumes for a bounded paper page.
const WORLD_UNIT_LAYOUT = { zoom: 1, pageWidth: Infinity };

// Matches createPageObject's own default (pageObjects.js) — a plain click
// keeps that size, only a real drag scales away from it.
const TEXT_BASE_FONT_SIZE = 16;
function scaledTextFontSize(height) {
  const scale = Math.abs(height) / TEXT_TOOL.height;
  return Math.max(6, Math.round(TEXT_BASE_FONT_SIZE * scale));
}

function relativePoint(element, event) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function ColorWidthPopover({ color, onColorChange, width, onWidthChange, onClose }) {
  const popoverRef = useRef(null);
  React.useEffect(() => {
    const handleDown = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !e.target.closest?.(".whiteboard-color-btn")) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      data-testid="whiteboard-color-popover"
      style={{
        position: "absolute",
        left: 60,
        top: 120,
        zIndex: 50,
        width: 220,
        padding: 16,
        borderRadius: 14,
        background: "#18181C",
        color: "#FFFFFF",
        boxShadow: "0 20px 48px -12px rgba(0,0,0,.8)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <Palette size={14} /> Farbe & Breite
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer" }}>
          <X size={14} />
        </button>
      </div>
      <HexColorPicker color={color} onChange={onColorChange} />
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Breite</span>
        <input
          type="range"
          min={1}
          max={20}
          value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, width: 24, textAlign: "right" }}>{width}</span>
      </div>
    </div>
  );
}

export default function WhiteboardEditor({ inkController, railSlot }) {
  const containerRef = useRef(null);
  const canvasControllerRef = useRef(null);
  const objectLayerRef = useRef(null);
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const pinchCommitRef = useRef(false);
  // Copy/duplicate/paste clipboard for page objects — kept in-memory rather
  // than the OS clipboard, since only this app needs to read it back.
  const clipboardRef = useRef(null);
  // Held space pans with the mouse regardless of the active tool, same
  // convention as Figma/Photoshop. Tracks the one pointer doing it.
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const panPointerRef = useRef(null);
  const [isEraser, setIsEraser] = useState(false);
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  const [isLassoMode, setIsLassoMode] = useState(false);
  const [isBucketMode, setIsBucketMode] = useState(false);
  const [lassoDraft, setLassoDraft] = useState(null);
  const [lassoSelection, setLassoSelection] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isDesignToolsOpen, setIsDesignToolsOpen] = useState(false);
  const [placingTool, setPlacingTool] = useState(null);
  const [draftPlacement, setDraftPlacement] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [editingObjectId, setEditingObjectId] = useState(null);
  const [isTextSettingsOpen, setIsTextSettingsOpen] = useState(false);
  const [isShapeSettingsOpen, setIsShapeSettingsOpen] = useState(false);
  const [textStyle, setTextStyle] = useState({
    fontSize: 20,
    fontFamily: "sans",
    textAlign: "left",
    bold: false,
    italic: false,
    snapToLines: false,
    lineStep: 1,
    color: "#EFECE4",
  });
  const [processingImageId, setProcessingImageId] = useState(null);
  const imageInputRef = useRef(null);
  const { camera, panBy, zoomBy, focusWorldPointAtScreen } = useWhiteboardCamera();
  const palmGuard = useMemo(() => palmGuardFromProfile(loadPalmProfile()), []);

  const document = inkController.document;
  const pageId = document.pages[0]?.id || "";
  const strokes = document.strokes;
  const pageObjects = pageObjectsOf(document);

  const mapOrigin = useCallback(
    () => worldToScreen(camera, { x: 0, y: 0 }),
    [camera],
  );
  const fakePageLayout = { zoom: camera.scale };
  // The object layer lays out in unscaled world units and lets its own wrapper
  // apply the camera, so a pan or zoom never touches a single object's style.
  // Constant identity, so the layer does not re-render just for this.
  const objectLayerLayout = WORLD_UNIT_LAYOUT;

  const mapPoint = useCallback(
    (event) => {
      const point = relativePoint(containerRef.current, event);
      if (!point) return null;
      const world = screenToWorld(camera, point);
      return { pageId, x: world.x, y: world.y };
    },
    [camera, pageId],
  );

  const inkPointer = useInkPointer({
    inputMode: inkController.inputMode,
    palmGuard,
    tool: isEraser
      ? inkController.eraserMode === "stroke"
        ? "stroke-eraser"
        : "pixel-eraser"
      : inkController.tool,
    eraserMode: inkController.eraserMode,
    color: inkController.color,
    width: isEraser ? inkController.eraserWidth : inkController.penWidth,
    mapPoint,
    document,
    commitStroke: inkController.commitStroke,
    removeStrokes: inkController.removeStrokes,
    addObject: inkController.addObject,
    onHoldWithoutShape: (stroke) => tryRecognizeLink(stroke, inkController),
    onDraftAppend: (draft, appendedFrom) =>
      canvasControllerRef.current?.appendDraftSegment(draft, appendedFrom),
  });

  // Ink canvas and object layer (text/tables/callouts) share one committed
  // camera, so a live gesture previews both the same way or they'd visibly
  // split apart mid-pinch.
  const setPreview = (translateX, translateY, scale) => {
    canvasControllerRef.current?.setViewportPreview(translateX, translateY, scale);
    objectLayerRef.current?.setViewportPreview(translateX, translateY, scale);
  };
  const clearPreview = () => {
    canvasControllerRef.current?.clearViewportPreview();
    objectLayerRef.current?.clearViewportPreview();
  };

  useLayoutEffect(() => {
    if (!pinchCommitRef.current) return;
    pinchCommitRef.current = false;
    clearPreview();
  }, [camera]);

  // Measured once per gesture rather than once per frame. A ResizeObserver
  // alone is not enough — the surface can move without resizing, and a stale
  // offset skews the point a pinch zooms about. Re-reading is cheap now that a
  // pan or zoom no longer rewrites object styles, so layout is clean when we
  // ask; it was the combination of asking and a freshly dirtied layout that
  // made this expensive before.
  const containerRectRef = useRef({ left: 0, top: 0 });
  const refreshContainerRect = () => {
    const measured = containerRef.current?.getBoundingClientRect();
    if (measured) containerRectRef.current = measured;
    return containerRectRef.current;
  };

  const measureRef = useCallback((node) => {
    containerRef.current = node;
    if (!node) return;
    const update = () => {
      setSize({ width: node.clientWidth, height: node.clientHeight });
      containerRectRef.current = node.getBoundingClientRect();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
  }, []);

  const updatePinchPreview = (pinch) => {
    if (!pinch || pinchRef.current !== pinch) return;
    const [a, b] = pinch.pointerIds.map((id) => touchesRef.current.get(id));
    if (!a || !b) return;
    const rect = containerRectRef.current;
    const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
    const centerScreen = {
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
    };
    const scale = clampWhiteboardScale(
      pinch.startScale * (distance / pinch.startDistance),
    );
    const ratio = scale / pinch.startScale;
    pinch.pending = { centerScreen, scale };
    setPreview(
      centerScreen.x - pinch.startCenter.x * ratio,
      centerScreen.y - pinch.startCenter.y * ratio,
      ratio,
    );
  };

  const handlePointerDown = (event) => {
    if (isSpaceDown && event.pointerType === "mouse" && event.button === 0) {
      panPointerRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    // Right-click-drag is the mouse's marquee — plain left-drag stays drawing
    // (it always was; a mouse should be able to draw same as a stylus). A
    // 4-corner box is just another polygon to the freehand lasso's own
    // render/commit code below, which is why rectStart is all that marks it.
    if (event.pointerType === "mouse" && event.button === 2) {
      event.preventDefault();
      const point = mapPoint(event);
      if (!point) return;
      setSelectedObjectId(null);
      setLassoSelection(null);
      setLassoDraft({
        pointerId: event.pointerId,
        points: [{ x: point.x, y: point.y }],
        rectStart: { x: point.x, y: point.y },
      });
      return;
    }
    // A press reaching here never hit a real object — PageObjectLayer stops
    // propagation itself the moment one does — so it always clears whatever
    // was selected/editing, same as clicking true empty canvas.
    const hadSelection = Boolean(selectedObjectId || lassoSelection?.objectIds?.length || editingObjectId);
    if (selectedObjectId) setSelectedObjectId(null);
    if (lassoSelection?.objectIds?.length) setLassoSelection(null);
    if (editingObjectId) setEditingObjectId(null);
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        // The drawing contact can be either finger — whichever landed first —
        // so every id in the pair has to be offered, not just this one. It is
        // a no-op for whichever finger was never drawing (see abortActiveStroke).
        for (const pointerId of touchesRef.current.keys()) {
          inkPointer.abortActiveStroke?.(pointerId, event.timeStamp);
        }
        // Once here, at the start of the pinch; every frame of it then reuses
        // this via containerRectRef.
        const rect = refreshContainerRect();
        const [a, b] = Array.from(touchesRef.current.values());
        const centerScreen = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        pinchRef.current = {
          pointerIds: Array.from(touchesRef.current.keys()),
          startDistance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
          startScale: camera.scale,
          startCenter: centerScreen,
          worldCenter: screenToWorld(camera, centerScreen),
          pending: null,
          ticking: false,
          frameId: null,
        };
        return;
      }
      if (touchesRef.current.size > 2) return;
    }
    // A tap that only dismisses a selection must not also leave an ink dot.
    if (hadSelection) return;
    if (isBucketMode) {
      const point = mapPoint(event);
      handleBucketFill(point);
      return;
    }
    if (placingTool) {
      const point = mapPoint(event);
      if (!point) return;
      setDraftPlacement({ type: placingTool.id, pointerId: event.pointerId, startX: point.x, startY: point.y, width: 0, height: 0 });
      return;
    }
    if (isLassoMode) {
      const point = mapPoint(event);
      if (!point) return;
      setLassoSelection(null);
      setLassoDraft({ pointerId: event.pointerId, points: [{ x: point.x, y: point.y }] });
      return;
    }
    inkPointer.onPointerDown(event);
  };

  const handlePointerMove = (event) => {
    const pan = panPointerRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      pan.x = event.clientX;
      pan.y = event.clientY;
      panBy(dx, dy);
      return;
    }
    if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2 && pinchRef.current) {
        const pinch = pinchRef.current;
        if (pinch.ticking) return;
        pinch.ticking = true;
        const frameId = requestAnimationFrame(() => {
          const current = pinchRef.current;
          if (!current) return;
          current.ticking = false;
          current.frameId = null;
          updatePinchPreview(current);
        });
        // requestAnimationFrame is synchronous in some tests. Do not resurrect
        // a frame id after that callback has already completed.
        if (pinch.ticking) pinch.frameId = frameId;
        return;
      }
      if (touchesRef.current.size >= 2) return;
    }
    if (draftPlacement && draftPlacement.pointerId === event.pointerId) {
      const point = mapPoint(event);
      if (!point) return;
      setDraftPlacement((prev) => ({ ...prev, width: point.x - prev.startX, height: point.y - prev.startY }));
      return;
    }
    if (lassoDraft && lassoDraft.pointerId === event.pointerId) {
      const point = mapPoint(event);
      if (!point) return;
      if (lassoDraft.rectStart) {
        // Marquee: rebuild the 4 corners from the fixed start each move,
        // rather than appending like the freehand lasso's own trail does.
        const { x: sx, y: sy } = lassoDraft.rectStart;
        const corners = [
          { x: sx, y: sy },
          { x: point.x, y: sy },
          { x: point.x, y: point.y },
          { x: sx, y: point.y },
          { x: sx, y: sy },
        ];
        setLassoDraft((prev) => ({ ...prev, points: corners }));
      } else {
        setLassoDraft((prev) => ({ ...prev, points: [...prev.points, { x: point.x, y: point.y }] }));
      }
      return;
    }
    inkPointer.onPointerMove(event);
  };

  const handlePointerUp = (event) => {
    if (panPointerRef.current?.pointerId === event.pointerId) {
      panPointerRef.current = null;
      return;
    }
    if (event.pointerType === "touch") {
      const pinch = pinchRef.current;
      if (pinch?.pointerIds.includes(event.pointerId)) {
        if (pinch.ticking) {
          if (pinch.frameId !== null) cancelAnimationFrame(pinch.frameId);
          pinch.ticking = false;
          pinch.frameId = null;
          updatePinchPreview(pinch);
        }
        const pending = pinch.pending;
        if (pending) {
          const nextCamera = {
            scale: pending.scale,
            x: pinch.worldCenter.x - pending.centerScreen.x / pending.scale,
            y: pinch.worldCenter.y - pending.centerScreen.y / pending.scale,
          };
          const changed =
            nextCamera.scale !== camera.scale ||
            nextCamera.x !== camera.x ||
            nextCamera.y !== camera.y;
          if (changed) {
            pinchCommitRef.current = true;
            focusWorldPointAtScreen(pinch.worldCenter, pending.centerScreen, pending.scale);
          } else {
            clearPreview();
          }
        } else {
          clearPreview();
        }
      }
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    }
    if (draftPlacement && draftPlacement.pointerId === event.pointerId) {
      const tool = placingTool;
      const dragged = Math.abs(draftPlacement.width) > 8 || Math.abs(draftPlacement.height) > 8;
      const object = createPageObject({
        pageId,
        type: draftPlacement.type,
        x: dragged || tool.id === "text" ? draftPlacement.startX : draftPlacement.startX - tool.width / 2,
        y: dragged || tool.id === "text" ? draftPlacement.startY : draftPlacement.startY - tool.height / 2,
        width: dragged ? draftPlacement.width : tool.width,
        height: dragged ? draftPlacement.height : tool.height,
        color: draftPlacement.type === "text" ? textStyle.color : inkController.color || "#3E7BD8",
        strokeWidth: inkController.penWidth || 3,
        // Always empty, click or drag alike — dropping straight into edit mode
        // below means there is no placeholder left to clear by hand, and an
        // untouched box just deletes itself on blur (see PageObjectLayer's
        // onCommitText).
        text: draftPlacement.type === "text" ? "" : undefined,
        // A dragged-out text box reads its size as "how big should this
        // read", same as stretching an existing one via its resize handle.
        fontSize:
          draftPlacement.type === "text" && dragged
            ? scaledTextFontSize(draftPlacement.height)
            : draftPlacement.type === "text"
              ? textStyle.fontSize
              : undefined,
        // A plain click keeps hugging content width as you type; a drag
        // picked a deliberate width, so typing should wrap within it instead.
        autoWidth: !dragged,
        ...(draftPlacement.type === "text"
          ? {
              fontFamily: textStyle.fontFamily,
              textAlign: textStyle.textAlign,
              bold: textStyle.bold,
              italic: textStyle.italic,
            }
          : {}),
      });
      inkController.addObject?.(object);
      setSelectedObjectId(object.id);
      // A mouse user who clicked or dragged the text tool wants to type next,
      // not click a second time to enter edit mode.
      if (draftPlacement.type === "text") setEditingObjectId(object.id);
      setDraftPlacement(null);
      setPlacingTool(null);
      return;
    }
    if (lassoDraft && lassoDraft.pointerId === event.pointerId) {
      const polygon = lassoDraft.points;
      if (polygon.length >= 3) {
        let strokeIds;
        let objectIds;
        if (lassoDraft.rectStart) {
          // Marquee: a straight-edged box reads as "fully contains", not
          // "touches a point of" — that any-point rule is right for a
          // hand-drawn lasso traced around something, but here it let one
          // grazed long stroke's whole length balloon the selection box far
          // past the rectangle actually dragged.
          const xs = polygon.map((p) => p.x);
          const ys = polygon.map((p) => p.y);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          strokeIds = strokes
            .filter(
              (s) =>
                s.pageId === pageId &&
                s.points.every((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY),
            )
            .map((s) => s.id);
          objectIds = pageObjects
            .filter((o) => {
              if (o.pageId !== pageId) return false;
              const bounds = objectBounds(o);
              return (
                bounds.x >= minX &&
                bounds.x + bounds.width <= maxX &&
                bounds.y >= minY &&
                bounds.y + bounds.height <= maxY
              );
            })
            .map((o) => o.id);
        } else {
          strokeIds = strokesInLasso(strokes, pageId, polygon);
          objectIds = objectsInLasso(pageObjects, pageId, polygon);
        }
        if (strokeIds.length > 0 || objectIds.length > 0) {
          setLassoSelection({ strokeIds, objectIds });
        }
      }
      setLassoDraft(null);
      return;
    }
    inkPointer.onPointerUp(event);
  };

  const handlePointerCancel = (event) => {
    if (panPointerRef.current?.pointerId === event.pointerId) {
      panPointerRef.current = null;
      return;
    }
    if (event.pointerType === "touch") {
      if (pinchRef.current?.pointerIds.includes(event.pointerId)) {
        if (pinchRef.current.frameId !== null) {
          cancelAnimationFrame(pinchRef.current.frameId);
        }
        clearPreview();
      }
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    }
    inkPointer.onPointerCancel(event);
  };

  // Holding space pans with the mouse no matter what tool is active — same
  // convention as Figma/Photoshop. keyup (not the big shortcut effect below,
  // which only handles keydown) releases it, including if focus moved away
  // mid-hold.
  React.useEffect(() => {
    const isEditingTarget = (target) =>
      target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
    const handleKeyDown = (event) => {
      if (event.code !== "Space" || isEditingTarget(event.target)) return;
      event.preventDefault();
      setIsSpaceDown(true);
    };
    const handleKeyUp = (event) => {
      if (event.code !== "Space") return;
      setIsSpaceDown(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    // A trackpad fires wheel events far faster than the display refreshes.
    // Applying each one straight to camera state (as before) forced a full
    // React commit — canvas redraw of every stroke, layout of every text/table
    // object — per event instead of per frame, which read as "extreme" lag on
    // exactly the content-heavy notes this app builds. Coalescing into one
    // accumulated pan/zoom per animation frame is the same fix already applied
    // to touch pinch below.
    let frameId = null;
    let pending = null;

    const flush = () => {
      frameId = null;
      const job = pending;
      pending = null;
      if (!job) return;
      if (job.kind === "zoom") {
        // Converted here rather than in the handler, so a burst of wheel
        // events costs one rect read per frame instead of one per event.
        const rect = refreshContainerRect();
        zoomBy({ x: job.client.x - rect.left, y: job.client.y - rect.top }, job.factor);
      } else {
        panBy(job.dx, job.dy);
      }
    };

    const handleWheel = (event) => {
      event.preventDefault();
      const normalizedDeltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const normalizedDeltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (event.ctrlKey) {
        const client = { x: event.clientX, y: event.clientY };
        const factor = Math.exp(-normalizedDeltaY * 0.0015);
        pending =
          pending?.kind === "zoom"
            ? { kind: "zoom", client, factor: pending.factor * factor }
            : { kind: "zoom", client, factor };
      } else {
        pending =
          pending?.kind === "pan"
            ? { kind: "pan", dx: pending.dx - normalizedDeltaX, dy: pending.dy - normalizedDeltaY }
            : { kind: "pan", dx: -normalizedDeltaX, dy: -normalizedDeltaY };
      }
      if (frameId === null) frameId = requestAnimationFrame(flush);
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", handleWheel);
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [panBy, zoomBy]);

  React.useEffect(() => {
    const NUDGE_STEP = 1;
    const NUDGE_STEP_FAST = 10;
    const CLONE_OFFSET = 24;
    const ARROW_DELTAS = {
      ArrowUp: { dx: 0, dy: -1 },
      ArrowDown: { dx: 0, dy: 1 },
      ArrowLeft: { dx: -1, dy: 0 },
      ArrowRight: { dx: 1, dy: 0 },
    };
    // Objects only — ink strokes have no id-preserving clone path, and
    // copy/duplicate/paste of hand-drawn ink was not asked for.
    const selectedObjectIds = () =>
      lassoSelection?.objectIds?.length ? lassoSelection.objectIds : selectedObjectId ? [selectedObjectId] : [];
    const selectIds = (ids) => {
      if (ids.length === 1) {
        setSelectedObjectId(ids[0]);
        setLassoSelection(null);
      } else {
        setSelectedObjectId(null);
        setLassoSelection({ strokeIds: [], objectIds: ids });
      }
    };
    const handleKeyDown = (event) => {
      const target = event.target;
      // isContentEditable catches a text/table object mid-edit — those are
      // plain divs, not INPUT/TEXTAREA, so the tag check alone misses them.
      // Leaving here also leaves native copy/paste/select-all working inside
      // the field itself, instead of hijacking them for the canvas below.
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        inkController.undo?.();
        return;
      }
      if ((mod && event.shiftKey && event.key.toLowerCase() === "z") || (mod && event.key.toLowerCase() === "y")) {
        event.preventDefault();
        inkController.redo?.();
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const strokeIds = strokes.filter((s) => s.pageId === pageId).map((s) => s.id);
        const objectIds = pageObjects.map((o) => o.id);
        if (strokeIds.length > 0 || objectIds.length > 0) {
          setSelectedObjectId(null);
          setLassoSelection({ strokeIds, objectIds });
        }
        return;
      }
      if (mod && (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "x")) {
        const ids = selectedObjectIds();
        if (ids.length === 0) return;
        event.preventDefault();
        clipboardRef.current = pageObjects.filter((o) => ids.includes(o.id)).map((o) => ({ ...o }));
        if (event.key.toLowerCase() === "x") {
          inkController.removeObjects?.(ids);
          setSelectedObjectId(null);
          setLassoSelection(null);
        }
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        if (!clipboardRef.current?.length) return;
        event.preventDefault();
        const pasted = clipboardRef.current.map((o) =>
          createPageObject({ ...o, id: undefined, x: o.x + CLONE_OFFSET, y: o.y + CLONE_OFFSET }),
        );
        pasted.forEach((o) => inkController.addObject?.(o));
        selectIds(pasted.map((o) => o.id));
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        const ids = selectedObjectIds();
        if (ids.length === 0) return;
        event.preventDefault();
        const duplicates = pageObjects
          .filter((o) => ids.includes(o.id))
          .map((o) => createPageObject({ ...o, id: undefined, x: o.x + CLONE_OFFSET, y: o.y + CLONE_OFFSET }));
        duplicates.forEach((o) => inkController.addObject?.(o));
        selectIds(duplicates.map((o) => o.id));
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && lassoSelection) {
        event.preventDefault();
        if (lassoSelection.strokeIds.length > 0) inkController.removeStrokes?.(lassoSelection.strokeIds);
        if (lassoSelection.objectIds.length > 0) inkController.removeObjects?.(lassoSelection.objectIds);
        setLassoSelection(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedObjectId) {
        event.preventDefault();
        inkController.removeObjects?.([selectedObjectId]);
        setSelectedObjectId(null);
        return;
      }
      if (ARROW_DELTAS[event.key] && selectedObjectId) {
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
        const { dx, dy } = ARROW_DELTAS[event.key];
        const object = pageObjects.find((o) => o.id === selectedObjectId);
        if (object) {
          inkController.updateObject?.(selectedObjectId, { x: object.x + dx * step, y: object.y + dy * step });
        }
        return;
      }
      if (event.key === "Escape") {
        if (lassoSelection) setLassoSelection(null);
        else if (isLassoMode) setIsLassoMode(false);
        else if (placingTool) setPlacingTool(null);
        else if (selectedObjectId) setSelectedObjectId(null);
        return;
      }
      if ((event.key === "t" || event.key === "T") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        setPlacingTool((cur) => (cur?.id === "text" ? null : TEXT_TOOL));
        setIsLassoMode(false);
        setIsBucketMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lassoSelection, isLassoMode, placingTool, selectedObjectId, pageObjects, strokes, pageId, inkController]);

  const handleBucketFill = (worldPoint) => {
    if (!worldPoint) return;

    const target = [...pageObjects]
      .reverse()
      .find(
        (object) =>
          (object.type === "rect" || object.type === "ellipse") &&
          isPointInsideObject(object, worldPoint.x, worldPoint.y),
      );
    if (target) {
      inkController.updateObject?.(target.id, { fillColor: inkController.color || "#3E7BD8" });
      return;
    }

    // Rasterize a viewport-sized window in world units, centered on the
    // current camera view, translating strokes/objects into that window's
    // local (0,0)-origin space first so rasterizePageWalls (unchanged, page
    // version's exact function) never needs to know about "world" at all.
    // Read the live layout box (same source mapPoint uses via relativePoint)
    // rather than the `size` state, which only updates from ResizeObserver
    // and can lag behind — especially in tests, which stub getBoundingClientRect.
    const rect = containerRef.current?.getBoundingClientRect();
    const viewportWidth = rect?.width || size.width;
    const viewportHeight = rect?.height || size.height;
    const windowWidth = Math.max(1, Math.round(viewportWidth / camera.scale));
    const windowHeight = Math.max(1, Math.round(viewportHeight / camera.scale));
    const originX = camera.x;
    const originY = camera.y;
    const translate = (points) => points.map((p) => ({ x: p.x - originX, y: p.y - originY }));
    const localStrokes = strokes
      .filter((s) => s.pageId === pageId)
      .map((s) => ({ ...s, points: translate(s.points) }));
    const localObjects = pageObjects.map((o) => ({ ...o, x: o.x - originX, y: o.y - originY }));

    // `document` (above) shadows window.document — use globalThis.document here.
    const canvas = globalThis.document.createElement("canvas");
    const wallData = rasterizePageWalls(canvas, {
      strokes: localStrokes,
      objects: localObjects,
      pageId,
      width: windowWidth,
      height: windowHeight,
    });
    const localX = Math.round(worldPoint.x - originX);
    const localY = Math.round(worldPoint.y - originY);
    if (localX < 0 || localY < 0 || localX >= windowWidth || localY >= windowHeight) return;
    const result = floodFill(wallData, windowWidth, windowHeight, localX, localY);
    if (!result) return;
    const { dataUrl, x, y, width: w, height: h } = fillResultToDataUrl(
      result,
      windowWidth,
      hexToRgb(inkController.color || "#3E7BD8"),
    );
    const object = createPageObject({
      pageId,
      type: "fill",
      x: x + originX,
      y: y + originY,
      width: w,
      height: h,
      color: inkController.color || "#3E7BD8",
      strokeWidth: 1,
      src: dataUrl,
    });
    inkController.addObject?.(object);
  };

  // Plain click replaces the selection. Ctrl/Cmd-click toggles the clicked
  // object into (or out of) a group, reusing the lasso's own multi-select —
  // group move/duplicate/delete/nudge already work for lassoSelection.
  const handleSelectObject = (objectId, modifiers = {}) => {
    if (!modifiers.ctrlKey && !modifiers.metaKey) {
      setSelectedObjectId(objectId);
      setLassoSelection(null);
      return;
    }
    const current = lassoSelection?.objectIds?.length
      ? lassoSelection.objectIds
      : selectedObjectId
        ? [selectedObjectId]
        : [];
    const next = current.includes(objectId)
      ? current.filter((id) => id !== objectId)
      : [...current, objectId];
    setSelectedObjectId(next.length === 1 ? next[0] : null);
    setLassoSelection(next.length > 1 ? { strokeIds: [], objectIds: next } : null);
  };

  const handleInsertTool = (item) => {
    if (item.id === "image") {
      imageInputRef.current?.click();
      setIsDesignToolsOpen(false);
      return;
    }
    setPlacingTool(item);
    setIsDesignToolsOpen(false);
  };

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { src, width, height } = await readImageObjectSource(file);
      const maxWidth = Math.min(600, width);
      const scale = maxWidth / width;
      const center = screenToWorld(camera, { x: size.width / 2, y: size.height / 2 });
      const object = createPageObject({
        pageId,
        type: "image",
        x: center.x - maxWidth / 2,
        y: center.y - (height * scale) / 2,
        width: maxWidth,
        height: height * scale,
        src,
      });
      inkController.addObject?.(object);
      setSelectedObjectId(object.id);
    } catch {
      // A file the browser cannot decode simply inserts nothing.
    }
  };

  const handleRemoveBackground = async (object) => {
    if (!object || !object.src || processingImageId === object.id) return;
    setProcessingImageId(object.id);
    try {
      const transparentDataUrl = await removeImageBackground(object.src);
      inkController?.updateObject?.(object.id, {
        src: transparentDataUrl,
        originalSrc: object.originalSrc || object.src,
      });
    } catch (error) {
      console.error("Failed to remove background:", error);
    } finally {
      setProcessingImageId(null);
    }
  };

  const handleRestoreBackground = (object) => {
    if (!object || !object.originalSrc) return;
    inkController?.updateObject?.(object.id, {
      src: object.originalSrc,
      originalSrc: null,
    });
  };

  const SHAPE_OBJECT_TYPES = ["rect", "ellipse", "line", "arrow"];
  const selectedTextObject =
    pageObjects.find((o) => o.id === selectedObjectId && o.type === "text") || null;
  const selectedShapeObject =
    pageObjects.find((o) => o.id === selectedObjectId && SHAPE_OBJECT_TYPES.includes(o.type)) ||
    null;

  const handleTextStyleChange = (patch) => {
    setTextStyle((prev) => ({ ...prev, ...patch }));
    if (selectedTextObject) inkController?.updateObject?.(selectedTextObject.id, patch);
  };
  const handleShapeStyleChange = (patch) => {
    if (selectedShapeObject) inkController?.updateObject?.(selectedShapeObject.id, patch);
  };
  // Selecting a text or shape object opens its settings automatically, so
  // there is no separate "edit" click beyond picking the object.
  React.useEffect(() => {
    if (selectedShapeObject) {
      setIsShapeSettingsOpen(true);
      setIsTextSettingsOpen(false);
    } else if (selectedTextObject) {
      setIsTextSettingsOpen(true);
      setIsShapeSettingsOpen(false);
    } else {
      setIsShapeSettingsOpen(false);
    }
  }, [selectedObjectId]);

  const railContent = (
    <>
      <button
        className="rail-btn"
        onClick={() => inkController.undo?.()}
        disabled={!inkController.canUndo}
        style={{ opacity: inkController.canUndo ? 1 : 0.35 }}
        title="Rückgängig"
      >
        <Undo2 size={19} />
      </button>
      <button
        className="rail-btn"
        onClick={() => inkController.redo?.()}
        disabled={!inkController.canRedo}
        style={{ opacity: inkController.canRedo ? 1 : 0.35 }}
        title="Wiederholen"
      >
        <Redo2 size={19} />
      </button>
      <button
        className={`rail-btn ${!isEraser ? "active" : ""}`}
        onClick={() => setIsEraser(false)}
        title="Stift"
      >
        <PenLine size={19} />
      </button>
      <button
        className={`rail-btn ${isEraser ? "active" : ""}`}
        onClick={() => setIsEraser(true)}
        title="Radierer"
      >
        <Eraser size={19} />
      </button>
      <button
        className="rail-btn whiteboard-color-btn"
        onClick={() => setIsColorPopoverOpen((open) => !open)}
        title="Farbe & Breite"
      >
        <Palette size={19} />
      </button>
      <button
        className={`rail-btn ${isLassoMode ? "active" : ""}`}
        onClick={() => {
          setIsLassoMode((mode) => !mode);
          setLassoSelection(null);
          setPlacingTool(null);
          setIsBucketMode(false);
        }}
        title="Lasso-Auswahl"
      >
        <Lasso size={19} />
      </button>
      <button
        className={`rail-btn text-rail-btn ${
          isTextSettingsOpen || placingTool?.id === "text" ? "active" : ""
        }`}
        onClick={() => {
          if (placingTool?.id === "text") {
            setPlacingTool(null);
            return;
          }
          setIsTextSettingsOpen((prev) => !prev);
          setIsShapeSettingsOpen(false);
          setIsLassoMode(false);
          setIsBucketMode(false);
        }}
        title="Text: Schrift, Größe & Farbe"
      >
        <span style={{ fontSize: 15, fontWeight: 700 }}>T</span>
      </button>
      <button
        className={`rail-btn design-rail-btn ${isDesignToolsOpen || placingTool ? "active" : ""}`}
        onClick={() => {
          if (placingTool) setPlacingTool(null);
          else setIsDesignToolsOpen((open) => !open);
          setIsLassoMode(false);
          setIsBucketMode(false);
        }}
        title="Einfügen"
      >
        <Shapes size={19} />
      </button>
      <button
        className={`rail-btn ${isBucketMode ? "active" : ""}`}
        onClick={() => {
          setIsBucketMode((mode) => !mode);
          setIsLassoMode(false);
          setPlacingTool(null);
        }}
        title="Eimer-Füllung"
      >
        <PaintBucket size={19} />
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageFile}
      />
    </>
  );

  return (
    <div
      data-testid="document-view"
      data-document-id={document.documentId}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: document.pages[0]?.background || "#0B0B0D",
      }}
    >
      <div
        ref={measureRef}
        data-testid="whiteboard-surface"
        style={{
          position: "absolute",
          inset: 0,
          touchAction: "none",
          cursor: isSpaceDown
            ? panPointerRef.current
              ? "grabbing"
              : "grab"
            : placingTool
              ? "crosshair"
              : isBucketMode
                ? "cell"
                : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        // Right-click now drives the marquee instead of the browser's own
        // context menu, which has nothing to show here anyway.
        onContextMenu={(event) => event.preventDefault()}
      >
        <WhiteboardCanvas
          ref={canvasControllerRef}
          pageId={pageId}
          strokes={strokes}
          draftStroke={inkPointer.draftStroke}
          draftVersion={inkPointer.draftVersion}
          camera={camera}
          width={size.width}
          height={size.height}
          dpr={globalThis.devicePixelRatio || 1}
        />
        {draftPlacement && (() => {
          const x = Math.min(draftPlacement.startX, draftPlacement.startX + draftPlacement.width);
          const y = Math.min(draftPlacement.startY, draftPlacement.startY + draftPlacement.height);
          const width = Math.abs(draftPlacement.width);
          const height = Math.abs(draftPlacement.height);
          const screen = worldToScreen(camera, { x, y });
          const dragged = width > 8 || height > 8;
          return (
            <>
              <div
                data-testid="draft-placement-box"
                style={{
                  position: "absolute",
                  left: screen.x,
                  top: screen.y,
                  width: width * camera.scale,
                  height: height * camera.scale,
                  border: "1.5px dashed #3E7BD8",
                  background: "rgba(62,123,216,0.08)",
                  pointerEvents: "none",
                }}
              />
              {draftPlacement.type === "text" && dragged && (
                <div
                  data-testid="draft-placement-font-size"
                  style={{
                    position: "absolute",
                    left: screen.x + (width * camera.scale) / 2,
                    top: screen.y - 30,
                    transform: "translateX(-50%)",
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "rgba(20,20,24,0.92)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#EFECE4",
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {scaledTextFontSize(draftPlacement.height)}px
                </div>
              )}
            </>
          );
        })()}
        {lassoDraft && lassoDraft.points.length > 1 && (
          <svg
            data-testid="lasso-draft-path"
            style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
          >
            <polyline
              points={lassoDraft.points
                .map((p) => {
                  const screen = worldToScreen(camera, p);
                  return `${screen.x},${screen.y}`;
                })
                .join(" ")}
              fill="rgba(62,123,216,0.12)"
              stroke="#3E7BD8"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          </svg>
        )}
        {lassoSelection && (
          <LassoSelectionLayer
            bounds={
              selectionBounds(strokes, pageObjects, lassoSelection.strokeIds, lassoSelection.objectIds)
                ? { pageId, ...selectionBounds(strokes, pageObjects, lassoSelection.strokeIds, lassoSelection.objectIds) }
                : null
            }
            pageLayout={fakePageLayout}
            mapOrigin={mapOrigin}
            onCommit={(transform) =>
              inkController.applyCommands?.([
                { type: "transform-selection", strokeIds: lassoSelection.strokeIds, objectIds: lassoSelection.objectIds, ...transform },
              ])
            }
            onDelete={() => {
              if (lassoSelection.strokeIds.length > 0) inkController.removeStrokes?.(lassoSelection.strokeIds);
              if (lassoSelection.objectIds.length > 0) inkController.removeObjects?.(lassoSelection.objectIds);
              setLassoSelection(null);
            }}
          />
        )}
        <PageObjectLayer
          ref={objectLayerRef}
          objects={pageObjects}
          pageLayout={objectLayerLayout}
          mapOrigin={mapOrigin}
          perObjectTouchAction={false}
          containerOffset={mapOrigin()}
          containerScale={camera.scale}
          selectedId={selectedObjectId}
          editingId={editingObjectId}
          onEditingChange={setEditingObjectId}
          processingObjectId={processingImageId}
          onSelect={handleSelectObject}
          onChange={(id, changes) => inkController.updateObject?.(id, changes)}
          onDelete={(id) => inkController.removeObjects?.([id])}
          onRemoveBackground={handleRemoveBackground}
          onRestoreBackground={handleRestoreBackground}
        />
      </div>
      {railSlot ? createPortal(railContent, railSlot) : railContent}
      {isDesignToolsOpen && (
        <DesignToolsPopover onInsert={handleInsertTool} onClose={() => setIsDesignToolsOpen(false)} />
      )}
      {isColorPopoverOpen && (
        <ColorWidthPopover
          color={isEraser ? "#FFFFFF" : inkController.color}
          onColorChange={(c) => inkController.setColor?.(c)}
          width={isEraser ? inkController.eraserWidth : inkController.penWidth}
          onWidthChange={(w) =>
            isEraser ? inkController.setEraserWidth?.(w) : inkController.setPenWidth?.(w)
          }
          onClose={() => setIsColorPopoverOpen(false)}
        />
      )}
      {isTextSettingsOpen && (
        <TextSettingsPopover
          style={selectedTextObject || textStyle}
          onStyleChange={handleTextStyleChange}
          paperStyle="blank"
          hasSelection={Boolean(selectedTextObject)}
          onInsert={() => {
            setPlacingTool(TEXT_TOOL);
            setIsTextSettingsOpen(false);
          }}
          onClose={() => setIsTextSettingsOpen(false)}
        />
      )}
      {isShapeSettingsOpen && selectedShapeObject && (
        <ShapeSettingsPopover
          object={selectedShapeObject}
          onChange={handleShapeStyleChange}
          onClose={() => setIsShapeSettingsOpen(false)}
        />
      )}
    </div>
  );
}
