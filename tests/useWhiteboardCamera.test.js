// tests/useWhiteboardCamera.test.js
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useWhiteboardCamera from '../src/hooks/useWhiteboardCamera.js';

describe('useWhiteboardCamera', () => {
  it('starts at the given initial camera', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 10, y: 20, scale: 2 }));
    expect(result.current.camera).toEqual({ x: 10, y: 20, scale: 2 });
  });

  it('panBy moves the camera opposite the screen delta, scaled', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 0, y: 0, scale: 2 }));
    act(() => result.current.panBy(20, 10));
    expect(result.current.camera).toEqual({ x: -10, y: -5, scale: 2 });
  });

  it('zoomBy keeps the screen point fixed in world space', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 0, y: 0, scale: 1 }));
    act(() => result.current.zoomBy({ x: 100, y: 100 }, 2));
    // World point under (100,100) was (100,100) before zoom; after doubling
    // scale it must still be (100,100) under that same screen point.
    const { camera } = result.current;
    expect(camera.scale).toBe(2);
    expect(100 / camera.scale + camera.x).toBeCloseTo(100);
    expect(100 / camera.scale + camera.y).toBeCloseTo(100);
  });

  it('clamps scale to [0.1, 4]', () => {
    const { result } = renderHook(() => useWhiteboardCamera({ x: 0, y: 0, scale: 1 }));
    act(() => result.current.zoomBy({ x: 0, y: 0 }, 100));
    expect(result.current.camera.scale).toBe(4);
    act(() => result.current.zoomBy({ x: 0, y: 0 }, 0.0001));
    expect(result.current.camera.scale).toBe(0.1);
  });

  it('focusWorldPointAtScreen sets camera so the world point lands exactly on the screen point', () => {
    const { result } = renderHook(() => useWhiteboardCamera());
    act(() => result.current.focusWorldPointAtScreen({ x: 400, y: 300 }, { x: 50, y: 60 }, 1.5));
    const { camera } = result.current;
    expect(camera.scale).toBe(1.5);
    expect((400 - camera.x) * camera.scale).toBeCloseTo(50);
    expect((300 - camera.y) * camera.scale).toBeCloseTo(60);
  });
});
