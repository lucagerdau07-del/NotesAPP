import { describe, expect, it, vi } from "vitest";
import { recaptureBackgroundOnChange, samplesEachOther } from "../src/hooks/useLiquidGlass";

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

function setup() {
  const root = document.createElement("div");
  const rail = document.createElement("div");
  rail.setAttribute("data-liquid-glass-control", "rail");
  const body = document.createElement("div");
  root.append(rail, body);
  document.body.append(root);
  const captureElement = vi.fn().mockResolvedValue(undefined);
  const stop = recaptureBackgroundOnChange({ capture: { captureElement } }, root);
  return { body, rail, captureElement, stop };
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

  it("ignores style changes on elements that only carry the viewport", async () => {
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();
    const viewport = document.createElement("div");
    viewport.setAttribute("data-glass-ignore-style", "");
    body.append(viewport);
    await settle();
    captureElement.mockClear();

    // What a pan or zoom commits: one transform, nothing else.
    viewport.style.transform = "translate(40px, 12px) scale(1.4)";
    await settle();
    expect(captureElement).not.toHaveBeenCalled();

    // Anything else about the same element still counts as real content.
    viewport.textContent = "Inhalt";
    await settle();
    expect(captureElement).toHaveBeenCalledWith(body, true);

    stop();
    vi.useRealTimers();
  });

  it("stops re-capturing a wrapper whose capture blows the time budget", async () => {
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();
    let clock = 0;
    const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
    captureElement.mockImplementation(() => {
      clock += 1900; // a Galaxy Tab A7 capture of the document wrapper
      return Promise.resolve();
    });

    body.textContent = "erste Änderung";
    await settle();
    await Promise.resolve();
    expect(captureElement).toHaveBeenCalledTimes(1);

    body.textContent = "zweite Änderung";
    await settle();
    expect(captureElement).toHaveBeenCalledTimes(1);

    now.mockRestore();
    stop();
    vi.useRealTimers();
  });

  it("coalesces a burst of mutations into a single capture", async () => {
    vi.useFakeTimers();
    const { body, captureElement, stop } = setup();

    for (let i = 0; i < 20; i += 1) body.setAttribute("data-i", String(i));
    await settle();

    expect(captureElement).toHaveBeenCalledTimes(1);
    stop();
    vi.useRealTimers();
  });
});
