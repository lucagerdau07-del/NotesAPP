export const CANONICAL_PAGE_WIDTH = 800;
export const PAGE_GAP = 28;
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_PAGE_CANVAS_PIXELS = 16_000_000;

const MIME_BY_EXTENSION = new Map([
  ['pdf', 'application/pdf'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
]);
const SUPPORTED_MIME = new Set(MIME_BY_EXTENSION.values());

export class ImportFailure extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = 'ImportFailure';
    this.code = code;
  }
}

export function titleFromFileName(name) {
  const trimmed = String(name || '').trim();
  const dot = trimmed.lastIndexOf('.');
  return (dot > 0 ? trimmed.slice(0, dot) : trimmed).trim() || 'Importiertes Dokument';
}

export function normalizeImportMime(file) {
  const declared = String(file?.type || '').toLowerCase();
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  const fromExtension = MIME_BY_EXTENSION.get(extension) || null;
  if (SUPPORTED_MIME.has(declared) && fromExtension && declared !== fromExtension) {
    throw new ImportFailure('type-mismatch', 'Dateiendung und Dateityp widersprechen sich.');
  }
  return SUPPORTED_MIME.has(declared) ? declared : fromExtension;
}

export function validateSingleImport(files) {
  const values = Array.from(files || []);
  if (values.length !== 1) throw new ImportFailure('single-file-required', 'Bitte jeweils nur eine Datei importieren.');
  const selected = values[0];
  const mimeType = normalizeImportMime(selected);
  if (!mimeType) throw new ImportFailure('unsupported-type', 'Unterstützt werden PDF-, PNG- und JPEG-Dateien.');
  if (selected.size === 0) throw new ImportFailure('empty-file', 'Die Datei ist leer.');
  if (selected.size > MAX_IMPORT_BYTES) throw new ImportFailure('file-too-large', 'Die Datei ist größer als 100 MB.');
  return { file: selected, mimeType, type: mimeType === 'application/pdf' ? 'pdf' : 'image' };
}

export function toPageDescriptors(noteId, sourcePages) {
  if (!Array.isArray(sourcePages) || sourcePages.length === 0) {
    throw new ImportFailure('no-pages', 'Das Dokument enthält keine darstellbare Seite.');
  }
  return sourcePages.map(({ width, height }, index) => {
    if (!(width > 0) || !(height > 0)) throw new ImportFailure('invalid-page-size', 'Eine Seite hat ungültige Abmessungen.');
    return {
      id: `${noteId}-page-${index + 1}`,
      index,
      width: CANONICAL_PAGE_WIDTH,
      height: CANONICAL_PAGE_WIDTH * height / width,
    };
  });
}
