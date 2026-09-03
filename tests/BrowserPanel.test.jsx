import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BrowserPanel from "../src/components/BrowserPanel.jsx";
import { createBrowserRepository } from "../src/browser/browserRepository.js";

function harness({ native = true } = {}) {
  let listener = () => {};
  const bridge = {
    isNative: native,
    mount: vi.fn(),
    setFrame: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    load: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    openExternal: vi.fn(),
    subscribe: vi.fn((next) => {
      listener = next;
      return () => {
        listener = () => {};
      };
    }),
  };
  return {
    bridge,
    repository: createBrowserRepository(globalThis.localStorage),
    emit: (event) => listener(event),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("BrowserPanel", () => {
  it("sends non-URL text to Google and exposes the page URL", () => {
    const { bridge, repository } = harness();
    render(<BrowserPanel active bridge={bridge} repository={repository} />);

    fireEvent.change(screen.getByLabelText("Adresse oder Google-Suche"), {
      target: { value: "zellatmung lernen" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Browsernavigation" }),
    );

    expect(bridge.load).toHaveBeenCalledWith(
      "https://www.google.com/search?q=zellatmung%20lernen",
    );
    expect(screen.getByLabelText("Adresse oder Google-Suche")).toHaveValue(
      "https://www.google.com/search?q=zellatmung%20lernen",
    );
  });

  it("adds and edits the current page from the top plus button", () => {
    const { bridge, repository } = harness();
    render(
      <BrowserPanel
        active
        bridge={bridge}
        repository={repository}
        initialUrl="https://example.com/"
      />,
    );

    fireEvent.click(screen.getByTitle("Zum Schnellzugriff hinzufügen"));
    expect(bridge.hide).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Shortcut-Name"), {
      target: { value: "Beispiel" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Shortcut speichern" }),
    );
    fireEvent.click(screen.getByTitle("Startseite"));

    expect(screen.getByRole("button", { name: "Beispiel öffnen" })).toBeVisible();
    expect(repository.listShortcuts()[0]).toMatchObject({
      title: "Beispiel",
      url: "https://example.com/",
    });
  });

  it("searches, reopens, and clears only the 30-day history", () => {
    const { bridge, repository } = harness();
    repository.saveShortcut({ title: "Docs", url: "https://docs.example" });
    repository.recordVisit({ title: "Biologie", url: "https://school.example/bio" });
    render(<BrowserPanel active bridge={bridge} repository={repository} />);

    fireEvent.click(screen.getByRole("tab", { name: "Verlauf durchsuchen" }));
    fireEvent.change(screen.getByLabelText("Verlauf durchsuchen"), {
      target: { value: "bio" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Biologie öffnen/ }));
    expect(bridge.load).toHaveBeenCalledWith("https://school.example/bio");

    fireEvent.click(screen.getByTitle("Startseite"));
    fireEvent.click(screen.getByRole("tab", { name: "Verlauf durchsuchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Verlauf löschen" }));
    fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    expect(repository.listHistory()).toEqual([]);
    expect(repository.listShortcuts()).toHaveLength(1);
  });

  it("renders retry and external recovery for native loading errors", () => {
    const { bridge, repository, emit } = harness();
    render(
      <BrowserPanel
        active
        bridge={bridge}
        repository={repository}
        initialUrl="https://offline.example/"
      />,
    );

    act(() => {
      emit({
        type: "error",
        url: "https://offline.example/",
        message: "Keine Verbindung",
      });
    });

    expect(screen.getByText("Seite nicht erreichbar")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Extern öffnen" }));
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(bridge.reload).toHaveBeenCalled();
    expect(bridge.openExternal).toHaveBeenCalledWith("https://offline.example/");
  });

  it("reacts to native state, load completion, and hardware back at root", () => {
    const { bridge, repository, emit } = harness();
    render(
      <BrowserPanel
        active
        bridge={bridge}
        repository={repository}
        initialUrl="https://example.com/"
      />,
    );

    act(() => {
      emit({
        type: "state",
        url: "https://example.com/next",
        title: "Nächste Seite",
        canGoBack: true,
        canGoForward: false,
      });
      emit({
        type: "load-end",
        url: "https://example.com/next",
        title: "Nächste Seite",
      });
    });
    expect(screen.getByTitle("Zurück")).toBeEnabled();
    expect(screen.getByTitle("Vor")).toBeDisabled();
    expect(repository.listHistory()[0].title).toBe("Nächste Seite");

    act(() => {
      emit({ type: "back-at-root" });
    });
    expect(screen.getByText("Meine Shortcuts")).toBeVisible();
  });

  it("loads every navigation request, survives inactive mode, and cleans up", async () => {
    const { bridge, repository } = harness();
    const view = render(
      <BrowserPanel
        active
        bridge={bridge}
        repository={repository}
        navigationRequest={{ id: 1, url: "https://example.com/" }}
      />,
    );

    view.rerender(
      <BrowserPanel
        active={false}
        bridge={bridge}
        repository={repository}
        navigationRequest={{ id: 2, url: "https://example.com/" }}
      />,
    );
    expect(bridge.load).toHaveBeenCalledTimes(2);
    expect(bridge.hide).toHaveBeenCalled();

    view.unmount();
    await waitFor(() => expect(bridge.destroy).toHaveBeenCalled());
  });
});
