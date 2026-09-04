import { beforeEach, describe, expect, it } from "vitest";
import { createInkDocument, createInkHistory } from "../src/ink/inkDocument.js";
import { renderNotePagesOf } from "../src/documents/notePreview.js";

beforeEach(() => {
  const document = createInkDocument("note-1", 2);
  globalThis.localStorage.setItem(
    "notes-app:ink:note-1",
    JSON.stringify(createInkHistory(document, 2)),
  );
  HTMLCanvasElement.prototype.toDataURL.mockClear();
});

describe("renderNotePagesOf", () => {
  it("rendert standardmäßig PNG ohne Qualitätsangabe", () => {
    renderNotePagesOf("note-1");
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png", undefined);
  });

  it("rendert auf Wunsch JPEG mit Qualität", () => {
    renderNotePagesOf("note-1", { mimeType: "image/jpeg", quality: 0.72 });
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.72);
  });

  it("liefert eine Seite je Seite des Dokuments", () => {
    expect(renderNotePagesOf("note-1")).toHaveLength(2);
  });

  it("liefert eine leere Liste für ein unbekanntes Dokument", () => {
    expect(renderNotePagesOf("gibt-es-nicht")).toEqual([]);
  });
});
