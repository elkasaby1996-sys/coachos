/** Hosted payment URLs are bearer capabilities; remove them from telemetry. */
export function redactHostedPaymentUrls<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(/https?:\/\/[^\s"<>]+/gi, (candidate) =>
      /lemonsqueezy\.com|[?&](?:signature|expires)=|\/billing(?:[/?#]|$)|\/subscription\/[^/]+\/payment-details/i.test(
        candidate,
      )
        ? "[redacted payment URL]"
        : candidate,
    ) as T;
  if (Array.isArray(value)) return value.map(redactHostedPaymentUrls) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        redactHostedPaymentUrls(key),
        /^(?:portalUrl|customer_portal|update_payment_method|signature)$/i.test(
          key,
        )
          ? "[redacted payment URL]"
          : redactHostedPaymentUrls(entry),
      ]),
    ) as T;
  return value;
}
