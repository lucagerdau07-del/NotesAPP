import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

let anonUserPromise;

// Anonymous auth gives this device a stable auth.uid() so RLS policies can
// scope rows per-device without a login screen.
export function ensureAnonUser() {
  if (!supabase) return Promise.resolve(null);
  if (!anonUserPromise) {
    anonUserPromise = supabase.auth.getSession().then(async ({ data }) => {
      if (data?.session?.user) return data.session.user;
      const { data: signIn, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      return signIn.user;
    });
  }
  return anonUserPromise;
}
