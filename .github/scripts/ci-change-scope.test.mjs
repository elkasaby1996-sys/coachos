import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    "supabase/functions/_shared/billing-handlers.ts",
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
    "supabase/functions/_shared/billing-handlers.ts",
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
    "supabase/functions/_shared/billing-handlers.ts",
    "supabase/migrations/20260924000000_unrelated_change.sql",
    "tests/e2e/checkin-submit-review.smoke.spec.ts",
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

const activationFiles = [
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
];

const activationPrFiles = [
  ...activationFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("exact checkout activation keeps quality and local smoke without hosted writes", () => {
  assert.equal(activationFiles.length, 29);
  assert.equal(new Set(activationFiles).size, 29);
  for (const files of [activationFiles, activationPrFiles]) {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  }
});

for (const file of [
  "src/app.tsx",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/functions/billing-create-lemon-squeezy-checkout/index.ts",
  "supabase/migrations/20260923000000_paddle_checkout_followup.sql",
  "tests/e2e/billing-checkout.spec.ts",
  "package-lock.json",
  "scripts/staging-commercial-apply.mjs",
  "supabase/functions/billing-create-paddle-checkout-v2/index.ts",
]) {
  test(`checkout activation with unreviewed ${file} requires configured data`, () => {
    assert.ok(!activationFiles.includes(file));
    assert.deepEqual(classifyChanges([...activationPrFiles, file]), {
      docs_only: false,
      configured_data_required: true,
    });
  });
}

const compatibilityFiles = [
  "docs/paddle-checkout-01-prep.md",
  "docs/paddle-checkout-activation.md",
  "src/features/billing/providers/paddle.ts",
  "supabase/functions/_shared/paddle-checkout/destination.ts",
  "tests/e2e/paddle-checkout.spec.ts",
  "tests/unit/paddle-browser-provider.test.ts",
  "tests/unit/paddle-checkout.test.ts",
];
const compatibilityPrFiles = [
  ...compatibilityFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("exact hosted URL compatibility keeps quality and local smoke without hosted writes", () => {
  assert.equal(compatibilityFiles.length, 7);
  assert.equal(new Set(compatibilityFiles).size, 7);
  for (const files of [compatibilityFiles, compatibilityPrFiles]) {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  }
});

const paddleIdentitySupersessionFiles = [
  "supabase/migrations/20260923102850_paddle_identity_supersession.sql",
  "supabase/tests/paddle_identity_supersession.sql",
  "scripts/test-paddle-identity-supersession-concurrency.py",
  "scripts/test-paddle-identity-supersession-migration.py",
  "docs/paddle-identity-supersession.md",
  "supabase/tests/billing_provider_v2_foundation.sql",
  "supabase/tests/paddle_certification_authority_retirement.sql",
  "config/staging-commercial-certification.json",
];
const paddleIdentitySupersessionPrFiles = [
  ...paddleIdentitySupersessionFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("exact Paddle identity supersession inventory keeps CI local-only", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(
        /const paddleIdentitySupersessionFiles = new Set\(\[([\s\S]*?)\]\);/,
      )[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(paddleIdentitySupersessionFiles.length, 8);
  assert.equal(new Set(paddleIdentitySupersessionFiles).size, 8);
  assert.deepEqual(entries, paddleIdentitySupersessionFiles);
  for (const files of [
    paddleIdentitySupersessionFiles,
    paddleIdentitySupersessionPrFiles,
  ]) {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  }
});

test("incomplete Paddle identity supersession patches remain fail-closed", () => {
  for (const omitted of paddleIdentitySupersessionFiles) {
    assert.equal(
      classifyChanges(
        paddleIdentitySupersessionFiles.filter((file) => file !== omitted),
      ).configured_data_required,
      true,
      omitted,
    );
  }
});

for (const file of [
  "supabase/functions/billing-paddle-webhook/index.ts",
  "supabase/functions/_shared/paddle-webhook/ingress.ts",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/migrations/20260923110000_unreviewed_identity_followup.sql",
  "scripts/staging-commercial-apply.mjs",
  "package-lock.json",
  "src/app.tsx",
  "tests/e2e/billing-checkout.spec.ts",
  "supabase/tests/paddle_identity_supersession_other.sql",
  "scripts/test-paddle-identity-supersession-other.py",
]) {
  test(`Paddle identity supersession mixed with ${file} remains fail-closed`, () => {
    assert.deepEqual(
      classifyChanges([...paddleIdentitySupersessionPrFiles, file]),
      { docs_only: false, configured_data_required: true },
    );
  });
}

for (const file of [
  "src/app.tsx",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/functions/billing-create-lemon-squeezy-checkout/index.ts",
  "supabase/migrations/20260923000000_paddle_checkout_url_followup.sql",
  "tests/e2e/billing-checkout.spec.ts",
  "package-lock.json",
  "scripts/staging-commercial-apply.mjs",
  "supabase/functions/_shared/paddle-checkout/destination-v2.ts",
]) {
  test(`hosted URL compatibility with unreviewed ${file} requires configured data`, () => {
    assert.deepEqual(classifyChanges([...compatibilityPrFiles, file]), {
      docs_only: false,
      configured_data_required: true,
    });
  });
}

const sharedRuntimeFiles = [
  "supabase/functions/_shared/paddle-catalogue/config.ts",
  "tests/unit/paddle-shared-runtime.test.ts",
  "tests/unit/paddle-checkout-runtime.test.ts",
];
const sharedRuntimePrFiles = [
  ...sharedRuntimeFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("exact shared runtime compatibility inventory keeps quality and local smoke", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(
        /const paddleSharedRuntimeCompatibilityFiles = new Set\(\[([\s\S]*?)\]\);/,
      )[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(entries.length, 3);
  assert.equal(new Set(entries).size, 3);
  assert.deepEqual(entries, sharedRuntimeFiles);
  for (const files of [sharedRuntimeFiles, sharedRuntimePrFiles]) {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  }
});

for (const file of [
  "src/app.tsx",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/functions/_shared/paddle-webhook/signature.ts",
  "supabase/functions/billing-create-paddle-checkout-v2/index.ts",
  "supabase/migrations/20260923000000_paddle_runtime_followup.sql",
  "tests/e2e/billing-checkout.spec.ts",
  "package-lock.json",
  "scripts/staging-commercial-apply.mjs",
  "supabase/functions/_shared/paddle-catalogue/config-v2.ts",
  "tests/unit/paddle-shared-runtime-other.test.ts",
  "supabase/functions/_shared/paddle-checkout-handler.ts",
  ".github/workflows/ci.yml",
]) {
  test(`shared runtime compatibility mixed with ${file} requires configured data`, () => {
    for (const files of [sharedRuntimeFiles, sharedRuntimePrFiles]) {
      assert.deepEqual(classifyChanges([...files, file]), {
        docs_only: false,
        configured_data_required: true,
      });
    }
  });
}

test("incomplete shared runtime patches do not inherit the exact exemption", () => {
  for (const omitted of sharedRuntimeFiles) {
    assert.equal(
      classifyChanges(sharedRuntimeFiles.filter((file) => file !== omitted))
        .configured_data_required,
      true,
    );
  }
});

const billingPreWorkspaceAccessFiles = [
  "src/lib/protected-route-guard.ts",
  "src/routes/app.tsx",
  "tests/unit/pre-workspace-pt-route.test.ts",
  "tests/unit/client-messages-route-wiring.test.ts",
  "tests/unit/client-preworkspace-shell-wiring.test.ts",
  "tests/unit/client-settings-route-wiring.test.ts",
  "tests/e2e/billing-pre-workspace.spec.ts",
  "tests/e2e/paddle-checkout.spec.ts",
  "docs/qa/BILL-ROUTE-01.md",
];
const billingPreWorkspaceAccessPrFiles = [
  ...billingPreWorkspaceAccessFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("exact pre-workspace Billing inventory keeps local smoke without hosted writes", () => {
  assert.equal(billingPreWorkspaceAccessFiles.length, 9);
  assert.equal(new Set(billingPreWorkspaceAccessFiles).size, 9);
  for (const files of [
    billingPreWorkspaceAccessFiles,
    billingPreWorkspaceAccessPrFiles,
  ]) {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  }
});

for (const file of [
  "src/app.tsx",
  "src/lib/auth.tsx",
  "src/components/layouts/pt-hub-layout.tsx",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/migrations/20260923000000_billing_route_followup.sql",
  "tests/e2e/billing-checkout.spec.ts",
  "package-lock.json",
  "scripts/staging-commercial-apply.mjs",
  "src/lib/protected-route-guard-v2.ts",
  "tests/e2e/billing-pre-workspace-other.spec.ts",
]) {
  test(`pre-workspace Billing mixed with ${file} requires configured data`, () => {
    assert.deepEqual(
      classifyChanges([...billingPreWorkspaceAccessPrFiles, file]),
      { docs_only: false, configured_data_required: true },
    );
  });
}

// Generated from git diff-tree for implementation commit
// c97d74f5bd30556fdccfd86308c23a169e2da12e; kept as a fixture so later
// squash merges do not require an unreachable historical Git object in CI.
const reconciliationFiles = [
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
];
const reconciliationPrFiles = [
  ...reconciliationFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("Paddle reconciliation inventory exactly matches the reviewed Git commit", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(
        /const paddleInitialPurchaseReconciliationFiles = new Set\(\[([\s\S]*?)\]\);/,
      )[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(entries.length, 11);
  assert.equal(new Set(entries).size, 11);
  assert.equal(reconciliationFiles.length, 11);
  assert.deepEqual(entries, reconciliationFiles);
});

for (const files of [reconciliationFiles, reconciliationPrFiles]) {
  test(`exact ${files.length}-file Paddle reconciliation inventory keeps local CI`, () => {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  });
}
for (const omitted of reconciliationFiles) {
  test(`Paddle reconciliation missing ${omitted} remains fail-closed`, () => {
    for (const files of [reconciliationFiles, reconciliationPrFiles]) {
      assert.deepEqual(
        classifyChanges(files.filter((file) => file !== omitted)),
        { docs_only: false, configured_data_required: true },
      );
    }
  });
}
for (const file of [
  "src/app.tsx",
  "src/lib/auth.tsx",
  "supabase/functions/billing-paddle-webhook/index.ts",
  "supabase/functions/billing-create-paddle-checkout/index.ts",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/migrations/20260924000000_paddle_reconciliation_followup.sql",
  "supabase/tests/paddle_initial_purchase_reconciliation_other.sql",
  "scripts/staging-commercial-apply.mjs",
  "tests/e2e/billing-checkout.spec.ts",
  "package-lock.json",
  ".github/workflows/ci.yml",
  "supabase/migrations/20260923151445_paddle_initial_purchase_reconciliation_other.sql",
  "scripts/test-paddle-reconciliation-concurrency-other.py",
  "scripts/test-paddle-reconciliation-migration-other.py",
  "scripts/test-paddle-reconciliation-regressions-other.py",
  "docs/paddle-initial-purchase-reconciliation-other.md",
  "docs/staging-commercial-deployment-manifest-other.md",
]) {
  test(`Paddle reconciliation mixed with ${file} remains fail-closed`, () => {
    for (const files of [reconciliationFiles, reconciliationPrFiles]) {
      assert.deepEqual(classifyChanges([...files, file]), {
        docs_only: false,
        configured_data_required: true,
      });
    }
  });
}
