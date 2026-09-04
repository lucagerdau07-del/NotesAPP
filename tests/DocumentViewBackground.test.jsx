import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import DocumentView from '../src/components/DocumentView.jsx';

vi.mock('../src/ink/imageBackground.js', () => ({
  removeImageBackground: vi.fn(async () => 'data:image/png;base64,transparentResult'),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function createMockController(objects = []) {
  return {
    document: {
      version: 1,
      documentId: 'note-1',
      pages: [{ id: 'page-1' }],
      strokes: [],
      objects,
      updatedAt: 0,
    },
    updateObject: vi.fn(),
    commitStroke: vi.fn(),
    removeStrokes: vi.fn(),
    clearDocument: vi.fn(),
    addPage: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: true,
    canRedo: true,
    inputMode: 'stylus',
    setInputMode: vi.fn(),
    eraserMode: 'pixel',
    setEraserMode: vi.fn(),
  };
}

const defaultToolbarState = {
  color: '#EFECE4',
  rawColor: '#EFECE4',
  tool: 'pen',
  rawLineWidth: 3,
  lineWidth: 3,
  eraserWidth: 15,
  isEraser: false,
  isSelectMode: false,
  paperStyle: 'lined',
  showPageBreaks: true,
  layoutMode: 'full',
};

describe('DocumentView background removal integration', () => {
  const imageObject = {
    id: 'img-123',
    pageId: 'page-1',
    type: 'image',
    src: 'data:image/jpeg;base64,originalData',
    x: 100,
    y: 100,
    width: 200,
    height: 150,
  };

  it('removes background when wand button is clicked', async () => {
    const controller = createMockController([imageObject]);

    render(
      <DocumentView
        inkController={controller}
        toolbarState={defaultToolbarState}
      />
    );

    // Select the image object
    const imageElement = screen.getByAltText('Bild');
    fireEvent.pointerDown(imageElement.closest('[data-object-id="img-123"]'));

    // Find the magic wand button
    const wandBtn = await screen.findByTitle('Hintergrund entfernen');
    expect(wandBtn).toBeInTheDocument();

    // Click remove background
    fireEvent.click(wandBtn);

    // Verify controller.updateObject is called with the transparent data URL and originalSrc
    await waitFor(() => {
      expect(controller.updateObject).toHaveBeenCalledWith('img-123', {
        src: 'data:image/png;base64,transparentResult',
        originalSrc: 'data:image/jpeg;base64,originalData',
      });
    });
  });

  it('restores original background when undo button is clicked', async () => {
    const objectWithOriginal = {
      ...imageObject,
      src: 'data:image/png;base64,transparentResult',
      originalSrc: 'data:image/jpeg;base64,originalData',
    };
    const controller = createMockController([objectWithOriginal]);

    render(
      <DocumentView
        inkController={controller}
        toolbarState={defaultToolbarState}
      />
    );

    // Select the image object
    const imageElement = screen.getByAltText('Bild');
    fireEvent.pointerDown(imageElement.closest('[data-object-id="img-123"]'));

    // Find the restore button
    const restoreBtn = await screen.findByTitle('Original wiederherstellen');
    expect(restoreBtn).toBeInTheDocument();

    // Click restore
    fireEvent.click(restoreBtn);

    // Verify controller.updateObject is called to revert
    expect(controller.updateObject).toHaveBeenCalledWith('img-123', {
      src: 'data:image/jpeg;base64,originalData',
      originalSrc: null,
    });
  });
});
