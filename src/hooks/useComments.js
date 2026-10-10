import { useCallback, useState } from "react";
import { browserCommentRepository } from "../knowledge/commentRepository.js";

// Spiegelt die Kommentare eines Dokuments aus dem Speicher, damit Whiteboard
// und Dokumentansicht denselben Weg nutzen.
export default function useComments(documentId, repository = browserCommentRepository) {
  const [comments, setComments] = useState(() => repository.list(documentId));
  const [loadedFor, setLoadedFor] = useState(documentId);
  if (loadedFor !== documentId) {
    setLoadedFor(documentId);
    setComments(repository.list(documentId));
  }

  const run = useCallback(
    (change) => {
      change();
      setComments(repository.list(documentId));
    },
    [repository, documentId],
  );

  return {
    comments,
    addComment: useCallback((draft) => run(() => repository.add(documentId, draft)), [run, repository, documentId]),
    editComment: useCallback((id, text) => run(() => repository.edit(documentId, id, text)), [run, repository, documentId]),
    removeComment: useCallback((id) => run(() => repository.remove(documentId, id)), [run, repository, documentId]),
  };
}
