import { useCallback, useEffect, useState } from "react";
import { browserDocumentImporter } from "../documents/documentImporter.js";
import { queueSourceIndexing } from "../knowledge/sources.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";

export default function useDocumentLibrary({
  repository = browserDocumentRepository,
  importer = browserDocumentImporter,
  indexSources = queueSourceIndexing,
} = {}) {
  const [importedNotes, setImportedNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;
    repository
      .listImportedNotes()
      .then((notes) => {
        if (!disposed) setImportedNotes(notes);
        // Turns imports into searchable text for the agent, picking up
        // wherever the last pass stopped (see knowledge/sources.js).
        indexSources(notes, { repository });
      })
      .catch((cause) => {
        if (!disposed) setError(cause);
      })
      .finally(() => {
        if (!disposed) setIsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [repository, indexSources]);

  const importFiles = useCallback(
    async (files, subject) => {
      if (isImporting) return null;
      setIsImporting(true);
      setError(null);
      try {
        const note = await importer.importFiles(files, { subject });
        setImportedNotes((current) => [
          note,
          ...current.filter((item) => item.id !== note.id),
        ]);
        indexSources([note], { repository });
        return note;
      } catch (cause) {
        setError(cause);
        return null;
      } finally {
        setIsImporting(false);
      }
    },
    [importer, isImporting, indexSources, repository],
  );

  return {
    importedNotes,
    isLoading,
    isImporting,
    error,
    clearError: () => setError(null),
    importFiles,
  };
}
