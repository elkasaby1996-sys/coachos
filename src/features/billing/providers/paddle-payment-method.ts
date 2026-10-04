import type { initializePaddle, Paddle } from "@paddle/paddle-js";
import { paymentMethodContinuationSchema } from "../payment-method-contracts";
import { PaymentMethodError } from "../payment-method-errors";
import type {
  BrowserPaymentMethodUpdateCapability,
  PaymentMethodCheckoutSignal,
} from "./payment-method-browser";

export function sandboxClientToken(value: unknown): string {
  if (typeof value !== "string" || !/^test_[a-zA-Z0-9]{20,64}$/.test(value))
    throw new PaymentMethodError("client_configuration");
  return value;
}
type CheckoutSDK = Pick<Paddle, "Initialized" | "Checkout">;
type Initializer = (
  options: Parameters<typeof initializePaddle>[0],
) => Promise<CheckoutSDK | undefined>;
export function createPaddlePaymentMethodBrowser(
  token: unknown,
  initialize: Initializer,
): BrowserPaymentMethodUpdateCapability {
  let initialization: Promise<CheckoutSDK> | undefined;
  const listeners = new Set<(signal: PaymentMethodCheckoutSignal) => void>();
  function instance() {
    // Retain only SDK initialization, never a transaction or continuation.
    initialization ??= (async () => {
      const clientToken = sandboxClientToken(token);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const sdk = await Promise.race([
          initialize({
            environment: "sandbox",
            token: clientToken,
            eventCallback(event) {
              const signal =
                event.name === "checkout.completed"
                  ? "completed"
                  : event.name === "checkout.closed"
                    ? "closed"
                    : event.name === "checkout.error" ||
                        event.name === "checkout.failed"
                      ? "failed"
                      : null;
              if (signal) for (const listener of listeners) listener(signal);
            },
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new PaymentMethodError("client_launch")),
              15_000,
            );
          }),
        ]);
        if (!sdk?.Initialized || typeof sdk.Checkout?.open !== "function")
          throw new PaymentMethodError("client_launch");
        return sdk;
      } catch {
        throw new PaymentMethodError("client_launch");
      } finally {
        clearTimeout(timer);
      }
    })();
    return initialization;
  }
  return {
    accepts: (value) =>
      value.provider === "paddle" &&
      value.environment === "test" &&
      /^txn_[a-z0-9]{26}$/.test(value.token),
    async ready() {
      await instance();
    },
    async open(value) {
      const parsed = paymentMethodContinuationSchema.safeParse(value);
      if (
        !parsed.success ||
        parsed.data.provider !== "paddle" ||
        parsed.data.environment !== "test" ||
        !/^txn_[a-z0-9]{26}$/.test(parsed.data.token)
      )
        throw new PaymentMethodError("client_launch");
      const sdk = await instance();
      try {
        sdk.Checkout.open({ transactionId: parsed.data.token });
      } catch {
        throw new PaymentMethodError("client_launch");
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export const paddlePaymentMethodBrowser = createPaddlePaymentMethodBrowser(
  import.meta.env.VITE_PADDLE_SANDBOX_CLIENT_TOKEN,
  async (options) =>
    (await import("@paddle/paddle-js")).initializePaddle(options),
);
