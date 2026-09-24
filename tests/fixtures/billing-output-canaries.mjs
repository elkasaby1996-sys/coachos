// Deliberately invalid provider IDs. No live/provider-derived test data.
export const references = [
  "che",
  "hsc",
  "txn",
  "ctm",
  "sub",
  "ntf",
  "evt",
  "res",
  "pro",
  "pri",
].map((prefix) => `${prefix}_synthetic_canary_not_real`);
export const identity = "00000000-0000-0000-0000-000000000042";
export const signature = "SYNTHETIC_SIGNATURE_NOT_REAL";
export const fields = [
  "checkoutUrl",
  "checkout_ref",
  "checkoutRef",
  "provider_checkout_ref",
  "providerTransactionRef",
  "provider_transaction_ref",
  "transactionRef",
  "customerRef",
  "subscriptionRef",
  "notificationRef",
  "provider_notification_ref",
  "eventRef",
  "resourceRef",
  "productRef",
  "priceRef",
  "provider_product_ref",
  "provider_price_ref",
  "signature",
  "signedUrl",
  "capability",
  "userId",
  "billing_account_id",
  "apiKey",
  "webhookSecret",
];
export const semanticCanaries = fields.map(
  (_, i) => `SYNTHETIC_OPAQUE_PRIVATE_${i}_END`,
);
export const paymentUrl = `https://sandbox-checkout.paddle.com/checkout/${references[0]}?signature=${signature}`;
export const canaries = [
  ...references,
  identity,
  signature,
  ...semanticCanaries,
];
export function fixture() {
  return {
    message: references.join(" "),
    nested: [{ arbitrary: references, [references[0]]: identity }],
    semantic: Object.fromEntries(
      fields.map((key, i) => [key, semanticCanaries[i]]),
    ),
    error: Object.assign(new Error(`failure ${paymentUrl} ${references[1]}`), {
      cause: { arbitrary: references[2] },
    }),
    url: paymentUrl,
    state: "processed",
  };
}
