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
export const projectReferences = [
  "syntheticprojectrefz",
  "syntheticproject0001",
];
export const projectFields = [
  "supabaseProjectRef",
  "project_id",
  "internalProjectId",
  "deploymentId",
  "environmentId",
  "organization_id",
];
export const projectSemanticCanaries = projectFields.map(
  (_, i) => `SYNTHETIC_PROJECT_IDENTIFIER_${i}_END`,
);
export const projectUrls = [
  `https://${projectReferences[0]}.supabase.co/rest/v1/health`,
  `postgresql://fixture@db.${projectReferences[1]}.supabase.co:5432/postgres`,
  `https://supabase.com/dashboard/project/${projectReferences[0]}/settings/general`,
];
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
  ...projectReferences,
  ...projectSemanticCanaries,
];
export function fixture() {
  return {
    message: references.join(" "),
    nested: [{ arbitrary: references, [references[0]]: identity }],
    semantic: Object.fromEntries(
      fields.map((key, i) => [key, semanticCanaries[i]]),
    ),
    projectRows: [
      {
        id: projectReferences[0],
        ref: projectReferences[0],
        project_url: projectUrls[0],
        database: { host: `db.${projectReferences[0]}.supabase.co` },
      },
      Object.fromEntries(
        projectFields.map((key, i) => [key, projectSemanticCanaries[i]]),
      ),
    ],
    projectDiagnostic: `project_ref=${projectReferences[1]} url=${projectUrls[2]}`,
    projectUrls,
    error: Object.assign(new Error(`failure ${paymentUrl} ${references[1]}`), {
      cause: { arbitrary: references[2] },
    }),
    url: paymentUrl,
    state: "processed",
  };
}
