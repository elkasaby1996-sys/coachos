import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import {
  getOwnerAccess,
  getWorkspaceAccess,
  getClientAccess,
} from "./access-api";
import { commercialAccessKeys } from "./query-keys";
const timing = { staleTime: 0, refetchInterval: 30_000, retry: 1 };
export function useCommercialAccess(enabled = true) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: commercialAccessKeys.owner(user?.id),
    queryFn: getOwnerAccess,
    enabled: !!user && enabled,
    ...timing,
  });
}
export function useWorkspaceCommercialAccess(workspaceId: string | null) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: commercialAccessKeys.workspace(user?.id, workspaceId),
    queryFn: () => getWorkspaceAccess(workspaceId!),
    enabled: !!user && !!workspaceId,
    ...timing,
  });
}
export function useClientCoachingAccess(clientId: string | null) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: commercialAccessKeys.client(user?.id, clientId),
    queryFn: () => getClientAccess(clientId!),
    enabled: !!user && !!clientId,
    ...timing,
  });
}
