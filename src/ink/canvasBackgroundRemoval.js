function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 1500);
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
 * Perceptually weighted color distance.
 * Human vision is significantly more sensitive to green and luminance differences
 * than to blue channel differences.
 */
export function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 1.732;
}

/**
 * Solves a 3x3 linear system A * x = b via Cramer's rule.
 */
function solve3x3(A, b) {
  const det =
    A[0] * (A[4] * A[8] - A[5] * A[7]) -
    A[1] * (A[3] * A[8] - A[5] * A[6]) +
    A[2] * (A[3] * A[7] - A[4] * A[6]);

  if (Math.abs(det) < 1e-7) {
    return [b[0] / (A[0] || 1), 0, 0];
  }

  const detX =
    b[0] * (A[4] * A[8] - A[5] * A[7]) -
    A[1] * (b[1] * A[8] - A[5] * b[2]) +
    A[2] * (b[1] * A[7] - A[4] * b[2]);

  const detY =
    A[0] * (b[1] * A[8] - A[5] * b[2]) -
    b[0] * (A[3] * A[8] - A[5] * A[6]) +
    A[2] * (A[3] * b[2] - b[1] * A[6]);

  const detZ =
    A[0] * (A[4] * b[2] - b[1] * A[7]) -
    A[1] * (A[3] * b[2] - b[1] * A[6]) +
    b[0] * (A[3] * A[7] - A[4] * A[6]);

  return [detX / det, detY / det, detZ / det];
}

/**
 * Weighted 2D plane fitting for RGB channels across coordinates u = x/w, v = y/h.
 */
function fitPlaneWeighted(samples, weights = null) {
  let s1 = 0, su = 0, sv = 0, su2 = 0, sv2 = 0, suv = 0;
  let sr = 0, sg = 0, sb = 0;
  let sur = 0, svr = 0, sug = 0, svg = 0, sub = 0, svb = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const w = weights ? weights[i] : 1;
    s1 += w;
    su += w * s.u;
    sv += w * s.v;
    su2 += w * s.u * s.u;
    sv2 += w * s.v * s.v;
    suv += w * s.u * s.v;

    sr += w * s.r;
    sur += w * s.u * s.r;
    svr += w * s.v * s.r;

    sg += w * s.g;
    sug += w * s.u * s.g;
    svg += w * s.v * s.g;

    sb += w * s.b;
    sub += w * s.u * s.b;
    svb += w * s.v * s.b;
  }

  const A = [s1, su, sv, su, su2, suv, sv, suv, sv2];
  return {
    coeffR: solve3x3(A, [sr, sur, svr]),
    coeffG: solve3x3(A, [sg, sug, svg]),
    coeffB: solve3x3(A, [sb, sub, svb]),
  };
}

/**
 * Fits a robust 2D lighting/vignette gradient plane using Iteratively Reweighted
 * Least Squares (IRLS) to reject foreground spikes intersecting the perimeter.
 */
export function fitBackgroundGradientPlane(imageData) {
  const { width, height, data } = imageData;
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));

  const samples = [];
  function addSample(x, y) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] > 30) {
      samples.push({
        x,
        y,
        u: x / Math.max(1, width - 1),
        v: y / Math.max(1, height - 1),
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      });
    }
  }

  for (let x = 0; x < width; x += stepX) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  if (samples.length < 4) {
    return {
      predict: () => ({ r: 255, g: 255, b: 255 }),
      variance: 0,
      inlierRatio: 1,
      isFeasible: true,
    };
  }

  // Pass 1: Standard unweighted plane fit
  let { coeffR, coeffG, coeffB } = fitPlaneWeighted(samples, null);

  // Pass 2 & 3: Iteratively Reweighted Least Squares with Cauchy/Huber weights
  const weights = new Float32Array(samples.length);
  for (let iter = 0; iter < 2; iter++) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const pr = coeffR[0] + coeffR[1] * s.u + coeffR[2] * s.v;
      const pg = coeffG[0] + coeffG[1] * s.u + coeffG[2] * s.v;
      const pb = coeffB[0] + coeffB[1] * s.u + coeffB[2] * s.v;
      const dev = colorDistance(s.r, s.g, s.b, pr, pg, pb);
      weights[i] = 1 / (1 + (dev / 18) * (dev / 18));
    }
    const refit = fitPlaneWeighted(samples, weights);
    coeffR = refit.coeffR;
    coeffG = refit.coeffG;
    coeffB = refit.coeffB;
  }

  // Evaluate inlier variance and inlier ratio
  let inlierDevSum = 0;
  let inlierCount = 0;
  for (let i = 0; i < samples.length; i++) {
    if (weights[i] > 0.35) {
      const s = samples[i];
      const pr = coeffR[0] + coeffR[1] * s.u + coeffR[2] * s.v;
      const pg = coeffG[0] + coeffG[1] * s.u + coeffG[2] * s.v;
      const pb = coeffB[0] + coeffB[1] * s.u + coeffB[2] * s.v;
      const dev = colorDistance(s.r, s.g, s.b, pr, pg, pb);
      inlierDevSum += dev * dev;
      inlierCount++;
    }
  }

  const inlierRatio = inlierCount / samples.length;
  const rmsDev = inlierCount > 0 ? Math.sqrt(inlierDevSum / inlierCount) : 12;

  return {
    predict: (x, y) => {
      const u = x / Math.max(1, width - 1);
      const v = y / Math.max(1, height - 1);
      return {
        r: Math.max(0, Math.min(255, coeffR[0] + coeffR[1] * u + coeffR[2] * v)),
        g: Math.max(0, Math.min(255, coeffG[0] + coeffG[1] * u + coeffG[2] * v)),
        b: Math.max(0, Math.min(255, coeffB[0] + coeffB[1] * u + coeffB[2] * v)),
      };
    },
    variance: rmsDev,
    inlierRatio,
    isFeasible: inlierRatio >= 0.5 && rmsDev <= 55,
  };
}

