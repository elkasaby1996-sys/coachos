import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { useWorkspace } from "../../../lib/use-workspace";

export function useWorkspaceSettingsAccess(routeWorkspaceId: string | undefined) {
  const { user } = useSessionAuth();
  const {
    workspaceId: activeWorkspaceId,
    workspaceIds,
    switchWorkspace,
    loading: workspaceLoading,
  } = useWorkspace();

  const membershipQuery = useQuery({
    queryKey: ["workspace-settings-membership", routeWorkspaceId, user?.id],
    enabled: Boolean(routeWorkspaceId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, user_id, role")
        .eq("workspace_id", routeWorkspaceId ?? "")
        .eq("user_id", user?.id ?? "")
        .maybeSingle();

      if (error) throw error;

      return (data ?? null) as {
        workspace_id: string;
        user_id: string;
        role: string;
      } | null;
    },
  });

  const isAuthorized = Boolean(membershipQuery.data?.workspace_id);
  const canManage = (membershipQuery.data?.role ?? "").startsWith("pt_");
  const isOwner = membershipQuery.data?.role === "pt_owner";

  useEffect(() => {
    if (!routeWorkspaceId || !isAuthorized) return;
    if (activeWorkspaceId && activeWorkspaceId === routeWorkspaceId) return;
    switchWorkspace(routeWorkspaceId);
  }, [activeWorkspaceId, isAuthorized, routeWorkspaceId, switchWorkspace]);

  const fallbackWorkspaceId = activeWorkspaceId ?? workspaceIds[0] ?? null;

  return {
    loading: workspaceLoading || membershipQuery.isLoading,
    isAuthorized,
    canManage,
    isOwner,
    role: membershipQuery.data?.role ?? null,
    fallbackWorkspaceId,
    membershipError: membershipQuery.error,
  };
}
