import {
  paymentMethodContinuationSchema,
  type PaymentMethodContinuation,
} from "../payment-method-contracts";
import { PaymentMethodError } from "../payment-method-errors";
import { paddlePaymentMethodBrowser } from "./paddle-payment-method";

export type PaymentMethodCheckoutSignal = "closed" | "completed" | "failed";
export interface BrowserPaymentMethodUpdateCapability {
  accepts(continuation: PaymentMethodContinuation): boolean;
  ready(): Promise<void>;
  open(continuation: PaymentMethodContinuation): Promise<void>;
  subscribe(
    listener: (signal: PaymentMethodCheckoutSignal) => void,
  ): () => void;
}
export function createPaymentMethodBrowserRegistry(
  capabilities: ReadonlyMap<string, BrowserPaymentMethodUpdateCapability>,
) {
  return {
    async ready() {
      await Promise.all(
        [...capabilities.values()].map((capability) => capability.ready()),
      );
    },
    subscribe(listener: (signal: PaymentMethodCheckoutSignal) => void) {
      const remove = [...capabilities.values()].map((capability) =>
        capability.subscribe(listener),
      );
      return () => {
        for (const unsubscribe of remove) unsubscribe();
      };
    },
    forContinuation(value: unknown) {
      const parsed = paymentMethodContinuationSchema.safeParse(value);
      const capability = parsed.success
        ? capabilities.get(parsed.data.provider)
        : undefined;
      if (!capability || !parsed.success || !capability.accepts(parsed.data))
        throw new PaymentMethodError("BILLING_PAYMENT_METHOD_PROVIDER_FAILED");
      return capability;
    },
  };
}
export const paymentMethodBrowserRegistry = createPaymentMethodBrowserRegistry(
  new Map([["paddle", paddlePaymentMethodBrowser]]),
);
