import { browserInkRepository } from "../ink/inkRepository.js";
import { objectBounds, pageObjectsOf } from "../ink/pageObjects.js";
import { renderInkStroke } from "../ink/renderInk.js";
import { fontStackOf } from "../ink/textStyle.js";

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 150;
const THUMB_DPR = 2;
// Breathing room around the content, in page units, before it's scaled to
// fit - otherwise a stroke or text box starting right at its own edge would
// touch the thumbnail's border.
const CONTENT_PADDING = 24;
// A single short word or tiny doodle would otherwise get blown up to fill
// the whole thumbnail; capping how far this ever scales UP keeps that
// readable instead of oversized. Scaling down to fit has no such cap.
const MAX_SCALE = 3;

function firstPageOf(inkDoc) {
  return inkDoc?.pages?.[0]?.id;
}

// The library card's thumbnail needs the note's real paper color behind the
// ink render - a fixed dark background made a light-paper note's (usually
// dark) ink invisible against it. The ruling itself is drawn into the
// canvas image (see drawRuling) rather than laid on as a separate CSS
// pattern: the ink content is scaled to fit+center per note, and a CSS
// background tiles at a fixed pixel size regardless of that scale, so the
// two would drift out of alignment with each other.
export function notePageStyleOf(documentId) {
  const inkDoc = browserInkRepository.loadHistory(documentId)?.present;
  return { background: inkDoc?.pages?.[0]?.background || "#0e0e12" };
}

// Mirrors DocumentView's getStaticBackgroundStyles() - same spacing and
// pixel offsets, but as canvas strokes drawn inside the content's own
// scale+pan transform, so the rules land under a snapped text baseline (or
// a drawn square) exactly the way the real page's CSS ruling would.
function drawRuling(context, page, scale, view) {
  if (!page.ruling || page.ruling === "blank") return;
  const linesRgb = page.linesRgb || "255,255,255";
  const lineOpacity = page.lineOpacity ?? 0.07;
  const gridOpacity = page.gridOpacity ?? 0.065;
  const hairline = 1 / scale;

  const drawLine = (x1, y1, x2, y2) => {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  };

  if (page.ruling === "lined" || page.ruling === "grid") {
    const spacing = page.ruling === "lined" ? 34 : 24;
    context.strokeStyle = `rgba(${linesRgb},${page.ruling === "lined" ? lineOpacity : gridOpacity})`;
    context.lineWidth = hairline;
    const first = 92 + Math.ceil((view.minY - 92) / spacing) * spacing;
    for (let y = first; y <= view.maxY; y += spacing) drawLine(view.minX, y, view.maxX, y);
  }
  if (page.ruling === "grid") {
    context.strokeStyle = `rgba(${linesRgb},${gridOpacity})`;
    context.lineWidth = hairline;
    const first = 88 + Math.ceil((view.minX - 88) / 24) * 24;
    for (let x = first; x <= view.maxX; x += 24) drawLine(x, view.minY, x, view.maxY);
  }
  if (page.ruling === "dotted") {
    context.fillStyle = `rgba(${linesRgb},.18)`;
    const firstY = 92 + Math.ceil((view.minY - 92) / 24) * 24;
    const firstX = 16 + Math.ceil((view.minX - 16) / 24) * 24;
    for (let y = firstY; y <= view.maxY; y += 24) {
      for (let x = firstX; x <= view.maxX; x += 24) {
        context.beginPath();
        context.arc(x, y, 1.2 / scale, 0, Math.PI * 2);
        context.fill();
      }
    }
  }
}

// The smallest box containing every stroke point and object on the page, in
// page units - null when the page is empty. Driving the thumbnail's scale
// and offset off this (instead of always cropping from the page's own 0,0
// origin) is what keeps content centered and unclipped regardless of where
// on the page it was actually drawn.
function contentBoundsOf(inkDoc, pageId) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  (inkDoc.strokes || [])
    .filter((stroke) => stroke.pageId === pageId)
    .forEach((stroke) => {
      stroke.points.forEach((point) => {
        if (point.x < minX) minX = point.x;
        if (point.x > maxX) maxX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.y > maxY) maxY = point.y;
      });
    });

  pageObjectsOf(inkDoc)
    .filter((object) => object.pageId === pageId)
    .forEach((object) => {
      const bounds = objectBounds(object);
      if (bounds.x < minX) minX = bounds.x;
      if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
      if (bounds.y < minY) minY = bounds.y;
      if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
    });

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// The topmost non-empty text object on a note's first page, so a list-view
// row (no room for a thumbnail image) still shows real content instead of a
// generic label. Freehand ink strokes aren't OCR'd, so a note with drawing
// but no text box falls back to the caller's default.
export function previewTextOf(documentId) {
  const inkDoc = browserInkRepository.loadHistory(documentId)?.present;
  const pageId = firstPageOf(inkDoc);
  if (!pageId) return "";
  const topText = pageObjectsOf(inkDoc)
    .filter(
      (object) =>
        object.type === "text" && object.pageId === pageId && object.text.trim(),
    )
    .sort((a, b) => a.y - b.y)[0];
  return topText?.text.trim().slice(0, 200) || "";
}

