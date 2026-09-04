import { describe, it, expect } from "vitest";
import {
  createInkDocument,
  executeInkCommand,
  resolveInkLayerIndex,
} from "../../src/ink/inkDocument.js";
import { createPageObject } from "../../src/ink/pageObjects.js";

describe("Layer Management Commands", () => {
  it("resolves default inkLayerIndex for legacy documents", () => {
    const doc = createInkDocument({
      objects: [
        createPageObject({ type: "fill", id: "fill-1" }),
        createPageObject({ type: "image", id: "img-1" }),
      ],
    });
    // Fill should be below ink, image above ink
    expect(resolveInkLayerIndex(doc)).toBe(1);
  });

  it("reorders objects and updates inkLayerIndex with undo/redo", () => {
    const o1 = createPageObject({ type: "image", id: "img-1" });
    const o2 = createPageObject({ type: "text", id: "txt-1" });
    let history = {
      past: [],
      present: createInkDocument({ objects: [o1, o2], inkLayerIndex: 1 }),
      future: [],
    };

    history = executeInkCommand(history, {
      type: "reorder-layers",
      newObjectIds: ["txt-1", "img-1"],
      inkLayerIndex: 0,
    });

    expect(history.present.objects.map((o) => o.id)).toEqual(["txt-1", "img-1"]);
    expect(history.present.inkLayerIndex).toBe(0);

    // Undo restores previous order and inkLayerIndex
    history = executeInkCommand(history, { type: "undo" });
    expect(history.present.objects.map((o) => o.id)).toEqual(["img-1", "txt-1"]);
    expect(history.present.inkLayerIndex).toBe(1);
  });

  it("toggles layer lock and visibility for objects and ink", () => {
    const o1 = createPageObject({ type: "image", id: "img-1" });
    let history = {
      past: [],
      present: createInkDocument({ objects: [o1] }),
      future: [],
    };

    // Lock object
    history = executeInkCommand(history, {
      type: "set-layer-lock",
      target: "object",
      objectId: "img-1",
      locked: true,
    });
    expect(history.present.objects[0].locked).toBe(true);

    // Hide ink layer
    history = executeInkCommand(history, {
      type: "set-layer-visibility",
      target: "ink",
      hidden: true,
    });
    expect(history.present.inkLayerHidden).toBe(true);

    // Lock ink layer
    history = executeInkCommand(history, {
      type: "set-layer-lock",
      target: "ink",
      locked: true,
    });
    expect(history.present.inkLayerLocked).toBe(true);
  });

  it("shifts layer order forward, backward, to front, and to back", () => {
    const o1 = createPageObject({ type: "image", id: "1" });
    const o2 = createPageObject({ type: "image", id: "2" });
    const o3 = createPageObject({ type: "image", id: "3" });
    let history = {
      past: [],
      present: createInkDocument({ objects: [o1, o2, o3], inkLayerIndex: 2 }),
      future: [],
    };

    // Shift "1" to front
    history = executeInkCommand(history, {
      type: "shift-layer-order",
      objectId: "1",
      direction: "front",
    });
    expect(history.present.objects.map((o) => o.id)).toEqual(["2", "3", "1"]);

    // Shift "1" (now at index 2) backward by 1
    history = executeInkCommand(history, {
      type: "shift-layer-order",
      objectId: "1",
      direction: "backward",
    });
    expect(history.present.objects.map((o) => o.id)).toEqual(["2", "1", "3"]);

    // Shift "1" to back
    history = executeInkCommand(history, {
      type: "shift-layer-order",
      objectId: "1",
      direction: "back",
    });
    expect(history.present.objects.map((o) => o.id)).toEqual(["1", "2", "3"]);
  });
});
