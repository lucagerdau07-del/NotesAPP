import { describe, expect, it, vi } from "vitest";
import {
  cullCaptureToGlass,
  recaptureBackgroundOnChange,
  samplesEachOther,
  SNAPSHOT_MAX_EDGE,
  thumbnailCanvasClones,
} from "../src/hooks/useLiquidGlass";

function boxed(left, top, width, height) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  });
  return element;
}

describe("samplesEachOther", () => {
  it("is true only for controls that overlap another glass control", () => {
    const rail = boxed(8, 12, 467, 378);
    const pill = boxed(600, 12, 200, 40);
    const overlapping = boxed(400, 12, 200, 40);

    expect(samplesEachOther(rail, [rail, pill])).toBe(false);
    expect(samplesEachOther(rail, [rail, overlapping])).toBe(true);
    expect(samplesEachOther(rail, [rail])).toBe(false);
  });
});

describe("cullCaptureToGlass", () => {
  it("leaves page objects far from every glass panel out of the capture", async () => {
    const rail = boxed(0, 0, 100, 700);
    const body = boxed(0, 0, 1300, 700);
    const behindRail = boxed(60, 100, 200, 50);
    behindRail.setAttribute("data-object-id", "near");
    const farAway = boxed(700, 100, 200, 50);
    farAway.setAttribute("data-object-id", "far");
    body.append(behindRail, farAway);

    const rendered = { width: 1300, height: 700 };
    const capture = {
      cache: new Map(),
      onCacheUpdate: vi.fn(),
      captureToCanvas: vi.fn().mockResolvedValue(rendered),
      drawCachedElement: vi.fn(),
      _captureWithHtmlToImage: vi.fn(),
    };
    cullCaptureToGlass({ capture, glassSet: new Set([rail]) });

    await capture._captureWithHtmlToImage(body, 1300, 700, 1300, 700);

    expect(capture.captureToCanvas).toHaveBeenCalledWith(body, 1300, 700, [farAway]);
    expect(capture.cache.get(body)).toMatchObject({ canvas: rendered, w: 1300, h: 700 });
    expect(capture.onCacheUpdate).toHaveBeenCalledWith(body);
  });
});

function setup(glassBox) {
  const root = document.createElement("div");
  const rail = document.createElement("div");
  rail.setAttribute("data-liquid-glass-control", "rail");
  const body = document.createElement("div");
  root.append(rail, body);
  document.body.append(root);
  const captureElement = vi.fn().mockResolvedValue(undefined);
  const markChanged = vi.fn();
  if (glassBox) rail.getBoundingClientRect = () => glassBox;
  const glassSet = new Set([rail]);
  const stop = recaptureBackgroundOnChange({ capture: { captureElement }, markChanged, glassSet }, root);
  return { body, rail, captureElement, markChanged, stop };
}

// MutationObserver callbacks are microtasks, the debounce is a timer.
const settle = async () => {
  await Promise.resolve();
  vi.advanceTimersByTime(300);
};

