import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check your .env.local file.",
  );
}

const isServiceRoleKey = (jwt: string) => {
  try {
    const payloadPart = jwt.split(".")[1];
    if (!payloadPart) return false;
    const payloadJson = atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/"));
    return payloadJson.includes('"role":"service_role"');
  } catch {
    return false;
  }
};

if (isServiceRoleKey(supabaseAnonKey)) {
  throw new Error(
    "Supabase service role key detected in client env. This key must only be used server-side.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabaseUrl, supabaseAnonKey };
