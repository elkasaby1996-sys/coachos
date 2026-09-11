import { billingDependencies } from "../_shared/billing-runtime.ts";
import { handleCustomerPortalLink } from "../_shared/billing-portal.ts";
Deno.serve((request) =>
  handleCustomerPortalLink(request, billingDependencies()),
);
