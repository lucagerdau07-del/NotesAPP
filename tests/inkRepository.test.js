import { describe, expect, it } from 'vitest';
import { createInkDocument, createInkHistory, executeInkCommand } from '../src/ink/inkDocument.js';
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

const defaultPreferences = {
  tool: 'pen',
  color: '#EFECE4',
  penWidth: 3,
  eraserWidth: 15,
  inputMode: 'stylus',
  eraserMode: 'pixel',
};

function strokeOf(id, pageId = 'note-1-page-1', pointCount = 100) {
  return {
    id,
    pageId,
    tool: 'pen',
    color: '#111111',
    width: 3,
    opacity: 1,
    points: Array.from({ length: pointCount }, (_, i) => ({ x: i * 1.5237, y: i * 2.7391 })),
  };
}

describe('ink repository', () => {
  it('round-trips the current document, keeping it editable', () => {
    const storage = createMemoryStorage();
    const repository = createInkRepository(storage);
    const history = validHistory();

    expect(repository.saveHistory('note-1', history)).toBe(true);
    expect(repository.loadHistory('note-1').present).toEqual(history.present);
  });

  // The undo stack holds up to `limit` FULL document snapshots, so persisting
  // it stores ~N^2/2 stroke copies for an N-stroke note. That filled the whole
  // 5MB origin quota off a single note, after which every document's save
  // failed with QuotaExceededError - silently, since saveSafely swallows it.
  it('does not persist the undo stack, so storage stays linear in stroke count', () => {
    const storage = createMemoryStorage();
    const repository = createInkRepository(storage);
    let history = createInkHistory(createInkDocument('note-1'));
    for (let i = 0; i < 60; i++) {
      history = executeInkCommand(history, { type: 'commit-stroke', stroke: strokeOf(`s${i}`) });
    }
    expect(history.past.length).toBe(60);

    repository.saveHistory('note-1', history);
    const written = storage.getItem('notes-app:ink:note-1');
    const oneSnapshot = JSON.stringify(history.present).length;

    // Whole-history serialization would be ~30x a single snapshot here.
    expect(written.length).toBeLessThan(oneSnapshot * 1.2);
    expect(repository.loadHistory('note-1').present.strokes).toHaveLength(60);
  });

  it('reloads a note with an empty undo stack rather than ancient states', () => {
    const storage = createMemoryStorage();
    const repository = createInkRepository(storage);

    repository.saveHistory('note-1', validHistory());

    expect(repository.loadHistory('note-1')).toMatchObject({ past: [], future: [] });
  });

  // Devices already carry bloated whole-history blobs; they must keep opening,
  // and the next save then rewrites them compactly and frees the quota.
  it('still loads legacy blobs that contain the whole history', () => {
    const document = createInkDocument('note-1');
    const legacy = { past: [document], present: document, future: [document], limit: 100 };
    const storage = createMemoryStorage({ 'notes-app:ink:note-1': JSON.stringify(legacy) });

    expect(createInkRepository(storage).loadHistory('note-1').present).toEqual(document);
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

  // The undo slots are no longer written or read, so junk left in a legacy
  // blob must not cost the user the drawing that sits next to it.
  it.each(['past', 'future'])('keeps the document when the legacy %s slot is malformed', slot => {
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

    expect(createInkRepository(storage).loadHistory('note-1').present).toEqual(history.present);
  });

  it('round-trips full preferences independently for each note', () => {
    const repository = createInkRepository(createMemoryStorage());
    const noteA = {
      tool: 'highlighter', color: '#3E7BD8', penWidth: 24, eraserWidth: 18,
      inputMode: 'finger', eraserMode: 'stroke',
    };
    const noteB = {
      tool: 'pencil', color: '#D8615B', penWidth: 5, eraserWidth: 30,
      inputMode: 'stylus', eraserMode: 'pixel',
    };

    expect(repository.savePreferences('note-a', noteA)).toBe(true);
    expect(repository.savePreferences('note-b', noteB)).toBe(true);
    expect(repository.loadPreferences('note-a')).toEqual(noteA);
    expect(repository.loadPreferences('note-b')).toEqual(noteB);
  });

  it('loads the legacy global modes into backward-safe full defaults', () => {
    const storage = createMemoryStorage({
      'notes-app:ink-preferences': JSON.stringify({ inputMode: 'finger', eraserMode: 'stroke' })
    });

    expect(createInkRepository(storage).loadPreferences('legacy-note')).toEqual({
      ...defaultPreferences,
      inputMode: 'finger',
      eraserMode: 'stroke',
    });
  });

  it.each([
    ['malformed JSON', '{bad'],
    ['an unsupported version', JSON.stringify({ version: 99, tool: 'highlighter' })],
    ['invalid fields', JSON.stringify({
      version: 1,
      tool: 'marker',
      color: 'blue',
      penWidth: 0,
      eraserWidth: 'wide',
      inputMode: 'mouse',
      eraserMode: 'vector',
    })],
  ])('normalizes %s to safe per-note defaults', (_label, payload) => {
    const storage = createMemoryStorage({
      'notes-app:ink-preferences:note-a': payload,
    });

    expect(createInkRepository(storage).loadPreferences('note-a')).toEqual(defaultPreferences);
  });

  it('normalizes invalid fields independently when saving', () => {
    const repository = createInkRepository(createMemoryStorage());

    expect(repository.savePreferences('note-a', {
      tool: 'fountain',
      color: '#112233',
      penWidth: Number.NaN,
      eraserWidth: -1,
      inputMode: 'finger',
      eraserMode: 'stroke',
    })).toBe(true);
    expect(repository.loadPreferences('note-a')).toEqual({
      ...defaultPreferences,
      tool: 'fountain',
      color: '#112233',
      inputMode: 'finger',
      eraserMode: 'stroke',
    });
  });
});
