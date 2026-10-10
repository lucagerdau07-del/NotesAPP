import { supabase, ensureAnonUser } from "../lib/supabaseClient.js";
import { browserDocumentRepository } from "../storage/documentRepository.js";

const BUCKET = "notesapp-backups";
const LAST_BACKUP_KEY = "notes.lastCloudBackupAt";
const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function collectSnapshot() {
  const db = await browserDocumentRepository.database();
  const [files, importedNotes, ocrPages] = await Promise.all([
    db.getAll("files"),
    db.getAll("importedNotes"),
    db.getAll("ocrPages"),
  ]);
  const filesEncoded = await Promise.all(
    files.map(async (f) => ({ ...f, blob: f.blob ? await blobToBase64(f.blob) : null })),
  );
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    folders: JSON.parse(globalThis.localStorage?.getItem("folders.folders.v1") || "null"),
    files: filesEncoded,
    importedNotes,
    ocrPages,
  };
}

// Uploads a single rolling snapshot (overwritten weekly) — a week-old
// backup, not a week of history. Large attachments make this heavier than
// Postgres row storage handles well, hence Supabase Storage over a table.
export async function runWeeklyBackupIfDue() {
  if (!supabase) return;
  try {
    const last = Number(globalThis.localStorage?.getItem(LAST_BACKUP_KEY) || 0);
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;

    const user = await ensureAnonUser();
    if (!user) return;

    const snapshot = await collectSnapshot();
    const payload = new Blob([JSON.stringify(snapshot)], { type: "application/json" });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${user.id}/backup.json`, payload, { upsert: true, contentType: "application/json" });
    if (error) throw error;

    globalThis.localStorage?.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // Backup is best-effort; a failed attempt just retries on next check.
  }
}
