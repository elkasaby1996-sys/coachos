/** Hosted payment URLs are bearer capabilities; remove them from telemetry. */
export function redactHostedPaymentUrls<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(
      /https?:\/\/[^\s"<>]*lemonsqueezy\.com[^\s"<>]*/gi,
      "[redacted payment URL]",
    ) as T;
  if (Array.isArray(value)) return value.map(redactHostedPaymentUrls) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactHostedPaymentUrls(entry),
      ]),
    ) as T;
  return value;
}
