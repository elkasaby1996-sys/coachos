import { supabase } from "./supabase";

export async function getWorkspaceIdForUser(userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.workspace_id) return data.workspace_id;

  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (clientError) throw clientError;

  return clientData?.workspace_id ?? null;
}
