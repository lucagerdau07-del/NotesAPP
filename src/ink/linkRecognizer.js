import { Capacitor, registerPlugin } from "@capacitor/core";
import { createPageObject } from "./pageObjects.js";

// Native Android plugin (android/.../ink/DigitalInkPlugin.java): wraps
// Google ML Kit Digital Ink Recognition, which reads the raw stroke points
// directly - free, on-device, no network, built for handwriting (unlike an
// image-OCR engine, which is tuned for print).
const DigitalInk = registerPlugin("DigitalInk");

// ponytail: good enough for "someone wrote a URL by hand" (www./http(s)://,
// a domain with a dot), not a full RFC 3986 validator.
const URL_PATTERN = /^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]\S*)?$/i;

function normalizeHref(text) {
  const trimmed = String(text ?? "").trim().replace(/\s+/g, "");
  if (!URL_PATTERN.test(trimmed)) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function boundsOf(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Runs after a held, non-shape stroke has already committed as ordinary ink
// (see useInkPointer's onHoldWithoutShape) - so a miss or an error just
// leaves the handwriting exactly as drawn, silently. Web/dev preview has no
// native plugin, so this is a no-op there too.
export async function tryRecognizeLink(stroke, inkController) {
  if (!Capacitor.isNativePlatform()) return;
  let text;
  try {
    const result = await DigitalInk.recognize({ points: stroke.points });
    text = result?.text;
  } catch {
    return;
  }
  const href = normalizeHref(text);
  if (!href) return;

  const box = boundsOf(stroke.points);
  inkController.removeStrokes?.([stroke.id]);
  inkController.addObject?.(
    createPageObject({
      type: "link",
      pageId: stroke.pageId,
      href,
      text: href,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    }),
  );
}
