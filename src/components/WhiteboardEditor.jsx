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
import { removeImageBackground } from "../ink/imageBackground.js";
import WhiteboardCanvas from "./document/WhiteboardCanvas.jsx";
import LassoSelectionLayer from "./document/LassoSelectionLayer.jsx";
import PageObjectLayer from "./document/PageObjectLayer.jsx";
import { DESIGN_TOOLS, TEXT_TOOL, DesignToolsPopover } from "./DocumentView.jsx";

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
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const pinchCommitRef = useRef(false);
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
    onDraftAppend: (draft, appendedFrom) =>
      canvasControllerRef.current?.appendDraftSegment(draft, appendedFrom),
  });

  useLayoutEffect(() => {
    if (!pinchCommitRef.current) return;
    pinchCommitRef.current = false;
    canvasControllerRef.current?.clearViewportPreview();
  }, [camera]);

  const measureRef = useCallback((node) => {
    containerRef.current = node;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
  }, []);

  const updatePinchPreview = (pinch) => {
    if (!pinch || pinchRef.current !== pinch) return;
    const [a, b] = pinch.pointerIds.map((id) => touchesRef.current.get(id));
    if (!a || !b) return;
    const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
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
    canvasControllerRef.current?.setViewportPreview(
      centerScreen.x - pinch.startCenter.x * ratio,
      centerScreen.y - pinch.startCenter.y * ratio,
      ratio,
    );
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        inkPointer.abortActiveStroke?.(event.pointerId, event.timeStamp);
        const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
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
      setLassoDraft((prev) => ({ ...prev, points: [...prev.points, { x: point.x, y: point.y }] }));
      return;
    }
    inkPointer.onPointerMove(event);
  };

  const handlePointerUp = (event) => {
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
            canvasControllerRef.current?.clearViewportPreview();
          }
        } else {
          canvasControllerRef.current?.clearViewportPreview();
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
        color: inkController.color || "#3E7BD8",
        strokeWidth: inkController.penWidth || 3,
        text: draftPlacement.type === "text" ? (dragged ? "Text" : "") : undefined,
      });
      inkController.addObject?.(object);
      setSelectedObjectId(object.id);
      setDraftPlacement(null);
      setPlacingTool(null);
      return;
    }
    if (lassoDraft && lassoDraft.pointerId === event.pointerId) {
      const polygon = lassoDraft.points;
      if (polygon.length >= 3) {
        const strokeIds = strokesInLasso(strokes, pageId, polygon);
        const objectIds = objectsInLasso(pageObjects, pageId, polygon);
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
    if (event.pointerType === "touch") {
      if (pinchRef.current?.pointerIds.includes(event.pointerId)) {
        if (pinchRef.current.frameId !== null) {
          cancelAnimationFrame(pinchRef.current.frameId);
        }
        canvasControllerRef.current?.clearViewportPreview();
      }
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    }
    inkPointer.onPointerCancel(event);
  };

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const normalizedDeltaX = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
      const normalizedDeltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (event.ctrlKey) {
        const rect = node.getBoundingClientRect();
        const factor = Math.exp(-normalizedDeltaY * 0.0015);
        zoomBy({ x: event.clientX - rect.left, y: event.clientY - rect.top }, factor);
      } else {
        panBy(-normalizedDeltaX, -normalizedDeltaY);
      }
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [panBy, zoomBy]);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if ((event.key === "Delete" || event.key === "Backspace") && lassoSelection) {
        event.preventDefault();
        if (lassoSelection.strokeIds.length > 0) inkController.removeStrokes?.(lassoSelection.strokeIds);
        if (lassoSelection.objectIds.length > 0) inkController.removeObjects?.(lassoSelection.objectIds);
        setLassoSelection(null);
      }
      if (event.key === "Escape") {
        if (lassoSelection) setLassoSelection(null);
        else if (isLassoMode) setIsLassoMode(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lassoSelection, isLassoMode, inkController]);

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
        className={`rail-btn ${placingTool?.id === "text" ? "active" : ""}`}
        onClick={() => {
          setPlacingTool((cur) => (cur?.id === "text" ? null : TEXT_TOOL));
          setIsLassoMode(false);
          setIsBucketMode(false);
        }}
        title="Text"
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
        style={{ position: "absolute", inset: 0, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <WhiteboardCanvas
          ref={canvasControllerRef}
          pageId={pageId}
          strokes={strokes}
          draftStroke={inkPointer.draftStroke}
          camera={camera}
          width={size.width}
          height={size.height}
          dpr={globalThis.devicePixelRatio || 1}
        />
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
          objects={pageObjects}
          pageLayout={fakePageLayout}
          mapOrigin={mapOrigin}
          selectedId={selectedObjectId}
          processingObjectId={processingImageId}
          onSelect={setSelectedObjectId}
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
    </div>
  );
}
