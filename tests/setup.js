import 'fake-indexeddb/auto';
import { vi } from 'vitest';

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
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
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

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
