import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useCanvas from '../src/hooks/useCanvas';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('useCanvas', () => {
  let mockContext;
  let mockCanvas;

  beforeEach(() => {
    mockContext = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray() })),
      putImageData: vi.fn()
    };
    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      getBoundingClientRect: vi.fn(() => ({ width: 800, height: 600, left: 0, top: 0 })),
      toDataURL: vi.fn(() => 'data:image/png;base64,mock')
    };
  });

  it('should initialize isDrawing to false', () => {
    const { result } = renderHook(() => useCanvas());
    expect(result.current.isDrawing).toBe(false);
  });

  it('should start drawing on touch down', () => {
    const { result } = renderHook(() => useCanvas());
    result.current.canvasRef.current = mockCanvas;

    act(() => {
      result.current.startDrawing({
        nativeEvent: { pointerType: 'touch', clientX: 10, clientY: 20 }
      });
    });

    expect(result.current.isDrawing).toBe(true);
    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    expect(mockContext.beginPath).toHaveBeenCalled();
    expect(mockContext.moveTo).toHaveBeenCalledWith(10, 20);
  });

  it('should not start drawing if pointerType is not touch, mouse, or pen', () => {
    const { result } = renderHook(() => useCanvas());
    result.current.canvasRef.current = mockCanvas;

    act(() => {
      result.current.startDrawing({
        nativeEvent: { pointerType: 'unknown', clientX: 10, clientY: 20 }
      });
    });

    expect(result.current.isDrawing).toBe(false);
    expect(mockContext.beginPath).not.toHaveBeenCalled();
  });

  it('should draw lines if drawing is started and pointer is touch', () => {
    const { result } = renderHook(() => useCanvas());
    result.current.canvasRef.current = mockCanvas;

    act(() => {
      result.current.startDrawing({
        nativeEvent: { pointerType: 'touch', clientX: 10, clientY: 20 }
      });
    });

    act(() => {
      result.current.draw({
        nativeEvent: { pointerType: 'touch', clientX: 30, clientY: 40 }
      });
    });

    expect(mockContext.lineTo).toHaveBeenCalledWith(30, 40);
    expect(mockContext.stroke).toHaveBeenCalled();
  });

  it('should stop drawing correctly', () => {
    const { result } = renderHook(() => useCanvas());
    result.current.canvasRef.current = mockCanvas;

    act(() => {
      result.current.startDrawing({
        nativeEvent: { pointerType: 'touch', clientX: 10, clientY: 20 }
      });
    });

    act(() => {
      result.current.stopDrawing();
    });

    expect(result.current.isDrawing).toBe(false);
    expect(mockContext.closePath).toHaveBeenCalled();
  });

  it('should not do anything on stopDrawing if not drawing', () => {
    const { result } = renderHook(() => useCanvas());
    result.current.canvasRef.current = mockCanvas;

    act(() => {
      result.current.stopDrawing();
    });

    expect(mockContext.closePath).not.toHaveBeenCalled();
  });
});
