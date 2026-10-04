import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BILLING_FUNCTIONS,
  FUNCTION_CONTRACTS,
  LS_TOMBSTONES,
  JWT_CONTRACTS,
  CONFIGURATION_CLASSES,
  SECRET_NAMES,
  SCENARIO_IDS,
  SCENARIO_ASSERTIONS,
  RETIREMENT_MIGRATION,
  RETIREMENT_SHA,
  ACTIVATION_MIGRATION,
  ACTIVATION_SHA,
} from "../../scripts/billing-deployment-contract.mjs";
import {
  validateBillingRetirement,
  validateRuntimeSource,
} from "../../scripts/validate-billing-retirement.mjs";
import {
  validateRetirementEvidence,
  validateDryRun,
  assertFunctionInventory,
  assertRetiredDatabaseAuthority,
  assertOverwriteVersions,
  hash,
} from "../../scripts/billing-retirement-release.mjs";
import {
  readDeploymentInventory,
  compareReviewedInventory,
  INVENTORY_QUERY,
  LS_ROOT_KEYS,
} from "../../scripts/billing-retirement-remote-inventory.mjs";
import {
  validateProductionAuthorization,
  runProductionRetirement,
} from "../../scripts/production-billing-retirement.mjs";
import { retirementFixture } from "./helpers/billing-retirement-tooling";
import { verdict } from "../../scripts/staging-commercial-evidence.mjs";
import { billingCapability } from "../../.github/scripts/ci-change-scope.mjs";
import { runStagingRetirementPreflight } from "../../scripts/staging-retirement-preflight.mjs";

const manifest = JSON.parse(
  readFileSync("config/staging-commercial-certification.json", "utf8"),
);
const scenarios = JSON.parse(
  readFileSync("config/staging-commercial-scenarios.json", "utf8"),
);
const native: string[] = JSON.parse(
  readFileSync(
    "supabase/tests/fixtures/lemon_squeezy_retired_functions.json",
    "utf8",
  ),
);
const commit = "a".repeat(40),
  project = "p".repeat(20),
  staging = "s".repeat(20);
