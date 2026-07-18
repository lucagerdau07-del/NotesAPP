import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import DocumentView from '../src/components/DocumentView';

test('renders DocumentView with master canvas and focus box', () => {
  const masterCanvasRef = { current: document.createElement('canvas') };
  const masterCanvasState = {
    masterCanvasRef
  };

  const handleDrag = vi.fn();
  const focusBoxState = {
    focusBox: { x: 50, y: 60, width: 200, height: 100 },
    handleDrag
  };

  render(<DocumentView masterCanvasState={masterCanvasState} focusBoxState={focusBoxState} />);

  // Check master canvas
  const canvas = screen.getByTestId('master-canvas');
  expect(canvas).toBeTruthy();
  expect(canvas.classList.contains('master-canvas')).toBe(true);

  // Check focus box
  const focusBox = screen.getByTestId('focus-box');
  expect(focusBox).toBeTruthy();
  expect(focusBox.classList.contains('focus-box')).toBe(true);
  expect(focusBox.style.left).toBe('50px');
  expect(focusBox.style.top).toBe('60px');
  expect(focusBox.style.width).toBe('200px');
  expect(focusBox.style.height).toBe('100px');

  // Check drag interaction
  fireEvent.pointerDown(focusBox, { clientX: 55, clientY: 65 });
  expect(handleDrag).toHaveBeenCalled();
});

test('renders DocumentView without crashing when states are missing', () => {
  render(<DocumentView />);
  const documentView = screen.getByTestId('document-view');
  expect(documentView).toBeTruthy();
});
