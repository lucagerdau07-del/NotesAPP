# File Open and Display System — Design Specification

**Date:** 2026-08-25  
**Topic:** PDF & Worksheet Import, Viewing, and Annotation System  
**Target:** React / Vite Web & Tablet Environment (NotesAPP/)

---

## 1. Overview & Objective

The goal is to enable students to import and open school worksheets, PDFs, and images (PNG, JPG) directly in the Notes application. The imported documents serve as multi-page background layers beneath the vector ink engine, allowing seamless handwriting, highlighting, zooming, panning, and Focus Box annotation.

Core capabilities:
- **Import Flow:** Import PDF or image documents from the Library or via Drag & Drop.
- **Persistent Local Storage:** Store original binary files (PDF/Image Blobs) in IndexedDB for reliable offline-first access on the tablet without memory overhead.
- **High-DPI Vector Rendering:** Render PDF pages using pdfjs-dist on per-page background canvases with dynamic zoom and devicePixelRatio scaling so that text and formulas remain crisp at any zoom level.
- **Ink & Coordinate Sync:** Map ink strokes, highlighters, and the Focus Box directly to page coordinates over the rendered PDF background.

---

## 2. User Experience & Flows

### 2.1 Library Import & Creation
- **" Datei öffnen / Importieren\ Action:** In the Library view, a Liquid-Glass pill button (FileUp / Plus icon) allows selecting .pdf, .png, .jpg, or .jpeg files.
- **Drag & Drop:** Users can drop PDF or image files anywhere onto the Library interface.
- **Subject Association:** If a subject (e.g. *Chemie*, *Mathe*) is currently filtered or active, the new document is automatically assigned to that subject. Otherwise, the user's default/selected subject is used.
- **Document Creation:** A new note record is created with the file name (without extension) as the title and an assigned ileId. The app immediately opens the editor for the new document.

### 2.2 Editor & Viewing Experience
- **Page Layout:** Multi-page PDFs render each page sequentially with consistent page gaps and page counter badges (SEITE X / Y).
- **Interactive Annotation:** Pen, fountain pen, pencil, highlighter, pixel/stroke eraser, lasso, and Focus Box operate directly on top of the worksheet.
- **Zoom & Pan:** Pinch-to-zoom and pan smoothly transform both the PDF background and the vector ink canvas in sync. Re-rendering at higher DPI occurs seamlessly when zooming in.
- **Navigation:** Tapping the back pill returns to the Library with all handwritten annotations and document states persisted.

---

## 3. Architecture & Data Model

### 3.1 Binary File Storage (IndexedDB)
Binary data is stored locally in an IndexedDB database named 
otes-app-db under the object store iles:

` s
interface FileRecord {
 fileId: string; // e.g. 'file_1724618000_a1b2c3d4'
 fileName: string; // e.g. 'Stoffwechsel_Uebungsblatt.pdf'
 mimeType: string; // 'application/pdf' | 'image/png' | 'image/jpeg'
 data: ArrayBuffer; // Binary file contents
 size: number; // Size in bytes
 createdAt: number; // Epoch timestamp
}
`

### 3.2 Note Metadata Model
Document metadata is maintained in the application state and persisted alongside note records:

` s
interface NoteMetadata {
 id: string; // Unique note ID (e.g. 'note-1724618000')
 title: string; // 'Stoffwechsel Übungsblatt'
 subject: string; // e.g. 'Chemie'
 fileId?: string; // Associated file ID in IndexedDB
 fileType?: 'pdf' | 'image';
 pageCount: number; // Total page count
 pageDimensions?: Array<{ width: number; height: number }>;
 when?: string; // e.g. 'heute'
 tag?: string; // e.g. 'Arbeitsblatt'
}
`

### 3.3 Ink Coordinate Mapping
- Ink strokes are stored in 
otes-app:ink:<documentId> via inkRepository.
- Stroke coordinates match the master document dimensions (aseWidth × (pageHeight * pageCount + gaps)).
- When a PDF page has a specific aspect ratio, aseWidth and pageHeight reflect the PDF's native aspect ratio (normalized to standard view width ~900px).

---

## 4. PDF Rendering Engine (DocumentView)

### 4.1 Rendering Pipeline
1. **Document Load:** DocumentView detects ileId in the active note metadata, retrieves the ArrayBuffer from IndexedDB, and loads the PDF document using pdfjs-dist.
2. **Page Preparation:** Determines 
umPages and viewport dimensions for each page. Initializes the ink document page count to match the PDF page count.
3. **Per-Page Canvas Rendering:**
 - Each page <div> contains a <canvas className=\pdf-page-canvas\> beneath the master ink canvas.
 - The canvas renders the PDF page using page.render({ canvasContext, viewport }).
 - Scale is calculated as: enderScale = (cssWidth / nativeWidth) * zoom * window.devicePixelRatio.
 - Canvas pixel dimensions are set to cssWidth * zoom * dpr while CSS display dimensions remain cssWidth * zoom.
4. **Debounced Zoom Re-render:** Panning uses existing canvas image transformations for 60fps fluidity; zooming triggers a debounced (100ms) re-render of visible pages for crisp vector rendering.

### 4.2 Image File Handling
- For image files (image/png, image/jpeg), the binary data is converted to an ObjectURL or rendered to a single page background canvas, matching the image aspect ratio.

---

## 5. Error Handling & Edge Cases

- **Corrupt File / Read Error:** Displays a non-blocking toast/banner (\Datei konnte nicht geladen werden\) with an option to return to the Library.
- **Large PDFs:** Pages are rendered asynchronously; invisible pages off-screen are rendered on-demand during scrolling to conserve memory on mobile tablets.
- **Offline Reliability:** No external network requests are required for PDF parsing or rendering; pdfjs-dist worker is bundled locally with Vite.

---

## 6. Verification & Testing Strategy

1. **Unit Tests:**
 - IndexedDB file repository (save, load, delete, list).
 - PDF metadata and page count extraction.
 - Note creation and file attachment logic.
2. **Component & Integration Tests:**
 - Library: Import button triggers file picker, creates note, and navigates to editor.
 - DocumentView: Correctly renders multi-page PDF backgrounds under the ink canvas.
 - Ink preservation: Annotations drawn on PDF pages are stored and reloaded accurately.
