/** Browser contract: only a server entrypoint and response URL policy, never credentials. */
export type BrowserBillingProvider = {
  checkoutFunction: string;
  acceptsCheckoutUrl: (url: string) => boolean;
};
