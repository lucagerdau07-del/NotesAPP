import { renderHook, act } from '@testing-library/react';
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

  it('clearCanvas should call clearRect and save a snapshot', () => {
    const { result } = renderHook(() => useMasterCanvas());
    
    const mockContext = {
      save: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
    };
    
    const mockCanvas = {
      getContext: vi.fn(() => mockContext),
      toDataURL: vi.fn(() => 'data:image/png;base64,...'),
      width: 500,
      height: 500,
    };

    result.current.masterCanvasRef.current = mockCanvas;
    act(() => {
      result.current.clearCanvas();
    });

    expect(mockContext.clearRect).toHaveBeenCalledWith(0, 0, 500, 500);
    expect(mockCanvas.toDataURL).toHaveBeenCalled();
  });

  it('undo and redo should manipulate history correctly', () => {
    const { result } = renderHook(() => useMasterCanvas());
    
    const mockContext = {
      save: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
    };
    
    const mockCanvas = {
      getContext: vi.fn(() => mockContext),
      toDataURL: vi.fn(() => 'data:image/png;base64,...'),
      width: 500,
      height: 500,
    };

    result.current.masterCanvasRef.current = mockCanvas;
    
    // Clear canvas to add to history
    act(() => {
      result.current.clearCanvas();
    });

    // Call undo (historyIndex goes from 0 to -1, which triggers clearRect)
    act(() => {
      result.current.undo();
    });
    // clearRect should be called twice now: once from clearCanvas, once from restoring to empty state
    expect(mockContext.clearRect).toHaveBeenCalledTimes(2);

    // Call redo (historyIndex goes from -1 to 0)
    act(() => {
      result.current.redo();
    });
    // Does not immediately trigger clearRect because it needs Image to load,
    // so we just ensure no errors occur.
  });
});
