import { removeBackground } from "@imgly/background-removal";
import { tryFastCanvasRemoval } from "./canvasBackgroundRemoval.js";

/**
 * Converts a Blob to a base64 Data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Blob konnte nicht gelesen werden"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 500);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Downscales an image before AI inference so mobile CPUs / WebAssembly
 * don't stall on unnecessarily large input dimensions.
 * @param {string | Blob} imageSource
 * @param {number} [maxEdge=640]
 * @returns {Promise<string | Blob>}
 */
export async function downscaleForInference(imageSource, maxEdge = 640) {
  if (typeof imageSource !== "string" || !imageSource.startsWith("data:")) {
    return imageSource;
  }
  try {
    const img = await loadImage(imageSource);
    if (!img || !img.naturalWidth || !img.naturalHeight) return imageSource;
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w <= maxEdge && h <= maxEdge) return imageSource;

    const scale = maxEdge / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return imageSource;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return imageSource;
  }
}

/**
 * Removes the background of an image.
 * Uses instantaneous Smart Canvas Removal (<20ms) for web graphics, stamps,
 * and images with uniform/solid backgrounds.
 * Falls back to Client-Side AI (U2Net) for complex photographic backgrounds.
 *
 * @param {string | Blob} imageSource - Image Data URL or Blob.
 * @param {object} [options] - Optional configuration overrides.
 * @returns {Promise<string>} Data URL of the transparent PNG image.
 */
export async function removeImageBackground(imageSource, options = {}) {
  // Yield to event loop so browser paints the loading spinner first
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 1. Instantaneous Smart Canvas Removal for uniform/web backgrounds
  try {
    const fastResult = await tryFastCanvasRemoval(imageSource, options.tolerance || 42);
    if (fastResult) {
      return fastResult;
    }
  } catch (err) {
    // If fast canvas removal encounters any error, continue to AI fallback
    console.warn("Fast canvas removal skipped:", err);
  }

  // 2. Client-Side AI Model for complex photographic backgrounds
  const preparedSource = await downscaleForInference(imageSource, options.maxEdge || 640);

  const config = {
    model: "small",
    output: {
      format: "image/png",
      quality: 0.9,
    },
    ...options,
  };

  const outputBlob = await removeBackground(preparedSource, config);
  return await blobToDataUrl(outputBlob);
}
