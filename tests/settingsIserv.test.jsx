import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../src/agent/agentClient.js", () => ({
  requestCompletion: vi.fn(async () => ({ content: '{"homework":[],"exams":[],"terms":[]}' })),
}));

import Settings from "../src/components/Settings.jsx";

beforeEach(() => {
  globalThis.localStorage.clear();
});

async function openNetwork() {
  render(<Settings onBack={() => {}} />);
  fireEvent.click(screen.getByText("KI & Netzwerk"));
  // loadIservCredentials ist asynchron: erst danach speichern Änderungen.
  await act(async () => {});
}

describe("Settings — IServ-Sync-Account", () => {
  it("zeigt Felder für E-Mail und Passwort", async () => {
    await openNetwork();
    expect(screen.getByTestId("iserv-email-input")).toHaveAttribute("type", "email");
    expect(screen.getByTestId("iserv-password-input")).toHaveAttribute("type", "password");
  });

  it("speichert die Zugangsdaten lokal", async () => {
    await openNetwork();
    fireEvent.change(screen.getByTestId("iserv-email-input"), { target: { value: "luca@example.de" } });
    fireEvent.change(screen.getByTestId("iserv-password-input"), { target: { value: "geheim" } });

    await waitFor(() =>
      expect(JSON.parse(globalThis.localStorage.getItem("notes.iservCredentials"))).toEqual({
        email: "luca@example.de",
        password: "geheim",
      }),
    );
  });

  it("füllt gespeicherte Zugangsdaten wieder ein", async () => {
    globalThis.localStorage.setItem(
      "notes.iservCredentials",
      JSON.stringify({ email: "luca@example.de", password: "geheim" }),
    );
    await openNetwork();
    await waitFor(() => expect(screen.getByTestId("iserv-email-input")).toHaveValue("luca@example.de"));
    expect(screen.getByTestId("iserv-password-input")).toHaveValue("geheim");
  });
});
