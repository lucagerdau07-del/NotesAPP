import React, { useEffect, useState } from "react";
import { isInternalBrowserUrl } from "../../browser/browserInput.js";

export default function PdfLinkLayer({ page, sourceHandle, zoom = 1, onOpenLink }) {
  const [links, setLinks] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const pdfPage = await sourceHandle?.document?.getPage?.(page.index + 1);
      const annotations = await pdfPage?.getAnnotations?.({ intent: "display" });
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      setLinks((annotations || []).filter((item) => item.subtype === "Link" && isInternalBrowserUrl(item.url)).map((item) => {
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(item.rect);
        return {
          url: item.url,
          label: item.title || item.contents || item.url,
          left: Math.min(x1, x2),
          top: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
        };
      }));
    }
    load().catch(() => !cancelled && setLinks([]));
    return () => { cancelled = true; };
  }, [page.index, sourceHandle, zoom]);

  return (
    <div className="pdf-link-layer" aria-label="PDF-Links">
      {links.map((link, index) => (
        <a
          key={`${link.url}-${index}`}
          href={link.url}
          aria-label={link.label}
          style={{ left: link.left, top: link.top, width: link.width, height: link.height }}
          onClick={(event) => {
            if (!onOpenLink) return;
            event.preventDefault();
            onOpenLink(link.url);
          }}
        />
      ))}
    </div>
  );
}
