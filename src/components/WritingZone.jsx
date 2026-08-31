import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import useInkPointer from "../hooks/useInkPointer";
import { mapFocusPoint } from "../ink/pageCoordinates";
import { renderInkStroke, resizeInkCanvas } from "../ink/renderInk";

const emptyDocument = { pages: [], strokes: [] };

function canvasRect(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

export default function WritingZone({
  inkController,
  focusBoxState,
  toolbarState,
}) {
  const canvasRef = useRef(null);
  const redrawInkCanvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const focusBox = focusBoxState?.focusBox;
  const inkDocument = inkController?.document || emptyDocument;
  const {
    color,
    rawColor,
    tool,
    lineWidth,
    rawLineWidth,
    eraserWidth,
    isEraser,
    paperStyle = "blank",
    showPageBreaks,
  } = toolbarState || {};
  const inkTool = isEraser
    ? inkController?.eraserMode === "stroke"
      ? "stroke-eraser"
      : "pixel-eraser"
    : tool || "pen";

  const mapPoint = useCallback(
    (event) => {
      const rect = canvasRect(canvasRef.current);
      if (!rect || !focusBox) return null;
      return mapFocusPoint(
        focusBox,
        { width: rect.width, height: rect.height },
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
      );
    },
    [focusBox],
  );

  const inkPointer = useInkPointer({
    inputMode: inkController?.inputMode || "stylus",
    tool: inkTool,
    eraserMode: inkController?.eraserMode || "pixel",
    color: rawColor ?? color ?? "#EFECE4",
    width: isEraser ? eraserWidth || 15 : (rawLineWidth ?? lineWidth ?? 3),
    mapPoint,
    document: inkDocument,
    commitStroke: inkController?.commitStroke,
    removeStrokes: inkController?.removeStrokes,
    onDraftAppend: () => redrawInkCanvasRef.current?.(),
  });

  redrawInkCanvasRef.current = () => {
    const canvas = canvasRef.current;
    const rect = canvasRect(canvas);
    if (!canvas || !rect) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = globalThis.devicePixelRatio || 1;
    resizeInkCanvas(canvas, rect.width, rect.height, dpr);
    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    if (focusBox && focusBox.width > 0 && focusBox.height > 0) {
      const scaleX = rect.width / focusBox.width;
      const scaleY = rect.height / focusBox.height;
      const visibleStrokes = inkDocument.strokes.filter(
        (stroke) => stroke.pageId === focusBox.pageId,
      );
      if (
        inkPointer.draftStroke &&
        inkPointer.draftStroke.pageId === focusBox.pageId &&
        inkTool !== "stroke-eraser"
      ) {
        visibleStrokes.push(inkPointer.draftStroke);
      }
      visibleStrokes.forEach((stroke) =>
        renderInkStroke(context, stroke, {
          offsetX: -focusBox.x * scaleX,
          offsetY: -focusBox.y * scaleY,
          scaleX,
          scaleY,
        }),
      );
    }

    context.restore();
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const redraw = () => {
      const rect = canvasRect(canvas);
      if (rect) {
        setCanvasSize((current) =>
          current.width === rect.width && current.height === rect.height
            ? current
            : { width: rect.width, height: rect.height },
        );
      }
      redrawInkCanvasRef.current?.();
    };

    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [focusBox, inkDocument, inkPointer.draftStroke, inkTool]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return undefined;
    let mediaQuery = null;
    let disposed = false;

    const removeListener = () => {
      if (!mediaQuery) return;
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleDprChange);
      } else {
        mediaQuery.removeListener?.(handleDprChange);
      }
    };
    const observeCurrentDpr = () => {
      removeListener();
      if (disposed) return;
      const dpr = globalThis.devicePixelRatio || 1;
      mediaQuery = globalThis.matchMedia(`(resolution: ${dpr}dppx)`);
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleDprChange);
      } else {
        mediaQuery.addListener?.(handleDprChange);
      }
    };
    function handleDprChange() {
      redrawInkCanvasRef.current?.();
      observeCurrentDpr();
    }

    observeCurrentDpr();
    return () => {
      disposed = true;
      removeListener();
    };
  }, []);

  const focusWidth = focusBox?.width > 0 ? focusBox.width : 1;
  const focusHeight = focusBox?.height > 0 ? focusBox.height : 1;
  const focusAspectRatio = focusWidth / focusHeight;
  const scaleX = canvasSize.width / focusWidth;
  const scaleY = canvasSize.height / focusHeight;
  const offsetX = focusBox ? -(focusBox.x * scaleX) : 0;
  const offsetY = focusBox ? -(focusBox.y * scaleY) : 0;
  const baseWidth = 800;

  const getPadBackgroundStyles = () => {
    if (paperStyle === "blank") {
      return {
        backgroundImage: "none",
        backgroundSize: "auto",
        backgroundPosition: "0px 0px",
      };
    }

    const marginLineLeft = `linear-gradient(to right, transparent, transparent calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px + 1px), transparent calc(${80 * scaleX}px + 1px))`;
    const marginLineRight = `linear-gradient(to left, transparent, transparent calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px - 1px), rgba(255,255,255,.14) calc(${80 * scaleX}px + 1px), transparent calc(${80 * scaleX}px + 1px))`;
    const horizLines =
      "linear-gradient(to bottom, transparent, transparent calc(100% - 1px), rgba(255,255,255,.14) calc(100% - 1px), rgba(255,255,255,.14) 100%)";
    const vertLines =
      "linear-gradient(to right, transparent, transparent calc(100% - 1px), rgba(255,255,255,.14) calc(100% - 1px), rgba(255,255,255,.14) 100%)";

    if (paperStyle === "lined") {
      return {
        backgroundImage: `${marginLineLeft}, ${marginLineRight}, ${horizLines}`,
        backgroundSize: `${baseWidth * scaleX}px 100%, ${baseWidth * scaleX}px 100%, 100% ${40 * scaleY}px`,
        backgroundPosition: `${offsetX}px 0px, ${offsetX}px 0px, 0px ${offsetY}px`,
        backgroundRepeat: "no-repeat, no-repeat, repeat-y",
      };
    }
    if (paperStyle === "grid") {
      return {
        backgroundImage: `${marginLineLeft}, ${marginLineRight}, ${horizLines}, ${vertLines}`,
        backgroundSize: `${baseWidth * scaleX}px 100%, ${baseWidth * scaleX}px 100%, 100% ${20 * scaleY}px, ${20 * scaleX}px 100%`,
        backgroundPosition: `${offsetX}px 0px, ${offsetX}px 0px, 0px ${offsetY}px, ${offsetX}px 0px`,
        backgroundRepeat: "no-repeat, no-repeat, repeat, repeat",
      };
    }
    return { backgroundImage: "none" };
  };

  const padPageHeight = 800 * 1.414 * scaleY;
  const maskImage = showPageBreaks
    ? `linear-gradient(to bottom, black 0px, black ${padPageHeight - 16 * scaleY}px, transparent ${padPageHeight - 16 * scaleY}px, transparent ${padPageHeight}px)`
    : "none";
  const maskSize = showPageBreaks ? `100% ${padPageHeight}px` : "auto";
  const maskPosition = showPageBreaks ? `0px ${offsetY}px` : "0px 0px";
  const maskRepeat = showPageBreaks ? "repeat-y" : "repeat";
  const paperBgColor = paperStyle === "grid" ? "#1a1820" : "#1D1B21";

  return (
    <div
      className="writing-zone"
      data-testid="writing-zone"
      data-document-id={inkController?.document?.documentId}
      data-input-mode={inkController?.inputMode}
      data-eraser-mode={inkController?.eraserMode}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0f0e11",
        backgroundImage: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "100%",
          maxHeight: "100%",
          width: "100%",
          height: "auto",
          aspectRatio: focusAspectRatio,
          filter: "drop-shadow(0 0 10px rgba(0,0,0,0.15))",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: paperBgColor,
            WebkitMaskImage: maskImage,
            maskImage,
            WebkitMaskSize: maskSize,
            maskSize,
            WebkitMaskPosition: maskPosition,
            maskPosition,
            WebkitMaskRepeat: maskRepeat,
            maskRepeat,
            ...getPadBackgroundStyles(),
          }}
        >
          <canvas
            ref={canvasRef}
            data-testid="focus-ink-canvas"
            onPointerDown={inkPointer.onPointerDown}
            onPointerMove={inkPointer.onPointerMove}
            onPointerUp={inkPointer.onPointerUp}
            onPointerCancel={inkPointer.onPointerCancel}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              touchAction: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}
