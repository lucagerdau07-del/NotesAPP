import { describe, expect, it } from 'vitest';
import {
  INK_SCHEMA_VERSION, createInkDocument, createInkStroke,
  getToolStyle, isInkDocument
} from '../src/ink/inkDocument';

describe('ink document schema', () => {
  it('creates stable page-local vector state', () => {
    expect(createInkDocument('note-7', 2)).toEqual({
      version: INK_SCHEMA_VERSION,
      documentId: 'note-7',
      pages: [{ id: 'note-7-page-1' }, { id: 'note-7-page-2' }],
      strokes: [],
      updatedAt: 0
    });
  });

  it('rejects malformed persisted documents', () => {
    expect(isInkDocument({ version: 1, documentId: 'x', pages: [], strokes: 'bad' })).toBe(false);
  });

  it.each([
    ['pen', 3, 3, 1],
    ['fountain', 3, 2.4, 1],
    ['pencil', 3, 3, 0.58],
    ['highlighter', 3, 15, 0.32],
    ['pixel-eraser', 3, 3, 1]
  ])('maps %s to deterministic width and opacity', (tool, rawWidth, width, opacity) => {
    expect(getToolStyle(tool, '#abcdef', rawWidth)).toMatchObject({ tool, width, opacity });
  });

  it('creates a stroke with copied finite page-local points', () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    const stroke = createInkStroke({ id: 's1', pageId: 'p1', tool: 'pen', color: '#abc', width: 3, opacity: 1, points });
    expect(stroke).toEqual({ id: 's1', pageId: 'p1', tool: 'pen', color: '#abc', width: 3, opacity: 1, points });
    expect(stroke.points).not.toBe(points);
    expect(stroke.points[0]).not.toBe(points[0]);
  });
});
