import { describe, expect, it } from 'vitest';
import { screenToWorld, worldToScreen } from '../src/ink/whiteboardCoordinates.js';

describe('whiteboard screen/world coordinate mapping', () => {
  it('maps the camera origin to screen (0,0)', () => {
    const camera = { x: 500, y: 200, scale: 1 };
    expect(screenToWorld(camera, { x: 0, y: 0 })).toEqual({ x: 500, y: 200 });
  });

  it('divides by scale when going screen -> world', () => {
    const camera = { x: 0, y: 0, scale: 2 };
    expect(screenToWorld(camera, { x: 100, y: 50 })).toEqual({ x: 50, y: 25 });
  });

  it('is the exact inverse of worldToScreen for arbitrary camera state', () => {
    const camera = { x: 137, y: -42, scale: 1.7 };
    const world = { x: 1000, y: -250 };
    const screen = worldToScreen(camera, world);
    const roundTripped = screenToWorld(camera, screen);
    expect(roundTripped.x).toBeCloseTo(world.x);
    expect(roundTripped.y).toBeCloseTo(world.y);
  });
});
