import { describe, expect, it, vi } from "vitest";
import { readTaskAttachment, searchImages } from "../src/agent/taskTools.js";
import { fetchIservAttachment } from "../src/knowledge/iservSync.js";

const attachments = [{ filename: "Blatt.pdf", path: "/iserv/fs/1" }, { filename: "Kaputt.docx" }];
const blob = new Blob(["x"], { type: "application/pdf" });

describe("readTaskAttachment", () => {
  it("hands PDF pages back as images with a citation each", async () => {
    const read = vi.fn(async () => ({ name: "Blatt.pdf", images: ["data:a", "data:b"], text: "" }));
    const fetchAttachment = vi.fn(async () => blob);
    const result = await readTaskAttachment({ attachments, index: 0 }, { fetchAttachment, read });
    expect(fetchAttachment).toHaveBeenCalledWith({ attachment: attachments[0] });
    expect(read.mock.calls[0][0].name).toBe("Blatt.pdf");
    expect(result).toEqual({
      pages: [
        { src: "data:a", cite: "Blatt.pdf S. 1" },
        { src: "data:b", cite: "Blatt.pdf S. 2" },
      ],
    });
  });

  it("returns a text file as text", async () => {
    const read = async () => ({ name: "n.txt", images: [], text: "Hallo" });
    const result = await readTaskAttachment({ attachments, index: 0 }, { fetchAttachment: async () => blob, read });
    expect(result).toBe("Blatt.pdf\nHallo");
  });

  it("answers with Fehler, never throws", async () => {
    const deps = { fetchAttachment: async () => blob, read: async () => ({ images: [], text: "" }) };
    expect(await readTaskAttachment({ attachments, index: 7 }, deps)).toMatch(/^Fehler.*0 bis 1/);
    expect(await readTaskAttachment({ attachments: [], index: 0 }, deps)).toMatch(/^Fehler.*keine Anhänge/);
    expect(await readTaskAttachment({ attachments, index: 1 }, deps)).toMatch(/^Fehler.*nicht verfügbar/);
    expect(await readTaskAttachment({ attachments, index: 0 }, deps)).toMatch(/^Fehler.*keinen lesbaren/);
    const failing = {
      fetchAttachment: async () => {
        throw new Error("Download fehlgeschlagen.");
      },
      read: vi.fn(),
    };
    expect(await readTaskAttachment({ attachments, index: 0 }, failing)).toBe("Fehler: Download fehlgeschlagen.");
  });
});

describe("searchImages", () => {
  const body = {
    query: {
      pages: {
        2: {
          index: 2,
          title: "File:Zwei.png",
          imageinfo: [{ mime: "image/png", url: "u2", thumburl: "t2", descriptionurl: "p2", extmetadata: {} }],
        },
        1: {
          index: 1,
          title: "File:Bauhaus Dessau.jpg",
          imageinfo: [
            {
              mime: "image/jpeg",
              url: "u1",
              thumburl: "t1",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Bauhaus_Dessau.jpg",
              extmetadata: {
                LicenseShortName: { value: "CC BY-SA 4.0" },
                Artist: { value: '<a href="x">Max <b>Muster</b></a>' },
              },
            },
          ],
        },
        3: { index: 3, title: "File:Ton.ogg", imageinfo: [{ mime: "audio/ogg", url: "u3" }] },
      },
    },
  };
  const ok = (data) => vi.fn(async () => ({ ok: true, status: 200, json: async () => data }));

  it("maps Commons pages in rank order and drops non-images", async () => {
    const fetchImpl = ok(body);
    const result = await searchImages("Bauhaus", { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain("commons.wikimedia.org/w/api.php");
    expect(fetchImpl.mock.calls[0][0]).toContain("gsrsearch=Bauhaus");
    expect(result.results).toEqual([
      {
        title: "Bauhaus Dessau.jpg",
        page: "https://commons.wikimedia.org/wiki/File:Bauhaus_Dessau.jpg",
        thumb: "t1",
        license: "CC BY-SA 4.0",
        author: "Max Muster",
      },
      { title: "Zwei.png", page: "p2", thumb: "t2", license: "unbekannt", author: "unbekannt" },
    ]);
  });

  it("handles empty answers, bad status, network errors and an empty query", async () => {
    expect(await searchImages("x", { fetchImpl: ok({}) })).toMatch(/^Keine Bilder/);
    expect(await searchImages("x", { fetchImpl: vi.fn(async () => ({ ok: false, status: 503 })) })).toMatch(/^Fehler.*503/);
    const offline = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await searchImages("x", { fetchImpl: offline })).toMatch(/^Fehler.*offline/);
    expect(await searchImages("  ")).toMatch(/^Fehler/);
  });
});

describe("fetchIservAttachment", () => {
  const config = { baseUrl: "https://space.example/api/notes", accessKey: "k".repeat(20) };

  it("loads the file through the Space with the key", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, blob: async () => blob }));
    const data = await fetchIservAttachment({ attachment: { path: "/iserv/fs/1" }, config, fetchImpl });
    expect(data).toBe(blob);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://space.example/api/notes/iserv/file?path=%2Fiserv%2Ffs%2F1");
    expect(fetchImpl.mock.calls[0][1].headers["x-app-key"]).toBe(config.accessKey);
  });

  it("throws without a path or on a failed download", async () => {
    await expect(fetchIservAttachment({ attachment: {}, config, fetchImpl: vi.fn() })).rejects.toThrow();
    await expect(
      fetchIservAttachment({ attachment: { path: "/x" }, config, fetchImpl: async () => ({ ok: false }) }),
    ).rejects.toThrow();
  });
});
