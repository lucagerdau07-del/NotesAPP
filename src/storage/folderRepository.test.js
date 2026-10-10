import { describe, expect, it } from "vitest";
import { createFolderRepository } from "./folderRepository.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

describe("folderRepository", () => {
  it("seeds the 7 default subject folders on first read", () => {
    const repo = createFolderRepository(fakeStorage());
    const folders = repo.listFolders();
    expect(folders).toHaveLength(7);
    expect(folders.map((f) => f.id)).toContain("mathe");
  });

  it("creates a custom folder alongside the defaults", () => {
    const repo = createFolderRepository(fakeStorage());
    const folder = repo.createFolder({ name: "Bio", color: "#4FA66B", icon: "leaf" });
    expect(folder.id).toBeTruthy();
    expect(repo.listFolders()).toHaveLength(8);
    expect(repo.listFolders().find((f) => f.id === folder.id)).toMatchObject({
      name: "Bio",
      color: "#4FA66B",
      icon: "leaf",
    });
  });

  it("renames a folder in place", () => {
    const repo = createFolderRepository(fakeStorage());
    const folder = repo.createFolder({ name: "Bio" });
    repo.renameFolder(folder.id, { name: "Biologie", color: "#000", icon: "star" });
    const updated = repo.listFolders().find((f) => f.id === folder.id);
    expect(updated).toMatchObject({ name: "Biologie", color: "#000", icon: "star" });
  });

  it("removes a folder", () => {
    const repo = createFolderRepository(fakeStorage());
    const folder = repo.createFolder({ name: "Bio" });
    repo.removeFolder(folder.id);
    expect(repo.listFolders().find((f) => f.id === folder.id)).toBeUndefined();
    expect(repo.listFolders()).toHaveLength(7);
  });
});