function drawPreviewObject(context, object) {
  if (object.type === "text") {
    if (!object.text.trim()) return;
    context.save();
    context.fillStyle = object.color;
    context.font = `${object.bold ? "700" : "400"} ${object.italic ? "italic " : ""}${object.fontSize}px ${fontStackOf(object.fontFamily)}`;
    context.textBaseline = "top";
    const lineHeight = object.lineHeight || object.fontSize * 1.25;
    String(object.text)
      .split("\n")
      .forEach((line, index) => context.fillText(line, object.x, object.y + index * lineHeight));
    context.restore();
    return;
  }

  const left = Math.min(object.x, object.x + object.width);
  const top = Math.min(object.y, object.y + object.height);
  const w = Math.abs(object.width);
  const h = Math.abs(object.height);
  context.save();
  context.strokeStyle = object.color;
  context.fillStyle = object.fillColor || object.color;
  context.lineWidth = Math.max(1, object.strokeWidth);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (object.type === "rect") {
    context.beginPath();
    if (typeof context.roundRect === "function")
      context.roundRect(left, top, w, h, Math.min(6, w / 2, h / 2));
    else context.rect(left, top, w, h);
    if (object.fillColor) context.fill();
    context.stroke();
  } else if (object.type === "ellipse") {
    context.beginPath();
    context.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (object.fillColor) context.fill();
    context.stroke();
  } else if (object.type === "line" || object.type === "arrow") {
    context.beginPath();
    context.moveTo(object.x, object.y);
    context.lineTo(object.x + object.width, object.y + object.height);
    context.stroke();
  }
  // "image"/"link"/"fill" objects are skipped - async asset loading isn't
  // worth it for a small library thumbnail (ponytail: revisit if notes built
  // mostly from pasted images end up with blank previews).
  context.restore();
}

// Renders one page (strokes + shapes/text + ruling) into a PNG data URL at
// the given pixel size, transform, and visible content-space rectangle.
// Ink and ruling are drawn on separate transparent layers, exactly like the
// real page (ruling behind, an ink canvas on top): an eraser stroke uses
// "destination-out" and would otherwise punch it right through the ruling
// too if both shared one canvas.
function renderComposite({ inkDoc, page, pixelWidth, pixelHeight, dpr, scale, offsetX, offsetY, view, mimeType = "image/png", quality }) {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const inkCanvas = document.createElement("canvas");
  inkCanvas.width = pixelWidth;
  inkCanvas.height = pixelHeight;
  const inkContext = inkCanvas.getContext("2d");
  if (!inkContext) return "";

  const applyContentTransform = (ctx) => {
    ctx.scale(dpr, dpr);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
  };

  inkContext.save();
  applyContentTransform(inkContext);
  (inkDoc.strokes || [])
    .filter((stroke) => stroke.pageId === page.id)
    .forEach((stroke) =>
      renderInkStroke(inkContext, stroke, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }),
    );
  pageObjectsOf(inkDoc)
    .filter((object) => object.pageId === page.id)
    .forEach((object) => drawPreviewObject(inkContext, object));
  inkContext.restore();

  context.save();
  applyContentTransform(context);
  drawRuling(context, page, scale, view);
  context.restore();
  context.drawImage(inkCanvas, 0, 0);

  return canvas.toDataURL(mimeType, quality);
}