describe("recaptureBackgroundOnChange", () => {
  it("forces a re-capture of the background once its DOM settles", async () => {
    vi.useFakeTimers();
    const { body, rail, captureElement, stop } = setup();

    body.textContent = "neuer Text";
    await settle();

    expect(captureElement).toHaveBeenCalledTimes(1);
    expect(captureElement).toHaveBeenCalledWith(body, true);
    expect(captureElement).not.toHaveBeenCalledWith(rail, true);

    stop();
    body.textContent = "noch mehr";
    await settle();
    expect(captureElement).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("repaints on a camera move and re-captures only once the view settles", async () => {
    vi.useFakeTimers();
    const { body, captureElement, markChanged, stop } = setup();
    const viewport = document.createElement("div");
    viewport.setAttribute("data-glass-viewport", "inner");
    body.append(viewport);
    await settle();
    captureElement.mockClear();

    viewport.style.transform = "translate(40px, 12px) scale(1.4)";
    await settle();
    expect(markChanged).toHaveBeenCalledWith(body);
    expect(captureElement).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(captureElement).toHaveBeenCalledWith(body, true);

    stop();
    vi.useRealTimers();
  });

  it("keeps re-capturing a wrapper even when one capture is slow", async () => {
    // A single expensive capture (a big note, a slow device) must not
    // permanently freeze the background — later real content changes still
    // need to land eventually.
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();
    captureElement.mockImplementationOnce(() => new Promise((r) => setTimeout(r, 2000)));

    body.textContent = "erste Änderung";
    await settle();
    expect(captureElement).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    await Promise.resolve();

    body.textContent = "zweite Änderung";
    await settle();
    expect(captureElement).toHaveBeenCalledTimes(2);

    stop();
    vi.useRealTimers();
  });

  it("coalesces a burst of mutations into a single capture", async () => {
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();

    for (let i = 0; i < 20; i += 1) body.setAttribute("class", `c${i}`);
    await settle();

    expect(captureElement).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });

  it("ignores attribute writes that leave the value as it was", async () => {
    // React re-applies an input's type and name on every render. DocumentView's
    // hidden file input did that on each stroke commit, which queued a
    // re-capture after every stroke even though nothing visible changed.
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();
    const input = document.createElement("input");
    input.type = "file";
    body.append(input);
    await settle();
    captureElement.mockClear();

    input.name = "";
    input.type = "file";
    input.removeAttribute("name");
    await settle();
    expect(captureElement).not.toHaveBeenCalled();

    input.type = "text";
    await settle();
    expect(captureElement).toHaveBeenCalledWith(body, true);

    stop();
    vi.useRealTimers();
  });

  it("holds the capture back until the hand leaves the screen", async () => {
    // An html-to-image pass is ~790ms of blocked main thread on the tablet.
    // Running it while a finger is still down is the draw and pinch lag — and
    // pointless, since the next frame of the same gesture invalidates it.
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();

    document.dispatchEvent(new Event("pointerdown"));
    body.textContent = "gezeichnet";
    await Promise.resolve();

    // Still drawing 3s later: the capture keeps getting pushed back.
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(150);
      document.dispatchEvent(new Event("pointermove"));
    }
    expect(captureElement).not.toHaveBeenCalled();

    // Hand lifts.
    vi.advanceTimersByTime(1000);
    expect(captureElement).toHaveBeenCalledWith(body, true);

    stop();
    vi.useRealTimers();
  });

  it("ignores data-* attribute changes no stylesheet selects", async () => {
    // DocumentView rewrites data-stroke-count on every stroke. Re-capturing for
    // it froze the tablet for ~600ms after every pause in handwriting.
    vi.useFakeTimers();
    const style = document.createElement("style");
    style.textContent = '[data-open="true"] { opacity: 0.5; }';
    document.head.append(style);
    const { body, captureElement, stop } = setup();

    body.setAttribute("data-stroke-count", "79");
    await settle();
    expect(captureElement).not.toHaveBeenCalled();

    body.setAttribute("data-open", "true");
    await settle();
    expect(captureElement).toHaveBeenCalledWith(body, true);

    stop();
    style.remove();
    vi.useRealTimers();
  });
});

describe("thumbnailCanvasClones", () => {
  it("hands html-to-image a thumbnail of a page canvas and restores the original after", () => {
    const wrapper = document.createElement("div");
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = 4000;
    pageCanvas.height = 3000;
    wrapper.append(pageCanvas);
    const original = pageCanvas.toDataURL;

    const thumbnails = [];
    const createElement = document.createElement.bind(document);
    const spy = vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag !== "canvas") return createElement(tag);
      const stub = {
        getContext: () => ({ drawImage: () => {} }),
        toDataURL: () => "data:thumbnail",
      };
      thumbnails.push(stub);
      return stub;
    });

    const restore = thumbnailCanvasClones(wrapper);
    // A second capture is still in flight when the first one finishes.
    const restoreConcurrent = thumbnailCanvasClones(wrapper);

    expect(pageCanvas.toDataURL()).toBe("data:thumbnail");
    expect(Math.max(thumbnails[0].width, thumbnails[0].height)).toBe(SNAPSHOT_MAX_EDGE);
    expect(thumbnails[0].height).toBe(384); // 4000x3000 keeps its aspect ratio

    restore();
    expect(pageCanvas.toDataURL()).toBe("data:thumbnail");
    restoreConcurrent();
    expect(pageCanvas.toDataURL).toBe(original);

    spy.mockRestore();
  });
});

describe("cullCaptureToGlass pages", () => {
  it("leaves imported pages that sit clear of every glass panel out of the capture", async () => {
    const rail = boxed(0, 0, 100, 700);
    const body = boxed(0, 0, 1300, 700);
    const pageBehindRail = boxed(60, 0, 800, 1100);
    pageBehindRail.className = "document-page";
    const pageClear = boxed(700, 0, 500, 1100);
    pageClear.className = "document-page";
    body.append(pageBehindRail, pageClear);

    const capture = {
      cache: new Map(),
      onCacheUpdate: vi.fn(),
      captureToCanvas: vi.fn().mockResolvedValue({ width: 1, height: 1 }),
      drawCachedElement: vi.fn(),
      _captureWithHtmlToImage: vi.fn(),
    };
    cullCaptureToGlass({ capture, glassSet: new Set([rail]) });
    await capture._captureWithHtmlToImage(body, 1300, 700, 1300, 700);

    expect(capture.captureToCanvas).toHaveBeenCalledWith(body, 1300, 700, [pageClear]);
  });
});

describe("recaptureBackgroundOnChange pages", () => {
  const box = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  const pageAt = (body, rect) => {
    const page = document.createElement("div");
    page.className = "document-page";
    page.getBoundingClientRect = () => rect;
    body.append(page);
    return page;
  };

  it("does not re-capture for a page mounting canvases clear of every glass panel", async () => {
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup(box(0, 0, 100, 700));
    const page = pageAt(body, box(700, 0, 500, 1100));
    await settle();
    captureElement.mockClear();

    page.append(document.createElement("canvas"));
    await settle();
    vi.advanceTimersByTime(2000);
    expect(captureElement).not.toHaveBeenCalled();

    stop();
    vi.useRealTimers();
  });

  it("re-captures a page behind glass, but only once the view settles", async () => {
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup(box(0, 0, 100, 700));
    const page = pageAt(body, box(60, 0, 800, 1100));
    await settle();
    captureElement.mockClear();

    page.append(document.createElement("canvas"));
    await settle();
    expect(captureElement).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(captureElement).toHaveBeenCalledWith(body, true);

    stop();
    vi.useRealTimers();
  });
});
