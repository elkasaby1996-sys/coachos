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

// Exact reviewed Sandbox hosted URL compatibility patch; keep local CI running.
// Unlisted runtime, deployment and schema changes still require configured data.
const paddleCheckoutUrlCompatibilityFiles = new Set([
  "docs/paddle-checkout-01-prep.md",
  "docs/paddle-checkout-activation.md",
  "src/features/billing/providers/paddle.ts",
  "supabase/functions/_shared/paddle-checkout/destination.ts",
  "tests/e2e/paddle-checkout.spec.ts",
  "tests/unit/paddle-browser-provider.test.ts",
  "tests/unit/paddle-checkout.test.ts",
]);

// Only this complete reviewed runtime patch (optionally with its classifier
// tests) is local-only. Mixing even previously exempt paths fails closed.
const paddleSharedRuntimeCompatibilityFiles = new Set([
  "supabase/functions/_shared/paddle-catalogue/config.ts",
  "tests/unit/paddle-shared-runtime.test.ts",
  "tests/unit/paddle-checkout-runtime.test.ts",
]);

// BILL-ROUTE-01 is a UI route-policy correction with local browser evidence.
// Only this entire reviewed inventory, optionally with this classifier and its
// tests, may skip configured hosted-account mutation checks.
const billingPreWorkspaceAccessFiles = new Set([
  "src/lib/protected-route-guard.ts",
  "src/routes/app.tsx",
  "tests/unit/pre-workspace-pt-route.test.ts",
  "tests/unit/client-messages-route-wiring.test.ts",
  "tests/unit/client-preworkspace-shell-wiring.test.ts",
  "tests/unit/client-settings-route-wiring.test.ts",
  "tests/e2e/billing-pre-workspace.spec.ts",
  "tests/e2e/paddle-checkout.spec.ts",
  "docs/qa/BILL-ROUTE-01.md",
]);

// PADDLE-IDENTITY-SUPERSESSION-01 changes private provider-evidence storage and
// exercises it locally. Only this complete reviewed inventory, optionally with
// its classifier and tests, may skip configured hosted-account mutations.
const paddleIdentitySupersessionFiles = new Set([
  "supabase/migrations/20260923102850_paddle_identity_supersession.sql",
  "supabase/tests/paddle_identity_supersession.sql",
  "scripts/test-paddle-identity-supersession-concurrency.py",
  "scripts/test-paddle-identity-supersession-migration.py",
  "docs/paddle-identity-supersession.md",
  "supabase/tests/billing_provider_v2_foundation.sql",
  "supabase/tests/paddle_certification_authority_retirement.sql",
  "config/staging-commercial-certification.json",
]);

// Authority-bearing but dormant initial reconciliation: only the complete
// reviewed implementation may skip hosted writes whose isolation is unproven.
const paddleInitialPurchaseReconciliationFiles = new Set([
  "config/staging-commercial-certification.json",
  "docs/paddle-initial-purchase-reconciliation.md",
  "docs/staging-commercial-deployment-manifest.md",
  "scripts/test-paddle-reconciliation-concurrency.py",
  "scripts/test-paddle-reconciliation-migration.py",
  "scripts/test-paddle-reconciliation-regressions.py",
  "supabase/migrations/20260923151445_paddle_initial_purchase_reconciliation.sql",
  "supabase/tests/billing_provider_v2_foundation.sql",
  "supabase/tests/billing_verified_evidence.sql",
  "supabase/tests/paddle_certification_authority_retirement.sql",
  "supabase/tests/paddle_initial_purchase_reconciliation.sql",
]);

// Authority-bearing but dormant automatic initial-purchase reconciliation.
// Only this complete reviewed inventory, optionally with its classifier and
// tests, may skip configured hosted-account writes whose isolation is unproven.
const paddleAutoInitialPurchaseReconciliationFiles = new Set([
  "config/staging-commercial-certification.json",
  "docs/paddle-auto-initial-purchase-reconciliation.md",
  "docs/staging-commercial-deployment-manifest.md",
  "scripts/test-paddle-auto-reconciliation-concurrency.py",
  "scripts/test-paddle-auto-reconciliation-migration.py",
  "supabase/functions/_shared/paddle-webhook/ingress.ts",
  "supabase/migrations/20260923220540_paddle_auto_initial_purchase_reconciliation.sql",
  "supabase/tests/fixtures/paddle_auto_reconciliation_fixture.psql",
  "supabase/tests/paddle_auto_initial_purchase_reconciliation.sql",
  "tests/unit/paddle-webhook-ingress.test.ts",
]);

