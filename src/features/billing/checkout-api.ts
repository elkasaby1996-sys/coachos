import {
  billingCheckoutRequestSchema,
  billingCheckoutResponseSchema,
  type BillingCheckoutRequest,
} from "./contracts";
import { safeBillingError, BillingCheckoutError } from "./checkout-errors";
import { billingBrowserProvider } from "./providers/active-provider";
export async function createBillingCheckout(input: BillingCheckoutRequest) {
  if (!billingBrowserProvider)
    throw safeBillingError({ code: "BILLING_PROVIDER_NOT_CONFIGURED" });
  const parsed = billingCheckoutRequestSchema.safeParse(input);
  if (!parsed.success)
    throw safeBillingError({ code: "BILLING_INVALID_INPUT" });
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.functions.invoke(
      billingBrowserProvider.checkoutFunction,
      { body: parsed.data },
    );
    if (error) {
      let body: unknown;
      try {
        body = await error.context?.json();
      } catch {
        /* No raw response retained. */
      }
      throw safeBillingError(body);
    }
    const result = billingCheckoutResponseSchema.safeParse(data);
    if (!result.success)
      throw safeBillingError({ code: "BILLING_VARIANT_MAPPING_MISMATCH" });
    return result.data;
  } catch (error) {
    if (
      !(error instanceof BillingCheckoutError) ||
      [
        "BILLING_RECONCILIATION_FAILED",
        "BILLING_VARIANT_MAPPING_MISMATCH",
      ].includes(error.code)
    )
      throw safeBillingError({ code: "PADDLE_CHECKOUT_RECOVERY_REQUIRED" });
    throw safeBillingError(error);
  }
}
