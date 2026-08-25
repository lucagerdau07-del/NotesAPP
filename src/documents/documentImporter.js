import { browserDocumentRepository } from '../storage/documentRepository.js';
import {
  ImportFailure, MAX_IMAGE_PIXELS, titleFromFileName, toPageDescriptors, validateSingleImport,
} from './fileImport.js';
import { inspectPdf as inspectPdfDefault } from './pdfRuntime.js';
import { inspectImage as inspectImageDefault } from './imageRuntime.js';

function stableUuid() {
  return globalThis.crypto?.randomUUID?.() || `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDocumentImporter({
  repository = browserDocumentRepository,
  inspectPdf = inspectPdfDefault,
  inspectImage = inspectImageDefault,
  uuid = stableUuid,
  now = Date.now,
} = {}) {
  return {
    async importFiles(files, { subject = '' } = {}) {
      const { file, mimeType, type } = validateSingleImport(files);
      let sourcePages;
      try {
        sourcePages = type === 'pdf' ? await inspectPdf(file) : await inspectImage(file);
      } catch (error) {
        if (error?.name === 'PasswordException') {
          throw new ImportFailure('password-protected', 'Passwortgeschützte PDFs werden noch nicht unterstützt.', error);
        }
        throw new ImportFailure('decode-failed', 'Die Datei konnte nicht gelesen werden.', error);
      }
      if (type === 'image' && sourcePages[0].width * sourcePages[0].height > MAX_IMAGE_PIXELS) {
        throw new ImportFailure('image-too-large', 'Das Bild ist für die Verarbeitung auf diesem Gerát zu groß.');
      }
      const noteId = uuid();
      const fileId = uuid();
      const timestamp = now();
      const note = {
        schemaVersion: 1,
        id: noteId,
        kind: 'imported',
        title: titleFromFileName(file.name),
        subject: String(subject || ''),
        createdAt: timestamp,
        updatedAt: timestamp,
        source: { fileId, type },
        pages: toPageDescriptors(noteId, sourcePages),
      };
      const fileRecord = {
        id: fileId,
        name: file.name.trim(),
        mimeType,
        size: file.size,
        blob: file.slice(0, file.size, mimeType),
        createdAt: timestamp,
      };
      await repository.saveImportedDocument({ note, file: fileRecord });
      return note;
    },
  };
}

export const browserDocumentImporter = createDocumentImporter();
