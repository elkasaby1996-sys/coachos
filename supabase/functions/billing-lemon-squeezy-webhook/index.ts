import { handleBillingWebhook } from "../_shared/billing-handlers.ts";
import { billingDependencies } from "../_shared/billing-runtime.ts";
Deno.serve((request) => handleBillingWebhook(request, billingDependencies()));
