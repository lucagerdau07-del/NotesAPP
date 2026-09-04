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
 * Checks if the outer border/corners of the image have a relatively uniform color
 * (e.g. white, light gray, solid color common in web graphics, stamps, logos).
 */
export function isUniformBorder(imageData, maxDistance = 50) {
  const { width, height, data } = imageData;
  if (width < 2 || height < 2) return false;

  const sampleCoords = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  const samples = [];
  for (const [x, y] of sampleCoords) {
    const idx = (y * width + x) * 4;
    // Skip if corner is already transparent
    if (data[idx + 3] > 20) {
      samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
  }

  if (samples.length < 3) return false;

  // Compute average of first sample as reference
  const ref = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const d = colorDistance(ref.r, ref.g, ref.b, samples[i].r, samples[i].g, samples[i].b);
    if (d > maxDistance) {
      return false; // Border colors vary too widely (e.g. complex photo)
    }
  }
  return true;
}

/**
 * Pure JS Canvas Smart Background Removal.
 * Uses border-seeded flood fill so that inner whites/colors remain intact.
 */
export function removeBackgroundCanvas(imageData, tolerance = 38) {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;

  // 1. Sample perimeter pixels to find reference background color
  let rSum = 0, gSum = 0, bSum = 0, sampleCount = 0;
  const samplePoints = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)]
  ];

  for (const [x, y] of samplePoints) {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] > 20) {
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      sampleCount++;
    }
  }

  if (sampleCount === 0) return imageData;

  const bgR = rSum / sampleCount;
  const bgG = gSum / sampleCount;
  const bgB = bSum / sampleCount;

  function distAt(idx) {
    const dr = data[idx] - bgR;
    const dg = data[idx + 1] - bgG;
    const db = data[idx + 2] - bgB;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 2. Seed queue with all perimeter pixels matching the background
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    if (distAt(topIdx) <= tolerance) {
      visited[x] = 1;
      queue[qTail++] = x;
    }
    const bottomP = (height - 1) * width + x;
    const bottomIdx = bottomP * 4;
    if (distAt(bottomIdx) <= tolerance) {
      visited[bottomP] = 1;
      queue[qTail++] = bottomP;
    }
  }

  for (let y = 0; y < height; y++) {
    const leftP = y * width;
    if (!visited[leftP] && distAt(leftP * 4) <= tolerance) {
      visited[leftP] = 1;
      queue[qTail++] = leftP;
    }
    const rightP = y * width + (width - 1);
    if (!visited[rightP] && distAt(rightP * 4) <= tolerance) {
      visited[rightP] = 1;
      queue[rightP] = rightP;
    }
  }

  // 3. Flood-fill from borders inward
  while (qHead < qTail) {
    const p = queue[qHead++];
    const px = p % width;
    const py = Math.floor(p / width);

    if (px > 0) {
      const left = p - 1;
      if (!visited[left] && distAt(left * 4) <= tolerance) {
        visited[left] = 1;
        queue[qTail++] = left;
      }
    }
    if (px < width - 1) {
      const right = p + 1;
      if (!visited[right] && distAt(right * 4) <= tolerance) {
        visited[right] = 1;
        queue[qTail++] = right;
      }
    }
    if (py > 0) {
      const up = p - width;
      if (!visited[up] && distAt(up * 4) <= tolerance) {
        visited[up] = 1;
        queue[qTail++] = up;
      }
    }
    if (py < height - 1) {
      const down = p + width;
      if (!visited[down] && distAt(down * 4) <= tolerance) {
        visited[down] = 1;
        queue[qTail++] = down;
      }
    }
  }

  // 4. Apply smooth transparency and feathering
  const feather = 8;
  for (let p = 0; p < width * height; p++) {
    if (visited[p]) {
      const idx = p * 4;
      const d = distAt(idx);
      if (d < tolerance - feather) {
        data[idx + 3] = 0;
      } else {
        const factor = (d - (tolerance - feather)) / feather;
        data[idx + 3] = Math.round(data[idx + 3] * Math.max(0, Math.min(1, factor)));
      }
    }
  }

  return imageData;
}

/**
 * Attempts instantaneous background removal if the image has a uniform border background.
 * Returns transparent PNG data URL, or null if image is photographic/non-uniform.
 */
export async function tryFastCanvasRemoval(imageSource, tolerance = 42) {
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

  // Check if border is uniform enough for algorithmic removal
  if (!isUniformBorder(imgData, 55)) {
    return null; // Not uniform, use AI
  }

  const processed = removeBackgroundCanvas(imgData, tolerance);
  ctx.putImageData(processed, 0, 0);
  return canvas.toDataURL("image/png");
}
