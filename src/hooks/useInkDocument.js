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
const defaultPreferences = { inputMode: 'stylus', eraserMode: 'pixel' };

function createHistoryForDocument(repository, documentId) {
  try {
    return repository.loadHistory(documentId) || createInkHistory(createInkDocument(documentId));
  } catch {
    return createInkHistory(createInkDocument(documentId));
  }
}

function loadPreferences(repository) {
  try {
    return { ...defaultPreferences, ...repository.loadPreferences() };
  } catch {
    return { ...defaultPreferences };
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
  const [preferences, setPreferences] = useState(() => loadPreferences(repository));

  // A render-phase update makes the new note available in this same render,
  // rather than letting callbacks briefly target the previously displayed note.
  if (history.present.documentId !== activeDocumentId) {
    setHistory(createHistoryForDocument(repository, activeDocumentId));
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
  const setInputMode = useCallback(inputMode => {
    if (inputMode !== 'stylus' && inputMode !== 'finger') return;
    setPreferences(current => current.inputMode === inputMode ? current : { ...current, inputMode });
  }, []);
  const setEraserMode = useCallback(eraserMode => {
    if (eraserMode !== 'pixel' && eraserMode !== 'stroke') return;
    setPreferences(current => current.eraserMode === eraserMode ? current : { ...current, eraserMode });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveSafely(() => repository.saveHistory(activeDocumentId, history));
    }, saveDelay);
    return () => clearTimeout(timer);
  }, [activeDocumentId, history, repository, saveDelay]);

  useEffect(() => {
    const timer = setTimeout(() => {
      saveSafely(() => repository.savePreferences(preferences));
    }, saveDelay);
    return () => clearTimeout(timer);
  }, [preferences, repository, saveDelay]);

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
    inputMode: preferences.inputMode,
    setInputMode,
    eraserMode: preferences.eraserMode,
    setEraserMode
  };
}
