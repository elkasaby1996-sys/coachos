import { createBillingProviderRegistry } from "./billing-provider-registry.ts";
import { createPaddleSandboxCheckoutTransport } from "./paddle-checkout/index.ts";
import { createPaddlePlanTransport } from "./paddle-plan-change.ts";
import { createPaddleSeatTransport } from "./paddle-seat-quantity.ts";
import { createPaddlePaymentMethodTransport } from "./paddle-payment-method.ts";
import { createPaddleWebhookIngress } from "./paddle-webhook/ingress.ts";

/** Existing reviewed Paddle implementations; no new provider wire logic. */
export const paddleProviderRegistry = createBillingProviderRegistry(
  [
    {
      provider: "paddle",
      factory: {
        createCheckoutTransport: createPaddleSandboxCheckoutTransport,
        createPlanTransport: createPaddlePlanTransport,
        createSeatTransport: createPaddleSeatTransport,
        createPaymentMethodTransport: createPaddlePaymentMethodTransport,
        createWebhookIngress: createPaddleWebhookIngress,
      },
    },
  ],
  "paddle",
);
