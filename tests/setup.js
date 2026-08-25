import { vi } from 'vitest';

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
