import assert from "node:assert/strict";
import test from "node:test";
import { changedFiles, classifyChanges } from "./ci-change-scope.mjs";

test("documentation changes complete CI without either E2E suite", () => {
  assert.deepEqual(classifyChanges(["docs/design.md", "docs/nested/a b.md"]), {
    docs_only: true,
    configured_data_required: false,
  });
});

test("the CI implementation still requires local smoke, but no remote writes", () => {
  assert.deepEqual(
    classifyChanges([
      "docs/design.md",
      ".github/workflows/ci.yml",
      ".github/scripts/ci-change-scope.mjs",
      ".github/scripts/ci-change-scope.test.mjs",
    ]),
    { docs_only: false, configured_data_required: false },
  );
});

test("runtime, tests, dependencies, SQL and unknown paths require all checks", () => {
  for (const file of [
    "src/app.tsx",
    "tests/e2e/billing.spec.ts",
    "package-lock.json",
    "supabase/migrations/change.sql",
    "docs/script.mjs",
    ".github/workflows/other.yml",
    "README.md",
  ]) {
    assert.deepEqual(classifyChanges(["docs/design.md", file]), {
      docs_only: false,
      configured_data_required: true,
    });
  }
});

const foundationFiles = [
  "docs/billing-provider-v2-foundation.md",
  "supabase/migrations/20260919092348_billing_provider_v2_private_foundation.sql",
  "supabase/tests/billing_provider_v2_foundation.sql",
  "supabase/tests/fixtures/billing_v2_legacy_manifest.psql",
  "supabase/tests/fixtures/billing_v2_legacy_seed.psql",
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("private billing foundation runs local smoke without remote account writes", () => {
  assert.deepEqual(classifyChanges(foundationFiles), {
    docs_only: false,
    configured_data_required: false,
  });
});

test("foundation mixed with runtime or any other SQL still requires all checks", () => {
  for (const file of [
    "src/app.tsx",
    "supabase/functions/billing-webhook/index.ts",
    "supabase/migrations/20260911010000_lemon_squeezy_billing_foundation.sql",
    "supabase/migrations/20260920000000_billing_provider_v2_followup.sql",
    "supabase/tests/lemon_squeezy_billing.sql",
    "tests/e2e/billing.spec.ts",
    "package-lock.json",
  ]) {
    assert.equal(
      classifyChanges([...foundationFiles, file]).configured_data_required,
      true,
      file,
    );
  }
});

test("empty and manually dispatched comparisons require all checks", () => {
  assert.deepEqual(classifyChanges(changedFiles("workflow_dispatch", {})), {
    docs_only: false,
    configured_data_required: true,
  });
});

const evidenceFiles = [
  "docs/billing-verified-evidence-boundary.md",
  "scripts/verify-billing-proof-manifest.py",
  "supabase/functions/_shared/billing-evidence-writer-v2.ts",
  "supabase/functions/_shared/billing-proof-v2.ts",
  "supabase/functions/_shared/billing-verified-receipts-v2.ts",
  "supabase/migrations/20260919114502_billing_verified_receipt_evidence_boundary.sql",
  "supabase/tests/billing_verified_evidence.sql",
  "supabase/tests/fixtures/billing_proof_legacy_manifest.psql",
  "supabase/tests/fixtures/billing_verified_proof_fixture.psql",
  "tests/unit/billing-verified-evidence.test.ts",
];

test("uncomposed evidence persistence requires local smoke without hosted writes", () => {
  assert.deepEqual(classifyChanges(evidenceFiles), {
    docs_only: false,
    configured_data_required: false,
  });
});

test("evidence mixed with integration, legacy or future schema changes requires all checks", () => {
  for (const file of [
    "supabase/functions/_shared/billing-runtime.ts",
    "supabase/functions/_shared/lemon-squeezy-reconciliation.ts",
    "supabase/functions/paddle-webhook/index.ts",
    "supabase/migrations/20260920000000_billing_verified_effects.sql",
    "src/features/billing/checkout.ts",
    "tests/e2e/billing.spec.ts",
  ]) {
    assert.equal(
      classifyChanges([...evidenceFiles, file]).configured_data_required,
      true,
      file,
    );
  }
});

const catalogueFiles = [
  "config/staging-commercial-certification.json",
  "docs/paddle-catalogue-publication.md",
  "docs/staging-commercial-deployment-manifest.md",
  "scripts/test-billing-catalogue-concurrency.py",
  "scripts/verify-billing-catalogue-manifest.py",
  "supabase/functions/_shared/billing-verified-receipts-v2.ts",
  "supabase/functions/_shared/billing-catalogue-proof-v1.ts",
  "supabase/functions/_shared/billing-catalogue-writer-v1.ts",
  "supabase/migrations/20260919134451_paddle_catalogue_verified_publication.sql",
  "supabase/tests/billing_catalogue_publication.sql",
  "supabase/tests/fixtures/billing_catalogue_fixture.psql",
  "supabase/tests/fixtures/billing_catalogue_legacy_manifest.psql",
  "tests/unit/billing-catalogue-publication.test.ts",
];
test("catalogue publication and manifest sync keep local checks without hosted writes", () => {
  assert.deepEqual(classifyChanges(catalogueFiles), {
    docs_only: false,
    configured_data_required: false,
  });
});
test("catalogue mixed with transport, runtime or another migration requires all checks", () => {
  for (const file of [
    "supabase/functions/_shared/paddle-catalogue/index.ts",
    "supabase/functions/_shared/billing-runtime.ts",
    "supabase/migrations/20260920000000_paddle_enablement.sql",
    "scripts/staging-commercial-apply.mjs",
  ]) {
    assert.equal(
      classifyChanges([...catalogueFiles, file]).configured_data_required,
      true,
    );
  }
});

const retirementFiles = [
  "config/staging-commercial-certification.json",
  "docs/paddle-certification-retirement-verification.md",
  "docs/paddle-checkout-certification-fixture.md",
  "docs/staging-commercial-deployment-manifest.md",
  "scripts/test-paddle-cert-retirement.py",
  "supabase/migrations/20260922094541_paddle_certification_fixture_authority_retirement.sql",
  "supabase/tests/fixtures/paddle_certification_before_retirement.psql",
  "supabase/tests/paddle_certification_authority_retirement.sql",
  "supabase/tests/paddle_checkout_certification_fixture.sql",
];

test("exact certification retirement keeps quality and local smoke without hosted writes", () => {
  for (const files of [
    retirementFiles,
    [
      ...retirementFiles,
      ".github/scripts/ci-change-scope.mjs",
      ".github/scripts/ci-change-scope.test.mjs",
    ],
  ]) {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  }
});

test("retirement mixed with any unreviewed behavior still requires configured data", () => {
  for (const file of [
    "src/app.tsx",
    "supabase/functions/paddle-webhook/index.ts",
    "supabase/functions/_shared/billing-runtime.ts",
    "supabase/migrations/20260924000000_unrelated_change.sql",
    "tests/e2e/checkin-submit-review.smoke.spec.ts",
    "package.json",
    "package-lock.json",
    "scripts/staging-commercial-apply.mjs",
    ".github/workflows/supabase-deploy-staging.yml",
  ]) {
    assert.deepEqual(
      classifyChanges([...retirementFiles, file]),
      { docs_only: false, configured_data_required: true },
      file,
    );
  }
});

test("unlisted near-matching retirement paths never inherit the exemption", () => {
  for (const file of [
    "supabase/migrations/20260923000000_paddle_certification_other_change.sql",
    "supabase/migrations/20260923000000_paddle_certification_fixture_authority_retirement.sql",
    "supabase/tests/paddle_certification_authority_retirement_other.sql",
    "scripts/test-paddle-cert-retirement-other.py",
  ]) {
    assert.equal(classifyChanges([file]).configured_data_required, true, file);
    assert.equal(
      classifyChanges([...retirementFiles, file]).configured_data_required,
      true,
      file,
    );
  }
});

test("PR comparison includes the whole PR and both sides of renames", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  const files = changedFiles(
    "pull_request",
    { pull_request: { base: { sha: base }, head: { sha: head } } },
    (command, args) => {
      assert.equal(command, "git");
      assert.deepEqual(args, [
        "diff",
        "--no-renames",
        "--name-only",
        "-z",
        `${base}...${head}`,
        "--",
      ]);
      return "src/old.ts\0docs/new.md\0";
    },
  );
  assert.equal(classifyChanges(files).configured_data_required, true);
});

test("push comparison covers the complete push", () => {
  const before = "a".repeat(40);
  const after = "b".repeat(40);
  changedFiles("push", { before, after }, (_command, args) => {
    assert.ok(args.includes(`${before}..${after}`));
    return "docs/design.md\0";
  });
});

test("bad revisions and Git failures cannot silently bypass tests", () => {
  assert.throws(() => changedFiles("pull_request", {}), /invalid/);
  assert.throws(
    () =>
      changedFiles(
        "push",
        {
          before: "a".repeat(40),
          after: "b".repeat(40),
        },
        () => {
          throw new Error("missing history");
        },
      ),
    /missing history/,
  );
});
