import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Markdown from "../src/components/Markdown.jsx";
import { BrowserLinkProvider } from "../src/browser/BrowserLinkContext.jsx";

it("routes safe Markdown links through the app browser", () => {
  const openLink = vi.fn();
  render(<BrowserLinkProvider openLink={openLink}><Markdown text="[Quelle](https://example.com)" /></BrowserLinkProvider>);
  fireEvent.click(screen.getByRole("link", { name: "Quelle" }));
  expect(openLink).toHaveBeenCalledWith("https://example.com");
});

it("does not turn unsafe Markdown URLs into links", () => {
  render(<Markdown text="[Nicht öffnen](javascript:alert(1))" />);
  expect(screen.queryByRole("link")).toBeNull();
});
