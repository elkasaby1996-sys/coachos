import { billingDependencies } from "../_shared/billing-runtime.ts";
import { handlePaymentMethodUpdate } from "../_shared/billing-payment-method.ts";

Deno.serve((request) =>
  handlePaymentMethodUpdate(request, billingDependencies()),
);
