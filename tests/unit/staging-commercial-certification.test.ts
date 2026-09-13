import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  manifestSchema,
  readJson,
  validateRepository,
  validateJwt,
  validateConfirmations,
  validateMigrations,
  validateRemoteHistory,
  scenariosSchema,
  rollbackSchema,
  SCENARIO_IDS,
  sha256,
} from "../../scripts/staging-commercial-contracts.mjs";
import {
  makePlan,
  runPlan,
  gitState,
  authorizationRequest,
} from "../../scripts/staging-commercial-plan.mjs";
import { validateProviderMappings } from "../../scripts/staging-commercial-provider.mjs";
import {
  evidenceSchema,
  validateEvidence,
  scanRedaction,
  redact,
  verdict,
  ASSERTION_CODES,
} from "../../scripts/staging-commercial-evidence.mjs";
import {
  readSnapshot,
  assertCatalogue,
  fetchStagingCatalogue,
  validateCatalogueEndpoint,
} from "../../scripts/staging-commercial-catalogue.mjs";
import {
  validateApplyAuthorization,
  requireGreenUnits,
  parseMigrationList,
} from "../../scripts/staging-commercial-apply.mjs";
import { guardedArgs } from "../../scripts/supabase-remote-guard.mjs";

const manifest = readJson("config/staging-commercial-certification.json");
const mappings = readJson("config/staging-commercial-provider.fake.json");
const evidence = readJson("config/staging-commercial-evidence.template.json");
const clone = <T>(v: T): T => structuredClone(v);
const commit = "a".repeat(40),
  project = "s".repeat(20),
  production = "p".repeat(20);
const inputs = {
  commit,
  project,
  expectedProject: project,
  productionProject: production,
  origin: "https://staging.example.com",
  expectedOrigin: "https://staging.example.com",
  productionOrigin: "https://app.example.com",
};
const state = {
  commit,
  branch: "main",
  clean: true,
  containsBase: true,
  descendsMain: true,
};
const tempDirs: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const d of tempDirs.splice(0))
    rmSync(d, { recursive: true, force: true });
});

