import { billingDependencies } from "../_shared/billing-runtime.ts";
import { handlePaddleCustomerPortal } from "../_shared/paddle-customer-portal.ts";

Deno.serve((request) =>
  handlePaddleCustomerPortal(request, () => ({
    ...billingDependencies(),
    env: (name) => Deno.env.get(name),
    fetch,
  })),
);
