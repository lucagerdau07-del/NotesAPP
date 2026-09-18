// src/components/WhiteboardEditor.jsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isLightBackground } from "../documents/pageStyles.js";
import { Undo2, Redo2, PenLine, Eraser, LassoSelect, Shapes, PaintBucket, Type, MessageSquare, Layers, Move, Columns2 } from "lucide-react";
import useInkPointer from "../hooks/useInkPointer.js";
import useWhiteboardCamera, { clampWhiteboardScale } from "../hooks/useWhiteboardCamera.js";
import { loadPalmProfile, palmGuardFromProfile } from "../ink/palmSettings.js";
import { screenToWorld, worldToScreen } from "../ink/whiteboardCoordinates.js";
import { strokesInLasso, objectsInLasso, selectionBounds } from "../ink/lasso.js";
import { createPageObject, objectBounds, pageObjectsOf, isPointInsideObject } from "../ink/pageObjects.js";
import { rasterizePageWalls, floodFill, fillResultToDataUrl, hexToRgb } from "../ink/bucketFill.js";
import { readImageObjectSource } from "../ink/imageObject.js";
import { isPdfFile, pdfWhiteboardBackgroundCommands, pdfWhiteboardObjects, readPdfPages } from "../ink/pdfObject.js";
import { whiteboardInkLayerIndex } from "../ink/inkDocument.js";
import { tryRecognizeLink } from "../ink/linkRecognizer.js";
import { removeImageBackground } from "../ink/imageBackground.js";
import WhiteboardCanvas from "./document/WhiteboardCanvas.jsx";
import LassoSelectionLayer from "./document/LassoSelectionLayer.jsx";
import PageObjectLayer from "./document/PageObjectLayer.jsx";
import CommentLayer from "./document/CommentLayer.jsx";
import useComments from "../hooks/useComments.js";
import LayerDrawer from "./document/LayerDrawer.jsx";
import {
  DESIGN_TOOLS,
  TEXT_TOOL,
  PEN_TOOL_ICONS,
  ColorSlot,
  ColorWheelPopover,
  DesignToolsPopover,
  EraserSettingsPopover,
  PenSettingsPopover,
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

export default function WhiteboardEditor({
  inkController,
  toolbarState,
  focusBoxState,
  railSlot,
  panelSlot,
  panelMode,
  setPanelMode,
  openRequest,
  onOpenHandled,
}) {
  const containerRef = useRef(null);
  const canvasControllerRef = useRef(null);
  const objectLayerRef = useRef(null);
  const belowLayerRef = useRef(null);
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
  // Same rail as DocumentView: pen/eraser/color popovers, long-press timers,
  // clear-confirm and the layers drawer.
  const [customColors, setCustomColors] = useState(["#EFECE4", "#3E7BD8", "#D8615B"]);
  const [activePickerIndex, setActivePickerIndex] = useState(0);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState(false);
  const [isEraserSettingsOpen, setIsEraserSettingsOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [popoverTop, setPopoverTop] = useState(120);
  const [localLayersOpen, setLocalLayersOpen] = useState(false);
  const penLongPressTimer = useRef(null);
  const penLongPressFired = useRef(false);
  const textLongPressTimer = useRef(null);
  const textLongPressFired = useRef(false);
  const rootRef = useRef(null);
  const [isCommentMode, setIsCommentMode] = useState(false);
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
  const { comments, addComment, editComment, removeComment } = useComments(document.documentId);

  useEffect(() => {
    const bg = document.pages[0]?.background;
    const isLight = isLightBackground(bg);
    const shell = containerRef.current?.closest(".editor-shell");
    if (shell) {
      if (isLight) {
        shell.setAttribute("data-document-theme", "light");
        shell.classList.add("light-doc");
      } else {
        shell.setAttribute("data-document-theme", "dark");
        shell.classList.remove("light-doc");
      }
    }
  }, [document.pages]);

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
    belowLayerRef.current?.setViewportPreview(translateX, translateY, scale);
  };
  const clearPreview = () => {
    canvasControllerRef.current?.clearViewportPreview();
    objectLayerRef.current?.clearViewportPreview();
    belowLayerRef.current?.clearViewportPreview();
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
      const center = screenToWorld(camera, { x: size.width / 2, y: size.height / 2 });
      if (isPdfFile(file)) {
        const objects = pdfWhiteboardObjects(pageId, await readPdfPages(file), center);
        inkController.applyCommands?.(objects.map((object) => ({ type: "add-object", object })));
        setSelectedObjectId(objects[0].id);
        return;
      }
      const { src, width, height } = await readImageObjectSource(file);
      const maxWidth = Math.min(600, width);
      const scale = maxWidth / width;
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

  const inputMode = inkController.inputMode;
  const isMoveMode = inputMode === "move";
  const isDesignPlacing = Boolean(placingTool) && placingTool.id !== "text";
  const penColor = inkController.color;
  const isLayersOpen = setPanelMode ? panelMode === "layers" : localLayersOpen;
  const toggleLayers = () =>
    setPanelMode
      ? setPanelMode((prev) => (prev === "layers" ? null : "layers"))
      : setLocalLayersOpen((prev) => !prev);
  const openLayers = () => (setPanelMode ? setPanelMode("layers") : setLocalLayersOpen(true));
  const closeLayers = () => (setPanelMode ? setPanelMode(null) : setLocalLayersOpen(false));

  const anchorPopoverToButton = (buttonEl, popoverHeight = 460) => {
    const containerRect = rootRef.current?.getBoundingClientRect();
    const buttonRect = buttonEl?.getBoundingClientRect();
    if (containerRect && buttonRect) {
      const maxTop = Math.max(8, containerRect.height - popoverHeight - 8);
      setPopoverTop(Math.min(Math.max(8, buttonRect.top - containerRect.top), maxTop));
    }
  };

  const handleColorChange = (index, color) => {
    setCustomColors((colors) => colors.map((c, i) => (i === index ? color : c)));
    inkController.setColor?.(color);
    setIsEraser(false);
  };

  const PenIcon = isMoveMode ? Move : PEN_TOOL_ICONS[inkController.tool] || PenLine;
  const isPenActive =
    Boolean(PEN_TOOL_ICONS[inkController.tool]) &&
    !isEraser &&
    !isMoveMode &&
    !isBucketMode &&
    !isLassoMode &&
    !placingTool &&
    !isDesignToolsOpen;

  const isSplit = toolbarState?.layoutMode === "split";
  const focusBox = focusBoxState?.focusBox;
  const toggleSplit = () => {
    if (!isSplit && focusBoxState?.setFocusBox) {
      // Start the box centered in what is currently on screen.
      const w = 250;
      const h = 100;
      const center = screenToWorld(camera, { x: size.width / 2, y: size.height / 2 });
      focusBoxState.setFocusBox({ pageId, x: center.x - w / 2, y: center.y - h / 2, width: w, height: h });
    }
    toolbarState?.setLayoutMode?.(isSplit ? "full" : "split");
  };
  const startFocusBoxDrag = (event) => {
    if (!focusBox) return;
    event.stopPropagation();
    event.preventDefault();
    let last = { x: event.clientX, y: event.clientY };
    const move = (e) => {
      focusBoxState.handleDrag((e.clientX - last.x) / camera.scale, (e.clientY - last.y) / camera.scale);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Same buttons, order and behavior as DocumentView's rail.
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
      <div className="rail-divider" />
      <button
        className={`rail-btn pen-rail-btn ${isPenActive || isMoveMode ? "active" : ""}`}
        onPointerDown={(e) => {
          penLongPressFired.current = false;
          const buttonEl = e.currentTarget;
          penLongPressTimer.current = setTimeout(() => {
            penLongPressFired.current = true;
            anchorPopoverToButton(buttonEl);
            setIsPenSettingsOpen(true);
            setIsBucketMode(false);
            setIsLassoMode(false);
            setLassoSelection(null);
            setIsColorPickerOpen(false);
            setIsEraserSettingsOpen(false);
          }, 500);
        }}
        onPointerUp={() => clearTimeout(penLongPressTimer.current)}
        onPointerLeave={() => clearTimeout(penLongPressTimer.current)}
        onClick={() => {
          if (penLongPressFired.current) return;
          if (isEraser || isBucketMode || isLassoMode || placingTool) {
            setIsEraser(false);
            setIsBucketMode(false);
            setIsLassoMode(false);
            setLassoSelection(null);
            setPlacingTool(null);
            if (isMoveMode) inkController.setInputMode?.("stylus");
          } else {
            inkController.setInputMode?.(isMoveMode ? "stylus" : "move");
          }
          setIsPenSettingsOpen(false);
        }}
        title="Stift: Klick = Bewegen, Halten = Einstellungen"
        data-testid="pen-tool-btn"
      >
        <PenIcon size={18} />
      </button>
      <button
        className={`rail-btn eraser-rail-btn ${isEraser ? "active" : ""}`}
        onClick={(e) => {
          if (isEraser) {
            anchorPopoverToButton(e.currentTarget);
            setIsEraserSettingsOpen((prev) => !prev);
          } else {
            setIsEraser(true);
            setIsPenSettingsOpen(false);
            setIsColorPickerOpen(false);
            if (isMoveMode) inkController.setInputMode?.("stylus");
          }
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title="Radiergummi"
      >
        <Eraser size={18} />
      </button>
      <button
        className={`rail-btn ${isBucketMode ? "active" : ""}`}
        onClick={() => {
          setIsBucketMode((prev) => {
            if (!prev && isMoveMode) inkController.setInputMode?.("stylus");
            return !prev;
          });
          setPlacingTool(null);
          setIsEraser(false);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title="Eimer (Fläche füllen)"
        data-testid="bucket-tool-btn"
      >
        <PaintBucket size={18} />
      </button>
      <button
        className={`rail-btn ${isLassoMode ? "active" : ""}`}
        onClick={() => {
          const next = !isLassoMode;
          setIsLassoMode(next);
          if (!next) setLassoSelection(null);
          setPlacingTool(null);
          setIsBucketMode(false);
          setIsEraser(false);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
        }}
        title="Lasso (markieren, verschieben, vergrößern)"
        data-testid="lasso-tool-btn"
      >
        <LassoSelect size={18} />
      </button>
      <button
        className={`rail-btn design-rail-btn ${isDesignToolsOpen || isDesignPlacing ? "active" : ""}`}
        onClick={(e) => {
          if (isDesignPlacing) {
            setPlacingTool(null);
            return;
          }
          setPlacingTool(null);
          anchorPopoverToButton(e.currentTarget);
          setIsDesignToolsOpen((prev) => !prev);
          setIsPenSettingsOpen(false);
          setIsEraserSettingsOpen(false);
          setIsColorPickerOpen(false);
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
        }}
        title={
          isDesignPlacing
            ? `${placingTool.name} ziehen zum Platzieren (Klick zum Abbrechen)`
            : "Pfeile, Formen, Bilder & Links einfügen"
        }
        data-testid="design-tools-btn"
      >
        {isDesignPlacing ? placingTool.icon : <Shapes size={18} />}
      </button>
      <button
        className={`rail-btn text-rail-btn ${
          isTextSettingsOpen || placingTool?.id === "text" ? "active" : ""
        }`}
        onPointerDown={(e) => {
          textLongPressFired.current = false;
          const buttonEl = e.currentTarget;
          textLongPressTimer.current = setTimeout(() => {
            textLongPressFired.current = true;
            anchorPopoverToButton(buttonEl);
            setIsTextSettingsOpen(true);
            setIsDesignToolsOpen(false);
            setIsPenSettingsOpen(false);
            setIsEraserSettingsOpen(false);
            setIsColorPickerOpen(false);
          }, 500);
        }}
        onPointerUp={() => clearTimeout(textLongPressTimer.current)}
        onPointerLeave={() => clearTimeout(textLongPressTimer.current)}
        onClick={() => {
          if (textLongPressFired.current) return;
          setPlacingTool((cur) => (cur?.id === "text" ? null : TEXT_TOOL));
          setIsBucketMode(false);
          setIsLassoMode(false);
          setLassoSelection(null);
          setIsEraser(false);
          setIsTextSettingsOpen(false);
        }}
        title={
          placingTool?.id === "text"
            ? "Text ziehen zum Platzieren (Klick zum Abbrechen)"
            : "Text: Klick = Platzieren, Halten = Einstellungen"
        }
        data-testid="text-tool-btn"
      >
        <Type size={18} />
      </button>
      <div className="rail-divider" />
      {customColors.map((c, index) => (
        <ColorSlot
          key={index}
          index={index}
          colorValue={c}
          isActive={penColor === c && !isEraser}
          isEraser={isEraser}
          onSelect={(buttonEl) => {
            if (penColor === c && !isEraser) {
              anchorPopoverToButton(buttonEl);
              setIsColorPickerOpen((prev) => !prev);
              setActivePickerIndex(index);
            } else {
              inkController.setColor?.(c);
              setIsEraser(false);
              setActivePickerIndex(index);
            }
            setIsPenSettingsOpen(false);
          }}
          onOpenPicker={(buttonEl) => {
            anchorPopoverToButton(buttonEl);
            setActivePickerIndex(index);
            setIsColorPickerOpen(true);
            setIsPenSettingsOpen(false);
          }}
        />
      ))}
      <div className="rail-divider" />
      <button
        className={`rail-btn ${isCommentMode ? "active" : ""}`}
        title="Kommentar"
        aria-pressed={isCommentMode}
        data-testid="comment-btn"
        onClick={() => setIsCommentMode((on) => !on)}
      >
        <MessageSquare size={18} />
      </button>
      <div className="rail-divider" />
      <button
        className={`rail-btn ${isSplit ? "active" : ""}`}
        onClick={toggleSplit}
        title={isSplit ? "Geteilte Ansicht ausschalten" : "Geteilte Ansicht (Fokus-Box) einschalten"}
        data-testid="layout-mode-btn"
      >
        <Columns2 size={18} />
      </button>
      <button
        className={`rail-btn ${isLayersOpen ? "active" : ""}`}
        style={{ marginTop: "auto" }}
        title="Ebenen"
        data-testid="layers-toggle-btn"
        onClick={toggleLayers}
      >
        <Layers size={19} />
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={handleImageFile}
      />
    </>
  );

  const inkIndex = whiteboardInkLayerIndex(document);
  const objectLayerProps = {
    pageLayout: objectLayerLayout,
    mapOrigin,
    perObjectTouchAction: false,
    containerOffset: mapOrigin(),
    containerScale: camera.scale,
    selectedId: selectedObjectId,
    editingId: editingObjectId,
    onEditingChange: setEditingObjectId,
    processingObjectId: processingImageId,
    onSelect: handleSelectObject,
    onChange: (id, changes) => inkController.updateObject?.(id, changes),
    onDelete: (id) => inkController.removeObjects?.([id]),
    onRemoveBackground: handleRemoveBackground,
    onRestoreBackground: handleRestoreBackground,
    onToggleLock: inkController.setLayerLock,
    onShiftOrder: inkController.shiftLayerOrder,
    onOpenLayers: openLayers,
    panMode: isSpaceDown,
  };

  // "Öffnen" from the ··· menu / Ctrl+O: the PDF becomes the bottom layer.
  React.useEffect(() => {
    if (!openRequest) return;
    const center = screenToWorld(camera, { x: size.width / 2, y: size.height / 2 });
    (async () => {
      try {
        const pages = await readPdfPages(openRequest.file);
        inkController.applyCommands(
          pdfWhiteboardBackgroundCommands(inkController.getDocument(), pages, center),
        );
      } catch {
        // A file pdf.js cannot read simply opens nothing.
      } finally {
        onOpenHandled?.(openRequest.id);
      }
    })();
  }, [openRequest]);

  return (
    <div
      ref={rootRef}
      className="document-view"
      data-testid="document-view"
      data-document-id={document.documentId}
      style={{
        // A flex child of .split-layout (width from .document-view), so the
        // writing zone lands to its right instead of taking the full row.
        position: "relative",
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
        {/* Objects sent below the ink (an opened PDF) sit under the canvas. */}
        <PageObjectLayer ref={belowLayerRef} objects={pageObjects.slice(0, inkIndex)} {...objectLayerProps} />
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
        {isSplit && focusBox && (() => {
          const at = worldToScreen(camera, focusBox);
          return (
            <div
              className="focus-box"
              data-testid="focus-box"
              role="region"
              aria-label="Fokusbereich"
              style={{
                left: at.x,
                top: at.y,
                width: focusBox.width * camera.scale,
                height: focusBox.height * camera.scale,
                border: "2px solid #1976D2",
                backgroundColor: "rgba(25, 118, 210, 0.1)",
                cursor: "move",
                touchAction: "none",
              }}
              onPointerDown={startFocusBoxDrag}
            />
          );
        })()}
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
        <PageObjectLayer ref={objectLayerRef} objects={pageObjects.slice(inkIndex)} {...objectLayerProps} />
        {isCommentMode && (
          <CommentLayer
            comments={comments}
            locate={mapPoint}
            project={(_pageId, x, y) => worldToScreen(camera, { x, y })}
            onSave={({ id, text, ...point }) => {
              if (id) editComment(id, text);
              else addComment({ ...point, text });
              setIsCommentMode(false);
            }}
            onRemove={removeComment}
          />
        )}
      </div>
      {railSlot ? createPortal(railContent, railSlot) : railContent}
      {isPenSettingsOpen && (
        <PenSettingsPopover
          tool={inkController.tool}
          setTool={inkController.setTool}
          rawLineWidth={inkController.penWidth}
          setLineWidth={inkController.setPenWidth}
          penColor={penColor}
          onClose={() => setIsPenSettingsOpen(false)}
          setIsEraser={setIsEraser}
          inputMode={inputMode}
          setInputMode={inkController.setInputMode}
          top={popoverTop}
        />
      )}
      {isEraserSettingsOpen && (
        <EraserSettingsPopover
          eraserMode={inkController.eraserMode}
          setEraserMode={inkController.setEraserMode}
          eraserWidth={inkController.eraserWidth}
          setEraserWidth={inkController.setEraserWidth}
          onClose={() => setIsEraserSettingsOpen(false)}
          top={popoverTop}
        />
      )}
      {isDesignToolsOpen && (
        <DesignToolsPopover
          onInsert={handleInsertTool}
          onClose={() => setIsDesignToolsOpen(false)}
          top={popoverTop}
        />
      )}
      {isColorPickerOpen && (
        <ColorWheelPopover
          customColors={customColors}
          activePickerIndex={activePickerIndex}
          setActivePickerIndex={setActivePickerIndex}
          onColorChange={handleColorChange}
          onClose={() => setIsColorPickerOpen(false)}
          top={popoverTop}
        />
      )}
      {isLayersOpen &&
        (() => {
          const drawer = (
            <LayerDrawer
              isOpen={isLayersOpen}
              objects={pageObjects}
              inkLayerIndex={inkIndex}
              inkLayerHidden={inkController.inkLayerHidden}
              inkLayerLocked={inkController.inkLayerLocked}
              strokeCount={strokes.length}
              selectedObjectId={selectedObjectId}
              onSelect={(id) => setSelectedObjectId(id === "__ink__" ? null : id)}
              onToggleLock={inkController.setLayerLock}
              onToggleVisibility={inkController.setLayerVisibility}
              onReorder={inkController.reorderLayers}
              onClose={closeLayers}
            />
          );
          return panelSlot ? createPortal(drawer, panelSlot) : drawer;
        })()}
      {isTextSettingsOpen && (
        <TextSettingsPopover
          style={selectedTextObject || textStyle}
          onStyleChange={handleTextStyleChange}
          paperStyle="blank"
          top={popoverTop}
          hasSelection={Boolean(selectedTextObject)}
          onInsert={() => {
            setPlacingTool(TEXT_TOOL);
            setIsTextSettingsOpen(false);
          }}
          onClose={() => setIsTextSettingsOpen(false)}
          top={popoverTop}
        />
      )}
      {isShapeSettingsOpen && selectedShapeObject && (
        <ShapeSettingsPopover
          object={selectedShapeObject}
          onChange={handleShapeStyleChange}
          onClose={() => setIsShapeSettingsOpen(false)}
          top={popoverTop}
        />
      )}
    </div>
  );
}
