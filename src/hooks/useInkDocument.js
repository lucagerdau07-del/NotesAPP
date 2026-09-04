import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInkDocument,
  createInkHistory,
  executeInkCommand,
  executeInkCommands,
  redoInkHistory,
  undoInkHistory,
} from "../ink/inkDocument.js";
import { browserInkRepository } from "../ink/inkRepository.js";
import { INPUT_MODES } from "../ink/inputPolicy.js";

const supportedTools = new Set(["pen", "fountain", "pencil", "highlighter"]);
const defaultPreferences = {
  tool: "pen",
  color: "#EFECE4",
  penWidth: 3,
  eraserWidth: 15,
  inputMode: "stylus",
  eraserMode: "pixel",
};

function createHistoryForDocument(repository, documentId, initialPageIds, initialPageStyle) {
  try {
    return (
      repository.loadHistory(documentId) ||
      createInkHistory(createInkDocument(documentId, initialPageIds, initialPageStyle))
    );
  } catch {
    return createInkHistory(createInkDocument(documentId, initialPageIds, initialPageStyle));
  }
}

function loadPreferences(repository, documentId, initialColor) {
  try {
    const merged = {
      documentId,
      ...defaultPreferences,
      ...repository.loadPreferences(documentId),
    };
    // loadPreferences() always synthesizes a full object, so it can't tell
    // "nothing persisted" from "persisted, and it matches the default".
    // hasPreferences() can, though - it checks raw storage. Only when nothing
    // was ever saved does the preset's initialColor get to apply; any
    // existing document keeps whatever color it saved, even if that happens
    // to equal the default.
    const hasSavedPreferences =
      typeof repository.hasPreferences === "function" &&
      repository.hasPreferences(documentId);
    if (initialColor && !hasSavedPreferences) {
      merged.color = initialColor;
    }
    return merged;
  } catch {
    return {
      documentId,
      ...defaultPreferences,
      ...(initialColor ? { color: initialColor } : {}),
    };
  }
}

function saveSafely(save) {
  try {
    save();
  } catch {
    // Persistence failures must not affect the editable in-memory document.
  }
}

