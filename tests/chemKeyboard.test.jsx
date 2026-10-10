import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ChemKeyboard from "../src/components/ChemKeyboard.jsx";
import { typedChar } from "../src/components/chemKeyboard/chemKeyboardLogic.js";
import { setChemKeyboardEnabled } from "../src/components/chemKeyboard/chemKeyboardState.js";

describe("typedChar", () => {
  it("maps digits and charges by script mode", () => {
    expect(typedChar("2", { script: "sub" })).toBe("₂");
    expect(typedChar("3", { script: "sup" })).toBe("³");
    expect(typedChar("+", { script: "sup" })).toBe("⁺");
    expect(typedChar("a", { script: "sub" })).toBe("a");
  });

  it("formula mode subscripts digits after letters, brackets and subscripts only", () => {
    const f = (ch, before) => typedChar(ch, { formula: true, before });
    expect(f("2", "H")).toBe("₂");
    expect(f("3", ")")).toBe("₃");
    expect(f("2", "₁")).toBe("₂");
    expect(f("2", "")).toBe("2");
    expect(f("2", " ")).toBe("2");
    expect(typedChar("2", { before: "H" })).toBe("2");
  });
});

describe("ChemKeyboard", () => {
  afterEach(() => setChemKeyboardEnabled(false));

  const focusField = async () => {
    const field = document.createElement("div");
    // jsdom has no isContentEditable
    Object.defineProperty(field, "isContentEditable", { value: true });
    field.tabIndex = 0;
    document.body.appendChild(field);
    await act(async () => {
      field.focus();
      await new Promise((r) => setTimeout(r, 5));
    });
    return field;
  };

  it("stays hidden until it is switched on and a page field has focus", async () => {
    render(<ChemKeyboard />);
    await focusField();
    expect(screen.queryByTestId("chem-keyboard")).toBeNull();
    act(() => setChemKeyboardEnabled(true));
    await focusField();
    expect(screen.getByTestId("chem-keyboard")).toBeTruthy();
  });

  it("types the script-mapped character into the focused field", async () => {
    document.execCommand = vi.fn();
    act(() => setChemKeyboardEnabled(true));
    render(<ChemKeyboard />);
    await focusField();
    fireEvent.pointerDown(screen.getByText("aₙ"));
    fireEvent.pointerDown(screen.getByText("2"));
    fireEvent.pointerUp(screen.getByText("2"));
    expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "₂");
  });

  it("long press opens variants and releasing over one types it", async () => {
    vi.useFakeTimers();
    document.execCommand = vi.fn();
    act(() => setChemKeyboardEnabled(true));
    render(<ChemKeyboard />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5);
    });
    const key = screen.getByText("s");
    fireEvent.pointerDown(key);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText("ß")).toBeTruthy();
    document.elementFromPoint = () => screen.getByText("ß");
    fireEvent.pointerUp(key);
    expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "ß");
    vi.useRealTimers();
  });
});
