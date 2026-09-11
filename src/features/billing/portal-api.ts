import {
  billingProviderSummarySchema,
  customerPortalLinkResponseSchema,
  portalLinkRequestSchema,
  type PortalLinkPurpose,
} from "./portal-contracts";
import { safePortalError } from "./portal-errors";
export async function createCustomerPortalLink(purpose: PortalLinkPurpose) {
  try {
    const body = portalLinkRequestSchema.parse({ purpose });
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.functions.invoke(
      "billing-create-customer-portal-link",
      { body },
    );
    if (error) {
      let safe: unknown;
      try {
        safe = await error.context?.json();
      } catch {
        /* No raw response retained. */
      }
      throw safePortalError(safe);
    }
    const result = customerPortalLinkResponseSchema.parse(data);
    if (result.purpose !== purpose) throw safePortalError(null);
    return result;
  } catch (error) {
    throw safePortalError(error);
  }
}
export async function fetchBillingProviderSummary() {
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.rpc(
      "get_my_billing_provider_summary",
    );
    if (error) throw safePortalError(error);
    return billingProviderSummarySchema.parse(data);
  } catch (error) {
    throw safePortalError(error);
  }
}
