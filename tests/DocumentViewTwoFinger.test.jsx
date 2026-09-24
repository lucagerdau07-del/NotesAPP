import '@testing-library/jest-dom';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/ink/renderInk.js', async (importOriginal) => ({
  ...(await importOriginal()),
  renderInkStroke: vi.fn(),
  renderInkDocument: vi.fn(),
}));

import { renderInkDocument, renderInkStroke } from '../src/ink/renderInk.js';
import DocumentView from '../src/components/DocumentView';

beforeEach(() => {
  // The SM-T505 this was reported from: no digitizer (the stylus is a touch)
  // and no usable contact geometry, as its calibration wizard stored it.
  localStorage.setItem('notes.palmGuard', JSON.stringify({
    measured: { geometryUsable: false, sizeChannel: 'none', separation: 0 },
  }));
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => (cb(), 1));
  // jsdom has no 2d context; a stub lets the live-draft paint path run.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => new Proxy({}, { get: () => () => {} }),
  );
  renderInkStroke.mockClear();
  renderInkDocument.mockClear();
});
afterEach(() => vi.restoreAllMocks());

const F = 16; // one frame

test.each([
  ['land together and pan', { lead: 0, rest: 0, a: [0, -12], b: [0, -12] }],
  ['first finger already moving when the second lands', { lead: 2, rest: 0, a: [0, -12], b: [0, -12] }],
  ['one finger stays anchored while the other zooms', { lead: 0, rest: 0, a: [0, 0], b: [15, 0] }],
  ['both rest a moment before panning', { lead: 0, rest: 370, a: [0, -12], b: [0, -12] }],
])('two fingers never draw (%s), and one finger writes again after', (_label, { lead, rest, a, b }) => {
  const commitStroke = vi.fn();
  render(<DocumentView
    inkController={{
      document: { version: 1, documentId: 'note-1', pages: [{ id: 'page-1' }], strokes: [], updatedAt: 0 },
      commitStroke,
      removeStrokes: vi.fn(),
      addPage: vi.fn(),
      inputMode: 'stylus',
      eraserMode: 'pixel',
    }}
    toolbarState={{ color: '#EFECE4', tool: 'pen', lineWidth: 3, paperStyle: 'lined', showPageBreaks: true, layoutMode: 'full' }}
  />);
  const page = screen.getByTestId('document-page');
  page.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: 800, height: 1200, right: 800, bottom: 1200 });
  let t = 1_000;
  const at = (type, pointerId, [x, y]) => {
    const event = createEvent[type](page, { pointerId, pointerType: 'touch', clientX: x, clientY: y });
    Object.defineProperty(event, 'timeStamp', { value: t });
    fireEvent(page, event);
  };
  const A = [300, 400];
  const B = [400, 400];
  const step = (p, [dx, dy]) => { p[0] += dx; p[1] += dy; };

  at('pointerDown', 10, A);
  for (let i = 0; i < lead; i += 1) { t += F; step(A, a); at('pointerMove', 10, A); }
  t += 20;
  at('pointerDown', 11, B);
  // Whatever the first finger drew alone is gone the moment the second lands,
  // and nothing is painted from here on.
  const strokesBefore = renderInkStroke.mock.calls.length;
  const docsBefore = renderInkDocument.mock.calls.length;
  t += rest;
  for (let i = 0; i < 10; i += 1) {
    t += F;
    step(A, a); at('pointerMove', 10, A);
    step(B, b); at('pointerMove', 11, B);
  }
  expect(renderInkStroke.mock.calls.length).toBe(strokesBefore);
  expect(renderInkDocument.mock.calls.slice(docsBefore).some(([, doc]) => doc.strokes.length > 0)).toBe(false);
  expect(page.style.transform).toMatch(/scale\(/);
  t += 5; at('pointerUp', 10, A);
  t += 5; at('pointerUp', 11, B);
  expect(commitStroke).not.toHaveBeenCalled();

  // The gesture lock lets go once both fingers are up: the stylus writes again.
  const C = [200, 300];
  t += 100; at('pointerDown', 12, C);
  for (let i = 0; i < 5; i += 1) { t += F; step(C, [6, 3]); at('pointerMove', 12, C); }
  t += 5; at('pointerUp', 12, C);
  expect(commitStroke).toHaveBeenCalledOnce();
});
