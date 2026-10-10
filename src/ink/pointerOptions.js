import { tryRecognizeLink } from "./linkRecognizer.js";

// Tool name useInkPointer runs with: the eraser flavor beats the pen type.
export function resolveInkTool({ isEraser, eraserMode, tool }) {
  if (isEraser) return eraserMode === "stroke" ? "stroke-eraser" : "pixel-eraser";
  return tool || "pen";
}

// What useInkPointer writes through, same for every editor that draws on the
// document. A locked ink layer swallows every write, so a stroke or an erase
// aimed at it leaves the document alone.
export function inkWriteOptions(inkController) {
  const locked = Boolean(inkController?.inkLayerLocked);
  const noop = () => {};
  return {
    commitStroke: locked ? noop : inkController?.commitStroke,
    removeStrokes: locked ? noop : inkController?.removeStrokes,
    removeObjects: locked ? noop : inkController?.removeObjects,
    addObject: locked ? undefined : inkController?.addObject,
    onHoldWithoutShape: locked ? undefined : (stroke) => tryRecognizeLink(stroke, inkController),
  };
}
