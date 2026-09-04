// Notes persist through localStorage, so a phone photo pasted at full size
// fills the quota after a handful of images. Everything inserted is re-encoded
// to fit inside MAX_EDGE first.
export const MAX_EDGE = 1400;

export function fitInside(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
    image.src = url;
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

// PNG keeps transparency for screenshots and diagrams; photos would only bloat
// as PNG, so anything not already a PNG comes back as JPEG.
async function fitAndEncode(original, preferPng) {
  const image = await loadImage(original);
  const size = fitInside(image.naturalWidth, image.naturalHeight);
  if (size.width === image.naturalWidth && size.height === image.naturalHeight)
    return { src: original, ...size };

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return { src: original, ...size };
  context.drawImage(image, 0, 0, size.width, size.height);
  const type = preferPng ? "image/png" : "image/jpeg";
  return { src: canvas.toDataURL(type, 0.85), ...size };
}

export async function readImageObjectSource(file) {
  const original = await readAsDataUrl(file);
  return fitAndEncode(original, file.type === "image/png");
}

// For images that already arrive as a data URL (e.g. downloaded natively from
// the internal browser) — same fit/encode pipeline, minus the FileReader step.
export async function readImageObjectSourceFromDataUrl(dataUrl) {
  return fitAndEncode(dataUrl, /^data:image\/png/i.test(dataUrl));
}
