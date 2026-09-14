import { describe, expect, it } from "vitest";
import {
  citeOf,
  parseOcrReply,
  queryTerms,
  rankPages,
  readSource,
  searchSources,
  textOfContent,
  toPage,
} from "../src/knowledge/sources.js";

const bookPage = (index, text) =>
  toPage({ noteId: "vorleser", title: "Der Vorleser", kind: "pdf", index, text });

describe("source search", () => {
  it("folds case and accents and strips one inflection ending from the query", () => {
    expect(queryTerms("Die Revolutionen der Menschen im Märchen")).toEqual([
      "revolution",
      "mensch",
      "march",
    ]);
    expect(queryTerms("Analphabetinnen Kenntnissen Wasser")).toEqual([
      "analphabetin",
      "kenntnis",
      "wass",
    ]);
  });

  it("ranks the page holding every query term first and quotes it verbatim", () => {
    const pages = [
      bookPage(0, "Michael lernt Hanna kennen. Sie ist Straßenbahnschaffnerin."),
      bookPage(1, "Im Prozess wird klar: Hanna ist Analphabetin und verschweigt es aus Scham."),
      bookPage(2, "Photosynthese findet in den Chloroplasten statt."),
    ];
    const hits = rankPages(pages, "Hanna Analphabetin");
    expect(hits.map((hit) => hit.page.cite)).toEqual([
      "Der Vorleser, PDF-S. 2",
      "Der Vorleser, PDF-S. 1",
    ]);
    expect(hits[0].excerpt).toContain("Hanna ist Analphabetin");
  });

  it("finds a word hyphenated across a PDF line break", () => {
    const text = textOfContent({
      items: [
        { str: "Die Revolu-", hasEOL: true },
        { str: "tion begann.", hasEOL: false },
      ],
    });
    expect(text).toBe("Die Revolution begann.");
    expect(rankPages([bookPage(0, text)], "Revolutionen")).toHaveLength(1);
  });

  it("reads the printed page number off the first line of an OCR reply", () => {
    expect(parseOcrReply("SEITE: 47\n[Z. 5] Er kam zurück.")).toEqual({
      printedPage: "47",
      text: "[Z. 5] Er kam zurück.",
    });
    expect(parseOcrReply("**SEITE:** 112\nText").printedPage).toBe("112");
    expect(parseOcrReply("SEITE: -\nText")).toEqual({ printedPage: null, text: "Text" });
    expect(parseOcrReply("Seite 3 beginnt hier")).toEqual({
      printedPage: null,
      text: "Seite 3 beginnt hier",
    });
  });

  it("cites scans by printed page and PDFs by file page", () => {
    expect(citeOf({ title: "Faust", kind: "pdf", page: 12, printedPage: "47" })).toBe("Faust, S. 47");
    expect(citeOf({ title: "Faust", kind: "pdf", page: 12 })).toBe("Faust, PDF-S. 12");
    expect(citeOf({ title: "Arbeitsblatt", kind: "image", page: 1 })).toBe("Arbeitsblatt");
  });

  it("searches stored pages, reports sources still being read, and refuses unread pages", async () => {
    const repository = {
      listOcrPages: async () => [
        { pageIndex: 0, text: "Hanna kann nicht lesen.", printedPage: "47" },
      ],
    };
    const note = {
      id: "scan-1",
      title: "Der Vorleser",
      updatedAt: 1,
      source: { type: "pdf" },
      pages: [{}, {}],
    };
    const scope = { imported: [note] };
    const result = await searchSources("lesen", scope, repository);
    expect(result.hits).toEqual([
      { noteId: "scan-1", page: 1, cite: "Der Vorleser, S. 47", excerpt: "Hanna kann nicht lesen." },
    ]);
    expect(result.unread).toEqual(["Der Vorleser: 1 von 2 Seiten gelesen"]);
    expect(await readSource({ noteId: "scan-1", page: 2 }, scope, repository)).toMatch(
      /Seite 2 ist nicht lesbar/,
    );
  });
});
