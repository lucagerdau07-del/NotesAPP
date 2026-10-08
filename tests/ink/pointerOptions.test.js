import { expect, test, vi } from 'vitest';
import { inkWriteOptions, resolveInkTool } from '../../src/ink/pointerOptions.js';

test('eraser flavor beats the pen type', () => {
  expect(resolveInkTool({ isEraser: true, eraserMode: 'stroke', tool: 'pen' })).toBe('stroke-eraser');
  expect(resolveInkTool({ isEraser: true, eraserMode: 'pixel', tool: 'pen' })).toBe('pixel-eraser');
  expect(resolveInkTool({ isEraser: true, tool: 'pen' })).toBe('pixel-eraser');
  expect(resolveInkTool({ isEraser: false, eraserMode: 'stroke', tool: 'pencil' })).toBe('pencil');
  expect(resolveInkTool({ isEraser: false })).toBe('pen');
});

test('an unlocked layer writes straight through the controller', () => {
  const controller = {
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    removeObjects: vi.fn(),
    addObject: vi.fn(),
  };
  const options = inkWriteOptions(controller);
  expect(options.commitStroke).toBe(controller.commitStroke);
  expect(options.removeStrokes).toBe(controller.removeStrokes);
  expect(options.removeObjects).toBe(controller.removeObjects);
  expect(options.addObject).toBe(controller.addObject);
  expect(options.onHoldWithoutShape).toBeTypeOf('function');
});

test('a locked ink layer swallows every write', () => {
  const controller = {
    inkLayerLocked: true,
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    removeObjects: vi.fn(),
    addObject: vi.fn(),
  };
  const options = inkWriteOptions(controller);
  options.commitStroke({ id: 's' });
  options.removeStrokes(['s']);
  options.removeObjects(['o']);
  expect(controller.commitStroke).not.toHaveBeenCalled();
  expect(controller.removeStrokes).not.toHaveBeenCalled();
  expect(controller.removeObjects).not.toHaveBeenCalled();
  expect(options.addObject).toBeUndefined();
  expect(options.onHoldWithoutShape).toBeUndefined();
});

test('missing controller yields no-op-safe options', () => {
  const options = inkWriteOptions(undefined);
  expect(options.commitStroke).toBeUndefined();
  expect(options.onHoldWithoutShape).toBeTypeOf('function');
});