/**
 * Checks if the outer perimeter of the image has a recognizable background
 * (solid, JPEG-compressed, or smooth lighting gradient).
 */
export function isUniformBorder(imageData, maxDistance = 60) {
  const model = fitBackgroundGradientPlane(imageData);
  return model.isFeasible && model.variance <= maxDistance;
}

/**
 * Removes small isolated noise specks (clusters of opaque pixels surrounded by transparent background).
 */
function removeNoiseIslands(data, width, height, minSize = 25) {
  const compVisited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);

  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] > 0 && !compVisited[p]) {
      let head = 0;
      let tail = 0;
      queue[tail++] = p;
      compVisited[p] = 1;

      while (head < tail) {
        const curr = queue[head++];
        const cx = curr % width;
        const cy = Math.floor(curr / width);

        const neighbors = [];
        if (cx > 0) neighbors.push(curr - 1);
        if (cx < width - 1) neighbors.push(curr + 1);
        if (cy > 0) neighbors.push(curr - width);
        if (cy < height - 1) neighbors.push(curr + width);

        for (const np of neighbors) {
          if (data[np * 4 + 3] > 0 && !compVisited[np]) {
            compVisited[np] = 1;
            queue[tail++] = np;
            if (tail > minSize) break;
          }
        }
        if (tail > minSize) break;
      }

      if (tail <= minSize) {
        for (let i = 0; i < tail; i++) {
          data[queue[i] * 4 + 3] = 0;
        }
      }
    }
  }
}

/**
 * High-precision, clean canvas background removal.
 * Features:
 * 1. Robust IRLS 2D gradient plane fitting.
 * 2. Adaptive noise floor for JPEG artifacts and scanned paper noise.
 * 3. Perimeter flood-fill with smooth step continuity.
 * 4. Enclosed cavity/hole detection (cleans letter loops and stamp frames).
 * 5. Boundary expansion & anti-aliasing color deconvolution (completely strips white halos).
 * 6. Morphological noise specks cleanup.
 *
 * @param {ImageData} imageData
 * @param {number | object} [options=42]
 * @returns {ImageData}
 */
