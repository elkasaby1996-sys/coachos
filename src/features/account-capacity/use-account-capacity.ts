import { useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import { fetchMyAccountCapacitySnapshot } from "./account-capacity-api";
import { accountCapacityKeys } from "./query-keys";
/** Mounted only by PT Hub Billing. No provider or startup dependency. */
export function useMyAccountCapacitySnapshot() {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: accountCapacityKeys.owner(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => fetchMyAccountCapacitySnapshot(),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  });
}
