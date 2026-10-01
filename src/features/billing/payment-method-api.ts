import {
  paymentMethodRequestSchema,
  paymentMethodResponseSchema,
  paymentMethodStateSchema,
} from "./payment-method-contracts";
import { safePaymentMethodError } from "./payment-method-errors";
import { paymentMethodBrowserRegistry } from "./providers/payment-method-browser";

export async function fetchPaymentMethodState() {
  try {
    const { supabase } = await import("../../lib/supabase");
    const { data, error } = await supabase.rpc(
      "get_my_billing_payment_method_state_v1",
    );
    if (error) throw error;
    return paymentMethodStateSchema.parse(data);
  } catch (error) {
    throw safePaymentMethodError(error);
  }
}
// The response lives only on this immediate launch stack; no capability is returned.
export async function activatePaymentMethodUpdate(
  deps = {
    ready: () => paymentMethodBrowserRegistry.ready(),
    invoke: async (body: { intent: "update_payment_method" }) => {
      const { supabase } = await import("../../lib/supabase");
      return supabase.functions.invoke("billing-update-payment-method", {
        body,
      });
    },
    registry: paymentMethodBrowserRegistry,
  },
): Promise<void> {
  try {
    // Fail missing client configuration before preparing a server transaction.
    await deps.ready();
    const { data, error } = await deps.invoke(
      paymentMethodRequestSchema.parse({ intent: "update_payment_method" }),
    );
    if (error) {
      let safe: unknown;
      try {
        safe = await error.context?.json();
      } catch {
        /* Discard raw errors. */
      }
      throw safePaymentMethodError(safe);
    }
    const result = paymentMethodResponseSchema.parse(data);
    await deps.registry
      .forContinuation(result.continuation)
      .open(result.continuation);
  } catch (error) {
    throw safePaymentMethodError(error);
  }
}
