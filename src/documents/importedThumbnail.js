import { openImage } from "./imageRuntime.js";

// Same box the library card shows (320x150 CSS px, 2x) - the top of page one,
// scaled to the card's width and cropped below, like renderNotePreviewDataUrl.
const WIDTH = 640;
const HEIGHT = 300;

export async function renderImportedThumbnail(blob, type) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  // JPEG has no alpha and pdf.js leaves the paper transparent.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (type === "pdf") {
    const { openPdf } = await import("./pdfRuntime.js");
    const opened = await openPdf(blob);
    try {
      const page = await opened.document.getPage(1);
      const scale = WIDTH / page.getViewport({ scale: 1 }).width;
      await page.render({ canvasContext: context, viewport: page.getViewport({ scale }) }).promise;
      page.cleanup();
    } finally {
      await opened.dispose();
    }
  } else {
    const opened = await openImage(blob);
    try {
      context.drawImage(opened.image, 0, 0, WIDTH, (opened.height * WIDTH) / opened.width);
    } finally {
      opened.dispose();
    }
  }
  return canvas.toDataURL("image/jpeg", 0.75);
}

// Textbooks show as a portrait cover on the shelf: the whole first page.
const COVER_WIDTH = 360;

export async function renderBookCover(blob) {
  const { openPdf } = await import("./pdfRuntime.js");
  const opened = await openPdf(blob);
  try {
    const page = await opened.document.getPage(1);
    const viewport = page.getViewport({ scale: COVER_WIDTH / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement("canvas");
    canvas.width = COVER_WIDTH;
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    await opened.dispose();
  }
}
