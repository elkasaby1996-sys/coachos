import { handlePaddleCheckout } from "../_shared/paddle-checkout-handler.ts";
import { billingDependencies } from "../_shared/billing-runtime.ts";

Deno.serve((request) =>
  handlePaddleCheckout(request, () => {
    const { authenticate, serviceRpc } = billingDependencies();
    return {
      authenticate,
      serviceRpc,
      readEnvironment: (name) => Deno.env.get(name),
      fetch,
    };
  }),
);
