import type { BrowserBillingProvider } from "./contract";

/** Browser defense in depth: exact Sandbox hosts, or the current HTTPS merchant origin. */
export function acceptsPaddleCheckoutUrl(
  value: string,
  merchantOrigin: string,
): boolean {
  try {
    if (
      value.length > 2048 ||
      !value.startsWith("https://") ||
      /[\s\\#]/.test(value) ||
      value.slice(8).split("/")[0]!.includes("@")
    )
      return false;
    const url = new URL(value);
    if (url.username || url.password || url.port || url.hash) return false;
    const hosted = ["sandbox-pay.paddle.io", "sandbox.pay.paddle.io"].includes(
      url.hostname,
    );
    if (
      hosted &&
      !(
        /^\/checkout\/[A-Za-z0-9_-]{1,512}$/.test(url.pathname) ||
        (url.hostname === "sandbox-pay.paddle.io" &&
          /^\/hsc_[A-Za-z0-9_-]{1,512}$/.test(url.pathname))
      )
    )
      return false;
    if (
      !hosted &&
      (url.origin !== merchantOrigin ||
        /(^|\.)paddle\.(io|com)$/.test(url.hostname))
    )
      return false;
    const key = hosted ? "transaction_id" : "_ptxn";
    const ref = url.searchParams.get(key);
    return (
      [...url.searchParams.keys()].join() === key &&
      !!ref &&
      ref.length <= 256 &&
      !/\s/.test(ref) &&
      [...ref].every(
        (char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127,
      )
    );
  } catch {
    return false;
  }
}
export const paddleBrowserProvider: BrowserBillingProvider = {
  checkoutFunction: "billing-create-paddle-checkout",
  acceptsCheckoutUrl: (value) =>
    acceptsPaddleCheckoutUrl(
      value,
      typeof window === "undefined" ? "" : window.location.origin,
    ),
};
