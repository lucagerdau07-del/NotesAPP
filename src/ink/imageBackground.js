import { removeBackground } from "@imgly/background-removal";

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

/**
 * Removes the background of an image using client-side AI.
 * @param {string | Blob} imageSource - Image Data URL or Blob.
 * @param {object} [options] - Optional configuration overrides.
 * @returns {Promise<string>} Data URL of the transparent PNG image.
 */
export async function removeImageBackground(imageSource, options = {}) {
  const config = {
    model: "small",
    output: {
      format: "image/png",
      quality: 0.9,
    },
    ...options,
  };

  const outputBlob = await removeBackground(imageSource, config);
  return await blobToDataUrl(outputBlob);
}
