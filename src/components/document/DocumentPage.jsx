import React, { useEffect, useRef, useState } from "react";
import PdfPageCanvas from "./PdfPageCanvas.jsx";
import ImagePageCanvas from "./ImagePageCanvas.jsx";
import InkPageCanvas from "./InkPageCanvas.jsx";
import PdfLinkLayer from "./PdfLinkLayer.jsx";
import { useBrowserLink } from "../../browser/BrowserLinkContext.jsx";

export default function DocumentPage({
  page,
  sourceType,
  sourceHandle,
  strokes = [],
  zoom = 1,
  dpr = 1,
  children,
}) {
  const openLink = useBrowserLink();
  const logicalWidth = page.width * zoom;
  const logicalHeight = page.height * zoom;
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasRendered(true);
        } else {
          setIsVisible(false);
        }
      },
      { rootMargin: "150% 0px 150% 0px" } // Render eagerly a page ahead
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="document-page"
      data-testid={`document-page-${page.id}`}
      data-page-id={page.id}
      data-page-index={page.index}
      style={{
        position: "absolute",
        width: `${Math.round(logicalWidth)}px`,
        height: `${Math.round(logicalHeight)}px`,
        margin: "0 auto",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 5px 24px rgba(0, 0, 0, 0.45)",
        borderRadius: "2px",
        overflow: "hidden",
      }}
    >
      {hasRendered && isVisible && (
        <>
          {sourceType === "pdf" && sourceHandle && (
            <PdfPageCanvas
              page={page}
              sourceHandle={sourceHandle}
              zoom={zoom}
              dpr={dpr}
            />
          )}
          {sourceType === "image" && sourceHandle && (
            <ImagePageCanvas
              page={page}
              sourceHandle={sourceHandle}
              zoom={zoom}
              dpr={dpr}
            />
          )}
          {sourceType === "pdf" && sourceHandle && (
            <PdfLinkLayer page={page} sourceHandle={sourceHandle} zoom={zoom} onOpenLink={openLink} />
          )}
          <InkPageCanvas page={page} strokes={strokes} zoom={zoom} dpr={dpr} />
        </>
      )}
      {children}
    </div>
  );
}
