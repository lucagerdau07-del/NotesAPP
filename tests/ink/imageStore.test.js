import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bigImage = `data:image/jpeg;base64,${"A".repeat(300000)}`;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    get size() {
      return [...map.values()].reduce((sum, v) => sum + v.length, 0);
    },
  };
}

// A fresh module graph is a cold app start: empty in-memory image cache.
async function freshModules() {
  vi.resetModules();
  const store = await import("../../src/ink/imageStore.js");
  const { createInkRepository } = await import("../../src/ink/inkRepository.js");
  const ink = await import("../../src/ink/inkDocument.js");
  return { store, createInkRepository, ink };
}

describe("big images live in IndexedDB, not in the note's localStorage blob", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("keeps the saved note small and brings the image back after a cold start", async () => {
    const warm = await freshModules();
    const storage = memoryStorage();
    const repo = warm.createInkRepository(storage);
    let history = warm.ink.createInkHistory(warm.ink.createInkDocument("n1", ["p1"]));
    history = warm.ink.executeInkCommand(history, {
      type: "add-object",
      object: { id: "img", pageId: "p1", type: "image", src: bigImage, x: 0, y: 0, width: 10, height: 10 },
    });

    expect(repo.saveHistory("n1", history)).toBe(true);
    expect(storage.size).toBeLessThan(5000);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const cold = await freshModules();
    const loaded = cold.createInkRepository(storage).loadHistory("n1");
    expect(loaded.present.objects[0].src).toMatch(/^idb:/);
    expect(await cold.store.loadImages(loaded.present)).toBe(true);
    expect(cold.store.hydrateImages(loaded.present).objects[0].src).toBe(bigImage);
  });

  it("leaves small images inline", async () => {
    const { store } = await freshModules();
    const doc = { objects: [{ src: "data:image/png;base64,AAAA" }] };
    expect(store.externalizeImages(doc)).toBe(doc);
  });
});
