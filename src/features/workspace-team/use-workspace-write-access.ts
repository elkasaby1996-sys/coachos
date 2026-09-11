import { useWorkspaceCommercialAccess } from "../commercial-access/use-commercial-access";
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
  const commercial = useWorkspaceCommercialAccess(workspaceId);

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
    isLoading: accessQuery.isLoading || commercial.isPending,
    error: accessQuery.error ?? commercial.error,
    role: accessQuery.data?.role ?? null,
    canEditClients: hasWorkspacePermission(context, "clients.edit"),
    canManageDelivery:
      commercial.data?.canWriteExistingDelivery === true &&
      hasWorkspacePermission(context, "delivery.manage"),
  };
}
