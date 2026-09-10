import { handleBillingCheckout } from "../_shared/billing-handlers.ts";
import { billingDependencies } from "../_shared/billing-runtime.ts";
Deno.serve((request) => handleBillingCheckout(request, billingDependencies()));
