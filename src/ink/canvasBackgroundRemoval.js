function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 1000);
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

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
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
 * Fits a 2D plane for R, G, B channels across normalized image coordinates (u = x/w, v = y/h)
 * using perimeter samples to handle gradient and ambient lighting falloff cleanly.
 */
function fitBackgroundGradientPlane(imageData) {
  const { width, height, data } = imageData;
  const stepX = Math.max(1, Math.floor(width / 16));
  const stepY = Math.max(1, Math.floor(height / 16));

  const samples = [];
  function addSample(x, y) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] > 30) {
      samples.push({
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
    };
  }

  let s1 = 0, su = 0, sv = 0, su2 = 0, sv2 = 0, suv = 0;
  let sr = 0, sg = 0, sb = 0;
  let sur = 0, svr = 0;
  let sug = 0, svg = 0;
  let sub = 0, svb = 0;

  for (const s of samples) {
    s1 += 1;
    su += s.u;
    sv += s.v;
    su2 += s.u * s.u;
    sv2 += s.v * s.v;
    suv += s.u * s.v;

    sr += s.r;
    sur += s.u * s.r;
    svr += s.v * s.r;

    sg += s.g;
    sug += s.u * s.g;
    svg += s.v * s.g;

    sb += s.b;
    sub += s.u * s.b;
    svb += s.v * s.b;
  }

  const A = [
    s1, su, sv,
    su, su2, suv,
    sv, suv, sv2,
  ];

  const coeffR = solve3x3(A, [sr, sur, svr]);
  const coeffG = solve3x3(A, [sg, sug, svg]);
  const coeffB = solve3x3(A, [sb, sub, svb]);

  // Compute variance from plane
  let maxDev = 0;
  for (const s of samples) {
    const pr = coeffR[0] + coeffR[1] * s.u + coeffR[2] * s.v;
    const pg = coeffG[0] + coeffG[1] * s.u + coeffG[2] * s.v;
    const pb = coeffB[0] + coeffB[1] * s.u + coeffB[2] * s.v;
    const dev = colorDistance(s.r, s.g, s.b, pr, pg, pb);
    if (dev > maxDev) maxDev = dev;
  }

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
    variance: maxDev,
  };
}

/**
 * Checks if the outer border/corners of the image have a relatively uniform color
 * or smooth lighting gradient (typical for web graphics, scans, stamps, logos).
 */
export function isUniformBorder(imageData, maxDistance = 65) {
  const model = fitBackgroundGradientPlane(imageData);
  return model.variance <= maxDistance;
}

/**
 * Removes small isolated noise specks (islands of opaque pixels smaller than minSize).
 */
function removeNoiseIslands(data, visited, width, height, minSize = 25) {
  const componentVisited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);

  for (let p = 0; p < width * height; p++) {
    // Look for opaque/unvisited pixels
    if (!visited[p] && !componentVisited[p]) {
      let head = 0;
      let tail = 0;
      queue[tail++] = p;
      componentVisited[p] = 1;

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
          if (!visited[np] && !componentVisited[np]) {
            componentVisited[np] = 1;
            queue[tail++] = np;
            // Stop early if component is already large enough
            if (tail > minSize) break;
          }
        }
        if (tail > minSize) break;
      }

      // If component is smaller than minSize, it's noise/speckle!
      if (tail <= minSize) {
        for (let i = 0; i < tail; i++) {
          const np = queue[i];
          visited[np] = 1;
          data[np * 4 + 3] = 0; // Clear alpha
        }
      }
    }
  }
}

/**
 * Advanced Clean Canvas Background Removal.
 * Uses:
 * 1. Bilinear Gradient Fitting (handles lighting gradients / vignette).
 * 2. Border-seeded Flood Fill with adaptive tolerance.
 * 3. Noise Speckle Removal (eliminates dust/artifacts).
 * 4. Color Decontamination / Defringing (removes white/light halos around edges).
 */
