import { useEffect, useState } from "react";
import { browserDocumentRepository } from "../storage/documentRepository.js";
import { openPdf as defaultOpenPdf } from "../documents/pdfRuntime.js";
import { openImage as defaultOpenImage } from "../documents/imageRuntime.js";

export default function useDocumentSource({
  note,
  repository = browserDocumentRepository,
  openPdf = defaultOpenPdf,
  openImage = defaultOpenImage,
} = {}) {
  const [sourceHandle, setSourceHandle] = useState(null);
  const [loading, setLoading] = useState(Boolean(note?.source?.fileId));
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let currentHandle = null;

    if (!note?.source?.fileId) {
      setSourceHandle(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    async function load() {
      try {
        const fileRecord = await repository.getFile(note.source.fileId);
        if (disposed) return;
        const handle =
          note.source.type === "pdf"
            ? await openPdf(fileRecord.blob)
            : await openImage(fileRecord.blob);
        if (disposed) {
          await handle?.dispose?.();
          return;
        }
        currentHandle = handle;
        setSourceHandle(handle);
      } catch (cause) {
        if (!disposed) {
          setError(cause);
          setSourceHandle(null);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    load();

    return () => {
      disposed = true;
      if (currentHandle) {
        currentHandle.dispose?.();
      }
    };
  }, [
    note?.source?.fileId,
    note?.source?.type,
    repository,
    openPdf,
    openImage,
    retryKey,
  ]);

  return { sourceHandle, loading, error, retry: () => setRetryKey((k) => k + 1) };
}
