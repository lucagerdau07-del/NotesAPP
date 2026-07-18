import '@testing-library/jest-dom';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SplitLayout from '../SplitLayout';
import * as useCanvasModule from '../../hooks/useCanvas';
import * as useMasterCanvasModule from '../../hooks/useMasterCanvas';
import * as useFocusBoxModule from '../../hooks/useFocusBox';

// Mock components
vi.mock('../DocumentView', () => ({
  default: ({ masterCanvasState }) => (
    <div data-testid="mock-document-view">
      {masterCanvasState && <canvas data-testid="master-canvas" />}
    </div>
  )
}));
vi.mock('../WritingZone', () => ({
  default: ({ canvasState }) => (
    <div data-testid="mock-writing-zone">
      <button data-testid="trigger-draw" onClick={() => {
        // simulate drawing which triggers masterCanvasState and auto advance
        const drawMock = canvasState.draw;
        const stopMock = canvasState.stopDrawing;
        if (drawMock) drawMock({ nativeEvent: { pointerType: 'touch', clientX: 100, clientY: 100 } });
        if (stopMock) stopMock();
      }}>Draw</button>
    </div>
  )
}));

describe('Task 4', () => {
  it('instantiates hooks and passes them down', () => {
    // We just want to check if it doesn't crash and renders the mocks
    render(<SplitLayout activeTab="smartCanvas" />);
    expect(screen.getByTestId('mock-document-view')).toBeInTheDocument();
    expect(screen.getByTestId('mock-writing-zone')).toBeInTheDocument();
  });
});