// Output-only hardening: exact implementation inventory from bf56f14127d58b5a78ee19970caaa198ae8fb1ad.
// Keep local quality and smoke; never broaden to unreviewed paths or subsets.
const paddleOutputRedactionFiles = new Set([
  "docs/paddle-output-redaction.md",
  "output/paddle-output-redaction/verification.json",
  "scripts/billing-operator-output.mjs",
  "scripts/paddle-catalogue-preflight.ts",
  "scripts/paddle-legal-readiness.ts",
  "scripts/staging-commercial-apply.mjs",
  "scripts/staging-commercial-catalogue.mjs",
  "scripts/staging-commercial-evidence.mjs",
  "scripts/staging-commercial-plan.mjs",
  "scripts/staging-commercial-preflight.mjs",
  "scripts/test-billing-output.mjs",
  "src/lib/redact-billing-private-values.ts",
  "src/lib/redact-hosted-payment-urls.ts",
  "tests/fixtures/billing-output-canaries.mjs",
  "tests/unit/billing-output-redaction.test.ts",
  "tests/unit/staging-commercial-preflight.test.ts",
]);

// PADDLE-OUTPUT-REDACTION-02 is output-only hardening. Exempt only its exact
// four-file implementation, optionally with this classifier and its tests.
const paddleProjectIdentifierRedactionFiles = new Set([
  "src/lib/redact-billing-private-values.ts",
  "tests/fixtures/billing-output-canaries.mjs",
  "tests/unit/billing-output-redaction.test.ts",
  "scripts/test-billing-output.mjs",
]);

// Only the complete reviewed lifecycle inventory may skip hosted-account writes.
const paddleSubscriptionLifecycleFiles = new Set([
  "config/staging-commercial-certification.json",
  "scripts/test-paddle-lifecycle-concurrency.py",
  "scripts/test-paddle-lifecycle-migration.py",
  "supabase/functions/_shared/paddle-webhook/contract.ts",
  "supabase/functions/_shared/paddle-webhook/ingress.ts",
  "supabase/functions/_shared/paddle-webhook/observation.ts",
  "supabase/migrations/20260924100007_paddle_subscription_lifecycle.sql",
  "supabase/tests/fixtures/paddle_lifecycle_fixture.psql",
  "supabase/tests/paddle_subscription_lifecycle.sql",
  "tests/unit/paddle-lifecycle-observation.test.ts",
  "tests/unit/paddle-webhook-ingress.test.ts",
]);

// PADDLE-PLAN-CHANGE-01: only the complete reviewed implementation skips
// configured-account mutations. Quality, local smoke, DB and security remain.
const paddlePlanChangeFiles = new Set([
  "config/staging-commercial-certification.json",
  "docs/paddle-plan-changes.md",
  "scripts/test-paddle-plan-change-concurrency.py",
  "src/features/billing/plan-change-contracts.ts",
  "src/features/billing/plan-change-panel.tsx",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/functions/_shared/billing-plan-change.ts",
  "supabase/functions/_shared/billing-runtime.ts",
  "supabase/functions/_shared/paddle-plan-change.ts",
  "supabase/functions/_shared/paddle-webhook/contract.ts",
  "supabase/functions/_shared/paddle-webhook/observation.ts",
  "supabase/migrations/20260924113658_paddle_plan_changes.sql",
  "supabase/tests/fixtures/paddle_plan_change_fixture.psql",
  "supabase/tests/paddle_plan_changes.sql",
  "tests/e2e/billing-plan-change.spec.ts",
  "tests/unit/billing-plan-change-panel.test.ts",
  "tests/unit/paddle-plan-change.test.ts",
]);

// Paddle preview-contract release: all twelve reviewed paths are required,
// including the classifier pair. No subsets, aliases, duplicates or extra paths.
const paddlePreviewContractFiles = new Set([
  "src/features/billing/plan-change-contracts.ts",
  "src/features/billing/plan-change-panel.tsx",
  "supabase/functions/_shared/paddle-plan-change.ts",
  "tests/e2e/billing-plan-change.spec.ts",
  "tests/e2e/billing-coach-seats.spec.ts",
  "tests/e2e/utils/plan-change-fixture.ts",
  "tests/e2e/utils/plan-change-mappings.ts",
  "tests/unit/billing-plan-change-panel.test.ts",
  "tests/unit/paddle-plan-change.test.ts",
  "tests/unit/plan-change-mappings.test.ts",
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
]);