describe("staging commercial manifest and local planner", () => {
  it("validates the repository, frozen migration hashes, allowlists and JWT contracts", () =>
    expect(validateRepository(process.cwd(), manifest)).toEqual(manifest));
  it.each(["unknown", "duplicate", "missing", "nonbilling"])(
    "rejects %s manifest function configuration",
    (kind) => {
      const m = clone(manifest);
      if (kind === "unknown") m.functions.billing.push("unreviewed-function");
      if (kind === "duplicate")
        m.functions.billing.push(m.functions.billing[0]);
      if (kind === "missing") m.functions.billing.pop();
      if (kind === "nonbilling")
        m.functions.nonbilling.push("marketing-lead-submit");
      expect(manifestSchema.safeParse(m).success).toBe(false);
    },
  );
  it.each(["root", "nested", "secret"])("rejects unknown %s fields", (kind) => {
    const m = clone(manifest);
    if (kind === "root") m.extra = true;
    if (kind === "nested") m.migrations.extra = true;
    if (kind === "secret") m.requiredSecretNames.push("UNREVIEWED_SECRET");
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
  it("rejects a missing function entry point", () => {
    const dir = mkdtempSync(join(tmpdir(), "cert-missing-"));
    tempDirs.push(dir);
    expect(() => validateRepository(dir, manifest)).toThrow();
  });
  it("rejects webhook and owner JWT mismatch and duplicate sections", () => {
    const toml = readFileSync("supabase/config.toml", "utf8");
    expect(() =>
      validateJwt(
        toml.replace("verify_jwt = false", "verify_jwt = true"),
        manifest.jwtContracts,
      ),
    ).toThrow("JWT_CONTRACT_MISMATCH");
    expect(() =>
      validateJwt(
        toml.replace("verify_jwt = true", "verify_jwt = false"),
        manifest.jwtContracts,
      ),
    ).toThrow("JWT_CONTRACT_MISMATCH");
    expect(() =>
      validateJwt(
        toml + "\n[functions.open-wearables]\nverify_jwt = true\n",
        manifest.jwtContracts,
      ),
    ).toThrow();
  });
  it.each([
    [{ commit: "b".repeat(40) }, {}, "COMMIT_MISMATCH"],
    [{}, { clean: false }, "DIRTY_WORKTREE"],
    [{}, { descendsMain: false }, "COMMIT_SOURCE_MISMATCH"],
    [{}, { containsBase: false }, "COMMIT_SOURCE_MISMATCH"],
    [{}, { branch: "HEAD" }, "DETACHED_SOURCE_MISMATCH"],
    [
      { project: production, expectedProject: production },
      {},
      "PRODUCTION_PROJECT_BLOCKED",
    ],
    [
      {
        origin: "https://app.example.com",
        expectedOrigin: "https://app.example.com",
      },
      {},
      "PRODUCTION_ORIGIN_BLOCKED",
    ],
    [
      { origin: "https://localhost", expectedOrigin: "https://localhost" },
      {},
      "STAGING_ORIGIN_REQUIRED",
    ],
    [
      {
        origin: "http://staging.example.com",
        expectedOrigin: "http://staging.example.com",
      },
      {},
      "STAGING_ORIGIN_REQUIRED",
    ],
    [
      {
        origin: "https://staging.production.example.com",
        expectedOrigin: "https://staging.production.example.com",
      },
      {},
      "STAGING_ORIGIN_REQUIRED",
    ],
    [
      { origin: "https://staging.example.com/path" },
      {},
      "STAGING_ORIGIN_REQUIRED",
    ],
    [{ project: "x".repeat(20) }, {}, "PROJECT_MISMATCH"],
  ])("fails closed for confirmation/state mismatch %#", (i, s, code) =>
    expect(() =>
      validateConfirmations({ ...inputs, ...i }, { ...state, ...s }),
    ).toThrow(code as string),
  );
  it("detects actual untracked work using git without touching the source checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "cert-git-"));
    tempDirs.push(dir);
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: dir,
        stdio: "pipe",
        encoding: "utf8",
      }).trim();
    git(["init", "-b", "main"]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "fixture",
    ]);
    const head = git(["rev-parse", "HEAD"]);
    git(["update-ref", "refs/remotes/origin/main", head]);
    expect(gitState(dir, head).clean).toBe(true);
    writeFileSync(join(dir, "untracked.txt"), "fixture");
    expect(gitState(dir, head).clean).toBe(false);
  });
  it("rejects migration reordering, duplicate versions, content changes and changed latest", () => {
    const a = manifest.migrations.approved;
    expect(() =>
      validateMigrations([...a].reverse(), a, a.at(-1).filename),
    ).toThrow("MIGRATION_ORDER_MISMATCH");
    expect(() =>
      validateMigrations([a[0], a[0]], a, a.at(-1).filename),
    ).toThrow("MIGRATION_ORDER_MISMATCH");
    expect(() => validateMigrations(a, a.slice(1), a.at(-1).filename)).toThrow(
      "MIGRATION_CONTENT_DRIFT",
    );
    expect(() => validateMigrations(a, a, a[0].filename)).toThrow(
      "MIGRATION_LATEST_MISMATCH",
    );
  });
  it("emits only placeholder targets and no provider/remote execution in plan mode", () => {
    const network = vi.fn(() => {
      throw new Error("NETWORK_FORBIDDEN");
    });
    vi.stubGlobal("fetch", network);
    const plan = makePlan(manifest, inputs, state);
    expect(plan.planValidation).toBe("pass");
    expect(plan.verdict).toBe("blocked");
    expect(JSON.stringify(plan)).not.toContain(project);
    expect(JSON.stringify(plan)).not.toContain(inputs.origin);
    expect(
      plan.authorization.commands.filter((s: string) =>
        s.includes("functions deploy"),
      ),
    ).toHaveLength(13);
    expect(network).not.toHaveBeenCalled();
    // No apply module is reachable from the planner import graph.
    expect(
      readFileSync("scripts/staging-commercial-plan.mjs", "utf8"),
    ).not.toMatch(/import.*staging-commercial-apply|\bfetch\(/);
  });
  it("writes a safe blocked artifact on invalid CLI inputs", () => {
    const dir = mkdtempSync(join(tmpdir(), "cert-plan-"));
    tempDirs.push(dir);
    expect(
      runPlan(["--unexpected-secret=private"], {}, dir).planValidation,
    ).toBe("fail");
    expect(
      readFileSync(
        join(dir, "output/staging-commercial/plan/plan.json"),
        "utf8",
      ),
    ).not.toContain("private");
  });
});

