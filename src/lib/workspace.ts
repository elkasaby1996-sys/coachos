import { supabase } from "./supabase";

export async function getWorkspaceIdForUser(userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.workspace_id ?? null;
}
