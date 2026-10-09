import { useCallback, useEffect, useRef, useState } from "react";
import { browserDocumentImporter } from "../documents/documentImporter.js";
import { renderImportedThumbnail } from "../documents/importedThumbnail.js";
import { queueHandwritingIndexing, queueSourceIndexing } from "../knowledge/sources.js";
import { browserNoteRepository } from "../storage/noteRepository.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";

export default function useDocumentLibrary({
  repository = browserDocumentRepository,
  importer = browserDocumentImporter,
  indexSources = queueSourceIndexing,
  indexHandwriting = queueHandwritingIndexing,
  noteRepository = browserNoteRepository,
  thumbnailer = renderImportedThumbnail,
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
        // Then the handwriting of the user's own notes, so the agent can
        // search class notes as well as books.
        indexHandwriting(noteRepository.listNotes(), { repository });
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
  }, [repository, indexSources, indexHandwriting, noteRepository]);

  // Card previews: imports made before thumbnails existed (and any new one)
  // get theirs rendered once, one at a time, and stored on the note.
  const thumbnailTried = useRef(new Set());
  useEffect(() => {
    if (!repository.getFile || !repository.saveImportedThumbnail) return;
    const missing = importedNotes.filter(
      (note) => !note.thumbnail && note.source?.fileId && !thumbnailTried.current.has(note.id),
    );
    missing.forEach((note) => thumbnailTried.current.add(note.id));
    (async () => {
      for (const note of missing) {
        try {
          const file = await repository.getFile(note.source.fileId);
          const thumbnail = await thumbnailer(file.blob, note.source.type);
          await repository.saveImportedThumbnail(note.id, thumbnail);
          setImportedNotes((current) =>
            current.map((item) => (item.id === note.id ? { ...item, thumbnail } : item)),
          );
        } catch {
          // No preview then - the card keeps its text-only look.
        }
      }
    })();
  }, [importedNotes, repository, thumbnailer]);

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
