// Read-only staging/provider observations. No publication, policy activation,
// account creation, webhook replay, transaction creation or payment requests.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { inspectSandboxPayment } from "./staging-sandbox-payment-status.mjs";
import {
  createPaddleSandboxCatalogue,
  PaddleCatalogueError,
} from "../supabase/functions/_shared/paddle-catalogue/index.ts";
import {
  STAGING_PROJECT,
  STAGING_ORIGIN,
  readBoundedStagingJson,
} from "./staging-billing-status.mjs";

export const CATALOGUE_QUERY = `select jsonb_build_object(
 'versions', (select jsonb_agg(v order by key) from (
   select plan_key as key, id, currency_code as currency,
     monthly_price_minor as monthly, annual_price_minor as annual
   from public.commercial_plan_versions
   where status='active' and plan_key in ('launch','growth','scale')
   union all
   select 'coach-seat', id, currency_code, monthly_unit_amount_minor, annual_unit_amount_minor
   from public.commercial_addon_versions where status='active' and addon_key='coach_seat'
 ) v),
 'mappings', coalesce((select jsonb_agg(m) from (
   select canonical_key as key, cadence, coalesce(plan_version_id,addon_version_id) as version,
     provider_product_ref as "productRef", provider_price_ref as "priceRef",
     currency_code as currency, unit_amount_minor as amount,
     recurrence_unit as unit, recurrence_count as frequency, status,
     catalogue_evidence_id is not null as "hasCatalogueEvidence",
     verified_at is not null and verification_sha256 is not null as "hasVerification"
   from public.billing_price_mappings
   where provider='paddle' and environment='test' and status in ('active','draft')
   order by canonical_key,cadence,status limit 101
 ) m),'[]'::jsonb),
 'policy', (select jsonb_build_object('environment',entitlement_environment,
   'salesEnabled',paddle_sales_enabled,'reconciliationEnabled',paddle_reconciliation_enabled)
   from public.billing_runtime_policy where id=1)
) as catalogue;`;

const amounts = Object.freeze({
  launch: 1900,
  growth: 5900,
  scale: 11900,
  "coach-seat": 1200,
});
const keySchema = z.enum(["launch", "growth", "scale", "coach-seat"]);
const reference = z.string().min(1).max(512);
const stateSchema = z.strictObject({
  versions: z
    .array(
      z.strictObject({
        key: keySchema,
        id: z.uuid(),
        currency: z.literal("USD"),
        monthly: z.number().int().positive(),
        annual: z.number().int().positive(),
      }),
    )
    .length(4),
  mappings: z
    .array(
      z.strictObject({
        key: keySchema,
        cadence: z.enum(["monthly", "annual"]),
        version: z.uuid(),
        productRef: reference.nullable(),
        priceRef: reference,
        currency: z.literal("USD"),
        amount: z.number().int().positive(),
        unit: z.enum(["month", "year"]),
        frequency: z.literal(1),
        status: z.enum(["active", "draft"]),
        hasCatalogueEvidence: z.boolean(),
        hasVerification: z.boolean(),
      }),
    )
    .max(100),
  policy: z.strictObject({
    environment: z.literal("test"),
    salesEnabled: z.boolean(),
    reconciliationEnabled: z.boolean(),
  }),
});

function fail(code, httpStatus) {
  const error = new Error(code);
  error.safeCode = code;
  error.httpStatus = httpStatus;
  throw error;
}

export function validateCatalogueState(input) {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success) fail("STAGING_CATALOGUE_RESPONSE_INVALID");
  const state = parsed.data;
  if (
    new Set(state.versions.map((v) => v.key)).size !== 4 ||
    new Set(state.versions.map((v) => v.id)).size !== 4 ||
    state.versions.some(
      (v) => v.monthly !== amounts[v.key] || v.annual !== amounts[v.key] * 10,
    )
  )
    fail("STAGING_CANONICAL_CATALOGUE_DIFFERS");
  return state;
}

