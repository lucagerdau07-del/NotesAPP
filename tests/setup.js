import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';

// localStorage persists across tests within a file (jsdom gives each test
// FILE a fresh window, not each test). The palm profile now writes to it
// from production code (markPenSeen), so one test's real pen stroke would
// otherwise leak sawPenPointer:true into every later test in that file.
afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    // Some suites stub localStorage without a clear() method; nothing to do.
  }
});

const blobConstructors = [
  typeof Blob !== 'undefined' ? Blob : null,
  typeof window !== 'undefined' ? window.Blob : null,
  typeof globalThis !== 'undefined' ? globalThis.Blob : null,
  typeof global !== 'undefined' ? global.Blob : null,
].filter(Boolean);

const blobPrototypes = new Set(blobConstructors.map(c => c.prototype).filter(Boolean));
if (typeof Blob !== 'undefined') {
  try {
    const instance = new Blob();
    let proto = Object.getPrototypeOf(instance);
    while (proto && proto !== Object.prototype) {
      blobPrototypes.add(proto);
      proto = Object.getPrototypeOf(proto);
    }
  } catch {}
}

for (const proto of blobPrototypes) {
  if (!proto.text) {
    proto.text = function text() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(this);
      });
    };
  }
  if (!proto.arrayBuffer) {
    proto.arrayBuffer = function arrayBuffer() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    };
  }
}

const originalStructuredClone = globalThis.structuredClone;
globalThis.structuredClone = function structuredCloneWithBlobs(value, options) {
  function cloneWithBlobs(val) {
    if (val === null || typeof val !== 'object') return val;
    if (val instanceof Blob) {
      const cloned = val.slice(0, val.size, val.type);
      if (!cloned.text) cloned.text = val.text?.bind(cloned) || Blob.prototype.text.bind(cloned);
      if (!cloned.arrayBuffer) cloned.arrayBuffer = val.arrayBuffer?.bind(cloned) || Blob.prototype.arrayBuffer.bind(cloned);
      return cloned;
    }
    if (Array.isArray(val)) return val.map(cloneWithBlobs);
    const copy = {};
    for (const key of Object.keys(val)) {
      copy[key] = cloneWithBlobs(val[key]);
    }
    return copy;
  }
  try {
    return cloneWithBlobs(value);
  } catch {
    return originalStructuredClone ? originalStructuredClone(value, options) : value;
  }
};

if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrix {
    constructor(init) {
      if (typeof init === 'string') {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      } else if (Array.isArray(init)) {
        this.a = init[0] ?? 1; this.b = init[1] ?? 0;
        this.c = init[2] ?? 0; this.d = init[3] ?? 1;
        this.e = init[4] ?? 0; this.f = init[5] ?? 0;
      } else if (init && typeof init === 'object') {
        this.a = init.a ?? 1; this.b = init.b ?? 0;
        this.c = init.c ?? 0; this.d = init.d ?? 1;
        this.e = init.e ?? 0; this.f = init.f ?? 0;
      } else {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      }
      this.m11 = this.a; this.m12 = this.b; this.m13 = 0; this.m14 = 0;
      this.m21 = this.c; this.m22 = this.d; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = this.e; this.m42 = this.f; this.m43 = 0; this.m44 = 1;
      this.is2D = true;
      this.isIdentity = (this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0);
    }
    translate(tx = 0, ty = 0) {
      const res = new DOMMatrix(this);
      res.e += tx * this.a + ty * this.c;
      res.f += tx * this.b + ty * this.d;
      return res;
    }
    scale(sx = 1, sy = sx) {
      const res = new DOMMatrix(this);
      res.a *= sx; res.b *= sx;
      res.c *= sy; res.d *= sy;
      return res;
    }
    multiply(other) {
      return new DOMMatrix(other);
    }
    transformPoint(point) {
      return {
        x: (point?.x || 0) * this.a + (point?.y || 0) * this.c + this.e,
        y: (point?.x || 0) * this.b + (point?.y || 0) * this.d + this.f,
      };
    }
  }
  globalThis.DOMMatrix = DOMMatrix;
  if (typeof window !== 'undefined') window.DOMMatrix = DOMMatrix;
}
if (typeof globalThis.DOMPoint === 'undefined') {
  class DOMPoint {
    constructor(x = 0, y = 0, z = 0, w = 1) {
      this.x = x; this.y = y; this.z = z; this.w = w;
    }
  }
  globalThis.DOMPoint = DOMPoint;
  if (typeof window !== 'undefined') window.DOMPoint = DOMPoint;
}

function createCanvasContext() {
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    // Bucket fill (src/ink/bucketFill.js) reads pixel data to find "walls".
    // jsdom has no real 2D rasterizer, so this stub reports an all-transparent
    // canvas — floodFill then treats the whole rasterized window as open,
    // which is enough for tests that only assert a fill object gets created.
    getImageData: vi.fn((x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    createImageData: vi.fn((w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    putImageData: vi.fn(),
    drawn: [],
  };
  const states = [];
  context.save = vi.fn(() => states.push({
    globalAlpha: context.globalAlpha,
    globalCompositeOperation: context.globalCompositeOperation,
    strokeStyle: context.strokeStyle,
    lineWidth: context.lineWidth,
    lineCap: context.lineCap,
    lineJoin: context.lineJoin,
  }));
  context.restore = vi.fn(() => Object.assign(context, states.pop()));
  context.stroke = vi.fn(() => context.drawn.push({
    globalAlpha: context.globalAlpha,
    globalCompositeOperation: context.globalCompositeOperation,
    strokeStyle: context.strokeStyle,
    lineWidth: context.lineWidth,
  }));
  return context;
}

const canvasContexts = new WeakMap();
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(function getContext(type) {
    if (type !== '2d') return null;
    if (!canvasContexts.has(this)) canvasContexts.set(this, createCanvasContext());
    return canvasContexts.get(this);
  }),
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  configurable: true,
  value: vi.fn(() => 'data:image/png;base64,'),
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
import '@testing-library/jest-dom';
class IntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe(element) {
    this.callback([ { isIntersecting: true, target: element } ]);
  }
  disconnect() {}
  unobserve() {}
}

globalThis.IntersectionObserver = IntersectionObserver;