// Temporary preview negotiation bridge. Every reviewed path is required;
// no extra paths, aliases, duplicates or partial inventories are exempt.
const paddlePreviewBridgeFiles = new Set([
  "src/features/billing/plan-change-api.ts",
  "src/features/billing/plan-change-panel.tsx",
  "supabase/functions/_shared/billing-plan-change.ts",
  "tests/unit/paddle-plan-change.test.ts",
  "tests/unit/billing-plan-change-api.test.ts",
  "tests/e2e/billing-plan-change.spec.ts",
  "docs/paddle-plan-changes.md",
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
]);

export function classifyChanges(files) {
  const paddlePreviewBridge =
    files.length === paddlePreviewBridgeFiles.size &&
    new Set(files).size === files.length &&
    files.every((file) => paddlePreviewBridgeFiles.has(file));
  const paddlePreviewContract =
    files.length === paddlePreviewContractFiles.size &&
    new Set(files).size === files.length &&
    files.every((file) => paddlePreviewContractFiles.has(file));
  const paddlePlanChange =
    new Set(files).size === files.length &&
    [...paddlePlanChangeFiles].every((file) => files.includes(file)) &&
    files.every(
      (file) =>
        paddlePlanChangeFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );

  const paddleSubscriptionLifecycle =
    new Set(files).size === files.length &&
    [...paddleSubscriptionLifecycleFiles].every((file) =>
      files.includes(file),
    ) &&
    files.every(
      (file) =>
        paddleSubscriptionLifecycleFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const paddleOutputRedaction =
    new Set(files).size === files.length &&
    [...paddleOutputRedactionFiles].every((file) => files.includes(file)) &&
    files.every(
      (file) =>
        paddleOutputRedactionFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const paddleProjectIdentifierRedaction =
    new Set(files).size === files.length &&
    [...paddleProjectIdentifierRedactionFiles].every((file) =>
      files.includes(file),
    ) &&
    files.every(
      (file) =>
        paddleProjectIdentifierRedactionFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const documentation = (file) => /^docs\/.+\.md$/.test(file);
  const sharedRuntimeCompatibility =
    [...paddleSharedRuntimeCompatibilityFiles].every((file) =>
      files.includes(file),
    ) &&
    files.every(
      (file) =>
        paddleSharedRuntimeCompatibilityFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const billingPreWorkspaceAccess =
    [...billingPreWorkspaceAccessFiles].every((file) => files.includes(file)) &&
    files.every(
      (file) =>
        billingPreWorkspaceAccessFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const paddleIdentitySupersession =
    [...paddleIdentitySupersessionFiles].every((file) =>
      files.includes(file),
    ) &&
    files.every(
      (file) =>
        paddleIdentitySupersessionFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const paddleInitialPurchaseReconciliation =
    [...paddleInitialPurchaseReconciliationFiles].every((file) =>
      files.includes(file),
    ) &&
    files.every(
      (file) =>
        paddleInitialPurchaseReconciliationFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  const paddleAutoInitialPurchaseReconciliation =
    [...paddleAutoInitialPurchaseReconciliationFiles].every((file) =>
      files.includes(file),
    ) &&
    files.every(
      (file) =>
        paddleAutoInitialPurchaseReconciliationFiles.has(file) ||
        file === ".github/scripts/ci-change-scope.mjs" ||
        file === ".github/scripts/ci-change-scope.test.mjs",
    );
  return {
    docs_only: files.length > 0 && files.every(documentation),
    // CI changes still run the full local smoke suite, but do not need to
    // mutate configured remote accounts. Unknown paths require all checks.
    configured_data_required:
      !paddlePreviewBridge &&
      !paddlePreviewContract &&
      !paddlePlanChange &&
      !paddleSubscriptionLifecycle &&
      !paddleOutputRedaction &&
      !paddleProjectIdentifierRedaction &&
      !sharedRuntimeCompatibility &&
      !billingPreWorkspaceAccess &&
      !paddleIdentitySupersession &&
      !paddleInitialPurchaseReconciliation &&
      !paddleAutoInitialPurchaseReconciliation &&
      (files.length === 0 ||
        files.some(
          (file) =>
            !documentation(file) &&
            !ciFiles.has(file) &&
            !privateBillingFoundationFiles.has(file) &&
            !privateBillingEvidenceFiles.has(file) &&
            !privatePaddleCatalogueFiles.has(file) &&
            !paddleCertificationRetirementFiles.has(file) &&
            !paddleCheckoutActivationFiles.has(file) &&
            !paddleCheckoutUrlCompatibilityFiles.has(file),
        )),
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