export function removeBackgroundCanvas(imageData, tolerance = 44) {
  const { width, height, data } = imageData;
  const bgModel = fitBackgroundGradientPlane(imageData);

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;

  function distAt(x, y, idx) {
    const bg = bgModel.predict(x, y);
    return colorDistance(data[idx], data[idx + 1], data[idx + 2], bg.r, bg.g, bg.b);
  }

  // 1. Seed queue with all perimeter pixels matching the background
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    if (distAt(x, 0, topIdx) <= tolerance) {
      visited[x] = 1;
      queue[qTail++] = x;
    }
    const bottomP = (height - 1) * width + x;
    const bottomIdx = bottomP * 4;
    if (distAt(x, height - 1, bottomIdx) <= tolerance) {
      visited[bottomP] = 1;
      queue[qTail++] = bottomP;
    }
  }

  for (let y = 0; y < height; y++) {
    const leftP = y * width;
    if (!visited[leftP] && distAt(0, y, leftP * 4) <= tolerance) {
      visited[leftP] = 1;
      queue[qTail++] = leftP;
    }
    const rightP = y * width + (width - 1);
    if (!visited[rightP] && distAt(width - 1, y, rightP * 4) <= tolerance) {
      visited[rightP] = 1;
      queue[rightP] = rightP;
    }
  }

  // 2. Flood-fill from borders inward with step similarity
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
      if (!visited[np]) {
        const nx = np % width;
        const ny = Math.floor(np / width);
        const nIdx = np * 4;
        const dist = distAt(nx, ny, nIdx);

        // Allow flood if within global tolerance OR local neighbor step is very smooth
        if (dist <= tolerance) {
          visited[np] = 1;
          queue[qTail++] = np;
        } else if (dist <= tolerance * 1.15) {
          const stepDist = colorDistance(
            data[pIdx], data[pIdx + 1], data[pIdx + 2],
            data[nIdx], data[nIdx + 1], data[nIdx + 2]
          );
          if (stepDist < 12) {
            visited[np] = 1;
            queue[qTail++] = np;
          }
        }
      }
    }
  }

  // 3. Remove small noise specks / dust in transparent region
  removeNoiseIslands(data, visited, width, height, 6);

  // 4. Alpha Feathering and Color Decontamination (Defringing)
  const feather = 10;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const idx = p * 4;
      const bg = bgModel.predict(x, y);

      if (visited[p]) {
        const d = distAt(x, y, idx);
        if (d < tolerance - feather) {
          data[idx + 3] = 0; // Completely transparent
        } else {
          // Smooth edge transition
          const factor = (d - (tolerance - feather)) / feather;
          const alphaNorm = Math.max(0, Math.min(1, factor));
          data[idx + 3] = Math.round(data[idx + 3] * alphaNorm);

          // Defringe: un-blend the background color from edge pixels
          if (alphaNorm > 0.05 && alphaNorm < 0.95) {
            data[idx] = Math.max(0, Math.min(255, Math.round((data[idx] - (1 - alphaNorm) * bg.r) / alphaNorm)));
            data[idx + 1] = Math.max(0, Math.min(255, Math.round((data[idx + 1] - (1 - alphaNorm) * bg.g) / alphaNorm)));
            data[idx + 2] = Math.max(0, Math.min(255, Math.round((data[idx + 2] - (1 - alphaNorm) * bg.b) / alphaNorm)));
          }
        }
      }
    }
  }

  return imageData;
}

/**
 * Attempts instantaneous clean background removal if the image has a recognizable border background.
 * Returns transparent PNG data URL, or null if image is photographic/non-uniform.
 */
export async function tryFastCanvasRemoval(imageSource, tolerance = 44) {
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
  if (!isUniformBorder(imgData, 65)) {
    return null; // Wild multi-color photo, defer to AI
  }

  const processed = removeBackgroundCanvas(imgData, tolerance);
  ctx.putImageData(processed, 0, 0);
  return canvas.toDataURL("image/png");
}
