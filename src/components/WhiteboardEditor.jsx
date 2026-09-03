// src/components/WhiteboardEditor.jsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Undo2, Redo2, PenLine, Eraser } from "lucide-react";
import useInkPointer from "../hooks/useInkPointer.js";
import useWhiteboardCamera from "../hooks/useWhiteboardCamera.js";
import { loadPalmProfile, palmGuardFromProfile } from "../ink/palmSettings.js";
import { screenToWorld } from "../ink/whiteboardCoordinates.js";
import WhiteboardCanvas from "./document/WhiteboardCanvas.jsx";

function relativePoint(element, event) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export default function WhiteboardEditor({ inkController, railSlot }) {
  const containerRef = useRef(null);
  const touchesRef = useRef(new Map());
  const pinchRef = useRef(null);
  const [isEraser, setIsEraser] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [liveDraft, setLiveDraft] = useState(null);
  const { camera, panBy, zoomBy, focusWorldPointAtScreen } = useWhiteboardCamera();
  const palmGuard = useMemo(() => palmGuardFromProfile(loadPalmProfile()), []);

  const document = inkController.document;
  const pageId = document.pages[0]?.id || "";
  const strokes = document.strokes;

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
    onDraftAppend: (draft) => {
      setLiveDraft(draft ? { ...draft, points: draft.points.slice() } : null);
    },
  });

  if (!inkPointer.draftStroke && liveDraft) {
    setLiveDraft(null);
  }

  const measureRef = useCallback((node) => {
    containerRef.current = node;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType === "touch") {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2) {
        inkPointer.abortActiveStroke?.(event.pointerId, event.timeStamp);
        const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const [a, b] = Array.from(touchesRef.current.values());
        const centerScreen = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        pinchRef.current = {
          startDistance: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
          startScale: camera.scale,
          worldCenter: screenToWorld(camera, centerScreen),
        };
        return;
      }
      if (touchesRef.current.size > 2) return;
    }
    inkPointer.onPointerDown(event);
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === "touch" && touchesRef.current.has(event.pointerId)) {
      touchesRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchesRef.current.size === 2 && pinchRef.current) {
        const rect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const [a, b] = Array.from(touchesRef.current.values());
        const distance = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1);
        const centerScreen = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const scale = pinchRef.current.startScale * (distance / pinchRef.current.startDistance);
        focusWorldPointAtScreen(pinchRef.current.worldCenter, centerScreen, scale);
        return;
      }
      if (touchesRef.current.size >= 2) return;
    }
    inkPointer.onPointerMove(event);
  };

  const handlePointerUp = (event) => {
    if (event.pointerType === "touch") {
      touchesRef.current.delete(event.pointerId);
      if (touchesRef.current.size < 2) pinchRef.current = null;
    }
    inkPointer.onPointerUp(event);
  };

  const handlePointerCancel = (event) => {
    if (event.pointerType === "touch") {
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
    </>
  );

  return (
    <div
      data-testid="document-view"
      data-document-id={document.documentId}
      style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0B0B0D" }}
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
          pageId={pageId}
          strokes={strokes}
          draftStroke={liveDraft}
          camera={camera}
          width={size.width}
          height={size.height}
          dpr={globalThis.devicePixelRatio || 1}
        />
      </div>
      {railSlot ? createPortal(railContent, railSlot) : railContent}
    </div>
  );
}