export function removeBackgroundCanvas(imageData, options = {}) {
  const userTolerance = typeof options === "number" ? options : options?.tolerance ?? 42;
  const clearHoles = typeof options === "object" ? (options.clearHoles ?? false) : false;

  const { width, height, data } = imageData;
  const bgModel = fitBackgroundGradientPlane(imageData);

  // Dynamically adapt tolerance to background noise (JPEG blocks, scanned paper)
  const tolerance = Math.max(userTolerance, Math.round(bgModel.variance * 2.5 + 24));
  const tClear = tolerance * 0.72;
  const tSolid = Math.max(tolerance * 2.2, 215);

  const distMap = new Float32Array(width * height);
  function getDist(x, y, idx) {
    const bg = bgModel.predict(x, y);
    return colorDistance(data[idx], data[idx + 1], data[idx + 2], bg.r, bg.g, bg.b);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      distMap[p] = getDist(x, y, p * 4);
    }
  }

  // 1. Perimeter flood-fill
  const isBg = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;

  function tryQueue(p) {
    if (!isBg[p] && distMap[p] <= tolerance) {
      isBg[p] = 1;
      queue[qTail++] = p;
    }
  }

  for (let x = 0; x < width; x++) {
    tryQueue(x);
    tryQueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    tryQueue(y * width);
    tryQueue(y * width + (width - 1));
  }

  while (qHead < qTail) {
    const p = queue[qHead++];
    const px = p % width;
    const py = Math.floor(p / width);
    const pIdx = p * 4;

    const neighbors = [];
    if (px > 0) neighbors.push(p - 1);
    if (px < width - 1) neighbors.push(p + 1);
    if (py > 0) neighbors.push(p - width);
    if (py < height - 1) neighbors.push(p + width);

    for (const np of neighbors) {
      if (!isBg[np]) {
        const d = distMap[np];
        if (d <= tolerance) {
          isBg[np] = 1;
          queue[qTail++] = np;
        } else if (d <= tolerance * 1.25) {
          const nIdx = np * 4;
          const step = colorDistance(
            data[pIdx], data[pIdx + 1], data[pIdx + 2],
            data[nIdx], data[nIdx + 1], data[nIdx + 2]
          );
          if (step < 10) {
            isBg[np] = 1;
            queue[qTail++] = np;
          }
        }
      }
    }
  }

  // 2. Enclosed cavity/hole detection (loops in 'e', 'a', 'o', inside stamp frames)
  if (clearHoles) {
    for (let p = 0; p < width * height; p++) {
      if (!isBg[p] && distMap[p] <= tClear) {
        let hHead = 0;
        let hTail = 0;
        queue[hTail++] = p;
        isBg[p] = 1;
        while (hHead < hTail) {
          const curr = queue[hHead++];
          const cx = curr % width;
          const cy = Math.floor(curr / width);

          const neighbors = [];
          if (cx > 0) neighbors.push(curr - 1);
          if (cx < width - 1) neighbors.push(curr + 1);
          if (cy > 0) neighbors.push(curr - width);
          if (cy < height - 1) neighbors.push(curr + width);

          for (const np of neighbors) {
            if (!isBg[np] && distMap[np] <= tolerance) {
              isBg[np] = 1;
              queue[hTail++] = np;
            }
          }
        }
      }
    }
  }

  // 3. Boundary transition zone expansion (captures anti-aliased edge pixels)
  const isTransition = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (isBg[p]) {
        isTransition[p] = 1;
      } else if (distMap[p] < tSolid) {
        const hasBgNeighbor =
          (x > 0 && isBg[p - 1]) ||
          (x < width - 1 && isBg[p + 1]) ||
          (y > 0 && isBg[p - width]) ||
          (y < height - 1 && isBg[p + width]);
        if (hasBgNeighbor) {
          isTransition[p] = 1;
        }
      }
    }
  }

  // 4. Alpha matting & true color deconvolution (defringing)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const idx = p * 4;
      const bg = bgModel.predict(x, y);

      if (isBg[p] && distMap[p] <= tClear) {
        data[idx + 3] = 0; // Pure transparent background
      } else if (isTransition[p]) {
        const d = distMap[p];
        const t = Math.max(0, Math.min(1, (d - tClear) / (tSolid - tClear)));
        // Smooth Hermite cubic curve
        const alphaNorm = t * t * (3 - 2 * t);
        data[idx + 3] = Math.round(data[idx + 3] * alphaNorm);

        // Decontaminate edge pixels by subtracting background color
        if (alphaNorm > 0.04 && alphaNorm < 0.98) {
          data[idx] = Math.max(0, Math.min(255, Math.round((data[idx] - (1 - alphaNorm) * bg.r) / alphaNorm)));
          data[idx + 1] = Math.max(0, Math.min(255, Math.round((data[idx + 1] - (1 - alphaNorm) * bg.g) / alphaNorm)));
          data[idx + 2] = Math.max(0, Math.min(255, Math.round((data[idx + 2] - (1 - alphaNorm) * bg.b) / alphaNorm)));
        }
      }
    }
  }

  // 5. Clean isolated noise specks (dust)
  removeNoiseIslands(data, width, height, 6);

  return imageData;
}

/**
 * Attempts instantaneous clean background removal if the image has a recognizable border background.
 * Returns transparent PNG data URL, or null if image is photographic/non-uniform.
 */
export async function tryFastCanvasRemoval(imageSource, options = {}) {
  if (typeof imageSource !== "string" || !imageSource.startsWith("data:")) {
    return null;
  }
  const img = await loadImage(imageSource);
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Check if border is uniform or smooth gradient
  if (!isUniformBorder(imgData, 60)) {
    return null;
  }

  const processed = removeBackgroundCanvas(imgData, options);
  ctx.putImageData(processed, 0, 0);
  return canvas.toDataURL("image/png");
}
