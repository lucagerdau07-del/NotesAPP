import { beforeEach, describe, expect, it } from "vitest";
import { createInkDocument, createInkHistory } from "../src/ink/inkDocument.js";
import { createPageObject } from "../src/ink/pageObjects.js";
import { renderNotePreviewDataUrl } from "../src/documents/notePreview.js";

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
  const doc = createInkDocument("note-img", 1, { kind: "whiteboard" });
  const image = createPageObject({
    pageId: doc.pages[0].id,
    type: "image",
    src: "data:image/png;base64,AAAA",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  globalThis.localStorage.setItem(
    "notes-app:ink:note-img",
    JSON.stringify(createInkHistory({ ...doc, objects: [image] }, 2)),
  );
});

const imagesDrawn = () =>
  HTMLCanvasElement.prototype.getContext.mock.results
    .flatMap((result) => result.value?.drawImage.mock.calls ?? [])
    .filter(([source]) => source instanceof globalThis.Image);

describe("renderNotePreviewDataUrl", () => {
  it("draws an image object once it has decoded, not just the first time", () => {
    renderNotePreviewDataUrl("note-img");
    expect(imagesDrawn()).toHaveLength(0);

    decoding.forEach((image) => image.onload());
    renderNotePreviewDataUrl("note-img");
    expect(imagesDrawn()).toHaveLength(1);
  });
});