const versions = manifest.migrations.approved.map((m: any) =>
  m.filename.slice(0, 14),
);
const cliLedger = (applied: string[]) =>
  JSON.stringify({
    migrations: versions.map((v: string) => ({
      local: v,
      remote: applied.includes(v) ? v : "",
      time: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)} ${v.slice(8, 10)}:${v.slice(10, 12)}:${v.slice(12, 14)}`,
    })),
    message: "Synthetic ledger display metadata",
  });
const authority = () =>
  native.map((signature) => ({
    signature,
    definition: `create function public.${signature} returns void as 'begin null; end' language plpgsql;`,
    applicationExecutable: false,
    publicExecutable: false,
  }));
const remoteFunctions = () =>
  FUNCTION_CONTRACTS.map((f) => ({
    name: f.name,
    id: "synthetic-" + f.name,
    version: 1,
    verify_jwt: f.verifyJwt,
  }));
const zeroRoots = () => Object.fromEntries(LS_ROOT_KEYS.map((key) => [key, 0]));
const context = (environment = "staging") => ({
  environment,
  commit,
  project,
  approvedRemoteVersions: versions.slice(0, 184),
  manifest,
  functionArtifactSha256: retirementFixture(manifest, commit, project)
    .functionArtifactSha256,
});
afterEach(() => vi.unstubAllEnvs());

describe("Paddle-only billing deployment contracts", () => {
  it("validates all local contracts without network or provider requests", () => {
    const network = vi.fn(() => {
      throw new Error("NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", network);
    try {
      expect(validateBillingRetirement()).toMatchObject({
        valid: true,
        billingFunctions: 14,
        tombstones: 3,
        activeLSRuntime: 0,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(network).not.toHaveBeenCalled();
  });
  it("includes the actual Paddle webhook and exactly three deployable static tombstones", () => {
    expect(BILLING_FUNCTIONS).toHaveLength(14);
    expect(BILLING_FUNCTIONS).toContain("billing-paddle-webhook");
    expect(LS_TOMBSTONES).toEqual([
      "billing-create-lemon-squeezy-checkout",
      "billing-lemon-squeezy-webhook",
      "billing-create-customer-portal-link",
    ]);
    expect(JWT_CONTRACTS["billing-paddle-webhook"]).toBe(false);
    expect(JWT_CONTRACTS["billing-lemon-squeezy-webhook"]).toBe(false);
    expect(
      FUNCTION_CONTRACTS.filter(
        (f) => f.authentication === "getUser-and-account-owner",
      ).every((f) => f.verifyJwt),
    ).toBe(true);
    expect(
      readFileSync(
        "supabase/functions/_shared/paddle-webhook/ingress.ts",
        "utf8",
      ),
    ).toContain("verifier.verify");
  });
  it("requires active Paddle configuration, never LS secrets or obsolete portal config", () => {
    for (const name of CONFIGURATION_CLASSES.LS_RETIREMENT_PENDING_REMOTE_REMOVAL)
      expect(SECRET_NAMES).not.toContain(name);
    expect(SECRET_NAMES).toContain("PADDLE_SANDBOX_WEBHOOK_SECRET");
    expect(SECRET_NAMES).toContain("PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY");
    expect(manifest.requiredSecretNames).toEqual(SECRET_NAMES);
  });
  it("freezes 186 migrations with unchanged retirement and separate activation hashes", () => {
    expect(manifest.migrations.approved).toHaveLength(186);
    expect(manifest.migrations.approved[184]).toEqual({
      filename: RETIREMENT_MIGRATION,
      sha256: RETIREMENT_SHA,
    });
    expect(manifest.migrations.approved.at(-1)).toEqual({
      filename: ACTIVATION_MIGRATION,
      sha256: ACTIVATION_SHA,
    });
    expect(
      readFileSync("supabase/migrations/" + RETIREMENT_MIGRATION, "utf8"),
    ).not.toContain("create or replace function public.inspect_lemon_squeezy");
  });
  it.each([
    'import { createLemonSqueezy } from "./old.ts";',
    'const transport = fetch("https://api.lemonsqueezy.com/v1/subscriptions");',
    'env("LEMONSQUEEZY_API_KEY")',
    'registry.forSubscription("lemonsqueezy")',
    "registry.forSubscription(`lemonsqueezy`)",
  ])("CI rejects active LS reintroduction %#", (source) =>
    expect(() =>
      validateRuntimeSource(source, "supabase/functions/_shared/new.ts"),
    ).toThrow("ACTIVE_LS_APPLICATION_RUNTIME_REINTRODUCED"),
  );
  it("does not exempt an entire privacy module from runtime reintroduction checks", () =>
    expect(() =>
      validateRuntimeSource(
        'fetch("https://api.lemonsqueezy.com/v1/subscriptions")',
        "src/lib/redact-billing-private-values.ts",
      ),
    ).toThrow("ACTIVE_LS_APPLICATION_RUNTIME_REINTRODUCED"));
  it("classifies tombstones, Paddle verification and shared safety without disabling broad suites", () => {
    expect(
      billingCapability(
        "supabase/functions/billing-lemon-squeezy-webhook/index.ts",
      ),
    ).toBe("LS_TOMBSTONE");
    expect(
      billingCapability("supabase/functions/billing-paddle-webhook/index.ts"),
    ).toBe("PADDLE_ACTIVE");
    expect(
      billingCapability("supabase/tests/lemon_squeezy_database_retirement.sql"),
    ).toBe("SHARED_SAFETY");
    expect(
      billingCapability("supabase/migrations/" + RETIREMENT_MIGRATION),
    ).toBe("LS_DATABASE_RETIREMENT");
    expect(
      billingCapability("supabase/migrations/" + ACTIVATION_MIGRATION),
    ).toBe("PADDLE_ACTIVE");
    expect(
      billingCapability("supabase/functions/marketing-lead-submit/index.ts"),
    ).toBe("NON_BILLING");
    expect(
      billingCapability(
        "docs/archive/pay03b-forensic/lemon_squeezy_billing.sql.txt",
      ),
    ).toBe("HISTORICAL");
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).toContain(
      "npm run test:unit",
    );
    expect(readFileSync(".github/workflows/supabase-ci.yml", "utf8")).toContain(
      "supabase test db",
    );
  });
  it("has the full evidence-classified Paddle matrix and no successful LS integration scenario", () => {
    expect(scenarios.map((s: any) => s.id)).toEqual(SCENARIO_IDS);
    expect(
      scenarios.every(
        (s: any) => s.provider === "paddle" && s.status === "not_run",
      ),
    ).toBe(true);
    expect(
      scenarios.find((s: any) => s.id === "CERT-PLAN-004").title,
    ).toContain("Natural");
    for (const id of [
      "CERT-SUBSCRIPTION-001",
      "CERT-SUBSCRIPTION-002",
      "CERT-PLAN-003",
      "CERT-SEAT-003",
    ]) {
      const s = scenarios.find((s: any) => s.id === id);
      expect(s.requiredForCertification).toBe(false);
      expect(s.evidenceClasses).toContain(
        id.startsWith("CERT-SUBSCRIPTION")
          ? "PRODUCT_DECISION_PENDING"
          : "INTENTIONALLY_UNSUPPORTED",
      );
    }
    const fake = JSON.parse(
      readFileSync("config/staging-commercial-evidence.template.json", "utf8"),
    );
    fake.fullUnitSuiteGreen = true;
    for (const record of fake.records) {
      record.status = "pass";
      record.scope = "staging_test";
      record.assertions = [
        { code: SCENARIO_ASSERTIONS[record.scenarioId], passed: true },
      ];
    }
    expect(() => verdict(fake)).toThrow("EVIDENCE_INVALID");
  });
});

describe("retirement preflight, authority and dry-run boundaries", () => {
  it("accepts fresh staging and disabled-production evidence with exact 184-prefix/185 suffix", () => {
    for (const environment of ["staging", "production"])
      expect(() =>
        validateRetirementEvidence(
          retirementFixture(
            manifest,
            commit,
            project,
            process.cwd(),
            environment,
          ),
          context(environment),
        ),
      ).not.toThrow();
  });
  it.each([
    "environment",
    "backupEnvironment",
    "backupCommitSha",
    "backupProjectSha256",
    "functionArtifactSha256",
    "providerMode",
    "classificationResult",
    "observedAt",
    "backupCreatedAt",
    "expectedPendingMigrations",
  ])("rejects drift/staleness in %s", (field) => {
    const e: any = retirementFixture(manifest, commit, project);
    e[field] =
      field === "expectedPendingMigrations"
        ? []
        : field.endsWith("At")
          ? "2020-01-01T00:00:00Z"
          : field.includes("Sha")
            ? "0".repeat(field === "backupCommitSha" ? 40 : 64)
            : "production";
    expect(() => validateRetirementEvidence(e, context())).toThrow();
  });
  it("permits the exact reviewed 185-prefix/186 suffix and 186 redeployment, but rejects older prefixes", () => {
    const e: any = retirementFixture(manifest, commit, project);
    e.expectedPendingMigrations = [ACTIVATION_MIGRATION];
    expect(() =>
      validateRetirementEvidence(e, {
        ...context(),
        approvedRemoteVersions: versions.slice(0, 185),
      }),
    ).not.toThrow();
    expect(() =>
      validateRetirementEvidence(
        { ...e, expectedPendingMigrations: [RETIREMENT_MIGRATION] },
        { ...context(), approvedRemoteVersions: versions.slice(0, 185) },
      ),
    ).toThrow("RETIREMENT_PENDING_MIGRATIONS_MISMATCH");
    e.expectedPendingMigrations = [];
    expect(() =>
      validateRetirementEvidence(e, {
        ...context(),
        approvedRemoteVersions: versions,
      }),
    ).not.toThrow();
    expect(() =>
      validateRetirementEvidence(e, {
        ...context(),
        approvedRemoteVersions: versions.slice(0, 183),
      }),
    ).toThrow("RETIREMENT_PENDING_MIGRATIONS_MISMATCH");
  });
  it("checks the actual dry-run suffix before any db push", () => {
    expect(() =>
      validateDryRun(`${RETIREMENT_MIGRATION}\n${ACTIVATION_MIGRATION}`, [
        RETIREMENT_MIGRATION,
        ACTIVATION_MIGRATION,
      ]),
    ).not.toThrow();
    expect(() =>
      validateDryRun(`${ACTIVATION_MIGRATION}\n${RETIREMENT_MIGRATION}`, [
        RETIREMENT_MIGRATION,
        ACTIVATION_MIGRATION,
      ]),
    ).toThrow("RETIREMENT_DRY_RUN_MISMATCH");
    expect(() =>
      validateDryRun("Would push:\n • " + RETIREMENT_MIGRATION, [
        RETIREMENT_MIGRATION,
      ]),
    ).not.toThrow();
    for (const output of [
      "private unrecognized output",
      "20261002000000_unreviewed.sql",
      RETIREMENT_MIGRATION + "\n20261002000000_unreviewed.sql",
    ])
      expect(() => validateDryRun(output, [RETIREMENT_MIGRATION])).toThrow(
        "RETIREMENT_DRY_RUN_MISMATCH",
      );
    expect(() =>
      validateDryRun("Remote database is up to date.", []),
    ).not.toThrow();
    expect(() => validateDryRun("unrecognized", [])).toThrow();
  });
  it("rejects unknown billing endpoints and post-deploy JWT drift", () => {
    expect(() =>
      assertFunctionInventory(remoteFunctions(), true),
    ).not.toThrow();
    expect(() =>
      assertFunctionInventory([
        ...remoteFunctions(),
        { name: "billing-old-ls", id: "fake", version: 1, verify_jwt: false },
      ]),
    ).toThrow("UNEXPECTED_REMOTE_BILLING_FUNCTION");
    const f = remoteFunctions();
    f.find((v) => v.name === "billing-paddle-webhook")!.verify_jwt = true;
    expect(() => assertFunctionInventory(f, true)).toThrow(
      "RETIREMENT_DEPLOYED_FUNCTION_CONTRACT_MISMATCH",
    );
  });
  it("rejects direct and indirect native LS ACL reintroduction", () => {
    expect(() =>
      assertRetiredDatabaseAuthority(authority(), native),
    ).not.toThrow();
    const direct = authority();
    direct[0].publicExecutable = true;
    expect(() => assertRetiredDatabaseAuthority(direct, native)).toThrow(
      "LS_DATABASE_AUTHORITY_PRESENT",
    );
    const indirect = [
      ...authority(),
      {
        signature: "wrapper()",
        applicationExecutable: true,
        publicExecutable: false,
        definition: `select public.${native[0].split("(")[0]}();`,
      },
    ];
    expect(() => assertRetiredDatabaseAuthority(indirect, native)).toThrow(
      "INDIRECT_LS_DATABASE_AUTHORITY_PRESENT",
    );
  });
  it("requires advancing deployed versions, not allowlist omission or unchanged metadata", () => {
    expect(() =>
      assertOverwriteVersions(remoteFunctions(), remoteFunctions()),
    ).toThrow("RETIREMENT_FUNCTION_OVERWRITE_NOT_PROVEN");
    expect(() =>
      assertOverwriteVersions(
        remoteFunctions(),
        remoteFunctions().map((f) => ({ ...f, version: 2 })),
      ),
    ).not.toThrow();
  });
  it("staging preflight reads a bound inventory but never performs mutation or certification", async () => {
    const auth = {
      approvedRemoteVersions: versions.slice(0, 184),
      retirement: retirementFixture(manifest, commit, project),
    };
    const read = vi.fn().mockResolvedValue({
      sha256: auth.retirement.inventorySha256,
      inventory: {
        functions: remoteFunctions(),
        facts: { versions: auth.approvedRemoteVersions },
      },
    });
    const local = vi.fn().mockReturnValue({ inputs: { project }, auth });
    expect(
      await runStagingRetirementPreflight({
        runPreflight: local,
        readDeploymentInventory: read,
      }),
    ).toMatchObject({
      readOnlyInventoryVerified: true,
      remoteMutationPerformed: false,
      billingCertification: "not_run",
      migrationCount: 184,
    });
    expect(local).toHaveBeenCalledExactlyOnceWith("preflight");
    expect(read).toHaveBeenCalledExactlyOnceWith({
      inputs: { project },
      auth,
      mode: "preflight",
    });
  });
  it("refuses a read before protected environment binding, with zero network", async () => {
    const transport = vi.fn();
    await expect(
      readDeploymentInventory(
        {
          inputs: { project },
          auth: { retirement: { environment: "production" } },
          mode: "preflight",
          environment: "production",
          env: {},
        },
        transport,
      ),
    ).rejects.toThrow("AUTHORIZED_RETIREMENT_READ_REQUIRED");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each(["roots", "schema", "policy"])(
    "rejects missing or unsafe %s inventory instead of inferring zero",
    async (field) => {
      const facts: any = {
        versions,
        policy: { sales: false, reconciliation: false },
        functions: authority(),
        tables: [],
        schema: {
          columns: [],
          constraints: [],
          indexes: [],
          triggers: [],
          policies: [],
        },
        lsRoots: zeroRoots(),
      };
      if (field === "roots") facts.lsRoots = {};
      if (field === "schema") delete facts.schema.constraints;
      if (field === "policy") facts.policy.sales = true;
      const transport = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => remoteFunctions(),
        })
        .mockResolvedValueOnce({ ok: true, json: async () => [] })
        .mockResolvedValueOnce({ ok: true, json: async () => [{ facts }] });
      await expect(
        readDeploymentInventory(
          {
            inputs: { project },
            auth: { retirement: { environment: "production" } },
            mode: "preflight",
            environment: "production",
            env: {
              GITHUB_ACTIONS: "true",
              GITHUB_REF: "refs/heads/main",
              PRODUCTION_SUPABASE_PROJECT_REF: project,
              SUPABASE_ACCESS_TOKEN: "synthetic-only",
            },
          },
          transport,
        ),
      ).rejects.toThrow("RETIREMENT_DATABASE_INVENTORY_INVALID");
    },
  );
  it("uses only read-only Supabase paths, prevents redirects and never emits secret values", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => remoteFunctions() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: "SYNTHETIC_NAME",
            digest: "synthetic-digest",
            value: "private-test-value",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            facts: {
              versions,
              policy: { sales: false, reconciliation: false },
              functions: authority(),
              tables: [],
              schema: {
                columns: [],
                constraints: [],
                indexes: [],
                triggers: [],
                policies: [],
              },
              lsRoots: zeroRoots(),
            },
          },
        ],
      });
    const result = await readDeploymentInventory(
      {
        inputs: { project },
        auth: { retirement: { environment: "production" } },
        mode: "preflight",
        environment: "production",
        env: {
          GITHUB_ACTIONS: "true",
          GITHUB_REF: "refs/heads/main",
          PRODUCTION_SUPABASE_PROJECT_REF: project,
          SUPABASE_ACCESS_TOKEN: "synthetic-only",
        },
      },
      transport,
    );
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls.map((c) => c[1].method ?? "GET")).toEqual([
      "GET",
      "GET",
      "POST",
    ]);
    expect(transport.mock.calls.every((c) => c[1].redirect === "error")).toBe(
      true,
    );
    expect(transport.mock.calls[2][0]).toContain("database/query/read-only");
    expect(INVENTORY_QUERY).not.toMatch(
      /\b(?:delete|insert|update|truncate|alter|grant|revoke)\b/i,
    );
    expect(JSON.stringify(result)).not.toContain("private-test-value");
    expect(() =>
      compareReviewedInventory(result, {
        retirement: {
          environment: "production",
          inventorySha256: result.sha256,
        },
        approvedRemoteVersions: versions,
      }),
    ).not.toThrow();
    expect(() =>
      compareReviewedInventory(result, {
        retirement: {
          environment: "production",
          inventorySha256: "0".repeat(64),
        },
        approvedRemoteVersions: versions,
      }),
    ).toThrow("RETIREMENT_REMOTE_DRIFT");
  });
});

describe("production and staging separation", () => {
  const inputs = {
    commit,
    project,
    expectedProject: project,
    origin: "https://app.example.com",
    expectedOrigin: "https://app.example.com",
    stagingProject: staging,
    stagingOrigin: "https://staging.example.com",
  };
  const state = {
    commit,
    branch: "main",
    clean: true,
    containsBase: true,
    descendsMain: true,
  };
  const authorization = () => ({
    reviewedCommit: commit,
    manifestSha256: hash(JSON.stringify(manifest)),
    projectSha256: hash(project),
    originSha256: hash(inputs.origin),
    backupEvidenceSha256: "b".repeat(64),
    approvedRemoteVersions: versions.slice(0, 184),
    retirement: retirementFixture(
      manifest,
      commit,
      project,
      process.cwd(),
      "production",
    ),
    rollbackReviewed: true,
    productionReleaseAuthorized: false,
  });
  function productionFixture() {
    const auth = authorization();
    const env = {
      GITHUB_ACTIONS: "true",
      GITHUB_REF: "refs/heads/main",
      SUPABASE_ACCESS_TOKEN: "synthetic-only",
      SUPABASE_DB_PASSWORD: "synthetic-only",
      CONFIRM_COMMIT_SHA: commit,
      CONFIRM_PROJECT_REF: project,
      CONFIRM_APP_ORIGIN: inputs.origin,
      PRODUCTION_SUPABASE_PROJECT_REF: project,
      PRODUCTION_APPLICATION_ORIGIN: inputs.origin,
      STAGING_SUPABASE_PROJECT_REF: staging,
      STAGING_APPLICATION_ORIGIN: inputs.stagingOrigin,
      PRODUCTION_RETIREMENT_AUTHORIZATION: JSON.stringify(auth),
      ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
      SUPABASE_PROJECT_REF: project,
    };
    const observation = (after = false) => ({
      sha256: after ? "c".repeat(64) : auth.retirement.inventorySha256,
      inventory: {
        functions: remoteFunctions().map((f) => ({
          ...f,
          version: after ? 2 : 1,
        })),
        facts: {
          versions: after ? versions : auth.approvedRemoteVersions,
          lsRoots: zeroRoots(),
          functions: authority(),
        },
      },
    });
    const before = observation(),
      after = observation(true);
    const read = vi
      .fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    // The final CLI ledger is requested before the second inventory read.
    let ledgerCalls = 0;
    const remote = vi.fn((args: string[]) =>
      args[0] === "migration"
        ? cliLedger(
            ledgerCalls++ === 0 ? auth.approvedRemoteVersions : versions,
          )
        : args.includes("--dry-run")
          ? `Would push ${RETIREMENT_MIGRATION}\n${ACTIVATION_MIGRATION}`
          : "synthetic command completed",
    );
    const reports: any[] = [];
    const persist = vi.fn((report: any) =>
      reports.push(structuredClone(report)),
    );
    return {
      env,
      auth,
      before,
      after,
      read,
      remote,
      reports,
      dependencies: {
        gitState: () => state,
        readDeploymentInventory: read,
        remote,
        persist,
      },
    };
  }
  it("production preflight is inventory-only and never links, pushes, deploys or certifies", async () => {
    const f = productionFixture();
    const result = await runProductionRetirement(
      "preflight",
      f.env,
      f.dependencies,
    );
    expect(result).toMatchObject({
      retirementDeployment: "preflight_pass_no_mutation",
      remoteMutationPerformed: false,
      certification: "not_run",
    });
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.remote).not.toHaveBeenCalled();
  });
  it("mocked production apply retains all functions, JWTs and authority checks without enabling billing", async () => {
    const f = productionFixture();
    const result = await runProductionRetirement(
      "apply",
      f.env,
      f.dependencies,
    );
    expect(f.remote).toHaveBeenCalledTimes(21);
    expect(f.read).toHaveBeenCalledTimes(2);
    const calls = f.remote.mock.calls.map((c) => c[0]);
    expect(calls.slice(0, 4)).toEqual([
      ["link", "--project-ref", project],
      ["migration", "list", "--linked", "--output-format", "json"],
      ["db", "push", "--linked", "--dry-run"],
      ["db", "push", "--linked", "--yes"],
    ]);
    expect(calls.filter((c) => c[0] === "functions")).toEqual(
      FUNCTION_CONTRACTS.map((f) => [
        "functions",
        "deploy",
        f.name,
        "--project-ref",
        project,
        ...(f.verifyJwt ? [] : ["--no-verify-jwt"]),
      ]),
    );
    expect(result).toMatchObject({
      deployedFunctionCount: 16,
      certification: "not_run",
      productionCommercialRelease: "BLOCKED_SANDBOX_ONLY_RUNTIME",
      retirementDeployment:
        "commands_complete_response_and_side_effect_probes_pending",
    });
    expect(JSON.stringify(f.reports)).not.toMatch(
      /synthetic-only|projectSha256|inventory|signature/,
    );
  });
  it.each([
    "reviewed inventory drift",
    "nonzero LS root",
    "unreviewed dry-run suffix",
    "post-deploy authority",
    "unchanged deployed version",
  ])("production stops on %s", async (condition) => {
    const f = productionFixture();
    if (condition === "reviewed inventory drift")
      f.before.sha256 = "0".repeat(64);
    if (condition === "nonzero LS root")
      f.before.inventory.facts.lsRoots.customers = 1;
    if (condition === "unreviewed dry-run suffix")
      f.remote.mockImplementation((args) =>
        args[0] === "migration"
          ? cliLedger(f.auth.approvedRemoteVersions)
          : args.includes("--dry-run")
            ? "20261002000000_unreviewed.sql"
            : "completed",
      );
    if (condition === "post-deploy authority")
      f.after.inventory.facts.functions[0].applicationExecutable = true;
    if (condition === "unchanged deployed version")
      f.after.inventory.functions[0].version = 1;
    await expect(
      runProductionRetirement("apply", f.env, f.dependencies),
    ).rejects.toThrow();
    expect(f.reports.at(-1)).toMatchObject({
      retirementDeployment: "blocked",
      certification: "not_run",
    });
    if (["reviewed inventory drift", "nonzero LS root"].includes(condition))
      expect(f.remote).not.toHaveBeenCalled();
    if (condition === "unreviewed dry-run suffix")
      expect(f.remote).toHaveBeenCalledTimes(3);
  });
  it("accepts production retirement only with billing disabled and no staging envelope", () => {
    expect(() =>
      validateProductionAuthorization(authorization(), manifest, inputs, state),
    ).not.toThrow();
    const a = authorization();
    a.retirement.environment = "staging";
    expect(() =>
      validateProductionAuthorization(a, manifest, inputs, state),
    ).toThrow();
    expect(() =>
      validateProductionAuthorization(
        authorization(),
        manifest,
        { ...inputs, project: staging, expectedProject: staging },
        state,
      ),
    ).toThrow();
    expect(() =>
      validateProductionAuthorization(
        { ...authorization(), productionReleaseAuthorized: true },
        manifest,
        inputs,
        state,
      ),
    ).toThrow();
  });
  it("production plan cannot perform network/deployment and reports the actual live blocker", async () => {
    const read = vi.fn(),
      remote = vi.fn(),
      persist = vi.fn();
    const result = await runProductionRetirement(
      "plan",
      {},
      { readDeploymentInventory: read, remote, persist },
    );
    expect(result.productionCommercialRelease).toBe(
      "BLOCKED_SANDBOX_ONLY_RUNTIME",
    );
    expect(result.remoteMutationPerformed).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(remote).not.toHaveBeenCalled();
  });
  it("production workflow is main-only, protected, confirmed and uses only production deployment binding", () => {
    const yaml = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/supabase-deploy-production.yml", "utf8"),
    );
    const job = yaml.jobs["deploy-production"];
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(job.environment).toBe("supabase-production");
    expect(yaml.on.workflow_dispatch.inputs.mode.default).toBe("plan");
    expect(job.steps.filter((s: any) => s.run === "npm ci")).toHaveLength(1);
    const apply = job.steps.find(
      (s: any) =>
        s.run === "node scripts/production-billing-retirement.mjs apply",
    );
    expect(apply.if).toBe("inputs.mode == 'apply'");
    expect(apply.env.SUPABASE_PROJECT_REF).toBe(
      "${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}",
    );
    expect(apply.env.PRODUCTION_RETIREMENT_AUTHORIZATION).toBe(
      "${{ secrets.PRODUCTION_RETIREMENT_AUTHORIZATION }}",
    );
    expect(JSON.stringify(job.steps)).not.toMatch(
      /secrets (?:set|unset)|functions delete|--include-all|migration repair/,
    );
  });
});
