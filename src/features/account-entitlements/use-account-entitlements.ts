import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import { accountEntitlementKeys } from "./query-keys";
import {
  fetchMyEffectiveAccountEntitlements,
  fetchWorkspaceEffectiveEntitlements,
} from "./account-entitlements-api";

export function useMyEffectiveAccountEntitlements() {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: accountEntitlementKeys.owner(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => fetchMyEffectiveAccountEntitlements(),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  });
}
export function useWorkspaceEffectiveEntitlements(
  workspaceId: string | null | undefined,
) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: accountEntitlementKeys.workspace(user?.id, workspaceId),
    enabled: Boolean(user?.id && workspaceId),
    queryFn: () => fetchWorkspaceEffectiveEntitlements(workspaceId!),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  });
}