export default function useInkDocument({
  documentId,
  initialPageIds,
  initialPageStyle,
  initialColor,
  repository = browserInkRepository,
  saveDelay = 120,
  onPersisted,
}) {
  const activeDocumentId = String(documentId);
  const documentIdRef = useRef(activeDocumentId);
  const repositoryRef = useRef(repository);
  documentIdRef.current = activeDocumentId;
  repositoryRef.current = repository;

  const [history, setHistory] = useState(() =>
    createHistoryForDocument(repository, activeDocumentId, initialPageIds, initialPageStyle),
  );
  const [preferences, setPreferences] = useState(() =>
    loadPreferences(repository, activeDocumentId, initialColor),
  );

  // A render-phase update makes the new note available in this same render,
  // rather than letting callbacks briefly target the previously displayed note.
  if (history.present.documentId !== activeDocumentId) {
    setHistory(
      createHistoryForDocument(repository, activeDocumentId, initialPageIds, initialPageStyle),
    );
  }
  if (preferences.documentId !== activeDocumentId) {
    setPreferences(loadPreferences(repository, activeDocumentId, initialColor));
  }

  // The agent needs the document *after* its own commands land, within the same
  // tick — React state hasn't flushed yet at that point, so the ref is the
  // source of truth for batched writes and every one of them chains off it.
  const historyRef = useRef(history);
  historyRef.current = history;

  const applyCommands = useCallback((commands) => {
    const documentId = documentIdRef.current;
    const base =
      historyRef.current.present.documentId === documentId
        ? historyRef.current
        : createHistoryForDocument(repositoryRef.current, documentId);
    const next = executeInkCommands(base, commands);
    historyRef.current = next;
    setHistory(next);
    return next.present;
  }, []);

  const getDocument = useCallback(() => historyRef.current.present, []);

  const applyCommand = useCallback((command) => {
    setHistory((current) => {
      const documentId = documentIdRef.current;
      const currentRepository = repositoryRef.current;
      const activeHistory =
        current.present.documentId === documentId
          ? current
          : createHistoryForDocument(currentRepository, documentId);
      return executeInkCommand(activeHistory, command);
    });
  }, []);

  const commitStroke = useCallback(
    (stroke) => {
      applyCommand({ type: "commit-stroke", stroke });
    },
    [applyCommand],
  );
  const removeStrokes = useCallback(
    (strokeIds) => {
      applyCommand({ type: "remove-strokes", strokeIds });
    },
    [applyCommand],
  );
  const clearDocument = useCallback(() => {
    applyCommand({ type: "clear-document" });
  }, [applyCommand]);
  const addObject = useCallback(
    (object) => {
      applyCommand({ type: "add-object", object });
    },
    [applyCommand],
  );
  const updateObject = useCallback(
    (objectId, changes) => {
      applyCommand({ type: "update-object", objectId, changes });
    },
    [applyCommand],
  );
  const removeObjects = useCallback(
    (objectIds) => {
      applyCommand({ type: "remove-objects", objectIds });
    },
    [applyCommand],
  );
  const addPage = useCallback(
    (page) => {
      applyCommand({ type: "add-page", page });
    },
    [applyCommand],
  );
  // One command for the whole lasso selection (strokes + objects together),
  // so a single drag is a single undo step no matter how many items moved.
  const transformSelection = useCallback(
    (strokeIds, objectIds, transform) => {
      applyCommand({ type: "transform-selection", strokeIds, objectIds, ...transform });
    },
    [applyCommand],
  );
  const undo = useCallback(() => {
    setHistory((current) =>
      current.present.documentId === documentIdRef.current
        ? undoInkHistory(current)
        : current,
    );
  }, []);
  const redo = useCallback(() => {
    setHistory((current) =>
      current.present.documentId === documentIdRef.current
        ? redoInkHistory(current)
        : current,
    );
  }, []);
  const updatePreference = useCallback((key, value) => {
    setPreferences((current) => {
      const documentId = documentIdRef.current;
      const activePreferences =
        current.documentId === documentId
          ? current
          : loadPreferences(repositoryRef.current, documentId);
      return activePreferences[key] === value
        ? activePreferences
        : { ...activePreferences, [key]: value };
    });
  }, []);
  const setTool = useCallback(
    (tool) => {
      if (!supportedTools.has(tool)) return;
      updatePreference("tool", tool);
    },
    [updatePreference],
  );
  const setColor = useCallback(
    (color) => {
      if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) return;
      updatePreference("color", color);
    },
    [updatePreference],
  );
  const setPenWidth = useCallback(
    (penWidth) => {
      if (!Number.isFinite(penWidth) || penWidth <= 0) return;
      updatePreference("penWidth", penWidth);
    },
    [updatePreference],
  );
  const setEraserWidth = useCallback(
    (eraserWidth) => {
      if (!Number.isFinite(eraserWidth) || eraserWidth <= 0) return;
      updatePreference("eraserWidth", eraserWidth);
    },
    [updatePreference],
  );
  const setInputMode = useCallback(
    (inputMode) => {
      if (!INPUT_MODES.includes(inputMode)) return;
      updatePreference("inputMode", inputMode);
    },
    [updatePreference],
  );
  const setEraserMode = useCallback(
    (eraserMode) => {
      if (eraserMode !== "pixel" && eraserMode !== "stroke") return;
      updatePreference("eraserMode", eraserMode);
    },
    [updatePreference],
  );

  // onPersisted is a fresh closure on every caller render (it usually closes
  // over the current documentId), so it can't sit in this effect's deps: that
  // would restart the debounce timer on every unrelated re-render and could
  // starve the actual save indefinitely. A ref keeps the effect keyed only on
  // real document changes while still calling the latest callback.
  const onPersistedRef = useRef(onPersisted);
  onPersistedRef.current = onPersisted;

  useEffect(() => {
    const timer = setTimeout(() => {
      saveSafely(() => repository.saveHistory(activeDocumentId, history));
      onPersistedRef.current?.(activeDocumentId);
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
    applyCommands,
    getDocument,
    commitStroke,
    removeStrokes,
    clearDocument,
    addObject,
    updateObject,
    removeObjects,
    addPage,
    transformSelection,
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
    setEraserMode,
  };
}
