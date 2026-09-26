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

// Generated from git diff-tree for implementation commit
// 07ffb467195f18189e461b1c05110166e58f2934. Keeping the exact inventory as
// a fixture makes the classifier independent of local Git history in CI.
const autoReconciliationFiles = [
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
];
const autoReconciliationPrFiles = [
  ...autoReconciliationFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("Paddle automatic reconciliation classifier exactly matches the implementation commit", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(
        /const paddleAutoInitialPurchaseReconciliationFiles = new Set\(\[([\s\S]*?)\]\);/,
      )[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(autoReconciliationFiles.length, 10);
  assert.equal(new Set(autoReconciliationFiles).size, 10);
  assert.equal(entries.length, 10);
  assert.deepEqual(entries, autoReconciliationFiles);
});

for (const files of [autoReconciliationFiles, autoReconciliationPrFiles]) {
  test(`exact ${files.length}-file Paddle automatic reconciliation inventory keeps local CI`, () => {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  });
}

test("incomplete Paddle automatic reconciliation patches remain fail-closed", () => {
  for (const omitted of autoReconciliationFiles) {
    for (const files of [autoReconciliationFiles, autoReconciliationPrFiles]) {
      assert.deepEqual(
        classifyChanges(files.filter((file) => file !== omitted)),
        { docs_only: false, configured_data_required: true },
        omitted,
      );
    }
  }
});

for (const file of [
  "src/app.tsx",
  "src/lib/auth.tsx",
  "supabase/functions/billing-paddle-webhook/index.ts",
  "supabase/functions/billing-create-paddle-checkout/index.ts",
  "supabase/functions/_shared/billing-handlers.ts",
  "supabase/functions/_shared/paddle-webhook/index.ts",
  "supabase/migrations/20260924000000_paddle_auto_reconciliation_followup.sql",
  "supabase/tests/paddle_auto_initial_purchase_reconciliation_other.sql",
  "scripts/staging-commercial-apply.mjs",
  "tests/e2e/billing-checkout.spec.ts",
  "package-lock.json",
  ".github/workflows/ci.yml",
  "supabase/migrations/20260923220540_paddle_auto_initial_purchase_reconciliation_other.sql",
  "supabase/tests/fixtures/paddle_auto_reconciliation_fixture_other.psql",
  "scripts/test-paddle-auto-reconciliation-concurrency-other.py",
  "tests/unit/paddle-webhook-ingress-other.test.ts",
  "docs/paddle-auto-initial-purchase-reconciliation-other.md",
]) {
  test(`Paddle automatic reconciliation mixed with ${file} remains fail-closed`, () => {
    for (const files of [autoReconciliationFiles, autoReconciliationPrFiles]) {
      assert.deepEqual(classifyChanges([...files, file]), {
        docs_only: false,
        configured_data_required: true,
      });
    }
  });
}

// Immutable implementation commit bf56f14127d58b5a78ee19970caaa198ae8fb1ad; generated with git diff-tree.
const outputRedactionFiles = [
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
];

const outputRedactionPrFiles = [
  ...outputRedactionFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

const projectIdentifierRedactionFiles = [
  "src/lib/redact-billing-private-values.ts",
  "tests/fixtures/billing-output-canaries.mjs",
  "tests/unit/billing-output-redaction.test.ts",
  "scripts/test-billing-output.mjs",
];
const projectIdentifierRedactionPrFiles = [
  ...projectIdentifierRedactionFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];

test("project-identifier redaction exemption has the exact four-file inventory", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(
        /const paddleProjectIdentifierRedactionFiles = new Set\(\[([\s\S]*?)\]\);/,
      )[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(entries.length, 4);
  assert.equal(new Set(entries).size, 4);
  assert.deepEqual(entries, projectIdentifierRedactionFiles);
});

test("exact project-identifier redaction implementation keeps CI local-only", () => {
  assert.deepEqual(classifyChanges(projectIdentifierRedactionFiles), {
    docs_only: false,
    configured_data_required: false,
  });
});

test("final six-file project-identifier redaction PR keeps CI local-only", () => {
  assert.equal(projectIdentifierRedactionPrFiles.length, 6);
  assert.deepEqual(classifyChanges(projectIdentifierRedactionPrFiles), {
    docs_only: false,
    configured_data_required: false,
  });
});

test("incomplete project-identifier redaction patches remain fail-closed", () => {
  for (const omitted of projectIdentifierRedactionFiles) {
    for (const files of [
      projectIdentifierRedactionFiles,
      projectIdentifierRedactionPrFiles,
    ]) {
      assert.deepEqual(
        classifyChanges(files.filter((file) => file !== omitted)),
        { docs_only: false, configured_data_required: true },
        omitted,
      );
    }
  }
});

for (const extra of [
  "src/app.tsx",
  "supabase/migrations/20260925000000_project_redaction_followup.sql",
  ".github/workflows/ci.yml",
  "package-lock.json",
  "src/lib/redact-billing-private-values-project.ts",
  "tests/fixtures/billing-output-project-canaries.mjs",
  "tests/unit/billing-output-project-redaction.test.ts",
  "scripts/test-project-billing-output.mjs",
]) {
  test(`project-identifier redaction mixed with ${extra} requires configured data`, () => {
    for (const files of [
      projectIdentifierRedactionFiles,
      projectIdentifierRedactionPrFiles,
    ]) {
      assert.deepEqual(classifyChanges([...files, extra]), {
        docs_only: false,
        configured_data_required: true,
      });
    }
  });
}

test("output redaction exemption matches the authoritative 16-file implementation", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(/const paddleOutputRedactionFiles = new Set\(\[([\s\S]*?)\]\);/)[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.equal(entries.length, 16);
  assert.equal(new Set(entries).size, 16);
  assert.deepEqual(entries, outputRedactionFiles);
});
for (const files of [outputRedactionFiles, outputRedactionPrFiles]) {
  test(`exact ${files.length}-file output redaction inventory keeps local CI`, () => {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  });
}
for (const omitted of outputRedactionFiles) {
  test(`output redaction missing ${omitted} requires configured data`, () => {
    for (const files of [outputRedactionFiles, outputRedactionPrFiles])
      assert.deepEqual(
        classifyChanges(files.filter((file) => file !== omitted)),
        { docs_only: false, configured_data_required: true },
      );
  });
}
for (const extra of [
  "src/app.tsx",
  "supabase/functions/billing-paddle-webhook/index.ts",
  "supabase/migrations/20260924000000_redaction_followup.sql",
  // Already part of the implementation: a duplicate is invalid, not a new path.
  "scripts/staging-commercial-apply.mjs",
  ".github/workflows/ci.yml",
  "package-lock.json",
  "src/lib/redact-billing-private-values-other.ts",
  "src/lib/redact-hosted-payment-urls-other.ts",
  "scripts/billing-operator-output-other.mjs",
  "scripts/test-billing-output-other.mjs",
  "tests/unit/billing-output-redaction-other.test.ts",
  "tests/fixtures/billing-output-canaries-other.mjs",
  "docs/paddle-output-redaction-other.md",
  "output/paddle-output-redaction/verification-other.json",
]) {
  test(`output redaction mixed with ${extra} requires configured data`, () => {
    for (const files of [outputRedactionFiles, outputRedactionPrFiles])
      assert.deepEqual(classifyChanges([...files, extra]), {
        docs_only: false,
        configured_data_required: true,
      });
  });
}

// Exact implementation inventory committed in 060b210.
const lifecycleFiles = [
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
];
const lifecyclePrFiles = [
  ...lifecycleFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];
test("lifecycle classifier has the exact eleven implementation files", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(
        /const paddleSubscriptionLifecycleFiles = new Set\(\[([\s\S]*?)\]\);/,
      )[1]
      .matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);
  assert.equal(entries.length, 11);
  assert.deepEqual(entries, lifecycleFiles);
});
for (const files of [lifecycleFiles, lifecyclePrFiles]) {
  test(`exact ${files.length}-file lifecycle inventory keeps local CI`, () => {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  });
  for (const omitted of lifecycleFiles) {
    test(`${files.length}-file lifecycle inventory missing ${omitted} fails closed`, () => {
      assert.deepEqual(classifyChanges(files.filter((f) => f !== omitted)), {
        docs_only: false,
        configured_data_required: true,
      });
    });
  }
  for (const extra of [
    "src/app.tsx",
    "supabase/functions/billing-paddle-webhook/index.ts",
    "supabase/migrations/20260925000000_lifecycle_followup.sql",
    ".github/workflows/ci.yml",
    "package-lock.json",
    "docs/unrelated.md",
    lifecycleFiles[0],
  ]) {
    test(`${files.length}-file lifecycle inventory plus ${extra} fails closed`, () => {
      assert.deepEqual(classifyChanges([...files, extra]), {
        docs_only: false,
        configured_data_required: true,
      });
    });
  }
}

