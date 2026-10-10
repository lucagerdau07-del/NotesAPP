import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Eigener Client mit eigenem Speicherschlüssel: die anonyme Sitzung aus
// supabaseClient.js (Untis-Spiegel, Backups) darf durch den Account-Login nicht
// ersetzt werden, sonst liefen beide danach unter einer anderen user_id.
export const iservClient =
  url && anonKey ? createClient(url, anonKey, { auth: { storageKey: "notes.iserv-auth" } }) : null;
