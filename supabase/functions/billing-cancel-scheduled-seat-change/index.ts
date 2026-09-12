import { billingDependencies } from "../_shared/billing-runtime.ts";
import { handleSeatQuantity } from "../_shared/billing-seat-quantity.ts";
Deno.serve((request) =>
  handleSeatQuantity(request, billingDependencies(), "cancel"),
);
