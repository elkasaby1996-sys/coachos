import { lemonSqueezyBrowserProvider } from "./lemon-squeezy";
import { paddleBrowserProvider } from "./paddle";

// Build-time selection only. Missing/unknown values preserve the existing LS default.
export function selectBillingBrowserProvider(value: unknown) {
  return value === "paddle"
    ? paddleBrowserProvider
    : lemonSqueezyBrowserProvider;
}
export const billingBrowserProvider = selectBillingBrowserProvider(
  import.meta.env.VITE_BILLING_PROVIDER,
);
export const usesPaddleCheckout =
  billingBrowserProvider === paddleBrowserProvider;
