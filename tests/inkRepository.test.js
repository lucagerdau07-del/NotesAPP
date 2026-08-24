import { describe, expect, it } from 'vitest';
import { createInkDocument, createInkHistory } from '../src/ink/inkDocument.js';
import { createInkRepository } from '../src/ink/inkRepository.js';

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

function validHistory() {
  const document = createInkDocument('note-1');
  return {
    ...createInkHistory(document, 2),
    past: [document],
    future: [document]
  };
}

describe('ink repository', () => {
  it('round-trips a valid bounded history', () => {
    const storage = createMemoryStorage();
    const repository = createInkRepository(storage);
    const history = validHistory();

    expect(repository.saveHistory('note-1', history)).toBe(true);
    expect(repository.loadHistory('note-1')).toEqual(history);
  });

  it('returns null for malformed JSON without throwing', () => {
    const storage = createMemoryStorage({ 'notes-app:ink:note-1': '{bad' });

    expect(createInkRepository(storage).loadHistory('note-1')).toBeNull();
  });

  it('keeps drawing usable when storage rejects a write', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };

    expect(createInkRepository(storage).saveHistory('note-1', validHistory())).toBe(false);
  });

  it.each([
    ['an unknown tool', { tool: 'marker' }],
    ['a non-positive width', { width: 0 }],
    ['opacity outside the supported range', { opacity: 1.1 }],
    ['a stroke page absent from the document', { pageId: 'missing-page' }]
  ])('rejects persisted history containing %s', (_label, invalidStroke) => {
    const history = validHistory();
    history.present = {
      ...history.present,
      strokes: [{
        id: 'stroke-1',
        pageId: 'note-1-page-1',
        tool: 'pen',
        color: '#000000',
        width: 3,
        opacity: 1,
        points: [{ x: 1, y: 1 }],
        ...invalidStroke
      }]
    };
    const storage = createMemoryStorage({
      'notes-app:ink:note-1': JSON.stringify(history)
    });

    expect(createInkRepository(storage).loadHistory('note-1')).toBeNull();
  });

  it.each(['past', 'future'])('rejects malformed documents in the %s history snapshot', slot => {
    const history = validHistory();
    history[slot] = [{
      ...history[slot][0],
      strokes: [{
        id: 'bad-snapshot-stroke',
        pageId: 'note-1-page-1',
        tool: 'unknown',
        color: '#000000',
        width: 3,
        opacity: 1,
        points: [{ x: 1, y: 1 }]
      }]
    }];
    const storage = createMemoryStorage({
      'notes-app:ink:note-1': JSON.stringify(history)
    });

    expect(createInkRepository(storage).loadHistory('note-1')).toBeNull();
  });

  it('normalizes malformed preferences to exact supported modes', () => {
    const storage = createMemoryStorage({
      'notes-app:ink-preferences': JSON.stringify({ inputMode: 'mouse', eraserMode: 'vector' })
    });

    expect(createInkRepository(storage).loadPreferences()).toEqual({ inputMode: 'stylus', eraserMode: 'pixel' });
  });

  it('round-trips only supported preference modes', () => {
    const storage = createMemoryStorage();
    const repository = createInkRepository(storage);

    expect(repository.savePreferences({ inputMode: 'finger', eraserMode: 'stroke' })).toBe(true);
    expect(repository.loadPreferences()).toEqual({ inputMode: 'finger', eraserMode: 'stroke' });
  });
});
