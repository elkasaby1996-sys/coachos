import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Avoid crashing the whole app at module load when env vars are missing.
// Runtime guards still enforce `supabaseConfigured` before auth flows proceed.
const fallbackSupabaseUrl = "http://127.0.0.1:54321";
const fallbackSupabaseAnonKey = "missing-supabase-anon-key";

export const supabase = createClient(
  supabaseConfigured ? supabaseUrl : fallbackSupabaseUrl,
  supabaseConfigured ? supabaseAnonKey : fallbackSupabaseAnonKey,
);
