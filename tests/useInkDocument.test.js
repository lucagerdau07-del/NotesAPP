import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInkDocument, createInkHistory, executeInkCommand } from '../src/ink/inkDocument.js';
import { createInkRepository } from '../src/ink/inkRepository.js';
import useInkDocument from '../src/hooks/useInkDocument.js';

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function validStroke(id, pageId = 'note-page-1') {
  return {
    id,
    pageId,
    tool: 'pen',
    color: '#111111',
    width: 3,
    opacity: 1,
    points: [{ x: 2, y: 4 }]
  };
}

const defaultPreferences = {
  tool: 'pen',
  color: '#EFECE4',
  penWidth: 3,
  eraserWidth: 15,
  inputMode: 'stylus',
  eraserMode: 'pixel',
};

function preferences(overrides = {}) {
  return { ...defaultPreferences, ...overrides };
}

function createSeededRepository(documentId) {
  const storage = createMemoryStorage();
  const repository = createInkRepository(storage);
  const saved = executeInkCommand(
    createInkHistory(createInkDocument(documentId)),
    { type: 'commit-stroke', stroke: validStroke('saved', `${documentId}-page-1`) }
  );
  repository.saveHistory(documentId, saved);
  repository.savePreferences(documentId, preferences({
    tool: 'highlighter',
    color: '#3E7BD8',
    penWidth: 24,
    eraserWidth: 18,
    inputMode: 'finger',
    eraserMode: 'stroke',
  }));
  return repository;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useInkDocument', () => {
  it('shares one history for strokes, clear, undo, and redo', () => {
    const repository = createInkRepository(createMemoryStorage());
    const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));

    act(() => result.current.commitStroke(validStroke('a')));
    act(() => result.current.clearDocument());
    expect(result.current.document.strokes).toEqual([]);
    act(() => result.current.undo());
    expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['a']);
    act(() => result.current.redo());
    expect(result.current.document.strokes).toEqual([]);
  });

  it('loads saved history and preferences for the note', () => {
    const repository = createSeededRepository('note');
    const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));

    expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['saved']);
    expect(result.current).toMatchObject({
      tool: 'highlighter',
      color: '#3E7BD8',
      penWidth: 24,
      eraserWidth: 18,
      inputMode: 'finger',
      eraserMode: 'stroke',
    });
  });

  it('switches documents before a stable command can modify stale note state', () => {
    const repository = createInkRepository(createMemoryStorage());
    const { result, rerender } = renderHook(
      ({ documentId }) => useInkDocument({ documentId, repository, saveDelay: 0 }),
      { initialProps: { documentId: 'first' } }
    );
    const commitStroke = result.current.commitStroke;

    act(() => commitStroke(validStroke('first-stroke', 'first-page-1')));
    rerender({ documentId: 'second' });
    act(() => commitStroke(validStroke('second-stroke', 'second-page-1')));

    expect(result.current.document.documentId).toBe('second');
    expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['second-stroke']);
  });

  it('offers stable callbacks for command and preference changes', () => {
    const repository = createInkRepository(createMemoryStorage());
    const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));
    const callbacks = {
      commitStroke: result.current.commitStroke,
      removeStrokes: result.current.removeStrokes,
      clearDocument: result.current.clearDocument,
      addPage: result.current.addPage,
      undo: result.current.undo,
      redo: result.current.redo,
      setTool: result.current.setTool,
      setColor: result.current.setColor,
      setPenWidth: result.current.setPenWidth,
      setEraserWidth: result.current.setEraserWidth,
      setInputMode: result.current.setInputMode,
      setEraserMode: result.current.setEraserMode
    };

    act(() => result.current.commitStroke(validStroke('a')));
    act(() => result.current.setInputMode('finger'));

    expect(result.current.commitStroke).toBe(callbacks.commitStroke);
    expect(result.current.removeStrokes).toBe(callbacks.removeStrokes);
    expect(result.current.clearDocument).toBe(callbacks.clearDocument);
    expect(result.current.addPage).toBe(callbacks.addPage);
    expect(result.current.undo).toBe(callbacks.undo);
    expect(result.current.redo).toBe(callbacks.redo);
    expect(result.current.setTool).toBe(callbacks.setTool);
    expect(result.current.setColor).toBe(callbacks.setColor);
    expect(result.current.setPenWidth).toBe(callbacks.setPenWidth);
    expect(result.current.setEraserWidth).toBe(callbacks.setEraserWidth);
    expect(result.current.setInputMode).toBe(callbacks.setInputMode);
    expect(result.current.setEraserMode).toBe(callbacks.setEraserMode);
  });

  it('persists history and preferences after the configured debounce delay', () => {
    vi.useFakeTimers();
    const repository = createInkRepository(createMemoryStorage());
    const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 25 }));

    act(() => {
      result.current.commitStroke(validStroke('a'));
      result.current.setTool('pencil');
      result.current.setColor('#112233');
      result.current.setPenWidth(5);
      result.current.setEraserWidth(22);
      result.current.setInputMode('finger');
      result.current.setEraserMode('stroke');
    });
    act(() => vi.advanceTimersByTime(24));
    expect(repository.loadHistory('note')).toBeNull();
    expect(repository.loadPreferences('note')).toEqual(defaultPreferences);

    act(() => vi.advanceTimersByTime(1));
    expect(repository.loadHistory('note').present.strokes.map(stroke => stroke.id)).toEqual(['a']);
    expect(repository.loadPreferences('note')).toEqual({
      tool: 'pencil',
      color: '#112233',
      penWidth: 5,
      eraserWidth: 22,
      inputMode: 'finger',
      eraserMode: 'stroke',
    });
  });

  it('switches full preferences synchronously and keeps stable setters scoped to the current note', () => {
    vi.useFakeTimers();
    const repository = createInkRepository(createMemoryStorage());
    repository.savePreferences('note-a', preferences({
      tool: 'highlighter', color: '#3E7BD8', penWidth: 24, eraserWidth: 18,
      inputMode: 'finger', eraserMode: 'stroke',
    }));
    repository.savePreferences('note-b', preferences({
      tool: 'pencil', color: '#D8615B', penWidth: 5, eraserWidth: 30,
    }));
    const { result, rerender } = renderHook(
      ({ documentId }) => useInkDocument({ documentId, repository, saveDelay: 25 }),
      { initialProps: { documentId: 'note-a' } }
    );
    const setColor = result.current.setColor;

    expect(result.current).toMatchObject({
      tool: 'highlighter', color: '#3E7BD8', penWidth: 24, eraserWidth: 18,
      inputMode: 'finger', eraserMode: 'stroke',
    });
    rerender({ documentId: 'note-b' });
    expect(result.current).toMatchObject({
      tool: 'pencil', color: '#D8615B', penWidth: 5, eraserWidth: 30,
      inputMode: 'stylus', eraserMode: 'pixel',
    });

    act(() => setColor('#112233'));
    act(() => vi.advanceTimersByTime(25));
    expect(repository.loadPreferences('note-a').color).toBe('#3E7BD8');
    expect(repository.loadPreferences('note-b').color).toBe('#112233');
  });

  it('cancels pending saves on cleanup', () => {
    vi.useFakeTimers();
    const repository = createInkRepository(createMemoryStorage());
    const { result, unmount } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 25 }));

    act(() => result.current.commitStroke(validStroke('a')));
    unmount();
    act(() => vi.advanceTimersByTime(25));

    expect(repository.loadHistory('note')).toBeNull();
  });

  it('cancels note A debounce before rerendering note B and never saves A state under B key', () => {
    vi.useFakeTimers();
    const repository = createInkRepository(createMemoryStorage());
    const { result, rerender } = renderHook(
      ({ documentId }) => useInkDocument({ documentId, repository, saveDelay: 25 }),
      { initialProps: { documentId: 'note-a' } }
    );

    act(() => result.current.commitStroke(validStroke('a', 'note-a-page-1')));
    act(() => vi.advanceTimersByTime(24));
    rerender({ documentId: 'note-b' });
    act(() => vi.advanceTimersByTime(1));

    expect(repository.loadHistory('note-a')).toBeNull();
    expect(repository.loadHistory('note-b')).toBeNull();

    act(() => vi.advanceTimersByTime(24));
    expect(repository.loadHistory('note-b').present).toMatchObject({
      documentId: 'note-b',
      strokes: [],
    });
  });

  it('keeps command state usable when storage rejects persistence', () => {
    vi.useFakeTimers();
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const repository = createInkRepository(storage);
    const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));

    act(() => {
      result.current.commitStroke(validStroke('a'));
      result.current.setInputMode('finger');
      vi.runOnlyPendingTimers();
    });

    expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['a']);
    expect(result.current.inputMode).toBe('finger');
  });

  it('exposes remove and page commands in the same undoable history', () => {
    const repository = createInkRepository(createMemoryStorage());
    const { result } = renderHook(() => useInkDocument({ documentId: 'note', repository, saveDelay: 0 }));

    act(() => result.current.commitStroke(validStroke('a')));
    act(() => result.current.addPage({ id: 'appendix' }));
    act(() => result.current.removeStrokes(['a']));
    expect(result.current.document).toMatchObject({ pages: [{ id: 'note-page-1' }, { id: 'appendix' }], strokes: [] });
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.document.strokes.map(stroke => stroke.id)).toEqual(['a']);
  });

  it('uses initial page IDs only when no saved history exists', () => {
    const repository = createInkRepository(createMemoryStorage());
    const { result, rerender } = renderHook(
      ({ ids }) => useInkDocument({ documentId: 'imported', initialPageIds: ids, repository, saveDelay: 0 }),
      { initialProps: { ids: ['p1', 'p2'] } },
    );
    expect(result.current.document.pages.map(page => page.id)).toEqual(['p1', 'p2']);
    rerender({ ids: ['changed'] });
    expect(result.current.document.pages.map(page => page.id)).toEqual(['p1', 'p2']);
  });
});