const paddlePlanChangeFiles = [
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
];
const paddlePlanChangePrFiles = [
  ...paddlePlanChangeFiles,
  ".github/scripts/ci-change-scope.mjs",
  ".github/scripts/ci-change-scope.test.mjs",
];
test("Paddle plan-change exemption matches the documented frozen inventory", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(/const paddlePlanChangeFiles = new Set\(\[([\s\S]*?)\]\);/)[1]
      .matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);
  const doc = readFileSync(
    new URL("../../docs/paddle-plan-changes.md", import.meta.url),
    "utf8",
  );
  const documented = [
    ...doc
      .split("## Reviewed implementation inventory (N=17)")[1]
      .split("## Transport")[0]
      .matchAll(/^- `([^`]+)`$/gm),
  ].map((m) => m[1]);
  assert.equal(entries.length, 17);
  assert.deepEqual(entries, paddlePlanChangeFiles);
  assert.deepEqual(documented, paddlePlanChangeFiles);
});
for (const files of [paddlePlanChangeFiles, paddlePlanChangePrFiles]) {
  test(`exact ${files.length}-file Paddle plan-change inventory keeps local checks`, () => {
    assert.deepEqual(classifyChanges(files), {
      docs_only: false,
      configured_data_required: false,
    });
  });
  for (const omitted of paddlePlanChangeFiles) {
    test(`${files.length}-file Paddle plan-change inventory missing ${omitted} fails closed`, () => {
      assert.deepEqual(classifyChanges(files.filter((f) => f !== omitted)), {
        docs_only: false,
        configured_data_required: true,
      });
    });
  }
  for (const extra of [
    "src/app.tsx",
    "supabase/migrations/20260925000000_unreviewed.sql",
    ".github/workflows/ci.yml",
    "package.json",
    "package-lock.json",
    "docs/unrelated.md",
    paddlePlanChangeFiles[0],
    ...paddlePlanChangeFiles.map((f) => f.replace(/(\.[^./]+)$/, "-other$1")),
  ]) {
    test(`${files.length}-file Paddle plan-change inventory plus ${extra} fails closed`, () => {
      assert.deepEqual(classifyChanges([...files, extra]), {
        docs_only: false,
        configured_data_required: true,
      });
    });
  }
}

const paddlePreviewContractFiles = [
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
];
const previewLocalOnly = { docs_only: false, configured_data_required: false };
const previewRequiresConfigured = {
  docs_only: false,
  configured_data_required: true,
};

test("Paddle preview exemption requires the exact twelve reviewed paths in any order", () => {
  const source = readFileSync(
    new URL("./ci-change-scope.mjs", import.meta.url),
    "utf8",
  );
  const entries = [
    ...source
      .match(/const paddlePreviewContractFiles = new Set\(\[([\s\S]*?)\]\);/)[1]
      .matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(entries, paddlePreviewContractFiles);
  assert.equal(entries.length, 12);
  assert.deepEqual(
    classifyChanges(paddlePreviewContractFiles),
    previewLocalOnly,
  );
  assert.deepEqual(
    classifyChanges([...paddlePreviewContractFiles].reverse()),
    previewLocalOnly,
  );
});
test("old eleven-file Paddle preview inventory no longer receives the exemption", () => {
  const previousInventory = paddlePreviewContractFiles.filter(
    (file) => file !== "tests/e2e/billing-coach-seats.spec.ts",
  );
  assert.equal(previousInventory.length, 11);
  assert.deepEqual(
    classifyChanges(previousInventory),
    previewRequiresConfigured,
  );
});
for (const omitted of paddlePreviewContractFiles) {
  test(`Paddle preview inventory missing ${omitted} fails closed`, () => {
    assert.deepEqual(
      classifyChanges(
        paddlePreviewContractFiles.filter((file) => file !== omitted),
      ),
      previewRequiresConfigured,
    );
  });
}
for (const extra of [
  "src/app.tsx",
  "supabase/migrations/20260926000000_unrelated.sql",
  ".github/workflows/ci.yml",
  "package.json",
  "package-lock.json",
  "docs/unrelated.md",
  ".codex/environments/environment.toml",
  "supabase/functions/_shared/billing-plan-change.ts",
  "src/features/billing/plan-change-api.ts",
  ...paddlePreviewContractFiles,
]) {
  test(`Paddle preview inventory plus ${extra} fails closed`, () => {
    assert.deepEqual(
      classifyChanges([...paddlePreviewContractFiles, extra]),
      previewRequiresConfigured,
    );
  });
}
for (const normalize of [
  (file) => `./${file}`,
  (file) => file.replaceAll("/", "\\"),
  (file) => file.toUpperCase(),
  (file) => `tests/../${file}`,
]) {
  test(`Paddle preview path alias ${normalize(paddlePreviewContractFiles[0])} fails closed`, () => {
    assert.deepEqual(
      classifyChanges([
        normalize(paddlePreviewContractFiles[0]),
        ...paddlePreviewContractFiles.slice(1),
      ]),
      previewRequiresConfigured,
    );
  });
}
test("unrelated billing changes do not inherit the Paddle preview exemption", () => {
  assert.deepEqual(
    classifyChanges(["src/features/billing/plan-change-api.ts"]),
    previewRequiresConfigured,
  );
  assert.deepEqual(
    classifyChanges(paddlePreviewContractFiles.slice(0, 9)),
    previewRequiresConfigured,
  );
  assert.deepEqual(
    classifyChanges([
      ...paddlePreviewContractFiles.slice(0, -1),
      paddlePreviewContractFiles[0],
    ]),
    previewRequiresConfigured,
  );
});
