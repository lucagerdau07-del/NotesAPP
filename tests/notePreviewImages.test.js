import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInkDocument, createInkHistory } from "../src/ink/inkDocument.js";
import { createPageObject } from "../src/ink/pageObjects.js";
import {
  renderNotePreviewDataUrl,
  subscribeToPreviewImages,
} from "../src/documents/notePreview.js";

// Decoding an <img> is async, so the first thumbnail render of a note with an
// image has to skip it; the card must pick the image up once it has decoded.
let decoding;
beforeEach(() => {
  decoding = [];
  globalThis.Image = class {
    naturalWidth = 100;
    naturalHeight = 100;
    set src(value) {
      this.currentSrc = value;
      decoding.push(this);
    }
  };
});

// Decoded images are cached by src for the whole file, so every test stores
// its own note with its own image.
function storeNoteWithImage(id, src) {
  const doc = createInkDocument(id, 1, { kind: "whiteboard" });
  const image = createPageObject({
    pageId: doc.pages[0].id,
    type: "image",
    src,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  globalThis.localStorage.setItem(
    `notes-app:ink:${id}`,
    JSON.stringify(createInkHistory({ ...doc, objects: [image] }, 2)),
  );
}

const imagesDrawn = () =>
  HTMLCanvasElement.prototype.getContext.mock.results
    .flatMap((result) => result.value?.drawImage.mock.calls ?? [])
    .filter(([source]) => source instanceof globalThis.Image);
const encodes = () => HTMLCanvasElement.prototype.toDataURL.mock.calls.length;
const idle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("renderNotePreviewDataUrl", () => {
  it("draws an image object once it has decoded, off the render path", async () => {
    storeNoteWithImage("note-img", "data:image/png;base64,AAAA");
    renderNotePreviewDataUrl("note-img");
    expect(imagesDrawn()).toHaveLength(0);

    const repaint = vi.fn();
    const unsubscribe = subscribeToPreviewImages(repaint);
    decoding.forEach((image) => image.onload());
    repaint.mockClear();

    // Not inside the render that asks: right after startup every such redraw
    // lands in the same render, one ~0.8s block on a Galaxy Tab A7.
    const before = encodes();
    renderNotePreviewDataUrl("note-img");
    expect(encodes()).toBe(before);

    await idle();
    expect(imagesDrawn()).toHaveLength(1);
    expect(repaint).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps an incomplete thumbnail until an image it skipped has decoded", () => {
    storeNoteWithImage("note-img-2", "data:image/png;base64,BBBB");
    renderNotePreviewDataUrl("note-img-2");
    const before = encodes();
    renderNotePreviewDataUrl("note-img-2");
    expect(encodes()).toBe(before);
  });
});
