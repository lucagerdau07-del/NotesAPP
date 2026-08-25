import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function openPdf(blob) {
  const loadingTask = getDocument({ data: await bytes(blob) });
  const document = await loadingTask.promise;
  return {
    document,
    async dispose() {
      await loadingTask.destroy();
    },
  };
}

export async function inspectPdf(blob) {
  const opened = await openPdf(blob);
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= opened.document.numPages; pageNumber += 1) {
      const page = await opened.document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ width: viewport.width, height: viewport.height });
      page.cleanup();
    }
    return pages;
  } finally {
    await opened.dispose();
  }
}
