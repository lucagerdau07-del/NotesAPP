import { describe, it, expect } from "vitest";
import { learn, learnFromStorage, predict, setGlossary } from "../src/components/chemKeyboard/wordSuggest.js";

describe("predict", () => {
  it("always returns exactly three distinct words", () => {
    for (const prefix of ["", "o", "Ox", "xq", "Qzxv", "und", "Oxidatoin", "ä", "Zzzzzzzz", "H"]) {
      for (const sentenceStart of [false, true]) {
        const words = predict({ prefix, sentenceStart });
        expect(words, `${prefix}/${sentenceStart}`).toHaveLength(3);
        expect(new Set(words.map((w) => w.toLowerCase())).size).toBe(3);
      }
    }
  });

  it("completes a started word from the vocabulary", () => {
    expect(predict({ prefix: "Oxid" })[0]).toBe("Oxidation");
    expect(predict({ prefix: "säu" })).toContain("Säuren");
    expect(predict({ prefix: "reak" })).toContain("Reaktion");
  });

  it("fixes small typos and offers the word as typed when nothing matches", () => {
    expect(predict({ prefix: "Oxidatoin" })[0]).toBe("Oxidation");
    expect(predict({ prefix: "Reaktoin" })[0]).toBe("Reaktion");
    expect(predict({ prefix: "wasse" })[0]).toBe("Wasserstoff");
    expect(predict({ prefix: "Qzxv" })[0]).toBe("Qzxv");
  });

  it("starts a sentence with capitals and keeps nouns capitalised", () => {
    expect(predict({ prefix: "", sentenceStart: true }).every((w) => /^\p{Lu}/u.test(w))).toBe(true);
    expect(predict({ prefix: "", sentenceStart: false }).every((w) => /^\p{Ll}/u.test(w))).toBe(true);
    expect(predict({ prefix: "atom" })[0]).toBe("Atom");
  });

  it("prefers words already typed in the field", () => {
    expect(predict({ prefix: "Stoffm", extraWords: ["Stoffmengenwert"] })[0]).toBe("Stoffmengenwert");
  });

  it("learns your glossary and what follows a word in your notes", () => {
    setGlossary(["Zwitterion"]);
    expect(predict({ prefix: "Zwit" })[0]).toBe("Zwitterion");
    learn("Die Titration zeigt den Äquivalenzpunkt. Der Äquivalenzpunkt liegt bei pH sieben.");
    expect(predict({ prefix: "Äqui" })[0]).toBe("Äquivalenzpunkt");
    expect(predict({ prefix: "", previous: "der" })[0]).toBe("Äquivalenzpunkt");
  });

  it("reads text objects out of stored notes once", async () => {
    const store = new Map([
      ["notes-app:ink:a", JSON.stringify({ present: { objects: [{ type: "text", text: "Quantenzahl erklärt\nDrehimpulsquantenzahl" }] } })],
      ["notes-app:ink-preferences:a", JSON.stringify({ text: "Ignoriert" })],
    ]);
    const storage = { get length() { return store.size; }, key: (i) => [...store.keys()][i], getItem: (k) => store.get(k) };
    await learnFromStorage(storage);
    expect(predict({ prefix: "Drehimpulsq" })[0]).toBe("Drehimpulsquantenzahl");
    expect(predict({ prefix: "Ignorier" })).not.toContain("Ignoriert");
  });
});
