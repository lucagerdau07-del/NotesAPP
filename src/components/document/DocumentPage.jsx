import React from 'react';
import PdfPageCanvas from './PdfPageCanvas.jsx';
import ImagePageCanvas from './ImagePageCanvas.jsx';
import InkPageCanvas from './InkPageCanvas.jsx';

export default function DocumentPage({
  page,
  sourceType,
  sourceHandle,
  strokes = [],
  zoom = 1,
  dpr = 1,
  children,
}) {
  const logicalWidth = page.width * zoom;
  const logicalHeight = page.height * zoom;

  return (
    <div
      className="document-page"
      data-testid={`document-page-${page.id}`}
      data-page-id={page.id}
      data-page-index={page.index}
      style={{
        position: 'absolute',
        width: `${Math.round(logicalWidth)}px`,
        height: `${Math.round(logicalHeight)}px`,
        margin: '0 auto',
        backgroundColor: '#FFFFFF',
        boxShadow: '0 5px 24px rgba(0, 0, 0, 0.45)',
        borderRadius: '2px',
        overflow: 'hidden',
      }}
    >
      {sourceType === 'pdf' && sourceHandle && (
        <PdfPageCanvas page={page} sourceHandle={sourceHandle} zoom={zoom} dpr={dpr} />
      )}
      {sourceType === 'image' && sourceHandle && (
        <ImagePageCanvas page={page} sourceHandle={sourceHandle} zoom={zoom} dpr={dpr} />
      )}
      <InkPageCanvas page={page} strokes={strokes} zoom={zoom} dpr={dpr} />
      {children}
    </div>
  );
}
