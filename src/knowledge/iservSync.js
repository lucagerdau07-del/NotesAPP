import { iservClient } from "../lib/iservClient.js";
import { loadIservCredentials } from "../ink/iservSettings.js";

export const ISERV_SOURCE_ID = "iserv";
export const ISERV_BUCKET = "notesapp-iserv";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^\d{2}:\d{2}$/;

// Eine Zeile aus notesapp.iserv_tasks als Termin der Terminplanung. Ohne Titel
// oder lesbare Frist lässt sich nichts einplanen.
export function rowToEvent(row) {
  const title = String(row?.title ?? "").trim();
  const due = String(row?.due ?? "");
  if (!row?.id || !title || !ISO_DATE.test(due)) return null;
  const time = String(row?.due_time ?? "");
  return {
    kind: "homework",
    title,
    subject: String(row.subject ?? "").trim(),
    due,
    // Ohne Uhrzeit nimmt der Lernplan 23:59 an (siehe studyPlan.js).
    ...(ISO_TIME.test(time) ? { time } : {}),
    iservId: String(row.id),
    url: String(row.url ?? ""),
    description: String(row.description ?? ""),
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

async function ensureSession(client, credentials) {
  const { data } = await client.auth.getSession();
  if (data?.session) return;
  const { error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) throw error;
}

export async function pullIservEvents({ client, credentials }) {
  await ensureSession(client, credentials);
  const { data, error } = await client
    .schema("notesapp")
    .from("iserv_tasks")
    .select("*")
    .order("due", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToEvent).filter(Boolean);
}

// Rückgabe: Anzahl neuer Termine, oder null, wenn nichts eingerichtet ist.
// Wirft bei Login- oder Netzwerkfehlern, der Aufrufer entscheidet, wie das angezeigt wird.
export async function syncIserv({
  repository,
  client = iservClient,
  loadCredentials = loadIservCredentials,
} = {}) {
  const credentials = await loadCredentials();
  if (!client || !credentials?.email || !credentials?.password) return null;
  const events = await pullIservEvents({ client, credentials });
  return repository.mergeFindings({ events, sourceNoteId: ISERV_SOURCE_ID }).addedEvents;
}

// Lädt den Anhang aus dem privaten Bucket und reicht ihn ans Teilen-Menü des
// Systems. saveAndShare kommt per dynamischem Import, damit dieses Modul
// (und seine Tests) jspdf und die Capacitor-Plugins nicht mitladen.
export async function openIservAttachment({ client, attachment, share }) {
  if (!attachment?.path) throw new Error("Anhang nicht verfügbar.");
  const { data, error } = await client.storage.from(ISERV_BUCKET).download(attachment.path);
  if (error || !data) throw error || new Error("Download fehlgeschlagen.");
  const shareFile = share || (await import("../documents/exportDocument.js")).saveAndShare;
  await shareFile(data, String(attachment.filename || "Anhang").replace(/[\\/:*?"<>|]+/g, "_"));
}