describe("provider mapping contract", () => {
  it("accepts six fake contracts without any transport", () =>
    expect(validateProviderMappings(mappings)).toEqual(mappings));
  it.each([
    "amountMinor",
    "cadence",
    "interval",
    "planVersion",
    "environment",
    "testMode",
    "trial",
    "setupFeeMinor",
    "scheme",
    "packageSize",
    "usageAggregation",
    "decimalPrice",
  ])("rejects wrong %s", (key) => {
    const v = clone(mappings);
    v.mappings[0][key] =
      typeof v.mappings[0][key] === "number" ? 999 : "invalid";
    expect(() => validateProviderMappings(v)).toThrow();
  });
  it.each([0, 1])("rejects incorrect tier %i amount and boundary", (index) => {
    const v = clone(mappings);
    v.mappings[0].tiers[index].unitAmountMinor++;
    expect(() => validateProviderMappings(v)).toThrow(
      "PROVIDER_SEAT_TIER_MISMATCH",
    );
    const w = clone(mappings);
    w.mappings[0].tiers.reverse();
    expect(() => validateProviderMappings(w)).toThrow();
  });
  it("rejects duplicate mapping, test/live collision, missing mapping and setup tier fee", () => {
    const v = clone(mappings);
    v.mappings[1] = v.mappings[0];
    expect(() => validateProviderMappings(v)).toThrow();
    const w = clone(mappings);
    w.liveReferences.push(w.mappings[0].variantRef);
    expect(() => validateProviderMappings(w)).toThrow(
      "PROVIDER_TEST_LIVE_COLLISION",
    );
    const x = clone(mappings);
    x.mappings.pop();
    expect(() => validateProviderMappings(x)).toThrow();
    const y = clone(mappings);
    y.mappings[0].tiers[1].fixedFeeMinor = 100;
    expect(() => validateProviderMappings(y)).toThrow();
  });
});

