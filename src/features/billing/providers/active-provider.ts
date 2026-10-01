import { paddleBrowserProvider } from "./paddle";

// The browser can enable the reviewed Paddle entrypoint, but cannot choose a
// different company to process a payment. The server owns checkout authority.
export function selectBillingBrowserProvider(value: unknown) {
  return value === "paddle" ? paddleBrowserProvider : null;
}
export const billingBrowserProvider = selectBillingBrowserProvider(
  import.meta.env.VITE_BILLING_PROVIDER,
);
export const usesPaddleCheckout =
  billingBrowserProvider === paddleBrowserProvider;