function priceProblems(price, product, key, cadence) {
  const problems = [];
  const amount = amounts[key] * (cadence === "annual" ? 10 : 1);
  if (price.status !== "active") problems.push("PRICE_NOT_ACTIVE");
  if (!product || product.status !== "active")
    problems.push("PRODUCT_NOT_ACTIVE");
  if (product?.taxCategory !== "saas") problems.push("TAX_CATEGORY_NOT_SAAS");
  if (
    price.unitPrice.currency !== "USD" ||
    price.unitPrice.amount !== String(amount)
  )
    problems.push("PRICE_AMOUNT_OR_CURRENCY_DIFFERS");
  if (
    price.billingCycle?.frequency !== 1 ||
    price.billingCycle.interval !== (cadence === "annual" ? "year" : "month")
  )
    problems.push("RECURRENCE_DIFFERS");
  if (price.trial !== null) problems.push("PROVIDER_TRIAL_PRESENT");
  if (price.hasUnitPriceOverrides) problems.push("PRICE_OVERRIDES_PRESENT");
  if (
    price.quantity.minimum !== 1 ||
    price.quantity.maximum !== (key === "coach-seat" ? 5 : 1)
  )
    problems.push("QUANTITY_LIMITS_DIFFER");
  return problems;
}

function productStructureMatches(prices) {
  return (
    prices.size === 8 &&
    new Set(
      Object.keys(amounts).map(
        (key) => prices.get(`${key}.monthly`)?.productReference,
      ),
    ).size === 4 &&
    Object.keys(amounts).every(
      (key) =>
        prices.get(`${key}.monthly`)?.productReference ===
        prices.get(`${key}.annual`)?.productReference,
    ) &&
    new Set([...prices.values()].map((p) => p.taxMode)).size === 1
  );
}

export function summarizeStagingAuth(auth) {
  if (!auth || typeof auth !== "object" || Array.isArray(auth))
    fail("STAGING_AUTH_RESPONSE_INVALID");
  const smtpHost =
    typeof auth.smtp_host === "string" ? auth.smtp_host.trim() : "";
  const redirects =
    typeof auth.uri_allow_list === "string"
      ? auth.uri_allow_list.split(",").map((v) => v.trim())
      : [];
  return {
    siteUrlMatches:
      auth.site_url === STAGING_ORIGIN ||
      auth.site_url === `${STAGING_ORIGIN}/`,
    callbackExplicitlyAllowed:
      redirects.includes(`${STAGING_ORIGIN}/auth/callback`) ||
      redirects.includes(`${STAGING_ORIGIN}/**`),
    emailEnabled:
      typeof auth.external_email_enabled === "boolean"
        ? auth.external_email_enabled
        : null,
    confirmationRequired:
      typeof auth.mailer_autoconfirm === "boolean"
        ? !auth.mailer_autoconfirm
        : null,
    emailProvider:
      smtpHost === "smtp.resend.com"
        ? "resend"
        : smtpHost
          ? "other_custom_smtp"
          : "supabase_default",
    smtpUserConfigured:
      typeof auth.smtp_user === "string" && auth.smtp_user.length > 0,
    senderConfigured:
      typeof auth.smtp_admin_email === "string" &&
      auth.smtp_admin_email.length > 0,
    // Management responses can redact passwords; never infer their validity.
    smtpCredentialsVerified: false,
    confirmationEmailDeliveryVerified: false,
  };
}

