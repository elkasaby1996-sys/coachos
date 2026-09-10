import { useMutation, useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import {
  createBillingCheckout,
  fetchBillingCheckoutState,
} from "./checkout-api";
import { billingKeys } from "./query-keys";
export function useBillingCheckout(
  attempt: string | null,
  poll: boolean,
  owner: boolean,
) {
  const { user } = useSessionAuth();
  const state = useQuery({
    queryKey: billingKeys.state(user?.id, attempt),
    queryFn: () => fetchBillingCheckoutState(attempt),
    enabled: Boolean(user && owner),
    retry: false,
    refetchInterval: (query) =>
      poll &&
      !["completed", "expired", "failed"].includes(
        query.state.data?.status ?? "",
      )
        ? 2_000
        : false,
  });
  const create = useMutation({
    mutationFn: createBillingCheckout,
    retry: false,
  });
  return { state, create };
}
