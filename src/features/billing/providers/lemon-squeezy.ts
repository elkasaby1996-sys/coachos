import type { BrowserBillingProvider } from "./contract";

export const lemonSqueezyBrowserProvider: BrowserBillingProvider = {
  checkoutFunction: "billing-create-lemon-squeezy-checkout",
  acceptsCheckoutUrl(value) {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      /^[a-z0-9-]+\.lemonsqueezy\.com$/.test(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      u.pathname.startsWith("/checkout/")
    );
  },
};