// Candidate counts are advisory only. They never select a binding, mint receipts
// or authorize publishing. Existing active mappings provide explicit references.
export async function summarizeSandboxCatalogue(state, capability) {
  if (capability.provider !== "paddle" || capability.environment !== "test")
    fail("SANDBOX_CAPABILITY_REQUIRED");
  const products = await capability.listProducts();
  const prices = await capability.listPrices();
  const productByRef = new Map(products.map((p) => [p.productReference, p]));
  const freshProducts = new Map();
  const pairs = [];
  const uniqueCandidates = new Map();
  const matchedPrices = new Map();
  for (const key of Object.keys(amounts)) {
    const version = state.versions.find((v) => v.key === key);
    for (const cadence of ["monthly", "annual"]) {
      const amount = amounts[key] * (cadence === "annual" ? 10 : 1);
      const candidates = prices.filter(
        (p) =>
          p.status === "active" &&
          p.unitPrice.currency === "USD" &&
          p.unitPrice.amount === String(amount) &&
          p.billingCycle?.interval ===
            (cadence === "annual" ? "year" : "month"),
      );
      const compatible = candidates.filter(
        (p) =>
          priceProblems(p, productByRef.get(p.productReference), key, cadence)
            .length === 0,
      );
      const pair = `${key}.${cadence}`;
      if (compatible.length === 1) uniqueCandidates.set(pair, compatible[0]);
      const mappings = state.mappings.filter(
        (m) => m.key === key && m.cadence === cadence,
      );
      const active = mappings.filter((m) => m.status === "active");
      let activeMappingMatches = false;
      const mapping = active[0];
      if (
        active.length === 1 &&
        mapping.version === version.id &&
        mapping.amount === amount &&
        mapping.hasCatalogueEvidence &&
        mapping.hasVerification &&
        mapping.unit === (cadence === "annual" ? "year" : "month") &&
        prices.some(
          (p) =>
            p.priceReference === mapping.priceRef &&
            p.productReference === mapping.productRef,
        )
      ) {
        const price = await capability.retrievePrice(mapping.priceRef);
        if (!freshProducts.has(price.productReference))
          freshProducts.set(
            price.productReference,
            await capability.retrieveProduct(price.productReference),
          );
        activeMappingMatches =
          price.productReference === mapping.productRef &&
          priceProblems(
            price,
            freshProducts.get(price.productReference),
            key,
            cadence,
          ).length === 0;
        if (activeMappingMatches) matchedPrices.set(pair, price);
      }
      pairs.push({
        pair,
        currency: "USD",
        amountMinor: amount,
        matchingAmountAndCadenceCount: candidates.length,
        compatibleCandidateCount: compatible.length,
        candidateProblems: [
          ...new Set(
            candidates.flatMap((p) =>
              priceProblems(
                p,
                productByRef.get(p.productReference),
                key,
                cadence,
              ),
            ),
          ),
        ].sort(),
        activeMappingCount: active.length,
        draftMappingCount: mappings.length - active.length,
        activeMappingMatches,
      });
    }
  }
  const candidateStructureMatches = productStructureMatches(uniqueCandidates);
  const mappedStructureMatches = productStructureMatches(matchedPrices);
  const matchedMappings = pairs.filter((p) => p.activeMappingMatches).length;
  return {
    productCount: products.length,
    priceCount: prices.length,
    pairs,
    candidateStructureMatches,
    mappedStructureMatches,
    matchedActiveMappings: matchedMappings,
    readiness:
      matchedMappings === 8 && mappedStructureMatches
        ? "existing_mappings_match_provider_facts"
        : candidateStructureMatches
          ? "catalogue_mapping_publication_required"
          : "provider_catalogue_review_required",
  };
}

