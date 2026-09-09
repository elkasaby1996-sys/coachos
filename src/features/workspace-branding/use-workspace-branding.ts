import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { BRANDING_SELECT, type WorkspaceBranding } from "./branding";

export function useWorkspaceBranding(workspaceId: string | null | undefined) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: ["workspace-branding", workspaceId, user?.id],
    enabled: Boolean(workspaceId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select(BRANDING_SELECT)
        .eq("id", workspaceId!)
        .maybeSingle();
      if (error) throw error;
      return data as WorkspaceBranding | null;
    },
  });
}
