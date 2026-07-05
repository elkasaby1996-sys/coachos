import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../lib/use-workspace";
import {
  hasWorkspacePermission,
  type WorkspaceMemberStatus,
  type WorkspaceRole,
} from "./contracts";

type WorkspaceAccessContextRow = {
  workspace_id: string;
  role: WorkspaceRole;
  member_status: WorkspaceMemberStatus;
};

export function useWorkspaceWriteAccess() {
  const { workspaceId } = useWorkspace();

  const accessQuery = useQuery({
    queryKey: ["workspace-write-access", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("workspace_access_context", {
        p_workspace_id: workspaceId,
      });

      if (error) throw error;
      return (
        Array.isArray(data) ? data[0] : null
      ) as WorkspaceAccessContextRow | null;
    },
  });

  const context = accessQuery.data
    ? {
        role: accessQuery.data.role,
        memberStatus: accessQuery.data.member_status,
      }
    : null;

  return {
    isLoading: accessQuery.isLoading,
    error: accessQuery.error,
    role: accessQuery.data?.role ?? null,
    canEditClients: hasWorkspacePermission(context, "clients.edit"),
    canManageDelivery: hasWorkspacePermission(context, "delivery.manage"),
  };
}