export async function inspectSandboxCatalogue({
  env = process.env,
  transport = fetch,
  createCapability = () =>
    createPaddleSandboxCatalogue({
      readEnvironment: (name) => env[name],
      fetch: transport,
    }),
} = {}) {
  const report = {
    status: "blocked",
    stage: "configuration",
    project: STAGING_PROJECT,
    readOnly: true,
    mappingsPublished: false,
    gatesChanged: false,
    paymentsVerified: false,
  };
  try {
    if (
      env.STAGING_SUPABASE_PROJECT_REF !== STAGING_PROJECT ||
      env.PADDLE_ENVIRONMENT !== "sandbox"
    )
      fail("SANDBOX_STAGING_CONFIGURATION_REQUIRED");
    if (!env.SUPABASE_ACCESS_TOKEN) fail("SUPABASE_ACCESS_TOKEN_MISSING");
    report.stage = "read_staging_catalogue";
    const response = await transport(
      `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/database/query/read-only`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: CATALOGUE_QUERY }),
      },
    );
    if (!response.ok) fail("STAGING_CATALOGUE_READ_FAILED", response.status);
    const rows = await readBoundedStagingJson(response);
    if (!Array.isArray(rows) || rows.length !== 1)
      fail("STAGING_CATALOGUE_RESPONSE_INVALID");
    const state = validateCatalogueState(rows[0].catalogue);
    report.policy = state.policy;
    report.canonicalVersionsVerified = true;
    report.storedMappingCount = state.mappings.length;
    report.stage = "read_staging_auth_configuration";
    const authResponse = await transport(
      `https://api.supabase.com/v1/projects/${STAGING_PROJECT}/config/auth`,
      {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
          Accept: "application/json",
        },
      },
    );
    if (!authResponse.ok) fail("STAGING_AUTH_READ_FAILED", authResponse.status);
    report.auth = summarizeStagingAuth(
      await readBoundedStagingJson(authResponse),
    );
    report.stage = "read_paddle_sandbox_catalogue";
    if (!env.PADDLE_SANDBOX_API_KEY)
      fail("PADDLE_SANDBOX_API_KEY_MISSING_IN_GITHUB");
    report.catalogue = await summarizeSandboxCatalogue(
      state,
      createCapability(),
    );
    if (env.STAGING_PILOT_USER_ID) {
      report.stage = "read_test_owner_payment_status";
      report.accountPayment = await inspectSandboxPayment({ env, transport });
      if (report.accountPayment.status !== "inspected")
        fail(
          "STAGING_PAYMENT_STATUS_READ_FAILED",
          report.accountPayment.httpStatus,
        );
    }
    report.status = "inspected";
    report.stage = "complete";
  } catch (error) {
    const providerCodes = [
      "configuration",
      "unauthorized",
      "forbidden",
      "not_found",
      "rate_limited",
      "provider_unavailable",
      "http_error",
      "timeout",
      "network",
      "response_too_large",
      "pagination_limit",
      "malformed_response",
      "invalid_reference",
    ];
    const safeCodes = [
      "SANDBOX_STAGING_CONFIGURATION_REQUIRED",
      "SUPABASE_ACCESS_TOKEN_MISSING",
      "STAGING_CATALOGUE_READ_FAILED",
      "STAGING_CATALOGUE_RESPONSE_INVALID",
      "STAGING_CANONICAL_CATALOGUE_DIFFERS",
      "PADDLE_SANDBOX_API_KEY_MISSING_IN_GITHUB",
      "SANDBOX_CAPABILITY_REQUIRED",
      "STAGING_AUTH_RESPONSE_INVALID",
      "STAGING_AUTH_READ_FAILED",
      "STAGING_PAYMENT_STATUS_READ_FAILED",
    ];
    report.code = safeCodes.includes(error.safeCode)
      ? error.safeCode
      : error instanceof PaddleCatalogueError &&
          providerCodes.includes(error.code)
        ? `PADDLE_CATALOGUE_${error.code.toUpperCase()}`
        : "SANDBOX_CATALOGUE_INSPECTION_FAILED";
    const status =
      error instanceof PaddleCatalogueError ? error.status : error.httpStatus;
    if (Number.isInteger(status) && status >= 100 && status <= 599)
      report.httpStatus = status;
  }
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = await inspectSandboxCatalogue();
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Paddle staging readiness\n\nRead-only: no mappings published, settings changed, emails sent or new payments created. Optional account inspection checks retained payment evidence; the full payment suite remains unverified.\n\n\`\`\`json\n${json}\n\`\`\`\n`,
    );
  console.error(
    `::${report.status === "blocked" ? "error" : "notice"} title=Paddle sandbox catalogue::status=${report.status}; stage=${report.stage}; code=${report.code ?? "none"}; readiness=${report.catalogue?.readiness ?? "unverified"}; matchedActiveMappings=${report.catalogue?.matchedActiveMappings ?? 0}/8; subscriptionPaymentVerified=${report.accountPayment?.payment?.subscriptionPaymentVerified ?? "not_inspected"}; paymentsVerified=false`,
  );
  if (report.status === "blocked") process.exitCode = 1;
}
