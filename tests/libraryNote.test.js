import { describe, expect, it } from "vitest";
import { createLibraryNoteSession } from "../src/agent/libraryNote.js";
import { executeTool, AGENT_LIBRARY_TOOLS } from "../src/agent/tools.js";
import { createInkRepository } from "../src/ink/inkRepository.js";
import { createNoteRepository } from "../src/storage/noteRepository.js";
import { createFolderRepository } from "../src/storage/folderRepository.js";

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

function setup() {
  const storage = fakeStorage();
  const repos = {
    inkRepository: createInkRepository(storage),
    noteRepository: createNoteRepository(storage),
    folderRepository: createFolderRepository(storage),
  };
  return { ...repos, session: createLibraryNoteSession(repos) };
}

describe("library note session", () => {
  it("create_note makes an indexed note and write_text lands in its stored ink", async () => {
    const { session, noteRepository, inkRepository } = setup();
    const created = await executeTool("create_note", { title: "Zellen", folder: "Mathe" }, session.api);
    expect(created.pageIds).toHaveLength(1);
    expect(noteRepository.listNotes()[0]).toMatchObject({ id: created.noteId, title: "Zellen", subject: "Mathe" });

    await executeTool("write_text", { pageId: created.pageIds[0], text: "Hallo Welt" }, session.api);
    const stored = inkRepository.loadHistory(created.noteId).present;
    expect(stored.objects.some((o) => o.text?.includes("Hallo Welt"))).toBe(true);
  });

  it("open_note edits an existing note and refuses unknown or imported ids", async () => {
    const { session, noteRepository, inkRepository } = setup();
    const created = await executeTool("create_note", { title: "A" }, session.api);
    const second = createLibraryNoteSession({
      inkRepository,
      noteRepository,
      folderRepository: createFolderRepository(fakeStorage()),
    });
    const opened = await executeTool("open_note", { noteId: created.noteId }, second.api);
    await executeTool("write_text", { pageId: opened.pageIds[0], text: "Nachtrag" }, second.api);
    expect(inkRepository.loadHistory(created.noteId).present.objects).toHaveLength(1);

    expect(await executeTool("open_note", { noteId: "import-1" }, second.api)).toMatch(/^Fehler/);
  });

  it("document tools refuse without a target and create_note rejects unknown folders", async () => {
    const { session } = setup();
    expect(await executeTool("write_text", { pageId: "x", text: "a" }, session.api)).toMatch(/create_note oder open_note/);
    expect(await executeTool("create_note", { title: "A", folder: "Nope" }, session.api)).toMatch(/Ordner "Nope"/);
  });

  it("library tool set has no duplicate names", () => {
    const names = AGENT_LIBRARY_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(["create_note", "open_note", "write_text", "list_notes"]));
  });
});
