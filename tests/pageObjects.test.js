import { describe, expect, it } from 'vitest';
import { createInkDocument, createInkHistory, executeInkCommand } from '../src/ink/inkDocument';
import { createPageObject, isPageObject, objectBounds, pageObjectsOf } from '../src/ink/pageObjects';
import { fitInside } from '../src/ink/imageObject';

const add = (history, object) => executeInkCommand(history, { type: 'add-object', object });

describe('page objects', () => {
  it('normalizes a negative-extent arrow into a positive bounding box', () => {
    const bounds = objectBounds(createPageObject({ pageId: 'p', type: 'arrow', x: 100, y: 80, width: -60, height: -40 }));
    expect(bounds).toEqual({ x: 40, y: 40, width: 60, height: 40 });
  });

  it('rejects an object without a page', () => {
    expect(isPageObject(createPageObject({ type: 'rect' }))).toBe(false);
  });

  it('adds, updates and removes objects through the history', () => {
    let history = add(createInkHistory(createInkDocument('n', 1)), {
      pageId: 'n-page-1', type: 'link', href: 'https://example.org',
    });
    const [object] = pageObjectsOf(history.present);
    expect(object.href).toBe('https://example.org');

    history = executeInkCommand(history, { type: 'update-object', objectId: object.id, changes: { x: 42 } });
    expect(pageObjectsOf(history.present)[0]).toMatchObject({ id: object.id, x: 42 });

    history = executeInkCommand(history, { type: 'remove-objects', objectIds: [object.id] });
    expect(pageObjectsOf(history.present)).toEqual([]);
  });

  it('treats a document saved before objects existed as having none', () => {
    expect(pageObjectsOf({ documentId: 'n', strokes: [] })).toEqual([]);
  });

  it('shrinks an oversized image to the long-edge budget and leaves small ones alone', () => {
    expect(fitInside(4000, 3000, 1400)).toEqual({ width: 1400, height: 1050 });
    expect(fitInside(800, 600, 1400)).toEqual({ width: 800, height: 600 });
  });
});
