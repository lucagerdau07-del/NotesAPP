import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useMasterCanvas from '../src/hooks/useMasterCanvas';

describe('useMasterCanvas', () => {
  beforeEach(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    delete global.ResizeObserver;
  });

  it('should initialize and return the correct API', () => {
    const { result } = renderHook(() => useMasterCanvas());

    expect(result.current.masterCanvasRef).toBeDefined();
    expect(typeof result.current.drawLine).toBe('function');
    expect(typeof result.current.clearCanvas).toBe('function');
    expect(typeof result.current.undo).toBe('function');
    expect(typeof result.current.redo).toBe('function');
  });

  it('drawLine should call context methods', () => {
    const { result } = renderHook(() => useMasterCanvas());
    
    // Mock canvas and context
    const mockContext = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
    };
    
    const mockCanvas = {
      getContext: vi.fn(() => mockContext),
      getBoundingClientRect: vi.fn(() => ({ width: 100, height: 100 })),
      toDataURL: vi.fn(() => 'data:image/png;base64,...'),
    };

    // Assign mock to ref
    result.current.masterCanvasRef.current = mockCanvas;
    
    // Test drawLine
    result.current.drawLine(0, 0, 10, 10, '#000', 5, false);

    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    expect(mockContext.beginPath).toHaveBeenCalled();
    expect(mockContext.moveTo).toHaveBeenCalledWith(0, 0);
    expect(mockContext.lineTo).toHaveBeenCalledWith(10, 10);
    expect(mockContext.stroke).toHaveBeenCalled();
  });
});
