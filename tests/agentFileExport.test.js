import { describe, expect, it, afterEach, vi } from "vitest";
import { createFile, buildIcs, parseMarkdown } from "../src/agent/fileExport";
import { executeTool, AGENT_NO_DOCUMENT_TOOLS, AGENT_CORE_TOOLS } from "../src/agent/tools";

const head = async (blob, n) => new Uint8Array(await blob.arrayBuffer()).slice(0, n);
const asText = async (blob) => new TextDecoder().decode(await blob.arrayBuffer());
const ascii = (bytes) => String.fromCharCode(...bytes);

afterEach(() => vi.unstubAllGlobals());

describe("create_file", () => {
  const md = "# Kapitel\n\nEin **wichtiger** Satz.\n\n- eins\n- zwei";

  it("builds real pdf/docx/pptx/xlsx containers", async () => {
    const pdf = await createFile({ format: "pdf", title: "Lernzettel", text: md });
    expect(ascii(await head(pdf.blob, 4))).toBe("%PDF");
    expect(pdf.filename).toBe("Lernzettel.pdf");

    const docx = await createFile({ format: "docx", title: "Referat", text: md });
    expect(ascii(await head(docx.blob, 2))).toBe("PK");

    const pptx = await createFile({
      format: "pptx",
      title: "Vortrag",
      slides: [{ title: "Folie 1", bullets: ["a", "b"], notes: "Notiz" }],
    });
    expect(ascii(await head(pptx.blob, 2))).toBe("PK");

    const xlsx = await createFile({ format: "xlsx", title: "Noten", rows: [["Fach", "Note"], ["Mathe", 2], ["Summe", "=B2"]] });
    expect(ascii(await head(xlsx.blob, 2))).toBe("PK");
  });

  it("writes csv with semicolons, quoting and BOM; flashcards as tab pairs", async () => {
    const csv = await createFile({ format: "csv", title: "t", rows: [["a;b", 'sag "hi"'], [1, 2]] });
    const CRLF = String.fromCharCode(13, 10);
    expect(await asText(csv.blob)).toBe(['"a;b";"sag ""hi"""', "1;2"].join(CRLF)); // TextDecoder drops the BOM
    expect(Array.from(await head(csv.blob, 3))).toEqual([0xef, 0xbb, 0xbf]);

    const cards = await createFile({ format: "flashcards", title: "Vokabeln", cards: [{ front: "der Hund", back: "dog\nanimal" }] });
    expect(await asText(cards.blob)).toBe("der Hund\tdog animal\n");
    expect(cards.filename).toBe("Vokabeln.txt");
  });

  it("builds ics events, all-day and timed, with escaping", async () => {
    const blob = buildIcs(
      [
        { title: "Klausur, Mathe", start: "2026-10-12T08:00", end: "2026-10-12T09:30", location: "Raum 2" },
        { title: "Abgabe", start: "2026-10-14" },
      ],
      new Date("2026-10-05T10:00:00Z"),
    );
    const ics = await asText(blob);
    expect(ics).toContain("DTSTART:20261012T080000");
    expect(ics).toContain("DTEND:20261012T093000");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261014");
    expect(ics).toContain(String.raw`SUMMARY:Klausur\, Mathe`);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("rejects bad input with a German error instead of throwing through the tool", async () => {
    await expect(createFile({ format: "exe", title: "x" })).rejects.toThrow(/format muss/);
    await expect(createFile({ format: "pdf", title: "x", text: "  " })).rejects.toThrow(/text fehlt/);
    await expect(createFile({ format: "ics", title: "x", events: [{ title: "a", start: "morgen" }] })).rejects.toThrow(/Datum/);
    const result = await executeTool("create_file", { format: "xlsx", title: "x" }, { shareFile: async () => {} });
    expect(String(result)).toMatch(/^Fehler: rows fehlt/);
  });

  it("parses the markdown subset", () => {
    expect(parseMarkdown(md).map((b) => b.type)).toEqual(["h", "p", "li", "li"]);
  });

  it("executeTool hands the file to the share function", async () => {
    const shared = [];
    const result = await executeTool(
      "create_file",
      { format: "md", title: "Notiz/1", text: "# Hi" },
      { shareFile: async (blob, filename) => shared.push(filename) },
    );
    expect(shared).toEqual(["Notiz_1.md"]);
    expect(result.created).toBe("Notiz_1.md");
  });

  it("is offered in the library chat, wolfram also in the edit core", () => {
    const names = (tools) => tools.map((t) => t.function.name);
    expect(names(AGENT_NO_DOCUMENT_TOOLS)).toEqual(expect.arrayContaining(["create_file", "wolfram_alpha"]));
    expect(names(AGENT_CORE_TOOLS)).toContain("wolfram_alpha");
    expect(names(AGENT_CORE_TOOLS)).not.toContain("create_file");
  });
});

describe("wolfram_alpha", () => {
  it("posts the query to the proxy and returns its text", async () => {
    let seen;
    vi.stubGlobal("fetch", async (url, init) => {
      seen = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ result: "x = 2 or x = 3" }), { status: 200 });
    });
    const result = await executeTool("wolfram_alpha", { query: "solve x^2-5x+6=0" });
    expect(result).toBe("x = 2 or x = 3");
    expect(seen.url).toMatch(/\/api\/notes\/wolfram$/);
    expect(seen.body).toEqual({ query: "solve x^2-5x+6=0" });
  });

  it("turns proxy errors into a Fehler string", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "WOLFRAM_APPID fehlt" } }), { status: 500 }));
    expect(String(await executeTool("wolfram_alpha", { query: "1+1" }))).toMatch(/^Fehler: Wolfram\|Alpha fehlgeschlagen \(WOLFRAM_APPID fehlt\)/);
    expect(await executeTool("wolfram_alpha", { query: " " })).toMatch(/^Fehler: query ist leer/);
  });
});
