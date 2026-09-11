import { useMutation, useQuery } from "@tanstack/react-query";
import { useSessionAuth } from "../../lib/auth";
import {
  createCustomerPortalLink,
  fetchBillingProviderSummary,
} from "./portal-api";
import type { PortalLinkPurpose } from "./portal-contracts";
import { safePortalError } from "./portal-errors";
export function useBillingProviderSummary(owner: boolean) {
  const { user } = useSessionAuth();
  return useQuery({
    queryKey: ["billing", "provider-summary", user?.id],
    queryFn: fetchBillingProviderSummary,
    enabled: Boolean(owner && user),
    retry: false,
  });
}
export function useCustomerPortalLinkMutation() {
  return useMutation({
    // Navigate inside the function and return void: the mutation cache never receives a bearer URL.
    mutationFn: async (purpose: PortalLinkPurpose) => {
      try {
        const result = await createCustomerPortalLink(purpose);
        window.location.assign(result.portalUrl);
      } catch (error) {
        throw safePortalError(error);
      }
    },
    retry: false,
    gcTime: 0,
  });
}
