import '@testing-library/jest-dom';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WritingZone from '../WritingZone';

describe('Task 4 - WritingZone', () => {
  let mockContext;
  
  beforeEach(() => {
    mockContext = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray() })),
      putImageData: vi.fn(),
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext);
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

    Element.prototype.getBoundingClientRect = vi.fn(() => {
      return {
        width: 800,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: 800,
      };
    });
    
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it('translates coordinates and calls masterCanvasState.drawLine', () => {
    const masterCanvasState = {
      drawLine: vi.fn(),
    };
    const focusBoxState = {
      focusBox: { x: 100, y: 50, width: 400, height: 300 },
      setFocusBox: vi.fn(),
    };

    render(<WritingZone masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />);
    
    const canvas = document.querySelector('.writing-zone canvas');
    
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 20, pointerType: 'touch' });
    
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 40, pointerType: 'touch' });
    
    expect(masterCanvasState.drawLine).toHaveBeenCalledWith(105, 60, 115, 70, expect.any(String), expect.any(Number), expect.any(Boolean));
    
    fireEvent.pointerMove(canvas, { clientX: 700, clientY: 40, pointerType: 'touch' });
    fireEvent.pointerUp(canvas);
    
    expect(focusBoxState.setFocusBox).toHaveBeenCalled();
  });
});
