import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import SplitLayout from '../src/components/SplitLayout';
import { browserInkRepository } from '../src/ink/inkRepository.js';

afterEach(() => vi.restoreAllMocks());

function mockRect(element, rect) {
  element.getBoundingClientRect = () => ({
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    ...rect,
  });
}

function drawPointerStroke(element, { pointerId, start, end }) {
  fireEvent.pointerDown(element, {
    pointerId, pointerType: 'pen', clientX: start.x, clientY: start.y,
  });
  fireEvent.pointerMove(element, {
    pointerId, pointerType: 'pen', clientX: end.x, clientY: end.y,
  });
  fireEvent.pointerUp(element, {
    pointerId, pointerType: 'pen', clientX: end.x, clientY: end.y,
  });
}

test('persists every stroke drawn on a directly-opened imported file, not just the first', async () => {
  const note = {
    id: 'imported-note-1',
    kind: 'imported',
    title: 'Scan',
    source: { fileId: 'file-1', type: 'image' },
    pages: [{ id: 'imported-note-1-page-1', index: 0, width: 800, height: 1200 }],
  };

  render(<SplitLayout activeTab="smartCanvas" note={note} />);

  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });

  for (let i = 0; i < 3; i++) {
    drawPointerStroke(page, {
      pointerId: i + 1,
      start: { x: 10 + i, y: 10 + i },
      end: { x: 20 + i, y: 20 + i },
    });
    // Flush the debounced save (saveDelay defaults to 120ms) after each stroke,
    // the way a real user pausing between strokes would.
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
  }

  const saved = browserInkRepository.loadHistory('imported-note-1');
  expect(saved?.present.strokes).toHaveLength(3);
});

test('persists many rapid strokes drawn back-to-back on an imported file', async () => {
  const note = {
    id: 'imported-note-2',
    kind: 'imported',
    title: 'Scan',
    source: { fileId: 'file-2', type: 'image' },
    pages: [{ id: 'imported-note-2-page-1', index: 0, width: 800, height: 1200 }],
  };

  render(<SplitLayout activeTab="smartCanvas" note={note} />);

  const page = screen.getByTestId('document-page');
  mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });

  for (let i = 0; i < 76; i++) {
    drawPointerStroke(page, {
      pointerId: i + 1,
      start: { x: 10 + (i % 50), y: 10 + (i % 50) },
      end: { x: 20 + (i % 50), y: 20 + (i % 50) },
    });
  }
  await act(() => new Promise((resolve) => setTimeout(resolve, 200)));

  const saved = browserInkRepository.loadHistory('imported-note-2');
  expect(saved?.present.strokes).toHaveLength(76);
});

test('persists strokes drawn across repeated open/close cycles of the same imported file', async () => {
  const note = {
    id: 'imported-note-3',
    kind: 'imported',
    title: 'Scan',
    source: { fileId: 'file-3', type: 'image' },
    pages: [{ id: 'imported-note-3-page-1', index: 0, width: 800, height: 1200 }],
  };

  for (let i = 0; i < 5; i++) {
    const { unmount } = render(<SplitLayout activeTab="smartCanvas" note={note} />);
    const page = screen.getByTestId('document-page');
    mockRect(page, { left: 0, top: 0, width: 800, height: 1200 });
    drawPointerStroke(page, {
      pointerId: i + 1,
      start: { x: 10 + i, y: 10 + i },
      end: { x: 20 + i, y: 20 + i },
    });
    // Give the debounced save a chance to flush before the note is closed,
    // the way a user pausing before navigating back to the library would.
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    unmount();
  }

  const saved = browserInkRepository.loadHistory('imported-note-3');
  expect(saved?.present.strokes).toHaveLength(5);
});
