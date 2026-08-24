import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createInkDocument,
  createInkHistory,
  executeInkCommand,
  redoInkHistory,
  undoInkHistory
} from '../ink/inkDocument.js';
import { createInkRepository } from '../ink/inkRepository.js';

const browserInkRepository = createInkRepository(globalThis.localStorage);
const supportedTools = new Set(['pen', 'fountain', 'pencil', 'highlighter']);
const defaultPreferences = {
  tool: 'pen',
  color: '#EFECE4',
  penWidth: 3,
  eraserWidth: 15,
  inputMode: 'stylus',
  eraserMode: 'pixel'
};

function createHistoryForDocument(repository, documentId) {
  try {
    return repository.loadHistory(documentId) || createInkHistory(createInkDocument(documentId));
  } catch {
    return createInkHistory(createInkDocument(documentId));
  }
}

function loadPreferences(repository, documentId) {
  try {
    return {
      documentId,
      ...defaultPreferences,
      ...repository.loadPreferences(documentId)
    };
  } catch {
    return { documentId, ...defaultPreferences };
  }
}

function saveSafely(save) {
  try {
    save();
  } catch {
    // Persistence failures must not affect the editable in-memory document.
  }
}

export default function useInkDocument({ documentId, repository = browserInkRepository, saveDelay = 120 }) {
  const activeDocumentId = String(documentId);
  const documentIdRef = useRef(activeDocumentId);
  const repositoryRef = useRef(repository);
  documentIdRef.current = activeDocumentId;
  repositoryRef.current = repository;

  const [history, setHistory] = useState(() => createHistoryForDocument(repository, activeDocumentId));
  const [preferences, setPreferences] = useState(() => loadPreferences(repository, activeDocumentId));

  // A render-phase update makes the new note available in this same render,
  // rather than letting callbacks briefly target the previously displayed note.
  if (history.present.documentId !== activeDocumentId) {
    setHistory(createHistoryForDocument(repository, activeDocumentId));
  }
  if (preferences.documentId !== activeDocumentId) {
    setPreferences(loadPreferences(repository, activeDocumentId));
  }

  const applyCommand = useCallback(command => {
    setHistory(current => {
      const documentId = documentIdRef.current;
      const currentRepository = repositoryRef.current;
      const activeHistory = current.present.documentId === documentId
        ? current
        : createHistoryForDocument(currentRepository, documentId);
      return executeInkCommand(activeHistory, command);
    });
  }, []);

  const commitStroke = useCallback(stroke => {
    applyCommand({ type: 'commit-stroke', stroke });
  }, [applyCommand]);
  const removeStrokes = useCallback(strokeIds => {
    applyCommand({ type: 'remove-strokes', strokeIds });
  }, [applyCommand]);
  const clearDocument = useCallback(() => {
    applyCommand({ type: 'clear-document' });
  }, [applyCommand]);
  const addPage = useCallback(page => {
    applyCommand({ type: 'add-page', page });
  }, [applyCommand]);
  const undo = useCallback(() => {
    setHistory(current => current.present.documentId === documentIdRef.current
      ? undoInkHistory(current)
      : current);
  }, []);
  const redo = useCallback(() => {
    setHistory(current => current.present.documentId === documentIdRef.current
      ? redoInkHistory(current)
      : current);
  }, []);
  const updatePreference = useCallback((key, value) => {
    setPreferences(current => {
      const documentId = documentIdRef.current;
      const activePreferences = current.documentId === documentId
        ? current
        : loadPreferences(repositoryRef.current, documentId);
      return activePreferences[key] === value
        ? activePreferences
        : { ...activePreferences, [key]: value };
    });
  }, []);
  const setTool = useCallback(tool => {
    if (!supportedTools.has(tool)) return;
    updatePreference('tool', tool);
  }, [updatePreference]);
  const setColor = useCallback(color => {
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return;
    updatePreference('color', color);
  }, [updatePreference]);
  const setPenWidth = useCallback(penWidth => {
    if (!Number.isFinite(penWidth) || penWidth <= 0) return;
    updatePreference('penWidth', penWidth);
  }, [updatePreference]);
  const setEraserWidth = useCallback(eraserWidth => {
    if (!Number.isFinite(eraserWidth) || eraserWidth <= 0) return;
    updatePreference('eraserWidth', eraserWidth);
  }, [updatePreference]);
  const setInputMode = useCallback(inputMode => {
    if (inputMode !== 'stylus' && inputMode !== 'finger') return;
    updatePreference('inputMode', inputMode);
  }, [updatePreference]);
  const setEraserMode = useCallback(eraserMode => {
    if (eraserMode !== 'pixel' && eraserMode !== 'stroke') return;
    updatePreference('eraserMode', eraserMode);
  }, [updatePreference]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveSafely(() => repository.saveHistory(activeDocumentId, history));
    }, saveDelay);
    return () => clearTimeout(timer);
  }, [activeDocumentId, history, repository, saveDelay]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const { documentId, ...values } = preferences;
      saveSafely(() => repository.savePreferences(documentId, values));
    }, saveDelay);
    return () => clearTimeout(timer);
  }, [activeDocumentId, preferences, repository, saveDelay]);

  return {
    document: history.present,
    commitStroke,
    removeStrokes,
    clearDocument,
    addPage,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    tool: preferences.tool,
    setTool,
    color: preferences.color,
    setColor,
    penWidth: preferences.penWidth,
    setPenWidth,
    eraserWidth: preferences.eraserWidth,
    setEraserWidth,
    inputMode: preferences.inputMode,
    setInputMode,
    eraserMode: preferences.eraserMode,
    setEraserMode
  };
}
