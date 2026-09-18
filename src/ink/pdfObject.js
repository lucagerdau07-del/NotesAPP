import { PAGE_GAP } from "../documents/fileImport.js";
import { MAX_EDGE } from "./imageObject.js";
import { resolveInkLayerIndex, whiteboardInkLayerIndex } from "./inkDocument.js";
import { createPageObject, pageObjectsOf } from "./pageObjects.js";

// ponytail: every page becomes a JPEG data URL inside the note, and notes live
// in localStorage (~5MB for everything), so long PDFs are cut off here. Keep the
// PDF in IndexedDB and render pages on demand if this needs to grow.
export const MAX_PDF_PAGES = 30;

export const isPdfFile = (file) =>
  file?.type === "application/pdf" || /\.pdf$/i.test(file?.name || "");

// width/height are the PDF page's own size in points; src is the render.
export async function readPdfPages(file, limit = MAX_PDF_PAGES) {
  // pdfjs-dist is large, so it only loads once someone actually inserts a PDF.
  const { openPdf } = await import("../documents/pdfRuntime.js");
  const opened = await openPdf(file);
  try {
    const total = opened.document.numPages;
    const pages = [];
    for (let number = 1; number <= Math.min(total, limit); number += 1) {
      const page = await opened.document.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: MAX_EDGE / Math.max(width, height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      // JPEG has no alpha and pdf.js leaves the paper transparent.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      pages.push({ src: canvas.toDataURL("image/jpeg", 0.8), width, height });
      page.cleanup();
    }
    if (limit === MAX_PDF_PAGES && total > pages.length)
      globalThis.alert?.(`Das PDF hat ${total} Seiten, eingefügt wurden die ersten ${pages.length}.`);
    return pages;
  } finally {
    await opened.dispose();
  }
}

// Whiteboard: the pages sit in one column at their own size, the first one
// centered on `center`, the rest below it.
export function pdfWhiteboardObjects(pageId, pages, center, extra = {}) {
  let y = center.y - pages[0].height / 2;
  return pages.map(({ src, width, height }) => {
    const object = createPageObject({
      ...extra,
      pageId,
      type: "image",
      src,
      x: center.x - width / 2,
      y,
      width,
      height,
    });
    y += height + PAGE_GAP;
    return object;
  });
}

// Puts the new objects at the very bottom of the stack, and the ink layer
// above them, so they end up under everything drawn or inserted before.
function underEverything(document, added, inkIndex) {
  return {
    type: "reorder-layers",
    newObjectIds: [...added.map((o) => o.id), ...pageObjectsOf(document).map((o) => o.id)],
    inkLayerIndex: inkIndex + added.length,
  };
}

// Whiteboard "open": the PDF is the locked bottom layer, at its own size.
export function pdfWhiteboardBackgroundCommands(document, pages, center) {
  const objects = pdfWhiteboardObjects(document.pages[0].id, pages, center, { locked: true });
  return [
    ...objects.map((object) => ({ type: "add-object", object })),
    underEverything(document, objects, whiteboardInkLayerIndex(document)),
  ];
}

// Document "open": each PDF page becomes the locked bottom layer of its own
// page, fitted onto it. A still-untouched single page takes the first PDF page
// instead of staying behind as a blank one.
export function pdfPageCommands(document, pages, size) {
  const pristine =
    document.pages.length === 1 &&
    document.strokes.length === 0 &&
    pageObjectsOf(document).length === 0;
  const stamp = Date.now();
  const commands = [];
  const added = [];
  pages.forEach(({ src, width, height }, index) => {
    const reuse = pristine && index === 0;
    const pageId = reuse ? document.pages[0].id : `${document.documentId}-pdf-${stamp}-${index}`;
    const scale = Math.min(size.width / width, size.height / height);
    const object = createPageObject({
      pageId,
      type: "image",
      src,
      x: (size.width - width * scale) / 2,
      y: (size.height - height * scale) / 2,
      width: width * scale,
      height: height * scale,
      locked: true,
    });
    if (!reuse) commands.push({ type: "add-page", page: { id: pageId } });
    commands.push({ type: "add-object", object });
    added.push(object);
  });
  commands.push(underEverything(document, added, resolveInkLayerIndex(document)));
  return commands;
}