describe("catalogue anonymous contract", () => {
  it("compares the entire frozen snapshot including trial", () => {
    const snapshot = readSnapshot();
    expect(assertCatalogue(clone(snapshot))).toEqual({
      match: true,
      paths: [],
    });
    const bad = clone(snapshot);
    bad.trial.capacities.coachSeats = 99;
    expect(assertCatalogue(bad).paths).toContain(
      "$catalogue.trial.capacities.coachSeats",
    );
  });
  it("does not disclose unexpected keys or values in diff paths", () => {
    const v = readSnapshot();
    v["customer.private@example.invalid"] = { token: "private" };
    expect(assertCatalogue(v).paths).toEqual(["$catalogue.[unexpected-field]"]);
  });
  it.each([
    "http://staging.example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://staging.example.com",
    "https://" + production + ".supabase.co",
  ])("rejects remote endpoint %s", (url) =>
    expect(() => validateCatalogueEndpoint(url, project)).toThrow(),
  );
  it("uses only the confirmed HTTPS origin, refuses redirects, and never dumps key", async () => {
    const transport = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => readSnapshot() });
    const result = await fetchStagingCatalogue(
      {
        url: `https://${project}.supabase.co`,
        anonKey: "fake-anon-key",
        project,
        confirmedProject: project,
        productionProject: production,
        authorized: "STAGING_ANONYMOUS_READ",
      },
      transport,
    );
    expect(result.match).toBe(true);
    expect(transport.mock.calls[0][1].redirect).toBe("error");
    expect(JSON.stringify(result)).not.toContain("fake-anon-key");
    await expect(
      fetchStagingCatalogue(
        {
          url: `https://${project}.supabase.co`,
          anonKey: "fake",
          project,
          confirmedProject: project,
          productionProject: production,
          authorized: "",
        },
        transport,
      ),
    ).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("evidence and verdict", () => {
  it("template remains not-run and blocked", () => {
    expect(validateEvidence(evidence)).toEqual(evidence);
    expect(verdict(evidence)).toBe("blocked");
  });
  it.each([
    { Authorization: "Bearer fake-auth-value" },
    { headers: [{ name: "authorization", value: "Bearer fake-auth-value" }] },
    { message: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.fake-signature" },
    {
      message: `https://test-store.lemonsqueezy.com/billing?expires=1999999999&signature=${"a".repeat(64)}`,
    },
    {
      message:
        "https://test-store.lemonsqueezy.com/checkout/custom/fake-capability?signature=abc",
    },
    { customer_id: "1029384756" },
    { message: "customer@example.invalid" },
    { rawProviderObject: { id: "87654321" } },
    { message: "Cookie: session=fake-session" },
    { message: "X-Signature: abcdef12345" },
    { message: "sub_fixture123" },
  ])("rejects and redacts realistic sensitive sample %#", (sample) => {
    expect(scanRedaction(sample).length).toBeGreaterThan(0);
    const result = redact(
      sample,
      "private-fixture-salt-with-at-least-32-characters",
    );
    expect(scanRedaction(result)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("1029384756");
    expect(evidenceSchema.safeParse({ ...evidence, raw: sample }).success).toBe(
      false,
    );
  });
  it("rejects free-form assertions, raw numeric provider ids, mixed commits and duplicate scenarios", () => {
    for (const modify of [
      (v: any) =>
        v.records[0].assertions.push({ code: "customer_name", passed: true }),
      (v: any) => (v.records[0].providerId = 123),
      (v: any) => (v.records[0].commitSha = commit),
      (v: any) => v.records.push(v.records[0]),
    ]) {
      const v = clone(evidence);
      modify(v);
      expect(() => validateEvidence(v)).toThrow();
    }
  });
  it("requires full green units and all real staging outcomes for pass", () => {
    const v = clone(evidence);
    v.fullUnitSuiteGreen = true;
    v.records.forEach((r: any, i: number) => {
      r.status = "pass";
      r.scope = "staging_test";
      r.assertions = [
        {
          code: ASSERTION_CODES[i === 5 ? 4 : i > 5 ? i - 1 : i],
          passed: true,
        },
      ];
    });
    expect(verdict(v)).toBe("pass");
    v.records[0].scope = "local_fixture";
    expect(verdict(v)).toBe("conditional");
    v.records[0].status = "not_applicable";
    expect(verdict(v)).toBe("conditional");
    v.records[0].status = "fail";
    expect(verdict(v)).toBe("blocked");
    v.records.shift();
    expect(verdict(v)).toBe("blocked");
  });
  it("requires scenario-specific positive assertions", () => {
    const v = clone(evidence);
    v.fullUnitSuiteGreen = true;
    v.records.forEach((r: any) => {
      r.status = "pass";
      r.scope = "staging_test";
      r.assertions = [{ code: "REDACTION_PASSED", passed: true }];
    });
    expect(verdict(v)).toBe("blocked");
  });
  it("covers all scenarios and ten history-preserving rollback templates", () => {
    const s = readJson("config/staging-commercial-scenarios.json"),
      r = readJson("config/staging-commercial-rollback.json");
    expect(scenariosSchema.safeParse(s).success).toBe(true);
    expect(rollbackSchema.safeParse(r).success).toBe(true);
    expect(rollbackSchema.safeParse(r.slice(1)).success).toBe(false);
    expect(scenariosSchema.safeParse(s.slice(1)).success).toBe(false);
    expect(s.every((v: any) => v.status === "not_run")).toBe(true);
    expect(s).toHaveLength(23);
    expect(authorizationRequest(manifest, commit).scenarioIds).toEqual(
      SCENARIO_IDS,
    );
  });
});

describe("apply safety and workflow contract", () => {
  it("keeps inherited failures blocking, including count-only and incomplete reports", () => {
    const green = {
      success: true,
      numFailedTests: 0,
      numFailedTestSuites: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      numTotalTests: 1784,
      numPassedTests: 1784,
      testResults: [
        {
          status: "passed",
          assertionResults: Array.from({ length: 1784 }, () => ({
            status: "passed",
          })),
        },
      ],
    };
    expect(() => requireGreenUnits(green)).not.toThrow();
    for (const change of [
      { numFailedTests: 13 },
      { numPendingTests: 1 },
      { numTotalTests: 1, numPassedTests: 1 },
      { success: false },
    ])
      expect(() => requireGreenUnits({ ...green, ...change })).toThrow();
    expect(manifest.unitGate).toBe("full-suite-green-before-apply");
  });
  it("checks approved prefix and rejects drift before mutation", () => {
    const versions = manifest.migrations.approved.map((m: any) =>
      m.filename.slice(0, 14),
    );
    expect(() =>
      validateRemoteHistory(
        manifest.migrations.approved,
        versions.slice(0, 2),
        versions.slice(0, 2),
      ),
    ).not.toThrow();
    expect(() =>
      validateRemoteHistory(
        manifest.migrations.approved,
        versions.slice(1, 2),
        versions.slice(1, 2),
      ),
    ).toThrow();
    expect(() =>
      validateRemoteHistory(
        manifest.migrations.approved,
        versions,
        versions.slice(0, 2),
      ),
    ).toThrow();
    expect(
      parseMigrationList(
        ` Local | Remote | Time (UTC)\n -------|--------|--------\n ${versions[0]} | ${versions[0]} | sample\n`,
      ),
    ).toEqual([versions[0]]);
    expect(() => parseMigrationList("unexpected private output")).toThrow();
  });
  it("binds separate authorization to commit, target, manifest, auth and actual normalized test mappings", () => {
    const normalized = clone(mappings);
    normalized.mappings.forEach((m: any) => {
      for (const k of ["storeRef", "productRef", "variantRef", "priceRef"])
        m[k] = "sha256:" + sha256(m[k]);
    });
    const a = {
      reviewedCommit: commit,
      manifestSha256: sha256(JSON.stringify(manifest)),
      projectSha256: sha256(project),
      originSha256: sha256(inputs.origin),
      approvedRemoteVersions: [],
      backupEvidenceSha256: "b".repeat(64),
      auth: {
        siteUrl: inputs.origin,
        redirectUrls: [inputs.origin + "/auth/callback"],
        signupEnabled: true,
        confirmationsEnabled: true,
      },
      providerMappings: normalized,
      remoteSecretNamesPresent: manifest.requiredSecretNames,
      providerEnvironment: "test",
      billingAppOrigin: inputs.origin,
      portalAllowedHosts: ["test-store.lemonsqueezy.com"],
      portalControlsReviewed: true,
      webhookTestStoreReviewed: true,
      rollbackReviewed: true,
    };
    expect(() =>
      validateApplyAuthorization(a, manifest, inputs, commit),
    ).not.toThrow();
    expect(() =>
      validateApplyAuthorization(
        { ...a, providerMappings: mappings },
        manifest,
        inputs,
        commit,
      ),
    ).toThrow("FAKE_PROVIDER_PROOF_BLOCKED");
    expect(() =>
      validateApplyAuthorization(
        { ...a, reviewedCommit: "b".repeat(40) },
        manifest,
        inputs,
        commit,
      ),
    ).toThrow();
    expect(() =>
      validateApplyAuthorization(
        {
          ...a,
          auth: { ...a.auth, redirectUrls: ["https://other.example.com/**"] },
        },
        manifest,
        inputs,
        commit,
      ),
    ).toThrow();
    expect(() =>
      validateApplyAuthorization(
        { ...a, remoteSecretNamesPresent: [] },
        manifest,
        inputs,
        commit,
      ),
    ).toThrow();
  });
  it("guards exact project flags and linked project without unsupported db flags", () => {
    const env = {
      ALLOW_REMOTE_SUPABASE: "I_UNDERSTAND_THIS_TOUCHES_REMOTE",
      SUPABASE_PROJECT_REF: project,
    };
    expect(guardedArgs(["db", "push", "--linked"], env, project)).toEqual([
      "db",
      "push",
      "--linked",
    ]);
    expect(guardedArgs(["functions", "deploy", "open-wearables"], env)).toEqual(
      ["functions", "deploy", "open-wearables", "--project-ref", project],
    );
    for (const args of [
      ["db", "push", "--linked"],
      ["functions", "deploy", "open-wearables", "--project-ref", production],
      ["link", "--project-ref=" + production],
      ["db", "push", "--db-url", "private"],
      ["secrets", "set", "BILLING_APP_BASE_URL=http://localhost:5173"],
    ])
      expect(() => guardedArgs(args, env, production)).toThrow();
    expect(() => guardedArgs(["link"], {}, project)).toThrow();
  });
  it("parses YAML and checks plan default, one setup, main/environment gates and sanitized uploads", () => {
    const require = createRequire(import.meta.url);
    // js-yaml is already part of the locked ESLint toolchain.
    const yaml = require("js-yaml").load(
      readFileSync(".github/workflows/supabase-deploy-staging.yml", "utf8"),
    );
    const dispatch = yaml.on.workflow_dispatch.inputs;
    expect(Object.keys(dispatch)).toEqual([
      "mode",
      "confirm_commit_sha",
      "confirm_project_ref",
      "confirm_app_origin",
      "evidence_label",
    ]);
    expect(dispatch.mode.default).toBe("plan");
    const job = yaml.jobs.certification,
      steps = job.steps;
    expect(job.environment).toBe("supabase-staging");
    expect(job.if).toBe("github.ref == 'refs/heads/main'");
    expect(yaml.concurrency["cancel-in-progress"]).toBe(false);
    expect(steps.filter((s: any) => s.run === "npm ci")).toHaveLength(1);
    expect(
      steps.filter((s: any) => s.uses?.startsWith("supabase/setup-cli")),
    ).toHaveLength(1);
    for (const s of steps.filter(
      (s: any) =>
        s.uses?.startsWith("supabase/setup-cli") ||
        s.run === "npm run staging:commercial:apply",
    ))
      expect(s.if).toBe("inputs.mode == 'apply'");
    for (const s of steps) expect(s["continue-on-error"]).toBeUndefined();
    expect(
      steps
        .filter((s: any) => s.uses?.startsWith("actions/upload-artifact"))
        .map((s: any) => s.with.path),
    ).toEqual([
      "output/staging-commercial/plan/",
      "output/staging-commercial/apply/deployment-evidence.json",
    ]);
    const source = readFileSync("scripts/staging-commercial-apply.mjs", "utf8");
    expect(source.indexOf("requireGreenUnits(readJson")).toBeLessThan(
      source.indexOf('remote(["link"'),
    );
    expect(source).not.toMatch(/readdir|continue-on-error|\|\| true/);
  });
});
