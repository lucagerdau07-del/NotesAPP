import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PdfLinkLayer from "../src/components/document/PdfLinkLayer.jsx";

describe("PdfLinkLayer", () => {
  it("maps safe PDF annotations and opens them inside the app", async () => {
    const onOpenLink = vi.fn();
    const pdfPage = {
      getAnnotations: vi.fn().mockResolvedValue([
        { subtype: "Link", title: "Quelle", url: "https://example.com", rect: [10, 20, 110, 50] },
        { subtype: "Link", url: "javascript:alert(1)", rect: [0, 0, 10, 10] },
      ]),
      getViewport: () => ({ convertToViewportRectangle: ([x1, y1, x2, y2]) => [x1 * 2, y1 * 2, x2 * 2, y2 * 2] }),
    };
    const sourceHandle = { document: { getPage: vi.fn().mockResolvedValue(pdfPage) } };

    render(<PdfLinkLayer page={{ index: 0 }} sourceHandle={sourceHandle} zoom={2} onOpenLink={onOpenLink} />);
    const link = await screen.findByRole("link", { name: "Quelle" });
    expect(link).toHaveStyle({ left: "20px", top: "40px", width: "200px", height: "60px" });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.click(link);
    expect(onOpenLink).toHaveBeenCalledWith("https://example.com");
  });
});
