import { useMutation, useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import { fetchSeatQuantityState } from "./seat-quantity-api";
import {
  activatePaymentMethodUpdate,
  fetchPaymentMethodState,
} from "./payment-method-api";
export function usePaymentMethodState(owner: boolean) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: ["billing", "payment-method-state", user?.id],
    queryFn: fetchPaymentMethodState,
    enabled: Boolean(owner && user),
    retry: false,
  });
}
export function usePaymentMethodUpdateMutation() {
  return useMutation({
    mutationFn: () => activatePaymentMethodUpdate(),
    retry: false,
    gcTime: 0,
  });
}

/** Explanatory only. Payment-method authority always comes from its own RPC. */
export function usePaymentMethodSeatState(enabled: boolean) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: ["billing", "seat-quantity", user?.id],
    queryFn: fetchSeatQuantityState,
    enabled: Boolean(enabled && user),
    retry: false,
  });
}
