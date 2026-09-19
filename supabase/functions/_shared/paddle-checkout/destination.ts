import type { PaddleCheckoutDestination } from "./contract.ts";
import { fail, object } from "./validation.ts";

const sandboxHostedHosts = new Set([
  "sandbox-pay.paddle.io",
  "sandbox.pay.paddle.io",
]);
function secureUrl(value: unknown): URL {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("https://") ||
    /[\s\\#]/.test(value) ||
    value.slice(8).split("/")[0]!.includes("@")
  )
    return fail("unsafe_destination");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("unsafe_destination");
  }
  if (
    url.href.length > 2048 ||
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.port
  )
    fail("unsafe_destination");
  return url;
}
/** Trusted server URLs only. No suffix matching, custom Paddle subdomains or browser input. */
export function destinationPolicy(
  paymentPageUrl: string,
  hostedCheckoutLaunchUrl?: string,
) {
  const payment = secureUrl(paymentPageUrl);
  if (
    ["paddle.io", "paddle.com"].some(
      (host) =>
        payment.hostname === host || payment.hostname.endsWith(`.${host}`),
    )
  )
    fail("unsafe_destination");
  if (payment.search || paymentPageUrl.includes("?"))
    fail("unsafe_destination");
  let hosted: URL | undefined;
  if (hostedCheckoutLaunchUrl !== undefined) {
    hosted = secureUrl(hostedCheckoutLaunchUrl);
    if (
      !sandboxHostedHosts.has(hosted.hostname) ||
      hosted.search ||
      hostedCheckoutLaunchUrl.includes("?") ||
      !/^\/checkout\/[A-Za-z0-9_-]{1,512}$/.test(hosted.pathname)
    )
      fail("unsafe_destination");
  }
  function capability(
    kind: PaddleCheckoutDestination["kind"],
    value: string,
  ): PaddleCheckoutDestination {
    if (value.length > 2048) fail("unsafe_destination");
    return Object.freeze({
      kind,
      destination: () => ({ url: value }),
      toJSON(): never {
        throw new Error("PADDLE_CHECKOUT_DESTINATION_NOT_SERIALIZABLE");
      },
    });
  }
  return Object.freeze({
    paymentPageUrl: payment.href,
    checkout(
      raw: unknown,
      transactionReference: string,
    ): PaddleCheckoutDestination | null {
      let paymentLink: URL | null = null;
      if (raw !== null) {
        const value = object(raw).url;
        if (value !== null) {
          paymentLink = secureUrl(value);
          if (
            paymentLink.origin !== payment.origin ||
            paymentLink.pathname !== payment.pathname ||
            [...paymentLink.searchParams.keys()].join() !== "_ptxn" ||
            paymentLink.searchParams.get("_ptxn") !== transactionReference
          )
            fail("unsafe_destination");
        }
      }
      if (hosted) {
        const destination = new URL(hosted.href);
        destination.searchParams.set("transaction_id", transactionReference);
        return capability("paddle_hosted", destination.href);
      }
      return paymentLink
        ? capability("merchant_payment_link", paymentLink.href)
        : null;
    },
  });
}
