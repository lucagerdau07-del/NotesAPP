import { describe, expect, it } from 'vitest';
import {
  INK_SCHEMA_VERSION, createInkDocument, createInkStroke,
  getToolStyle, isInkDocument, createInkHistory, executeInkCommand,
  undoInkHistory, redoInkHistory, findIntersectingStrokeIds
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

  it('normalizes malformed stroke metadata to serializable defaults', () => {
    expect(createInkStroke({ id: 's2', pageId: 'p1', tool: 'unknown', color: { bad: true }, width: Infinity, opacity: NaN }))
      .toMatchObject({ id: 's2', pageId: 'p1', tool: 'pen', color: '#000000', width: 3, opacity: 1 });
  });

  it('rejects non-finite points while remaining safe for null input', () => {
    expect(createInkStroke({ points: [{ x: 1, y: 2 }, { x: Infinity, y: 3 }, { x: 4, y: NaN }] }).points)
      .toEqual([{ x: 1, y: 2 }]);
    expect(() => createInkStroke(null)).not.toThrow();
  });

  it('validates malformed values without throwing', () => {
    expect(() => isInkDocument(null)).not.toThrow();
    expect(() => isInkDocument({})).not.toThrow();
    expect(isInkDocument(null)).toBe(false);
  });
});

describe('ink command history', () => {
  const stroke = (id, pageId = 'note-page-1', points = [{ x: 1, y: 1 }, { x: 2, y: 2 }]) => createInkStroke({
    id, pageId, tool: 'pen', color: '#fff', width: 3, opacity: 1, points
  });

  it('keeps one bounded undo/redo timeline and replaces the redo branch', () => {
    const empty = createInkDocument('note');
    const a = stroke('a');
    const b = stroke('b', 'note-page-1', [{ x: 3, y: 3 }, { x: 4, y: 4 }]);
    let history = createInkHistory(empty, 10);
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: a });
    history = undoInkHistory(history);
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: b });
    expect(history.present.strokes.map(item => item.id)).toEqual(['b']);
    expect(history.future).toEqual([]);
  });

  it('bounds past snapshots and moves snapshots through undo and redo', () => {
    let history = createInkHistory(createInkDocument('note'), 2);
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: stroke('a') });
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: stroke('b') });
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: stroke('c') });
    expect(history.past).toHaveLength(2);
    history = undoInkHistory(history);
    expect(history.present.strokes.map(item => item.id)).toEqual(['a', 'b']);
    history = redoInkHistory(history);
    expect(history.present.strokes.map(item => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('retains no past snapshots when history is disabled with a zero limit', () => {
    let history = createInkHistory(createInkDocument('note'), 0);
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: stroke('a') });
    expect(history.past).toEqual([]);
    history = undoInkHistory(history);
    expect(history.past).toEqual([]);
    history = redoInkHistory(history);
    expect(history.past).toEqual([]);
  });

  it('removes selected strokes and clears all strokes without mutating prior snapshots', () => {
    let history = createInkHistory(createInkDocument('note'));
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: stroke('a') });
    history = executeInkCommand(history, { type: 'commit-stroke', stroke: stroke('b') });
    const beforeRemove = history.present;
    history = executeInkCommand(history, { type: 'remove-strokes', strokeIds: ['a'] });
    expect(history.present.strokes.map(item => item.id)).toEqual(['b']);
    expect(beforeRemove.strokes.map(item => item.id)).toEqual(['a', 'b']);
    history = executeInkCommand(history, { type: 'clear-document' });
    expect(history.present.strokes).toEqual([]);
  });

  it('adds pages immutably and advances updatedAt for same-millisecond commands', () => {
    let history = createInkHistory(createInkDocument('note'));
    history = executeInkCommand(history, { type: 'add-page' });
    const firstUpdate = history.present.updatedAt;
    expect(history.present.pages).toEqual([{ id: 'note-page-1' }, { id: 'note-page-2' }]);
    history = executeInkCommand(history, { type: 'add-page', page: { id: 'appendix' } });
    expect(history.present.pages.map(page => page.id)).toEqual(['note-page-1', 'note-page-2', 'appendix']);
    expect(history.present.updatedAt).toBeGreaterThan(firstUpdate);
  });

  it('finds a stroke intersected between sampled endpoints', () => {
    const document = {
      ...createInkDocument('note'),
      strokes: [stroke('line', 'note-page-1', [{ x: 0, y: 10 }, { x: 100, y: 10 }])]
    };
    expect(findIntersectingStrokeIds(document, 'note-page-1', [{ x: 50, y: 13 }], 4)).toEqual(['line']);
  });
});