// A real render of a note's own ink strokes and shapes/text - not a
// description of them - for the library card thumbnail. Only the top of the
// content is shown: it's scaled so the content's own width fits (so a line
// that starts mid-page doesn't run off the edge) and anchored to the top,
// then whatever falls below the thumbnail's height is simply cropped -
// never shrunk to cram the whole page in.
export function renderNotePreviewDataUrl(documentId) {
  const inkDoc = browserInkRepository.loadHistory(documentId)?.present;
  const pageId = firstPageOf(inkDoc);
  const bounds = pageId ? contentBoundsOf(inkDoc, pageId) : null;
  const page = inkDoc?.pages?.[0];
  if (!bounds || !page) return "";

  const contentWidth = bounds.maxX - bounds.minX + CONTENT_PADDING * 2;
  const scale = Math.min(THUMB_WIDTH / contentWidth, MAX_SCALE);
  // Centers the content horizontally; anchors it to the top vertically
  // (content's own top, plus a little padding) instead of centering it.
  const offsetX =
    (THUMB_WIDTH - contentWidth * scale) / 2 - (bounds.minX - CONTENT_PADDING) * scale;
  const offsetY = (CONTENT_PADDING - bounds.minY) * scale;

  return renderComposite({
    inkDoc,
    page,
    pixelWidth: THUMB_WIDTH * THUMB_DPR,
    pixelHeight: THUMB_HEIGHT * THUMB_DPR,
    dpr: THUMB_DPR,
    scale,
    offsetX,
    offsetY,
    view: {
      minX: -offsetX / scale,
      maxX: (THUMB_WIDTH - offsetX) / scale,
      minY: -offsetY / scale,
      maxY: (THUMB_HEIGHT - offsetY) / scale,
    },
  });
}

const FULL_PAGE_DPR = 2;
// The rendered image's longer side, in CSS px - the container sizes itself
// to the page's real aspect ratio (see NoteDetailPanel), so this only sets
// resolution, not the shape shown on screen.
const FULL_PAGE_MAX_DIMENSION = 640;

// The full page area for a given page id, in page units - not the drawn
// content's bounding box. A normal page has a fixed size (from
// resolvePageStyle at creation); a whiteboard page doesn't, so it falls
// back to its own content's bounds, padded, as the closest thing it has to
// a "whole page".
function fullPageBounds(inkDoc, page) {
  if (Number.isFinite(page.width) && Number.isFinite(page.height))
    return { minX: 0, minY: 0, maxX: page.width, maxY: page.height };
  const bounds = contentBoundsOf(inkDoc, page.id);
  if (!bounds) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  return {
    minX: bounds.minX - CONTENT_PADDING,
    minY: bounds.minY - CONTENT_PADDING,
    maxX: bounds.maxX + CONTENT_PADDING,
    maxY: bounds.maxY + CONTENT_PADDING,
  };
}

// One full page (the whole page area, not just the top) - used by the note
// detail view, which has room to show a page in full and to swipe between
// several of them (see renderNotePagesOf).
function renderFullPage(inkDoc, page, { maxDimension = FULL_PAGE_MAX_DIMENSION, mimeType, quality } = {}) {
  const { minX, minY, maxX, maxY } = fullPageBounds(inkDoc, page);
  const pageWidth = Math.max(1, maxX - minX);
  const pageHeight = Math.max(1, maxY - minY);
  const scale = maxDimension / Math.max(pageWidth, pageHeight);

  return renderComposite({
    inkDoc,
    page,
    pixelWidth: Math.round(pageWidth * scale * FULL_PAGE_DPR),
    pixelHeight: Math.round(pageHeight * scale * FULL_PAGE_DPR),
    dpr: FULL_PAGE_DPR,
    scale,
    offsetX: -minX * scale,
    offsetY: -minY * scale,
    view: { minX, minY, maxX, maxY },
    mimeType,
    quality,
  });
}

// Every page of a note, whole (not cropped), each with its own aspect
// ratio, for the note detail view's swipeable page gallery.
// Optionen: die Detailansicht nimmt die Vorgaben (PNG, 640 px), der
// Dokumentscan fordert JPEG bei 1000 px an - als Base64 in einer HTTP-Anfrage
// ist PNG bei voller Auflösung rund eine Größenordnung zu groß.
export function renderNotePagesOf(documentId, options = {}) {
  if (typeof document === "undefined") return [];
  const inkDoc = browserInkRepository.loadHistory(documentId)?.present;
  if (!inkDoc) return [];
  return inkDoc.pages.map((page) => {
    const { minX, minY, maxX, maxY } = fullPageBounds(inkDoc, page);
    return {
      id: page.id,
      src: renderFullPage(inkDoc, page, options),
      background: page.background || "#0e0e12",
      aspectRatio: (maxX - minX) / Math.max(1, maxY - minY),
    };
  });
}
