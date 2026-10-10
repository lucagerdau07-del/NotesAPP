import { loadAgentConfig } from "../agent/agentSettings.js";

export const ISERV_SOURCE_ID = "iserv";

// Kaltstart des Space (Puppeteer, Anmeldung, Aufgabenseiten) dauert; danach liegt das Ergebnis dort im Cache.
const PULL_TIMEOUT_MS = 25_000;
const FILE_TIMEOUT_MS = 60_000;
const ISO_DATE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/;

const endpoint = (config, path) => `${String(config.baseUrl).replace(/\/+$/, "")}/iserv/${path}`;
const headers = (config) => ({ "x-app-key": config.accessKey });

// Eine Aufgabe des Space als Termin der Terminplanung. Ohne Titel, URL oder lesbare Frist lässt sich nichts
// einplanen. Ohne Uhrzeit nimmt der Lernplan 23:59 an (siehe studyPlan.js).
export function taskToEvent(task) {
  const title = String(task?.title ?? "").trim();
  const url = String(task?.url ?? "");
  const due = ISO_DATE.exec(String(task?.due ?? ""));
  if (!title || !url || !due) return null;
  return {
    kind: "homework",
    title,
    subject: String(task.tags ?? "").trim(),
    due: due[1],
    ...(due[2] ? { time: due[2] } : {}),
    iservId: url,
    url,
    description: String(task.description ?? ""),
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    // erledigt oder abgelaufen: in IServ nichts mehr zu tun
    iservClosed: task.done === true || task.expired === true,
  };
}

export async function pullIservEvents({ config, fetchImpl = (...args) => fetch(...args) }) {
  const response = await fetchImpl(endpoint(config, "tasks"), {
    headers: headers(config),
    signal: AbortSignal.timeout(PULL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`IServ ${response.status}`);
  const body = await response.json();
  return (Array.isArray(body?.tasks) ? body.tasks : []).map(taskToEvent).filter(Boolean);
}

// Rückgabe: Anzahl neuer Termine, oder null, wenn nichts eingerichtet ist (kein Zugriffsschlüssel).
// Wirft bei Netzwerk- und Serverfehlern, der Aufrufer entscheidet, wie das angezeigt wird.
export async function syncIserv({ repository, loadConfig = loadAgentConfig, fetchImpl } = {}) {
  const config = loadConfig();
  if (!config?.accessKey || !config?.baseUrl) return null;
  const events = await pullIservEvents({ config, fetchImpl });
  return repository.mergeFindings({ events, sourceNoteId: ISERV_SOURCE_ID }).addedEvents;
}

// Lädt den Anhang über den Space (er ist dort angemeldet) und reicht ihn ans Teilen-Menü des Systems.
// saveAndShare kommt per dynamischem Import, damit dieses Modul (und seine Tests) jspdf und die
// Capacitor-Plugins nicht mitladen.
export async function openIservAttachment({
  attachment,
  config = loadAgentConfig(),
  share,
  fetchImpl = (...args) => fetch(...args),
}) {
  if (!attachment?.path) throw new Error("Anhang nicht verfügbar.");
  const response = await fetchImpl(`${endpoint(config, "file")}?path=${encodeURIComponent(attachment.path)}`, {
    headers: headers(config),
    signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("Download fehlgeschlagen.");
  const data = await response.blob();
  const shareFile = share || (await import("../documents/exportDocument.js")).saveAndShare;
  await shareFile(data, String(attachment.filename || "Anhang").replace(/[\\/:*?"<>|]+/g, "_"));
}
