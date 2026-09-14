import { jsPDF } from "jspdf";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  renderRegionFromDocument,
  contentBoundsOf,
  flatBackdropColor,
  CONTENT_PADDING,
} from "./notePreview.js";

const EXPORT_MAX_DIMENSION = 2000;
// Text near the bottom of a page can render slightly past its own object's
// declared bounds (see the table-cell-overflow issue) - extra room here
// keeps that overflow from being cropped off, on top of the normal padding
// every other edge gets.
const EXPORT_BOTTOM_PADDING = 40;

export function sanitizeFilename(name) {
  return String(name || "Notiz").trim().replace(/[\\/:*?"<>|]+/g, "_") || "Notiz";
}

// Fit `contentRatio` (width/height) inside a `pageWidth` x `pageHeight` box,
// preserving aspect ratio and centering it - same idea as CSS
// `object-fit: contain`.
export function containInPage(contentRatio, pageWidth, pageHeight) {
  const ratio = contentRatio > 0 ? contentRatio : pageWidth / pageHeight;
  const pageRatio = pageWidth / pageHeight;
  const width = ratio >= pageRatio ? pageWidth : pageHeight * ratio;
  const height = ratio >= pageRatio ? pageWidth / ratio : pageHeight;
  return { width, height, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2 };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Native (Android/iOS): write to the cache directory and hand it to the OS
// share sheet, so the user can save it to Downloads, send it, print it, etc.
// Plain browser (dev preview, no native shell): a normal <a download> link -
// Filesystem/Share have no meaningful target there.
async function saveAndShare(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ url: uri, files: [uri], title: filename });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

// "rgb(r,g,b)" or "#rrggbb"/"#rgb" (flatBackdropColor's two output shapes)
// to a [r,g,b] triple - null for anything else, so callers can fall back.
export function parseRgbColor(color) {
  const rgbMatch = /^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/i.exec(color || "");
  if (rgbMatch) return rgbMatch.slice(1, 4).map(Number);
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || "");
  if (!hexMatch) return null;
  const hex = hexMatch[1];
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [full.slice(0, 2), full.slice(2, 4), full.slice(4, 6)].map((h) => parseInt(h, 16));
}

// A page's own nominal size (normal notes) or a small fallback (a truly
// empty whiteboard, which has no nominal size at all) - only used when the
// page has no drawn content to crop to.
function nominalPageBounds(page) {
  if (Number.isFinite(page.width) && Number.isFinite(page.height))
    return { minX: 0, minY: 0, maxX: page.width, maxY: page.height };
  return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
}

// Every page cropped to what's actually drawn on it, padded - a normal note
// page's nominal A4 size is otherwise mostly blank paper, which exported as
// a full page reads as a wide white/paper border around the real content.
// Whiteboards already have no nominal size, so this is the same crop they
// always got; normal pages now get it too.
function exportPagesOf(inkDoc, options) {
  return inkDoc.pages.map((page) => {
    const bounds = contentBoundsOf(inkDoc, page.id);
    const rect = bounds
      ? {
          minX: bounds.minX - CONTENT_PADDING,
          minY: bounds.minY - CONTENT_PADDING,
          maxX: bounds.maxX + CONTENT_PADDING,
          maxY: bounds.maxY + EXPORT_BOTTOM_PADDING,
        }
      : nominalPageBounds(page);
    return {
      id: page.id,
      hasContent: Boolean(bounds),
      src: renderRegionFromDocument(inkDoc, page.id, rect, options),
      aspectRatio: (rect.maxX - rect.minX) / Math.max(1, rect.maxY - rect.minY),
      background: page.background,
    };
  });
}

// One page, full resolution, as a PNG - cropped to its own drawn content.
export async function exportPageAsPng(inkDoc, pageId, filenameBase) {
  const pages = exportPagesOf(inkDoc, {
    maxDimension: EXPORT_MAX_DIMENSION,
    mimeType: "image/png",
    paintBackground: true,
  });
  const page = pages.find((p) => p.id === pageId) || pages[0];
  if (!page?.src) throw new Error("Nothing to export");
  const blob = await dataUrlToBlob(page.src);
  await saveAndShare(blob, `${sanitizeFilename(filenameBase)}.png`);
}

// Every page of the document, cropped to its own content and fit onto a
// standard A4 page. A blank trailing page (e.g. one auto-created by
// scrolling past the last used page but never drawn on) has no content to
// crop to - including it anyway would render as a big blank block at the end
// of the PDF, so it's left out entirely rather than falling back to its full
// nominal size.
//
// Every page is real A4 (jsPDF's own "a4" format, not a custom size fit to
// each image's aspect ratio) because some share targets (e.g. re-saving
// through certain Android apps) silently normalize an odd-sized PDF page to
// A4 themselves, shrinking and top-aligning the content in the process and
// leaving an unfilled - and un-paintable, since it happens outside this
// code - white strip on whichever side didn't reach the new page edge.
// Starting from A4 means that normalization is a no-op. The image is fit
// inside (not stretched to fill) and centered, like CSS object-fit: contain.
export async function exportDocumentAsPdf(inkDoc, filenameBase) {
  const allPages = exportPagesOf(inkDoc, {
    maxDimension: EXPORT_MAX_DIMENSION,
    mimeType: "image/jpeg",
    quality: 0.92,
    paintBackground: true,
  }).filter((page) => page.src);
  const pages = allPages.some((page) => page.hasContent)
    ? allPages.filter((page) => page.hasContent)
    : allPages;
  if (!pages.length) throw new Error("Nothing to export");

  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage("a4");
    const rgb = parseRgbColor(flatBackdropColor(page.background)) || [255, 255, 255];
    pdf.setFillColor(...rgb);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    const { x, y, width, height } = containInPage(page.aspectRatio, pageWidth, pageHeight);
    pdf.addImage(page.src, "JPEG", x, y, width, height);
  });
  await saveAndShare(pdf.output("blob"), `${sanitizeFilename(filenameBase)}.pdf`);
}
