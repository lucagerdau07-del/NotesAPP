import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepList } from "../src/components/AiChatPanel";

describe("StepList doc card", () => {
  const card = { kind: "gdoc", title: "Referat Klimawandel", url: "https://docs.google.com/document/d/abc/edit" };
  const steps = [
    { id: "1", name: "create_google_doc", label: "Google Doc erstellen: Referat", state: "done", card },
    { id: "2", name: "done", label: "Fertig", state: "done" },
  ];

  it("shows the card as an external link, even while the finished run's steps are folded", () => {
    render(<StepList steps={steps} elapsedMs={12000} />);
    const link = screen.getByRole("link", { name: /Referat Klimawandel/ });
    expect(link.getAttribute("href")).toBe(card.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.queryByText("Fertig")).toBeNull();
  });

  it("renders no card when no step produced one", () => {
    render(<StepList steps={[steps[1]]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
