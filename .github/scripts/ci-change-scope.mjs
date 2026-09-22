import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ciFiles = new Set([
  ".github/workflows/ci.yml",
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
]);

// This dormant foundation has no application callers or hosted-schema changes.
// Keep quality, local smoke, and Supabase CI; do not mutate remote test accounts.
// Deliberately enumerate this reviewed change, not all future SQL migrations.
const privateBillingFoundationFiles = new Set([
  "supabase/migrations/20260919092348_billing_provider_v2_private_foundation.sql",
  "supabase/tests/billing_provider_v2_foundation.sql",
  "supabase/tests/fixtures/billing_v2_legacy_manifest.psql",
  "supabase/tests/fixtures/billing_v2_legacy_seed.psql",
]);

// PROOF-01 is uncomposed evidence retention only. Exercise local smoke and DB
// checks without writing configured hosted accounts. Runtime callers and any
// unlisted follow-up migration still require the full configured-data checks.
const privateBillingEvidenceFiles = new Set([
  "scripts/verify-billing-proof-manifest.py",
  "supabase/functions/_shared/billing-evidence-writer-v2.ts",
  "supabase/functions/_shared/billing-proof-v2.ts",
  "supabase/functions/_shared/billing-verified-receipts-v2.ts",
  "supabase/migrations/20260919114502_billing_verified_receipt_evidence_boundary.sql",
  "supabase/tests/billing_verified_evidence.sql",
  "supabase/tests/fixtures/billing_proof_legacy_manifest.psql",
  "supabase/tests/fixtures/billing_verified_proof_fixture.psql",
  "tests/unit/billing-verified-evidence.test.ts",
]);

// CATALOGUE-01 remains uncomposed and sandbox-only. The manifest edit records
// checksums; it does not authorize hosted migration or account mutations.
const privatePaddleCatalogueFiles = new Set([
  "config/staging-commercial-certification.json",
  "scripts/test-billing-catalogue-concurrency.py",
  "scripts/verify-billing-catalogue-manifest.py",
  "supabase/functions/_shared/billing-catalogue-proof-v1.ts",
  "supabase/functions/_shared/billing-catalogue-writer-v1.ts",
  "supabase/migrations/20260919134451_paddle_catalogue_verified_publication.sql",
  "supabase/tests/billing_catalogue_publication.sql",
  "supabase/tests/fixtures/billing_catalogue_fixture.psql",
  "supabase/tests/fixtures/billing_catalogue_legacy_manifest.psql",
  "tests/unit/billing-catalogue-publication.test.ts",
]);

// CERT-FIXTURE-02 removes temporary authority without deploying hosted changes.
// Keep quality and local Supabase smoke; exempt only these reviewed paths from
// configured-account writes. Any unlisted runtime/schema change fails closed.
const paddleCertificationRetirementFiles = new Set([
  "config/staging-commercial-certification.json",
  "docs/paddle-certification-retirement-verification.md",
  "docs/paddle-checkout-certification-fixture.md",
  "docs/staging-commercial-deployment-manifest.md",
  "scripts/test-paddle-cert-retirement.py",
  "supabase/migrations/20260922094541_paddle_certification_fixture_authority_retirement.sql",
  "supabase/tests/fixtures/paddle_certification_before_retirement.psql",
  "supabase/tests/paddle_certification_authority_retirement.sql",
  "supabase/tests/paddle_checkout_certification_fixture.sql",
]);

// This exact reviewed activation inventory keeps quality and local smoke running.
// Hosted-account writes are not authorized; unlisted follow-ups require all checks.
const paddleCheckoutActivationFiles = new Set([
  "config/staging-commercial-certification.json",
  "docs/paddle-checkout-activation.md",
  "docs/staging-commercial-deployment-manifest.md",
  "package.json",
  "playwright.config.ts",
  "playwright.paddle-checkout.config.ts",
  "scripts/staging-commercial-contracts.mjs",
  "src/features/billing/checkout-api.ts",
  "src/features/billing/checkout-errors.ts",
  "src/features/billing/checkout-panel.tsx",
  "src/features/billing/contracts.ts",
  "src/features/billing/providers/active-provider.ts",
  "src/features/billing/providers/paddle.ts",
  "src/features/billing/use-billing-checkout.ts",
  "src/lib/redact-hosted-payment-urls.ts",
  "src/vite-env.d.ts",
  "supabase/config.toml",
  "supabase/functions/_shared/billing-runtime.ts",
  "supabase/functions/_shared/paddle-checkout-handler.ts",
  "supabase/functions/_shared/paddle-checkout-rpc.ts",
  "supabase/functions/_shared/paddle-checkout/config.ts",
  "supabase/functions/_shared/paddle-checkout/index.ts",
  "supabase/functions/billing-create-paddle-checkout/index.ts",
  "tests/e2e/paddle-checkout.spec.ts",
  "tests/unit/paddle-browser-provider.test.ts",
  "tests/unit/paddle-checkout-runtime.test.ts",
  "tests/unit/paddle-checkout.test.ts",
  "tests/unit/staging-commercial-apply.test.ts",
  "tests/unit/staging-commercial-certification.test.ts",
]);

export function classifyChanges(files) {
  const documentation = (file) => /^docs\/.+\.md$/.test(file);
  return {
    docs_only: files.length > 0 && files.every(documentation),
    // CI changes still run the full local smoke suite, but do not need to
    // mutate configured remote accounts. Unknown paths require all checks.
    configured_data_required:
      files.length === 0 ||
      files.some(
        (file) =>
          !documentation(file) &&
          !ciFiles.has(file) &&
          !privateBillingFoundationFiles.has(file) &&
          !privateBillingEvidenceFiles.has(file) &&
          !privatePaddleCatalogueFiles.has(file) &&
          !paddleCertificationRetirementFiles.has(file) &&
          !paddleCheckoutActivationFiles.has(file),
      ),
  };
}

export function changedFiles(eventName, event, runGit = execFileSync) {
  if (eventName === "workflow_dispatch") return [];
  const base =
    eventName === "pull_request" ? event.pull_request?.base.sha : event.before;
  const head =
    eventName === "pull_request" ? event.pull_request?.head.sha : event.after;
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ""))) {
    throw new Error("Missing or invalid CI comparison revisions");
  }
  // A new branch has no comparison base: require the full suite.
  if (/^0+$/.test(base)) return [];
  const range =
    eventName === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
  return runGit(
    "git",
    ["diff", "--no-renames", "--name-only", "-z", range, "--"],
    {
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const scope = classifyChanges(
    changedFiles(process.env.GITHUB_EVENT_NAME, event),
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(scope)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
  console.log(JSON.stringify(scope));
}
