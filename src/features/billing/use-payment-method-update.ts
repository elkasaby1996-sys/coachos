import { useMutation, useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import {
  activatePaymentMethodUpdate,
  fetchBillingProviderSummary,
  fetchPaymentMethodState,
} from "./payment-method-api";
export function useBillingProviderSummary(owner: boolean) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: ["billing", "provider-summary", user?.id],
    queryFn: fetchBillingProviderSummary,
    enabled: Boolean(owner && user),
    retry: false,
  });
}
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
