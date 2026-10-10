import { describe, expect, it, vi } from "vitest";
import {
  openIservAttachment,
  pullIservEvents,
  syncIserv,
  taskToEvent,
} from "../src/knowledge/iservSync.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const config = { baseUrl: "https://space.example/api/notes/", accessKey: "k".repeat(20) };

const task = (overrides = {}) => ({
  id: 1,
  url: "https://schule.example/iserv/exercise/show/1",
  title: "Blatt 3",
  tags: "Mathe",
  due: "2026-09-24T14:30",
  done: false,
  expired: false,
  description: "Löse Seite 10",
  attachments: [{ filename: "Blatt.pdf", path: "/iserv/fs/file/exercise/1" }],
  ...overrides,
});

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  blob: async () => new Blob(["x"]),
});

function memoryRepository() {
  const values = new Map();
  return createKnowledgeRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => 1 },
  );
}

describe("taskToEvent", () => {
  it("macht aus einer Aufgabe eine Hausaufgabe mit Frist und Uhrzeit", () => {
    expect(taskToEvent(task())).toEqual({
      kind: "homework",
      title: "Blatt 3",
      subject: "Mathe",
      due: "2026-09-24",
      time: "14:30",
      iservId: "https://schule.example/iserv/exercise/show/1",
      url: "https://schule.example/iserv/exercise/show/1",
      description: "Löse Seite 10",
      attachments: [{ filename: "Blatt.pdf", path: "/iserv/fs/file/exercise/1" }],
      iservClosed: false,
    });
  });

  it("nimmt ein Datum ohne Uhrzeit ohne time", () => {
    expect(taskToEvent(task({ due: "2026-09-24" })).time).toBeUndefined();
  });

  it("meldet erledigt und abgelaufen als geschlossen", () => {
    expect(taskToEvent(task({ done: true })).iservClosed).toBe(true);
    expect(taskToEvent(task({ expired: true })).iservClosed).toBe(true);
  });

  it("verwirft Aufgaben ohne Titel, Frist oder URL", () => {
    expect(taskToEvent(task({ title: " " }))).toBeNull();
    expect(taskToEvent(task({ due: null }))).toBeNull();
    expect(taskToEvent(task({ url: "" }))).toBeNull();
  });

  it("verträgt fehlende Anhänge", () => {
    expect(taskToEvent(task({ attachments: null })).attachments).toEqual([]);
  });
});

describe("pullIservEvents", () => {
  it("fragt den Space mit dem Schlüssel und gibt die Termine zurück", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ tasks: [task(), task({ id: 2, title: "" })] }));
    const events = await pullIservEvents({ config, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://space.example/api/notes/iserv/tasks");
    expect(fetchImpl.mock.calls[0][1].headers["x-app-key"]).toBe(config.accessKey);
    expect(events).toHaveLength(1);
  });

  it("wirft bei einem Fehlerstatus", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unreachable" }, 502));
    await expect(pullIservEvents({ config, fetchImpl })).rejects.toThrow();
  });
});

describe("syncIserv", () => {
  it("ist ohne Zugriffsschlüssel aus und fragt nicht", async () => {
    const fetchImpl = vi.fn();
    const result = await syncIserv({
      repository: memoryRepository(),
      loadConfig: () => ({ ...config, accessKey: "" }),
      fetchImpl,
    });
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("trägt neue Aufgaben ein und hakt geschlossene bekannte ab", async () => {
    const repository = memoryRepository();
    const loadConfig = () => config;
    await syncIserv({ repository, loadConfig, fetchImpl: async () => jsonResponse({ tasks: [task()] }) });
    expect(repository.read().events).toHaveLength(1);

    const unknownClosed = task({ id: 9, url: "https://schule.example/iserv/exercise/show/9", expired: true });
    const added = await syncIserv({
      repository,
      loadConfig,
      fetchImpl: async () => jsonResponse({ tasks: [task({ expired: true }), unknownClosed] }),
    });

    expect(added).toBe(0);
    const { events } = repository.read();
    expect(events).toHaveLength(1);
    expect(events[0].done).toBe(true);
    expect(events[0].sourceNoteId).toBe("iserv");
  });

  it("wirft bei einem Fehler, damit der Hook den Zustand setzt", async () => {
    await expect(
      syncIserv({
        repository: memoryRepository(),
        loadConfig: () => config,
        fetchImpl: async () => jsonResponse({}, 503),
      }),
    ).rejects.toThrow();
  });
});

describe("openIservAttachment", () => {
  it("lädt die Datei über den Space und reicht sie ans Teilen-Menü", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const share = vi.fn(async () => {});
    await openIservAttachment({
      attachment: { filename: "Blatt:1.pdf", path: "/iserv/fs/file/exercise/1" },
      config,
      share,
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://space.example/api/notes/iserv/file?path=%2Fiserv%2Ffs%2Ffile%2Fexercise%2F1",
    );
    expect(share).toHaveBeenCalledWith(expect.any(Blob), "Blatt_1.pdf");
  });

  it("wirft ohne Pfad", async () => {
    await expect(openIservAttachment({ attachment: { filename: "x" }, config, fetchImpl: vi.fn() })).rejects.toThrow();
  });

  it("wirft, wenn der Space die Datei nicht liefert", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "refused" }, 502));
    await expect(
      openIservAttachment({ attachment: { filename: "x", path: "/iserv/x" }, config, share: vi.fn(), fetchImpl }),
    ).rejects.toThrow();
  });
});
