import {
  checkoutRequestSchema,
  checkoutResponseSchema,
  checkoutStateSchema,
  type CheckoutRequest,
} from "./contracts";
import { safeBillingError } from "./checkout-errors";
export async function createBillingCheckout(input: CheckoutRequest) {
  const parsed = checkoutRequestSchema.safeParse(input);
  if (!parsed.success)
    throw safeBillingError({ code: "BILLING_INVALID_INPUT" });
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.functions.invoke(
      "billing-create-lemon-squeezy-checkout",
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
    const result = checkoutResponseSchema.safeParse(data);
    if (!result.success)
      throw safeBillingError({ code: "BILLING_VARIANT_MAPPING_MISMATCH" });
    return result.data;
  } catch (error) {
    throw safeBillingError(error);
  }
}
export async function fetchBillingCheckoutState(attempt: string | null) {
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.rpc(
      "get_my_billing_checkout_state",
      { p_attempt: attempt },
    );
    if (error) throw safeBillingError(error);
    return checkoutStateSchema.parse(data);
  } catch (error) {
    throw safeBillingError(error);
  }
}
