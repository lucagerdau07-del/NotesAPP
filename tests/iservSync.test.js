import { describe, expect, it, vi } from "vitest";
import {
  ISERV_BUCKET,
  openIservAttachment,
  pullIservEvents,
  rowToEvent,
  syncIserv,
} from "../src/knowledge/iservSync.js";
import { createKnowledgeRepository } from "../src/knowledge/knowledgeRepository.js";

const row = (overrides = {}) => ({
  id: "https://iserv/ex/1",
  title: "Blatt 3",
  subject: "Mathe",
  due: "2026-09-24",
  url: "https://iserv/ex/1",
  description: "Löse Seite 10",
  attachments: [{ filename: "Blatt.pdf", path: "u/h/Blatt.pdf", size_bytes: 3 }],
  ...overrides,
});

const credentials = { email: "a@b.de", password: "pw" };

function fakeClient({ session = null, rows = [], signInError = null, queryError = null } = {}) {
  const order = vi.fn(async () => ({ data: rows, error: queryError }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  const schema = vi.fn(() => ({ from }));
  const signInWithPassword = vi.fn(async () => ({ error: signInError }));
  const getSession = vi.fn(async () => ({ data: { session } }));
  return { client: { auth: { getSession, signInWithPassword }, schema }, signInWithPassword, schema, from };
}

function memoryRepository() {
  const values = new Map();
  return createKnowledgeRepository(
    { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    { now: () => 1 },
  );
}

describe("rowToEvent", () => {
  it("macht aus einer Zeile eine Hausaufgabe", () => {
    expect(rowToEvent(row())).toEqual({
      kind: "homework",
      title: "Blatt 3",
      subject: "Mathe",
      due: "2026-09-24",
      iservId: "https://iserv/ex/1",
      url: "https://iserv/ex/1",
      description: "Löse Seite 10",
      attachments: [{ filename: "Blatt.pdf", path: "u/h/Blatt.pdf", size_bytes: 3 }],
    });
  });

  it("verwirft Zeilen ohne Titel", () => {
    expect(rowToEvent(row({ title: "  " }))).toBeNull();
  });

  it("verwirft Zeilen ohne lesbare Frist", () => {
    expect(rowToEvent(row({ due: null }))).toBeNull();
    expect(rowToEvent(row({ due: "" }))).toBeNull();
  });

  it("verträgt fehlende Anhänge", () => {
    expect(rowToEvent(row({ attachments: null })).attachments).toEqual([]);
  });

  it("übernimmt eine gültige Abgabeuhrzeit", () => {
    expect(rowToEvent(row({ due_time: "07:45" })).time).toBe("07:45");
  });

  it("lässt die Uhrzeit weg, wenn keine gesetzt oder ungültig ist", () => {
    expect(rowToEvent(row({ due_time: null })).time).toBeUndefined();
    expect(rowToEvent(row({ due_time: "irgendwann" })).time).toBeUndefined();
  });

  it("liest die Uhrzeit aus deadline_raw, wenn due_time fehlt", () => {
    const philo = row({ due: "2026-09-28", due_time: null, deadline_raw: "2026-09-28T00:00:00+02:00" });
    expect(rowToEvent(philo).time).toBe("00:00");
  });

  it("bevorzugt due_time und ignoriert ein deadline_raw mit anderem Datum", () => {
    expect(rowToEvent(row({ due_time: "07:45", deadline_raw: "2026-09-24T18:00:00+02:00" })).time).toBe("07:45");
    expect(rowToEvent(row({ deadline_raw: "2026-09-23T18:00:00+02:00" })).time).toBeUndefined();
    expect(rowToEvent(row({ deadline_raw: "Do, 24.09.2026" })).time).toBeUndefined();
  });
});

describe("pullIservEvents", () => {
  it("meldet sich an, wenn keine Sitzung besteht", async () => {
    const { client, signInWithPassword } = fakeClient({ rows: [row()] });
    const events = await pullIservEvents({ client, credentials });
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "a@b.de", password: "pw" });
    expect(events).toHaveLength(1);
  });

  it("meldet sich nicht erneut an, wenn eine Sitzung besteht", async () => {
    const { client, signInWithPassword } = fakeClient({ session: {}, rows: [row()] });
    await pullIservEvents({ client, credentials });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("liest die Tabelle notesapp.iserv_tasks", async () => {
    const { client, schema, from } = fakeClient({ session: {} });
    await pullIservEvents({ client, credentials });
    expect(schema).toHaveBeenCalledWith("notesapp");
    expect(from).toHaveBeenCalledWith("iserv_tasks");
  });

  it("wirft bei einem Loginfehler", async () => {
    const { client } = fakeClient({ signInError: new Error("Invalid login") });
    await expect(pullIservEvents({ client, credentials })).rejects.toThrow("Invalid login");
  });

  it("wirft bei einem Lesefehler", async () => {
    const { client } = fakeClient({ session: {}, queryError: new Error("offline") });
    await expect(pullIservEvents({ client, credentials })).rejects.toThrow("offline");
  });

  it("lässt Zeilen ohne Frist aus", async () => {
    const { client } = fakeClient({ session: {}, rows: [row(), row({ id: "x", due: null })] });
    expect(await pullIservEvents({ client, credentials })).toHaveLength(1);
  });
});

describe("syncIserv", () => {
  it("gibt null zurück, wenn nichts eingerichtet ist", async () => {
    const repository = memoryRepository();
    const { client } = fakeClient();
    expect(await syncIserv({ repository, client, loadCredentials: async () => null })).toBeNull();
    expect(await syncIserv({ repository, client: null, loadCredentials: async () => credentials })).toBeNull();
    expect(
      await syncIserv({ repository, client, loadCredentials: async () => ({ email: "a@b.de", password: "" }) }),
    ).toBeNull();
  });

  it("trägt Zeilen als Termine ein und zählt nur neue", async () => {
    const repository = memoryRepository();
    const { client } = fakeClient({ session: {}, rows: [row()] });
    const options = { repository, client, loadCredentials: async () => credentials };

    expect(await syncIserv(options)).toBe(1);
    expect(repository.read().events[0]).toMatchObject({
      sourceNoteId: "iserv",
      iservId: "https://iserv/ex/1",
      kind: "homework",
    });
    expect(await syncIserv(options)).toBe(0);
  });
});

describe("openIservAttachment", () => {
  const client = (download) => ({ storage: { from: vi.fn(() => ({ download })) } });

  it("lädt den Anhang aus dem Bucket und reicht ihn ans Teilen-Menü", async () => {
    const blob = new Blob(["x"]);
    const download = vi.fn(async () => ({ data: blob, error: null }));
    const share = vi.fn(async () => {});
    const fake = client(download);

    await openIservAttachment({
      client: fake,
      attachment: { filename: "Blatt 1.pdf", path: "u/h/Blatt_1.pdf" },
      share,
    });

    expect(fake.storage.from).toHaveBeenCalledWith(ISERV_BUCKET);
    expect(download).toHaveBeenCalledWith("u/h/Blatt_1.pdf");
    expect(share).toHaveBeenCalledWith(blob, "Blatt 1.pdf");
  });

  it("bereinigt Zeichen, die kein Dateiname enthalten darf", async () => {
    const share = vi.fn(async () => {});
    const download = vi.fn(async () => ({ data: new Blob(["x"]), error: null }));
    await openIservAttachment({
      client: client(download),
      attachment: { filename: "a/b:c.pdf", path: "u/h/a_b_c.pdf" },
      share,
    });
    expect(share.mock.calls[0][1]).toBe("a_b_c.pdf");
  });

  it("wirft, wenn der Anhang keinen Pfad hat", async () => {
    await expect(
      openIservAttachment({ client: {}, attachment: { filename: "x.pdf", path: null }, share: vi.fn() }),
    ).rejects.toThrow();
  });

  it("wirft, wenn der Download scheitert", async () => {
    const download = vi.fn(async () => ({ data: null, error: new Error("nicht gefunden") }));
    await expect(
      openIservAttachment({
        client: client(download),
        attachment: { filename: "x.pdf", path: "u/h/x.pdf" },
        share: vi.fn(),
      }),
    ).rejects.toThrow("nicht gefunden");
  });
});
