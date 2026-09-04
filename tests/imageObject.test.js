import { describe, expect, it } from 'vitest';
import { readImageObjectSource, readImageObjectSourceFromDataUrl } from '../src/ink/imageObject.js';

function stubImage(naturalWidth, naturalHeight) {
  const OriginalImage = globalThis.Image;
  class MockImage {
    set src(_value) {
      this.naturalWidth = naturalWidth;
      this.naturalHeight = naturalHeight;
      queueMicrotask(() => this.onload?.());
    }
  }
  globalThis.Image = MockImage;
  return () => {
    globalThis.Image = OriginalImage;
  };
}

describe('readImageObjectSourceFromDataUrl', () => {
  it('passes a data URL through unchanged when it already fits inside MAX_EDGE', async () => {
    const restore = stubImage(200, 100);
    try {
      const original = 'data:image/png;base64,AAAA';
      const result = await readImageObjectSourceFromDataUrl(original);
      expect(result).toEqual({ src: original, width: 200, height: 100 });
    } finally {
      restore();
    }
  });

  it('downscales an oversized PNG and re-encodes it as PNG through canvas', async () => {
    const restore = stubImage(2000, 1000);
    try {
      const original = 'data:image/png;base64,AAAA';
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      const result = await readImageObjectSourceFromDataUrl(original);
      expect(result.width).toBe(1400);
      expect(result.height).toBe(700);
      expect(toDataURL).toHaveBeenCalledWith('image/png', 0.85);
    } finally {
      restore();
    }
  });

  it('downscales an oversized non-PNG and re-encodes it as JPEG', async () => {
    const restore = stubImage(2000, 1000);
    try {
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      await readImageObjectSourceFromDataUrl('data:image/jpeg;base64,AAAA');
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85);
    } finally {
      restore();
    }
  });
});

describe('readImageObjectSource (existing file path, unchanged behavior)', () => {
  it('still reads a File and fits it inside MAX_EDGE', async () => {
    const restore = stubImage(50, 50);
    try {
      const file = new File(['abc'], 'a.png', { type: 'image/png' });
      const result = await readImageObjectSource(file);
      expect(result.width).toBe(50);
      expect(result.height).toBe(50);
      expect(result.src.startsWith('data:')).toBe(true);
    } finally {
      restore();
    }
  });
});
