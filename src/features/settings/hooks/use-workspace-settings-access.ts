import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { useWorkspace } from "../../../lib/use-workspace";
import {
  canManageTeam,
  type WorkspaceMemberStatus,
  type WorkspaceRole,
} from "../../workspace-team";

export function useWorkspaceSettingsAccess(
  routeWorkspaceId: string | undefined,
) {
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
      const { data, error } = await supabase.rpc("workspace_access_context", {
        p_workspace_id: routeWorkspaceId,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;

      return (row ?? null) as {
        workspace_id: string;
        role: string;
        member_status: string;
      } | null;
    },
  });

  const isAuthorized = Boolean(membershipQuery.data?.workspace_id);
  const canManage = canManageTeam({
    role: (membershipQuery.data?.role ?? "viewer") as WorkspaceRole,
    memberStatus: (membershipQuery.data?.member_status ??
      "removed") as WorkspaceMemberStatus,
  });
  const isOwner = membershipQuery.data?.role === "owner";

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
