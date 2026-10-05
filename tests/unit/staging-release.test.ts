import { describe, it, expect, vi } from "vitest";
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import {
  releaseIdentity,
  migrationArtifact,
  disposableArtifact,
  verifyMigrationDirectory,
  CONTAINMENT_SOURCE,
  validateContainment,
  canonical,
  verifyFunctionDirectory,
  verifyDeploymentConfiguration,
} from "../../scripts/staging-release-artifacts.mjs";
import {
  phasePlan,
  validateAuthorization,
  ledger,
  recoveryPlan,
  verifyFunctions,
  assertScheduled,
  PHASES,
} from "../../scripts/staging-release-contracts.mjs";
import { runRelease } from "../../scripts/staging-release-runner.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import {
  FUNCTION_CONTRACTS,
  SECRET_NAMES,
  LS_TOMBSTONES,
} from "../../scripts/billing-deployment-contract.mjs";
import { guardedArgs } from "../../scripts/supabase-remote-guard.mjs";
import { validateRecoveryBundle } from "../../scripts/staging-release-recovery-evidence.mjs";
import { MANAGED_COMPATIBILITY_EXCLUSIONS } from "../../scripts/staging-logical-backup-data.mjs";
import {
  createRemoteAdapter,
  historyQuery,
  workQuery,
  databaseContract,
  normalizeFunctionInventory,
  EMPTY_WEBHOOK_REVIEW,
  OBSERVATION_MAX_AGE_MS,
} from "../../scripts/staging-release-observation.mjs";

import {
  classifyWebhookHistory,
  inspectWebhookHistory,
  evidenceDigest,
  WEBHOOK_HISTORY_TABLES,
  webhookHistoryQuery,
  isEffectiveEntitlementAuthority,
  isEffectiveCapacityAuthority,
} from "../../scripts/staging-release-webhook-history.mjs";
const emptyWebhookTables = () =>
  Object.fromEntries(WEBHOOK_HISTORY_TABLES.map((t) => [t, []])) as Record<
    string,
    any[]
  >;
const fixtureAuthorityTables = [
  "account_feature_entitlement_overrides",
  "account_capacity_reservations",
];
function fixtureAccountAuthority(table: string, account: string) {
  const common = {
    id: `authority-${table}-${account}`,
    billing_account_id: account,
    source: "local-release-test",
    created_at: "2026-09-20T10:00:00Z",
  };
  return table === "account_feature_entitlement_overrides"
    ? {
        ...common,
        feature_key: "core.client_management",
        effect: "enable",
        reason: "Local release regression",
        approved_by: null,
        starts_at: common.created_at,
        expires_at: null,
        revoked_at: null,
      }
    : {
        ...common,
        dimension: "counted_clients",
        quantity: 1,
        status: "active",
        idempotency_key: "local-release-test",
        subject_type: "client",
        subject_key: "local-release-test-subject",
        workspace_id: null,
        created_by_user_id: null,
        expires_at: "2026-09-20T10:05:00Z",
        consumed_at: null,
        released_at: null,
        expired_at: null,
        metadata: {},
        updated_at: common.created_at,
      };
}
function lifecycleAuthority(kind: string, account: string) {
  const capacity = kind.startsWith("capacity-");
  const table = fixtureAuthorityTables[capacity ? 1 : 0];
  const row: any = fixtureAccountAuthority(table, account);
  row.__release_authority_lifecycle = "blocking";
  if (kind === "override-future") row.starts_at = "2099-09-20T10:00:00Z";
  if (kind === "override-expired") {
    row.expires_at = "2026-09-20T10:00:00.000001Z";
    row.__release_authority_lifecycle = "expired";
  }
  if (kind === "override-revoked") {
    row.revoked_at = "2026-09-20T10:01:00.000001Z";
    row.__release_authority_lifecycle = "revoked";
  }
  if (["capacity-released", "capacity-expired"].includes(kind)) {
    row.status = kind.slice(9);
    row[`${row.status}_at`] = "2026-09-20T10:05:00.000001Z";
    row.updated_at = row[`${row.status}_at`];
    row.__release_authority_lifecycle = row.status;
  }
  return { table, row };
}
const identity = releaseIdentity();
const NOW = Date.now();
const iso = (offset = 0) => new Date(NOW + offset).toISOString();
const root = process.cwd();
const context = {
  commit: "9a9f79ff2ba7aada9ff2c24f162360d9c03b33a0",
  clean: true,
  project: "s".repeat(20),
  expectedProject: "s".repeat(20),
  productionProject: "p".repeat(20),
  origin: "https://staging.repsync.example.org",
  expectedOrigin: "https://staging.repsync.example.org",
  productionOrigin: "https://repsync.example.org",
};
const contracts = {
  checkpoints: Object.fromEntries(
    [179, 180, 181, 182, 183, 184, 185, 186].map((n) => [
      n,
      { digest: hash("database-" + n) },
    ]),
  ),
};
const native = JSON.parse(
  readFileSync(
    "supabase/tests/fixtures/lemon_squeezy_retired_functions.json",
    "utf8",
  ),
);
const provider = JSON.parse(
  readFileSync("config/staging-commercial-provider.fake.json", "utf8"),
);
for (const m of provider.mappings)
  for (const key of [
    "productRef",
    "priceRef",
    "seatProductRef",
    "seatPriceRef",
  ])
    m[key] = "sha256:" + hash(m[key]);
provider.liveReferences = provider.liveReferences.map(
  (r: string) => "sha256:" + hash(r),
);
function simulation(start: number) {
  let count = start;
  const commands: string[][] = [];
  let functions = FUNCTION_CONTRACTS.map((f) => ({
    name: f.name,
    version: 1,
    id: "synthetic-" + f.name,
    verify_jwt: f.verifyJwt,
    status: "ACTIVE",
  }));
  let fail = "",
    badRetirement = false,
    unexpectedContainment = false,
    enabled = false,
    busy = false,
    dryRunOverride: string | null = null;
  let reads = 0;
  const observation = () => {
    reads++;
    const facts: any = {
      versions: ledger(identity.manifest, count),
      policy: { sales: enabled, reconciliation: false },
      contractDigest: contracts.checkpoints[count].digest,
      history: {
        billing_accounts: hash("retained"),
        ...(count >= 184
          ? {
              billing_payment_method_preparations_v2:
                "d751713988987e9331980363e24189ce",
            }
          : {}),
      },
      webhookHistory: classifyWebhookHistory(
        emptyWebhookTables(),
        EMPTY_WEBHOOK_REVIEW,
      ),
      work: Object.fromEntries(
        [
          "legacyCheckouts",
          "paddleCheckouts",
          "legacyPlans",
          "legacySeats",
          "paddleOperations",
          "paymentMethods",
          "legacyWebhooks",
          "paddleWebhooks",
        ].map((k) => [k, busy && k === "paddleOperations" ? 1 : 0]),
      ),
      scheduled: { count: 0, earliest: null, invalidBoundaries: 0 },
      functions: native.map((signature: string) => ({
        signature,
        definition: `create function public.${signature} returns void as 'begin null; end' language plpgsql;`,
        applicationExecutable: badRetirement && count >= 185,
        publicExecutable: false,
      })),
    };
    const o: any = {
      observedAt: iso(),
      stability: {
        stable: true,
        categories: [],
        startedAt: iso(),
        completedAt: iso(),
      },
      functions: structuredClone(functions),
      secretNames: SECRET_NAMES,
      secretDigest: hash("secrets"),
      authDigest: hash("auth"),
      authConfig: {
        site_url: context.origin,
        disable_signup: false,
        mailer_autoconfirm: false,
        uri_allow_list: context.origin + "/auth/callback",
      },
      facts,
    };
    o.digest = hash(canonical({ ...o, observedAt: undefined }));
    return o;
  };
  const adapter = {
    observe: vi.fn(async () => observation()),
    command: vi.fn((args: string[]) => {
      commands.push(args);
      if (args[0] === "functions" && args[1] === "deploy") {
        if (
          fail === "containment" &&
          commands.filter((c) => c[0] === "functions").length === 2
        )
          throw Error("SYNTHETIC_CONTAINMENT_FAILURE");
        if (
          fail === "final" &&
          count === 186 &&
          args[2] === "billing-create-paddle-checkout"
        )
          throw Error("SYNTHETIC_FINAL_FAILURE");
        functions = functions.map((f) =>
          f.name === args[2] ? { ...f, version: f.version + 1 } : f,
        );
      }
      if (args.includes("--dry-run")) {
        if (dryRunOverride !== null) return dryRunOverride;
        const target = count < 184 ? 184 : count === 184 ? 185 : 186;
        return identity.manifest.migrations.approved
          .slice(count, target)
          .map((m) => m.filename)
          .join("\n");
      }
      if (args[0] === "db" && args.includes("--yes")) {
        if (fail === "baseline") {
          count = 182;
          throw Error("SYNTHETIC_BASELINE_FAILURE");
        }
        if (fail === "activation" && count === 185)
          throw Error("SYNTHETIC_ACTIVATION_FAILURE");
        count = count < 184 ? 184 : count + 1;
      }
      return "";
    }),
    verifyArtifact: vi.fn(async (name: string, expected: any, mode: string) =>
      unexpectedContainment && mode === "final"
        ? hash(CONTAINMENT_SOURCE)
        : mode === "containment" && !LS_TOMBSTONES.includes(name)
          ? expected.entrypointSha256
          : expected.digest,
    ),
    probe: vi.fn(async () => undefined),
  };
  return {
    adapter,
    commands,
    observation,
    setFail: (value: string) => (fail = value),
    setRetirementFailure: () => (badRetirement = true),
    setRemainingContainment: () => (unexpectedContainment = true),
    setEnabled: () => (enabled = true),
    setBusy: () => (busy = true),
    setDryRun: (value: string) => (dryRunOverride = value),
    get count() {
      return count;
    },
    get reads() {
      return reads;
    },
  };
}
function authorization(phase: string, s: ReturnType<typeof simulation>) {
  const p = phasePlan(phase, identity),
    o = s.observation();
  return structuredClone({
    schemaVersion: 3,
    phase,
    operationId: "00000000-0000-4000-8000-000000000001",
    executionCommit: context.commit,
    frozenPayloadCommit: identity.payload.frozenCommit,
    payloadDigest: identity.payload.digest,
    manifestDigest: hash(canonical(identity.manifest)),
    projectSha256: hash(context.project),
    originSha256: hash(context.origin),
    productionDenyProjectSha256: hash(context.productionProject),
    productionDenyOriginSha256: hash(context.productionOrigin),
    createdAt: iso(),
    expiresAt: iso(25 * 60_000),
    startVersions: p.startVersions,
    endVersions: p.endVersions,
    pendingMigrations: p.pendingMigrations,
    migrationArtifacts: p.migrationArtifacts,
    finalFunctions: p.finalFunctions,
    outsideFunctions: p.outsideFunctions,
    containmentFunctions: p.containmentFunctions,
    inventory: { digest: o.digest, observedAt: iso() },
    webhookHistory: {
      review: EMPTY_WEBHOOK_REVIEW,
      dispositionDigest: o.facts.webhookHistory.digest,
    },
    backup: {
      evidenceSha256: hash("backup"),
      createdAt: iso(-60_000),
      expiresAt: iso(60 * 60_000),
      executionCommit: context.commit,
      projectSha256: hash(context.project),
      ledger: p.startVersions,
      quietWindowReviewed: true,
      releaseLock: "supabase-staging-commercial",
      componentsVerified: true,
      authUsersIncluded: true,
      applicationCompletenessVerified: true,
      migrationLedgerIncluded: true,
      migrationLedgerSha256: hash("migration-ledger.json"),
      ledgerRowsSha256: hash("ledger rows"),
      storageObjectsIncluded: false,
      managedExclusionsReviewed: true,
      restore: {
        evidenceSha256: hash("restore"),
        backupEvidenceSha256: hash("backup"),
        verifiedAt: iso(-30_000),
        isolatedTarget: true,
        allApplicationTargetsRestored: true,
        authUsersRestored: true,
        retainedHistoryVerified: true,
        ledgerVerified: true,
        migrationLedgerSha256: hash("migration-ledger.json"),
        restoredLedgerRowsSha256: hash("ledger rows"),
      },
    },
    configuration: {
      evidenceSha256: hash("configuration"),
      observedAt: iso(),
      secretInventorySha256: o.secretDigest,
      authConfigurationSha256: o.authDigest,
      requiredNames: SECRET_NAMES,
      paddleEnvironment: "sandbox",
      checkoutAccessMode: "disabled",
      siteUrl: context.origin,
      redirectUrls: [context.origin + "/auth/callback"],
      signupEnabled: true,
      confirmationsEnabled: true,
      paymentPageReviewed: true,
      frontendTokenReviewed: true,
      originsReviewed: true,
      providerMappings: provider,
    },
    salesEnabled: false,
    reconciliationEnabled: false,
    syntheticClassification: {
      evidenceSha256: hash("synthetic"),
      result: "synthetic_only",
    },
    checkpointContractDigest: hash(canonical(contracts)),
    operational: {
      quiescenceEvidenceSha256: hash("quiet"),
      providerRequestAuditEvidenceSha256: hash("audit"),
      retryWindowReviewed: true,
      retryWindowEndsAt: iso(60 * 60_000),
      clientsAndJobsPaused: true,
      oldInvocationsDrained: true,
      scheduledOperationsCount: 0,
    },
  }) as any;
}
const run = (
  phase: string,
  s: ReturnType<typeof simulation>,
  a = authorization(phase, s),
  deps = {},
) =>
  runRelease(
    { phase, mode: "apply", authorization: a, context, identity, contracts },
    s.adapter,
    { now: () => NOW, currentIdentity: () => identity, ...deps },
  );

describe("fixed bounded migration artifacts", { timeout: 20000 }, () => {
  it.each(["supabase", "supabase/migrations", "supabase/functions"])(
    "rejects linked artifact ancestor %s",
    (path) => {
      const a = disposableArtifact(root, identity, "activation", "final");
      try {
        const original = join(a.directory, path),
          moved = join(a.directory, "moved");
        renameSync(original, moved);
        symlinkSync(
          moved,
          original,
          process.platform === "win32" ? "junction" : "dir",
        );
        const check = path.endsWith("functions")
          ? () =>
              verifyFunctionDirectory(
                a.directory,
                identity.functions[0],
                "final",
              )
          : () => verifyMigrationDirectory(a.directory, a.artifact);
        expect(check).toThrow("SYMLINK");
        if (path === "supabase")
          expect(() =>
            verifyDeploymentConfiguration(a.directory, "ignored"),
          ).toThrow("SYMLINK");
      } finally {
        a.cleanup();
      }
    },
  );
  it("plans exact 180 to 184 without final functions", () => {
    const p = phasePlan("BASELINE_180_TO_184", identity);
    expect(p.start).toBe(180);
    expect(p.end).toBe(184);
    expect(p.steps).toEqual(["baseline"]);
    expect(p.pendingMigrations).toHaveLength(4);
  });
  it.each(["183", "185", 185, "force", "anything"])(
    "rejects arbitrary target %s",
    (stage) =>
      expect(() => migrationArtifact(identity.manifest, stage)).toThrow(
        "ARBITRARY",
      ),
  );
  it.each(["baseline", "retirement", "activation"])(
    "constructs and verifies fixed %s artifact",
    (stage) => {
      const a = disposableArtifact(root, identity, stage);
      try {
        verifyMigrationDirectory(a.directory, a.artifact);
        expect(a.artifact.migrations).toHaveLength(a.artifact.target);
      } finally {
        a.cleanup();
      }
    },
  );
  it.each(["extra", "missing", "modified", "later185", "later186"])(
    "rejects %s artifact mutation",
    (kind) => {
      const stage = kind === "later186" ? "retirement" : "baseline",
        a = disposableArtifact(root, identity, stage);
      try {
        const directory = join(a.directory, "supabase/migrations");
        if (kind === "missing")
          unlinkSync(join(directory, a.artifact.migrations[0].filename));
        else if (kind === "modified")
          writeFileSync(
            join(directory, a.artifact.migrations[0].filename),
            "select 1;",
          );
        else {
          const m =
            identity.manifest.migrations.approved[
              kind === "later186" ? 185 : 184
            ];
          writeFileSync(
            join(
              directory,
              kind === "extra" ? "99999999999999_extra.sql" : m.filename,
            ),
            readFileSync(join(root, "supabase/migrations", m.filename)),
          );
        }
        expect(() => verifyMigrationDirectory(a.directory, a.artifact)).toThrow(
          "ARTIFACT_DRIFT",
        );
      } finally {
        a.cleanup();
      }
    },
  );
  it("rejects reordered and modified artifact metadata", () => {
    const a = disposableArtifact(root, identity, "baseline");
    try {
      const bad = structuredClone(a.artifact);
      bad.migrations.reverse();
      expect(() => verifyMigrationDirectory(a.directory, bad)).toThrow();
    } finally {
      a.cleanup();
    }
  });
  it.each([
    CONTAINMENT_SOURCE + 'fetch("https://example.org");',
    CONTAINMENT_SOURCE + 'import "./billing.ts";',
    CONTAINMENT_SOURCE.replace("503", "200"),
  ])("rejects forbidden containment code", (source) =>
    expect(() => validateContainment(source)).toThrow("FORBIDDEN"),
  );
  it("static containment responds retryably without database or provider capabilities", async () => {
    let handler: () => Response;
    const serve = vi.fn((h) => {
      handler = h;
    });
    new Function("Deno", CONTAINMENT_SOURCE)({ serve });
    const response = handler!();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({
      code: "BILLING_RELEASE_TEMPORARILY_UNAVAILABLE",
      retryable: true,
    });
    expect(serve).toHaveBeenCalledOnce();
  });
});

describe("strict versioned phase authority", () => {
  it("accepts exact fresh baseline authorization", () => {
    const s = simulation(180);
    expect(
      validateAuthorization(
        authorization("BASELINE_180_TO_184", s),
        "BASELINE_180_TO_184",
        identity,
        context,
        hash(canonical(contracts)),
        NOW,
      ).phase,
    ).toBe("BASELINE_180_TO_184");
  });
  const mutations: [string, (a: any) => void][] = [
    ["old authorization version", (a) => (a.schemaVersion = 2)],
    ["missing webhook review", (a) => delete a.webhookHistory],
    ["wrong commit", (a) => (a.executionCommit = "a".repeat(40))],
    ["stale authorization", (a) => (a.createdAt = iso(-31 * 60_000))],
    ["expired authority", (a) => (a.expiresAt = iso(-1))],
    [
      "wrong project",
      (a) => (a.projectSha256 = hash(context.productionProject)),
    ],
    ["stale backup", (a) => (a.backup.createdAt = iso(-25 * 60 * 60_000))],
    ["missing restore", (a) => delete a.backup.restore],
    [
      "wrong restore binding",
      (a) => (a.backup.restore.backupEvidenceSha256 = hash("other")),
    ],
    ["wrong final digest", (a) => (a.finalFunctions[0].digest = hash("wrong"))],
    ["wrong JWT", (a) => (a.finalFunctions[0].verifyJwt = false)],
    [
      "wrong containment digest",
      (a) => (a.containmentFunctions[0].digest = hash("bad")),
    ],
    ["enabled sales", (a) => (a.salesEnabled = true)],
    ["enabled reconciliation", (a) => (a.reconciliationEnabled = true)],
    ["arbitrary target", (a) => (a.target = 999)],
    [
      "modified migration hash",
      (a) => (a.pendingMigrations[0].sha256 = hash("bad")),
    ],
    ["missing migration", (a) => a.pendingMigrations.pop()],
    [
      "extra migration",
      (a) =>
        a.pendingMigrations.push(identity.manifest.migrations.approved[184]),
    ],
    ["reordered migrations", (a) => a.pendingMigrations.reverse()],
    ["cross phase", (a) => (a.phase = "RETIREMENT_ACTIVATION_184_TO_186")],
    ["stale inventory", (a) => (a.inventory.observedAt = iso(-16 * 60_000))],
    [
      "configuration missing payment credential",
      (a) =>
        (a.configuration.requiredNames = a.configuration.requiredNames.filter(
          (n: string) => !n.includes("PAYMENT_METHOD"),
        )),
    ],
  ];
  it.each(mutations)("rejects %s", (_name, mutate) => {
    const s = simulation(180),
      a = authorization("BASELINE_180_TO_184", s);
    mutate(a);
    expect(() =>
      validateAuthorization(
        a,
        "BASELINE_180_TO_184",
        identity,
        context,
        hash(canonical(contracts)),
        NOW,
      ),
    ).toThrow();
  });
  it("rejects production as staging", () => {
    const s = simulation(180);
    expect(() =>
      validateAuthorization(
        authorization("BASELINE_180_TO_184", s),
        "BASELINE_180_TO_184",
        identity,
        {
          ...context,
          project: context.productionProject,
          expectedProject: context.productionProject,
        },
        hash(canonical(contracts)),
        NOW,
      ),
    ).toThrow("PROJECT");
  });
  it("requires protected wrapper authority for downloads", () =>
    expect(() =>
      guardedArgs(
        ["functions", "download", "billing-paddle-webhook"],
        {},
        null,
      ),
    ).toThrow("AUTHORIZATION"));
});

describe(
  "fail-closed phase execution and checkpoints",
  { timeout: 20000 },
  () => {
    it.each(["REMOVED", "THROTTLED", undefined])(
      "stops a non-active deployment (%s) before the next mutation",
      async (status) => {
        const s = simulation(184),
          a = authorization("RETIREMENT_ACTIVATION_184_TO_186", s);
        s.adapter.observe.mockImplementation(async () => {
          const o = s.observation();
          if (s.commands.length)
            o.functions.find((f) => f.name === LS_TOMBSTONES[0]).status =
              status;
          return o;
        });
        const result = await run("RETIREMENT_ACTIVATION_184_TO_186", s, a);
        expect(result.recovery.errorCode).toBe("RELEASE_FUNCTION_NOT_ACTIVE");
        expect(s.commands).toHaveLength(1);
      },
    );
    it.each(["REMOVED", "THROTTLED", undefined])(
      "rejects non-active final Paddle webhook (%s)",
      (status) => {
        const o = simulation(186).observation();
        o.artifacts = Object.fromEntries(
          identity.functions.map((f) => [f.name, f.digest]),
        );
        o.functions.find((f) => f.name === "billing-paddle-webhook").status =
          status;
        expect(() => verifyFunctions(o, identity, "final")).toThrow(
          "NOT_ACTIVE",
        );
      },
    );
    it.each(["ledger", "configuration", "source", "expiry", "backup", "work"])(
      "blocks immediate %s drift after dry-run",
      async (kind) => {
        const s = simulation(180),
          a = authorization("BASELINE_180_TO_184", s);
        if (kind === "backup") a.backup.expiresAt = iso(60_000);
        const original = s.adapter.command.getMockImplementation()!;
        let afterDryRun = false;
        s.adapter.command.mockImplementation((args) => {
          const result = original(args);
          if (args.includes("--dry-run")) afterDryRun = true;
          return result;
        });
        s.adapter.observe.mockImplementation(async () => {
          const o = s.observation();
          if (afterDryRun) {
            if (kind === "ledger") o.facts.versions.push("99999999999999");
            if (kind === "configuration") o.secretDigest = hash("changed");
            if (kind === "work") o.facts.work.paddleOperations = 1;
          }
          return o;
        });
        const r = await run("BASELINE_180_TO_184", s, a, {
          currentContext: () => ({
            ...context,
            commit:
              afterDryRun && kind === "source"
                ? "b".repeat(40)
                : context.commit,
          }),
          now: () =>
            NOW +
            (afterDryRun && kind === "expiry"
              ? 26 * 60_000
              : afterDryRun && kind === "backup"
                ? 2 * 60_000
                : 0),
        });
        expect(r.status).toBe("blocked");
        expect(s.commands.some((c) => c.includes("--yes"))).toBe(false);
      },
    );
    it.each(["unexpected", "reordered", "definition"])(
      "rejects remote %s drift before mutation",
      async (kind) => {
        const s = simulation(180),
          a = authorization("BASELINE_180_TO_184", s);
        s.adapter.observe.mockImplementation(async () => {
          const o = s.observation();
          if (kind === "unexpected") o.facts.versions.push("99999999999999");
          if (kind === "reordered") o.facts.versions.reverse();
          if (kind === "definition")
            o.facts.contractDigest = hash("changed SQL or ACL");
          return o;
        });
        expect((await run("BASELINE_180_TO_184", s, a)).status).toBe("blocked");
        expect(s.commands).toHaveLength(0);
      },
    );
    it("rejects a wrong deployed digest immediately before subsequent deployments", async () => {
      const s = simulation(184);
      s.adapter.verifyArtifact.mockResolvedValue(hash("wrong"));
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("blocked");
      expect(s.commands).toHaveLength(1);
      expect(s.count).toBe(184);
    });
    it("rejects tombstone probe side effects before subsequent deployments", async () => {
      const s = simulation(184);
      s.adapter.probe.mockImplementation(async () => {
        s.setEnabled();
      });
      expect((await run("RETIREMENT_ACTIVATION_184_TO_186", s)).status).toBe(
        "blocked",
      );
      expect(s.commands).toHaveLength(1);
    });
    it.each([179, 181, 185])(
      "blocks wrong baseline prefix %s before mutation",
      async (count) => {
        const s = simulation(count);
        const r = await run("BASELINE_180_TO_184", s);
        expect(r.status).toBe("blocked");
        expect(s.commands).toHaveLength(0);
      },
    );
    it("performs exact bounded baseline with an observable 184 checkpoint", async () => {
      const s = simulation(180),
        r = await run("BASELINE_180_TO_184", s);
      expect(r.status).toBe("complete");
      expect(s.count).toBe(184);
      expect(r.checkpoints[0].stage).toBe("baseline_checkpoint");
      expect(s.commands.some((c) => c[0] === "functions")).toBe(false);
      expect(s.reads).toBeGreaterThan(3);
    });
    it.each(["extra", "missing", "reordered"])(
      "rejects %s dry-run before apply",
      async (kind) => {
        const s = simulation(180);
        let files = identity.manifest.migrations.approved
          .slice(180, 184)
          .map((m) => m.filename);
        if (kind === "extra")
          files.push(identity.manifest.migrations.approved[184].filename);
        if (kind === "missing") files.pop();
        if (kind === "reordered") files.reverse();
        s.setDryRun(files.join("\n"));
        const r = await run("BASELINE_180_TO_184", s);
        expect(r.status).toBe("blocked");
        expect(s.commands.some((c) => c.includes("--yes"))).toBe(false);
      },
    );
    it("blocks newly enabled flags", async () => {
      const s = simulation(180),
        a = authorization("BASELINE_180_TO_184", s);
      s.setEnabled();
      expect((await run("BASELINE_180_TO_184", s, a)).status).toBe("blocked");
      expect(s.commands).toHaveLength(0);
    });
    it("blocks in-flight work", async () => {
      const s = simulation(184);
      s.setBusy();
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("blocked");
      expect(s.commands).toHaveLength(0);
    });
    it("records actual partial baseline state without continuing", async () => {
      const s = simulation(180);
      s.setFail("baseline");
      const r = await run("BASELINE_180_TO_184", s);
      expect(r.recovery.ledgerCount).toBe(182);
      expect(r.recovery.newAuthorizationRequired).toBe(true);
      expect(recoveryPlan(r.recovery).phase).toBe("RESUME_BASELINE_182_TO_184");
      expect(s.commands.filter((c) => c.includes("--yes"))).toHaveLength(1);
    });
    it("runs containment then verified 185 and 186 then distinct final substages", async () => {
      const s = simulation(184),
        r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("complete");
      expect(s.count).toBe(186);
      expect(r.checkpoints.map((c: any) => c.stage)).toContain(
        "retirement_checkpoint",
      );
      expect(r.completedSteps).toContain("nonbilling");
      expect(s.commands[0][2]).toBe(LS_TOMBSTONES[0]);
      expect(s.adapter.probe).toHaveBeenCalled();
    });
    it("stops containment failure before SQL mutation", async () => {
      const s = simulation(184);
      s.setFail("containment");
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("blocked");
      expect(s.count).toBe(184);
      expect(s.commands.some((c) => c.includes("--yes"))).toBe(false);
    });
    it("stops at 185 on retirement proof failure, never attempts 186", async () => {
      const s = simulation(184);
      s.setRetirementFailure();
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("blocked");
      expect(r.recovery.ledgerCount).toBe(185);
      expect(s.commands.filter((c) => c.includes("--yes"))).toHaveLength(1);
    });
    it("records failed activation at 185", async () => {
      const s = simulation(184);
      s.setFail("activation");
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.recovery.ledgerCount).toBe(185);
      expect(r.recovery.failedStep).toBe("activation");
    });
    it("records partial final deployment at 186", async () => {
      const s = simulation(184);
      s.setFail("final");
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("blocked");
      expect(r.recovery.ledgerCount).toBe(186);
      expect(r.completedSteps).not.toContain("nonbilling");
      expect(
        r.recovery.functionStates.some((f) => f.artifact === "containment"),
      ).toBe(true);
      expect(r.recovery.inventoryDigest).toMatch(/^[a-f0-9]{64}$/);
    });
    it("blocks JWT drift before proceeding to another function", async () => {
      const s = simulation(184),
        a = authorization("RETIREMENT_ACTIVATION_184_TO_186", s);
      s.adapter.observe.mockImplementation(async () => {
        const o = s.observation();
        if (s.commands.length)
          o.functions[0].verify_jwt = !o.functions[0].verify_jwt;
        return o;
      });
      expect((await run("RETIREMENT_ACTIVATION_184_TO_186", s, a)).status).toBe(
        "blocked",
      );
      expect(s.commands).toHaveLength(1);
    });
    it("blocks a generation change while deployed source is being verified", async () => {
      const s = simulation(184),
        a = authorization("RETIREMENT_ACTIVATION_184_TO_186", s);
      let downloaded = false;
      s.adapter.verifyArtifact.mockImplementation(async (_name, expected) => {
        downloaded = true;
        return expected.digest;
      });
      s.adapter.observe.mockImplementation(async () => {
        const o = s.observation();
        if (downloaded) {
          o.functions[0].version++;
          o.digest = hash(
            canonical({ ...o, digest: undefined, observedAt: undefined }),
          );
        }
        return o;
      });
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s, a);
      expect(r.recovery.errorCode).toBe("RELEASE_DEPLOYED_GENERATION_DRIFT");
      expect(s.commands).toHaveLength(1);
    });
    it("rejects remaining containment during final verification", async () => {
      const s = simulation(184);
      s.setRemainingContainment();
      const r = await run("RETIREMENT_ACTIVATION_184_TO_186", s);
      expect(r.status).toBe("blocked");
      expect(r.recovery.errorCode).toBe("RELEASE_FUNCTION_IDENTITY_DRIFT");
    });
    it("rejects missing tombstone and unexpected legacy function", () => {
      const s = simulation(186),
        o = s.observation();
      o.artifacts = Object.fromEntries(
        identity.functions.map((f) => [f.name, f.digest]),
      );
      o.functions = o.functions.filter((f: any) => f.name !== LS_TOMBSTONES[0]);
      expect(() => verifyFunctions(o, identity, "final")).toThrow();
      o.functions.push({
        name: "billing-legacy-lemon-portal",
        version: 1,
        verify_jwt: true,
      });
      expect(() => verifyFunctions(o, identity, "final")).toThrow();
    });
    it("verifies the JWT contract of an observed outside-scope function without deploying it", () => {
      const o = simulation(186).observation();
      o.artifacts = Object.fromEntries(
        identity.functions.map((f) => [f.name, f.digest]),
      );
      const f = identity.outsideFunctions[0];
      o.functions.push({ name: f.name, version: 1, verify_jwt: f.verifyJwt });
      expect(() => verifyFunctions(o, identity, "final")).not.toThrow();
      o.functions.at(-1).verify_jwt = !f.verifyJwt;
      expect(() => verifyFunctions(o, identity, "final")).toThrow("JWT_DRIFT");
    });
    it.each([180, 181, 182, 183, 184, 185, 186])(
      "supports newly authorized resume from %s",
      async (count) => {
        const e = {
          schemaVersion: 2,
          status: "blocked",
          phase: "BASELINE_180_TO_184",
          authorizationDigest: hash("previous"),
          executionCommit: context.commit,
          observedAt: iso(-5000),
          ledgerCount: count,
          inventoryDigest: hash("prior inventory"),
          functionStates: [],
          completedSteps: [],
          failedStep: "synthetic",
          errorCode: "SYNTHETIC_FAILURE",
          newAuthorizationRequired: true,
        };
        const p = recoveryPlan(e),
          s = simulation(count),
          a = authorization(p.phase, s);
        a.recovery = { evidence: e, digest: p.evidenceDigest };
        expect((await run(p.phase, s, a)).status).toBe("complete");
      },
    );
    it("rejects resume without fresh recovery authorization", async () => {
      const s = simulation(185);
      expect((await run("RESUME_ACTIVATION_185_TO_186", s)).status).toBe(
        "blocked",
      );
      expect(s.commands).toHaveLength(0);
    });
    it("performs no network for local planning", async () => {
      const s = simulation(180);
      const r = await runRelease(
        {
          phase: "BASELINE_180_TO_184",
          mode: "plan",
          context,
          identity,
          contracts,
        },
        s.adapter,
      );
      expect(r.status).toBe("plan");
      expect(s.adapter.observe).not.toHaveBeenCalled();
    });
  },
);

describe("exact recovery evidence bytes", () => {
  function bundle() {
    const a = authorization("BASELINE_180_TO_184", simulation(180));
    const b = {
      schemaVersion: 3,
      environment: "staging",
      commitSha: a.executionCommit,
      projectRefSha256: a.projectSha256,
      createdAt: a.backup.createdAt,
      portableRestoreData: true,
      authUsersIncluded: true,
      applicationSchemasExcluded: false,
      storageObjectsIncluded: false,
      remoteMutationPerformed: false,
      migrationLedgerIncluded: true,
      migrationLedgerSha256: a.backup.migrationLedgerSha256,
      ledgerRowsSha256: a.backup.ledgerRowsSha256,
      ledgerVersions: a.startVersions,
      publicCopyTargetCount: 100,
      managedCompatibilityExclusions: MANAGED_COMPATIBILITY_EXCLUSIONS,
      files: [
        "roles.sql",
        "schema.sql",
        "data.sql",
        "migration-ledger.json",
      ].map((filename) => ({
        filename,
        byteLength: 100,
        sha256: hash(filename),
      })),
    };
    const r = {
      schemaVersion: 3,
      environment: "staging",
      executionCommit: a.executionCommit,
      projectSha256: a.projectSha256,
      backupEvidenceSha256: hash(JSON.stringify(b)),
      verifiedAt: a.backup.restore.verifiedAt,
      sourceLedger: a.startVersions,
      restoredLedger: a.startVersions,
      migrationLedgerSha256: a.backup.migrationLedgerSha256,
      restoredLedgerRowsSha256: a.backup.ledgerRowsSha256,
      isolatedTarget: true,
      authUsersRestored: true,
      retainedHistoryVerified: true,
      expectedApplicationTargetCount: 100,
      restoredApplicationTargetCount: 100,
      retirementCompatible: true,
    };
    a.backup.evidenceSha256 = hash(JSON.stringify(b));
    a.backup.restore.backupEvidenceSha256 = a.backup.evidenceSha256;
    a.backup.restore.evidenceSha256 = hash(JSON.stringify(r));
    return {
      a,
      b,
      r,
      wire: {
        backupEvidence: JSON.stringify(b),
        restoreProof: JSON.stringify(r),
      },
    };
  }
  it("accepts explicitly bound backup and independent restore proof", () => {
    const { a, wire } = bundle();
    expect(validateRecoveryBundle(wire, a)).toBe(true);
  });
  it.each([
    "missing",
    "bytes",
    "backup metadata",
    "missing component",
    "restore ledger",
    "restore counts",
    "restore authority",
    "ledger artifact",
    "ledger rows",
    "backup prefix",
    "old backup",
    "old restore",
  ])("rejects %s recovery evidence", (kind) => {
    const { a, b, r, wire } = bundle();
    if (kind === "missing") delete (wire as any).restoreProof;
    if (kind === "bytes") wire.backupEvidence += " ";
    if (kind === "backup metadata") b.authUsersIncluded = false;
    if (kind === "missing component") b.files.pop();
    if (kind === "restore ledger") r.restoredLedger = [];
    if (kind === "restore counts") r.restoredApplicationTargetCount--;
    if (kind === "restore authority") r.retirementCompatible = false;
    if (kind === "ledger artifact")
      b.files[3].sha256 = hash("substituted ledger");
    if (kind === "ledger rows")
      r.restoredLedgerRowsSha256 = hash("reconstructed rather than restored");
    if (kind === "backup prefix")
      b.ledgerVersions = b.ledgerVersions.slice(0, 179);
    if (kind === "old backup") b.schemaVersion = 2;
    if (kind === "old restore") r.schemaVersion = 2;
    if (!["missing", "bytes"].includes(kind)) {
      wire.backupEvidence = JSON.stringify(b);
      wire.restoreProof = JSON.stringify(r);
      a.backup.evidenceSha256 = hash(wire.backupEvidence);
      a.backup.restore.evidenceSha256 = hash(wire.restoreProof);
    }
    expect(() => validateRecoveryBundle(wire, a)).toThrow();
  });
});

describe(
  "complete closing stability through the actual adapter and runner",
  { timeout: 30000 },
  () => {
    const mutationCalls = (s: ReturnType<typeof simulation>) =>
      s.commands.filter(
        (args) =>
          (args[0] === "db" && args.includes("--yes")) ||
          (args[0] === "functions" && ["deploy", "delete"].includes(args[1])),
      );
    function databaseFacts(o: any) {
      const {
        history,
        work,
        scheduled,
        contractDigest,
        webhookHistory,
        ...facts
      } = o.facts;
      return {
        ...facts,
        tables: [
          ...new Set([...Object.keys(history), ...WEBHOOK_HISTORY_TABLES]),
        ].map((name) => ({
          name,
          acl: null,
          rls: true,
        })),
        schema: {},
      };
    }
    async function harness(
      options: {
        phase?: string;
        mutate?: (state: any) => void;
        tripRound?: number;
        tripRead?: number;
        slowClosing?: boolean;
        slowConfirmation?: boolean;
        reorder?: boolean;
        beforeMutationDelay?: boolean;
        armAfterCheckpoint?: string;
        armAfterStep?: string;
        armAfterDryRun?: number;
        webhookTables?: Record<string, any[]>;
        webhookReview?: any;
      } = {},
    ) {
      const phase = options.phase ?? "BASELINE_180_TO_184";
      const s = simulation(PHASES[phase].start);
      const localContracts = {
        checkpoints: Object.fromEntries(
          [180, 181, 182, 183, 184, 185, 186].map((n) => [
            n,
            {
              digest: databaseContract(
                databaseFacts(simulation(n).observation()),
              ),
            },
          ]),
        ),
      };
      const state = {
        functions: s.observation().functions,
        secrets: SECRET_NAMES.map((name) => ({
          name,
          value: hash("synthetic-" + name),
          ...(name === SECRET_NAMES.at(-1)
            ? {}
            : { updated_at: "2026-10-05T10:00:00.123456Z" }),
        })),
        auth: {
          ...s.observation().authConfig,
          smtp_pass: "synthetic-private-never-export",
        },
        overrideFacts: null as any,
        webhookTables: structuredClone(
          options.webhookTables ?? emptyWebhookTables(),
        ),
      };
      let calls = 0,
        changed = false,
        armed = false,
        armedCalls = 0;
      const transport = vi.fn(async () => {
        calls++;
        const round = Math.floor((calls - 1) / 17) + 1,
          read = ((calls - 1) % 17) + 1;
        const trip =
          options.armAfterCheckpoint ||
          options.armAfterDryRun ||
          options.armAfterStep
            ? armed && armedCalls++ === (options.tripRead ?? 5) - 1
            : round === (options.tripRound ?? 4) &&
              read === (options.tripRead ?? 5);
        if (!changed && trip) {
          changed = true;
          options.mutate?.(state);
        }
        if (options.slowClosing && round === 4 && read === 10)
          vi.setSystemTime(Date.now() + 61_000);
        if (options.slowConfirmation && round === 4 && read === 17)
          vi.setSystemTime(Date.now() + 61_000);
        const o = s.observation();
        let response;
        if ([1, 7, 8, 14].includes(read))
          response = [{ facts: state.overrideFacts ?? databaseFacts(o) }];
        else if ([2, 9, 15].includes(read)) response = state.functions;
        else if ([3, 10, 16].includes(read)) response = state.secrets;
        else if ([4, 11, 17].includes(read)) response = state.auth;
        else if ([5, 12].includes(read))
          response = [{ history: o.facts.history }];
        else
          response = [
            {
              work: {
                ...o.facts.work,
                paddleWebhooks:
                  state.webhookTables.billing_webhook_events_v2.filter(
                    (e: any) =>
                      !["processed", "ignored"].includes(e.processing_status),
                  ).length,
              },
              scheduled: o.facts.scheduled,
              webhook_history: Object.fromEntries(
                databaseFacts(o).tables.map((t: any) => [
                  t.name,
                  (state.webhookTables[t.name] ?? []).map((row) => ({
                    ...row,
                    __release_row_sha256: evidenceDigest(
                      Object.fromEntries(
                        Object.entries(row).filter(
                          ([k]) => k !== "__release_row_sha256",
                        ),
                      ),
                    ),
                  })),
                ]),
              ),
            },
          ];
        if (options.reorder && round > 1) {
          if ([2, 3, 9, 10, 15, 16].includes(read))
            response = [...response]
              .reverse()
              .map((row) => Object.fromEntries(Object.entries(row).reverse()));
          if ([4, 11, 17].includes(read))
            response = Object.fromEntries(Object.entries(response).reverse());
        }
        return new Response(JSON.stringify(response));
      });
      const real = createRemoteAdapter(
        context,
        {
          STAGING_SUPABASE_PROJECT_REF: context.project,
          PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
        },
        transport,
        options.webhookReview ?? EMPTY_WEBHOOK_REVIEW,
      );
      const reviewed = await real.observe();
      const a = authorization(phase, { observation: () => reviewed } as any);
      a.webhookHistory.review = options.webhookReview ?? EMPTY_WEBHOOK_REVIEW;
      a.webhookHistory.dispositionDigest = reviewed.facts.webhookHistory.digest;
      a.checkpointContractDigest = hash(canonical(localContracts));
      a.configuration.secretInventorySha256 = reviewed.secretDigest;
      a.configuration.authConfigurationSha256 = reviewed.authDigest;
      if (phase.startsWith("RESUME_")) {
        const evidence = {
          schemaVersion: 2,
          status: "blocked",
          phase,
          authorizationDigest: hash("previous"),
          executionCommit: context.commit,
          observedAt: iso(-1000),
          ledgerCount: PHASES[phase].start,
          inventoryDigest: reviewed.digest,
          functionStates: [],
          completedSteps: [],
          failedStep: "review_fixture",
          errorCode: "REVIEW_FIXTURE",
          newAuthorizationRequired: true,
        };
        a.recovery = { evidence, digest: hash(canonical(evidence)) };
      }
      const execute = s.adapter.command;
      const adapter = {
        ...real,
        command: vi.fn((args: string[]) => {
          const output = execute(args);
          state.functions = s.observation().functions;
          if (args.includes("--dry-run") && options.armAfterDryRun === s.count)
            armed = true;
          return output;
        }),
        verifyArtifact: s.adapter.verifyArtifact,
        probe: s.adapter.probe,
      };
      let afterDryRunIdentityReads = 0;
      const result = await runRelease(
        {
          phase,
          mode: "apply",
          authorization: a,
          context,
          identity,
          contracts: localContracts,
        },
        adapter,
        {
          now: Date.now,
          currentIdentity: () => {
            // The gate validates authority twice after dry-run; the third check
            // is readyForMutation, after artifact checks and before the push.
            if (s.commands.some((args) => args.includes("--dry-run")))
              afterDryRunIdentityReads++;
            if (options.beforeMutationDelay && afterDryRunIdentityReads === 3)
              vi.setSystemTime(Date.now() + 61_000);
            return identity;
          },
          emit: (report: any) => {
            if (
              options.armAfterCheckpoint &&
              report.checkpoints.at(-1)?.stage === options.armAfterCheckpoint
            )
              armed = true;
            if (
              options.armAfterStep &&
              report.completedSteps.includes(options.armAfterStep)
            )
              armed = true;
          },
        },
      );
      expect(JSON.stringify(result)).not.toContain(
        "synthetic-private-never-export",
      );
      return { s, result, changed, reviewed, transport };
    }

    it("reaches the real adapter/runner mutation boundary with exact historical-safe evidence", async () => {
      const t = webhookFixture("runner-stable"),
        review = historyReview(t);
      const { s, result } = await harness({
        webhookTables: t,
        webhookReview: review,
      });
      expect(result.status).toBe("complete");
      expect(mutationCalls(s)).toHaveLength(1);
      expect(result.webhookHistory.historicalSafeWebhookCount).toBe(1);
    });
    it.each(
      Object.keys(PHASES).flatMap((phase) =>
        fixtureAuthorityTables.map((table) => [phase, table]),
      ),
    )(
      "blocks freshly reviewed fixture account authority in %s: %s",
      async (phase, table) => {
        const t = webhookFixture(
          "owner-gate",
          "subscription.created",
          "fixture",
        );
        t[table].push(
          fixtureAccountAuthority(
            table,
            t.billing_checkouts_v2[0].billing_account_id,
          ),
        );
        const { s, result } = await harness({
          phase,
          webhookTables: t,
          webhookReview: historyReview(t, ["closed_fixture"]),
        });
        expect(result.status).toBe("blocked");
        expect(result.recovery.errorCode).toBe("RELEASE_IN_FLIGHT_WORK");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each(fixtureAuthorityTables)(
      "blocks fixture account authority added during closing: %s",
      async (table) => {
        const t = webhookFixture(
          "owner-drift",
          "subscription.created",
          "fixture",
        );
        const { s, result, changed } = await harness({
          webhookTables: t,
          webhookReview: historyReview(t, ["closed_fixture"]),
          tripRead: 12,
          mutate: (state) =>
            state.webhookTables[table].push(
              fixtureAccountAuthority(
                table,
                t.billing_checkouts_v2[0].billing_account_id,
              ),
            ),
        });
        expect(changed).toBe(true);
        expect(result.recovery.errorCode).toBe("DATABASE_DRIFT");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it("allows a closed fixture with only unrelated account authority through the runner", async () => {
      const t = webhookFixture(
        "owner-clean",
        "subscription.created",
        "fixture",
      );
      for (const table of fixtureAuthorityTables)
        t[table].push(fixtureAccountAuthority(table, "unrelated-account"));
      const { s, result } = await harness({
        webhookTables: t,
        webhookReview: historyReview(t, ["closed_fixture"]),
      });
      expect(result.status).toBe("complete");
      expect(mutationCalls(s)).toHaveLength(1);
      expect(result.webhookHistory.historicalSafeWebhookCount).toBe(1);
    });
    it.each([
      ["override-active", false],
      ["override-future", false],
      ["override-expired", true],
      ["override-revoked", true],
      ["capacity-active", false],
      ["capacity-released", true],
      ["capacity-expired", true],
    ])(
      "uses fresh lifecycle evidence/authorization through the runner: %s",
      async (kind, safe) => {
        const t = webhookFixture(
          "lifecycle-runner",
          "subscription.created",
          "fixture",
        );
        const { table, row } = lifecycleAuthority(
          kind as string,
          t.billing_checkouts_v2[0].billing_account_id,
        );
        t[table].push(row);
        const { s, result } = await harness({
          webhookTables: t,
          webhookReview: historyReview(t, ["closed_fixture"]),
        });
        expect(result.status).toBe(safe ? "complete" : "blocked");
        expect(mutationCalls(s)).toHaveLength(safe ? 1 : 0);
        if (safe)
          expect(result.webhookHistory.historicalSafeWebhookCount).toBe(1);
      },
    );
    it.each(fixtureAuthorityTables)(
      "blocks mixed active/ended authority with fresh authorization: %s",
      async (table) => {
        const t = webhookFixture(
          "lifecycle-mixed",
          "subscription.created",
          "fixture",
        );
        const account = t.billing_checkouts_v2[0].billing_account_id;
        t[table].push(
          lifecycleAuthority(
            table === fixtureAuthorityTables[0]
              ? "override-revoked"
              : "capacity-released",
            account,
          ).row,
        );
        t[table].push({
          ...fixtureAccountAuthority(table, account),
          id: "still-active",
        });
        const { s, result } = await harness({
          webhookTables: t,
          webhookReview: historyReview(t, ["closed_fixture"]),
        });
        expect(result.status).toBe("blocked");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each([
      "override-expired",
      "override-revoked",
      "capacity-released",
      "capacity-expired",
    ])(
      "blocks ended-to-effective lifecycle drift through the runner: %s",
      async (kind) => {
        const t = webhookFixture(
          "lifecycle-drift",
          "subscription.created",
          "fixture",
        );
        const { table, row } = lifecycleAuthority(
          kind,
          t.billing_checkouts_v2[0].billing_account_id,
        );
        t[table].push(row);
        const { s, result, changed } = await harness({
          webhookTables: t,
          webhookReview: historyReview(t, ["closed_fixture"]),
          tripRead: 12,
          mutate: (state) => {
            // Real immutable rows cannot reopen; simulate transport/remote drift to
            // prove that neither an altered row nor altered computed proof is reused.
            state.webhookTables[table][0] = fixtureAccountAuthority(
              table,
              row.billing_account_id,
            );
          },
        });
        expect(changed).toBe(true);
        expect(result.recovery.errorCode).toBe("DATABASE_DRIFT");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each([
      "missing-proof",
      "unknown-status",
      "contradictory-terminal",
      "missing-null-field",
    ])(
      "blocks ambiguous lifecycle through fresh runner authorization: %s",
      async (kind) => {
        const t = webhookFixture(
          "lifecycle-ambiguous",
          "subscription.created",
          "fixture",
        );
        const { table, row } = lifecycleAuthority(
          "capacity-expired",
          t.billing_checkouts_v2[0].billing_account_id,
        );
        if (kind === "missing-proof") delete row.__release_authority_lifecycle;
        if (kind === "unknown-status") row.status = "unknown";
        if (kind === "contradictory-terminal") row.released_at = row.expired_at;
        if (kind === "missing-null-field") delete row.consumed_at;
        t[table].push(row);
        const { s, result } = await harness({
          webhookTables: t,
          webhookReview: historyReview(t, ["closed_fixture"]),
        });
        expect(result.status).toBe("blocked");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each([
      "row",
      "payload",
      "observation",
      "receipt",
      "checkout",
      "payment",
      "unknown",
      "removed",
      "replacement",
      "entitlement",
    ])(
      "blocks %s drift through the actual observation adapter and runner",
      async (category) => {
        const t = webhookFixture("runner-drift"),
          review = historyReview(t);
        const { s, result, changed } = await harness({
          webhookTables: t,
          webhookReview: review,
          tripRead: 12,
          mutate: (state) => {
            const rows = state.webhookTables;
            if (category === "row")
              rows.billing_webhook_events_v2[0].attempt_count++;
            if (category === "payload")
              rows.billing_paddle_event_deliveries[0].raw_payload_sha256 =
                hash("changed");
            if (category === "observation")
              rows.billing_paddle_event_observations[0].observation.customerRef =
                "changed";
            if (category === "receipt")
              rows.billing_verified_evidence_v2[0].payment_authority = true;
            if (category === "checkout")
              rows.billing_checkouts_v2.push({
                provider_transaction_ref:
                  rows.billing_webhook_events_v2[0].resource_ref,
                status: "ambiguous",
                provider: "paddle",
                environment: "test",
                billing_account_id: "owner",
              });
            if (category === "payment")
              rows.billing_payment_applications_v2.push({
                provider_transaction_ref:
                  rows.billing_webhook_events_v2[0].resource_ref,
                provider: "paddle",
                environment: "test",
              });
            if (category === "unknown")
              rows.billing_webhook_events_v2.push({
                ...rows.billing_webhook_events_v2[0],
                id: "unknown",
                processing_status: "manual_review",
              });
            if (category === "removed") rows.billing_webhook_events_v2 = [];
            if (category === "replacement")
              rows.billing_webhook_events_v2[0].id = "replacement";
            if (category === "entitlement")
              rows.account_subscriptions.push({ id: "new-canonical-effect" });
          },
        });
        expect(changed).toBe(true);
        expect(result.status).toBe("blocked");
        expect(result.recovery.errorCode).toBe("DATABASE_DRIFT");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each(Object.keys(PHASES))(
      "protects webhook evidence in every phase %s",
      async (phase) => {
        const t = webhookFixture("all-phases"),
          review = historyReview(t);
        const { s, result } = await harness({
          phase,
          webhookTables: t,
          webhookReview: review,
          tripRound: 2,
          tripRead: 12,
          mutate: (state) =>
            state.webhookTables.billing_webhook_events_v2[0].attempt_count++,
        });
        expect(result.recovery.errorCode).toBe("DATABASE_DRIFT");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it("new unknown retained evidence blocks a stable initial observation before any mutation", async () => {
      const t = webhookFixture("unreviewed");
      const { s, result } = await harness({ webhookTables: t });
      expect(result.status).toBe("blocked");
      expect(result.recovery.errorCode).toBe("RELEASE_IN_FLIGHT_WORK");
      expect(mutationCalls(s)).toHaveLength(0);
    });
    it("blocks a substituted authorization disposition digest before mutation", async () => {
      const s = simulation(180),
        a = authorization("BASELINE_180_TO_184", s);
      a.webhookHistory.dispositionDigest = hash("substituted-report");
      const result = await run("BASELINE_180_TO_184", s, a);
      expect(result.recovery.errorCode).toBe("RELEASE_WEBHOOK_REVIEW_DRIFT");
      expect(mutationCalls(s)).toHaveLength(0);
    });
    const changes: [string, string, (state: any) => void][] = [
      [
        "function added",
        "FUNCTION_INVENTORY_DRIFT",
        (s) =>
          s.functions.push({
            name: "marketing-lead-submit",
            id: "synthetic-added",
            version: 1,
            verify_jwt: true,
            status: "ACTIVE",
          }),
      ],
      [
        "function removed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => s.functions.pop(),
      ],
      [
        "JWT changed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => (s.functions[0].verify_jwt = !s.functions[0].verify_jwt),
      ],
      [
        "status changed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => (s.functions[0].status = "THROTTLED"),
      ],
      [
        "generation changed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => s.functions[0].version++,
      ],
      [
        "deployed identifier changed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => (s.functions[0].id = "synthetic-replacement"),
      ],
      [
        "source metadata changed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => (s.functions[0].source_digest = "synthetic-new-source"),
      ],
      [
        "status removed",
        "FUNCTION_INVENTORY_DRIFT",
        (s) => delete s.functions[0].status,
      ],
      [
        "required secret missing",
        "CONFIGURATION_DRIFT",
        (s) => s.secrets.pop(),
      ],
      [
        "secret identity changed at same count",
        "CONFIGURATION_DRIFT",
        (s) => (s.secrets[0].name = "SYNTHETIC_DIFFERENT_CONFIG"),
      ],
      [
        "secret digest changed",
        "CONFIGURATION_DRIFT",
        (s) => (s.secrets[0].value = hash("synthetic-rotation")),
      ],
      [
        "site origin changed",
        "AUTH_CONFIGURATION_DRIFT",
        (s) => (s.auth.site_url = "https://changed.example.org"),
      ],
      [
        "callback changed",
        "AUTH_CONFIGURATION_DRIFT",
        (s) =>
          (s.auth.uri_allow_list += ",https://changed.example.org/callback"),
      ],
      [
        "signup changed",
        "AUTH_CONFIGURATION_DRIFT",
        (s) => (s.auth.disable_signup = true),
      ],
      [
        "other Auth setting changed",
        "AUTH_CONFIGURATION_DRIFT",
        (s) => (s.auth.jwt_exp = 999),
      ],
      [
        "multiple surfaces changed",
        "MULTIPLE_SURFACE_DRIFT",
        (s) => {
          s.functions[0].version++;
          s.secrets[0].value = hash("new");
          s.auth.site_url = "https://changed.example.org";
        },
      ],
    ];
    it.each(changes)(
      "blocks %s after opening the final mutation observation",
      async (_name, category, mutate) => {
        const { s, result, changed } = await harness({ mutate });
        expect(changed).toBe(true);
        expect(result.recovery.errorCode).toBe(category);
        expect(result.observationStability.stable).toBe(false);
        if (category === "MULTIPLE_SURFACE_DRIFT")
          expect(result.observationStability.categories).toEqual([
            "FUNCTION_INVENTORY_DRIFT",
            "CONFIGURATION_DRIFT",
            "AUTH_CONFIGURATION_DRIFT",
          ]);
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each([
      ["function", 12, changes[3][2], "FUNCTION_INVENTORY_DRIFT"],
      ["configuration", 13, changes[10][2], "CONFIGURATION_DRIFT"],
      ["Auth", 14, changes[12][2], "AUTH_CONFIGURATION_DRIFT"],
    ])(
      "blocks %s drift between closing reads",
      async (_name, tripRead, mutate, category) => {
        const { s, result } = await harness({
          tripRead: tripRead as number,
          mutate: mutate as any,
        });
        expect(result.recovery.errorCode).toBe(category);
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    const secretChanges: [string, (state: any) => void][] = [
      ["changed digest", (s) => (s.secrets[0].value = hash("rotation"))],
      [
        "added secret",
        (s) => s.secrets.push({ name: "ADDED", value: hash("added") }),
      ],
      ["removed secret", (s) => s.secrets.pop()],
      ["renamed secret", (s) => (s.secrets[0].name = "RENAMED")],
      [
        "timestamp only",
        (s) => (s.secrets[0].updated_at = "2026-10-05T10:00:00.123457Z"),
      ],
      ["timestamp disappears", (s) => delete s.secrets[0].updated_at],
      [
        "timestamp appears",
        (s) => (s.secrets.at(-1).updated_at = "2026-10-05T10:00:01Z"),
      ],
    ];
    it.each(
      secretChanges.flatMap(([name, mutate]) =>
        [10, 16].map((tripRead) => [name, tripRead, mutate] as const),
      ),
    )(
      "secrets compatibility blocks %s at read %s with zero mutation",
      async (_name, tripRead, mutate) => {
        const { s, result, changed } = await harness({ tripRead, mutate });
        expect(changed).toBe(true);
        expect(result.recovery.errorCode).toBe("CONFIGURATION_DRIFT");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it("accepts stable API ordering differences and completes a bounded baseline", async () => {
      const { s, result, reviewed } = await harness({ reorder: true });
      expect(result.status).toBe("complete");
      expect(mutationCalls(s)).toHaveLength(1);
      expect(s.count).toBe(184);
      expect(reviewed.stability.stable).toBe(true);
      expect(reviewed.authConfig).not.toHaveProperty("smtp_pass");
    });
    it("blocks a slow closing observation without resetting the opening clock", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        const { s, result } = await harness({ slowClosing: true });
        expect(result.recovery.errorCode).toBe("RELEASE_OBSERVATION_STALE");
        expect(mutationCalls(s)).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
    it("rechecks freshness after the final local authorization work", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        const { s, result } = await harness({ beforeMutationDelay: true });
        expect(result.recovery.errorCode).toBe("RELEASE_OBSERVATION_STALE");
        expect(mutationCalls(s)).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
    it("includes the final metadata confirmation in the original freshness budget", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        const { s, result } = await harness({ slowConfirmation: true });
        expect(result.recovery.errorCode).toBe("RELEASE_OBSERVATION_STALE");
        expect(mutationCalls(s)).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
    it.each(Object.keys(PHASES))(
      "protects the first mutation of %s, including resume",
      async (phase) => {
        const { s, result } = await harness({
          phase,
          tripRound: 2,
          mutate: changes[3][2],
        });
        expect(result.recovery.errorCode).toBe("FUNCTION_INVENTORY_DRIFT");
        expect(mutationCalls(s)).toHaveLength(0);
      },
    );
    it.each([184, 185])(
      "protects the isolated migration after the %s dry-run",
      async (count) => {
        const { s, result } = await harness({
          phase: "RETIREMENT_ACTIVATION_184_TO_186",
          armAfterDryRun: count,
          mutate: changes[10][2],
        });
        expect(result.recovery.errorCode).toBe("CONFIGURATION_DRIFT");
        expect(
          mutationCalls(s).filter((args) => args[0] === "db"),
        ).toHaveLength(count === 184 ? 0 : 1);
        expect(s.count).toBe(count);
      },
    );
    it("protects final billing activation after the 186 checkpoint", async () => {
      const { s, result } = await harness({
        phase: "RETIREMENT_ACTIVATION_184_TO_186",
        armAfterCheckpoint: "activation_checkpoint",
        mutate: changes[12][2],
      });
      expect(result.recovery.errorCode).toBe("AUTH_CONFIGURATION_DRIFT");
      // Fourteen containment deployments occurred under earlier stable snapshots;
      // no final business function deployment may follow the newly detected drift.
      expect(
        mutationCalls(s).filter((args) => args[0] === "functions"),
      ).toHaveLength(14);
    });
    it("protects the distinct final nonbilling substage", async () => {
      const { s, result } = await harness({
        phase: "RETIREMENT_ACTIVATION_184_TO_186",
        armAfterStep: "billing",
        mutate: changes[3][2],
      });
      expect(result.recovery.errorCode).toBe("FUNCTION_INVENTORY_DRIFT");
      expect(
        mutationCalls(s).filter((args) => args[0] === "functions"),
      ).toHaveLength(28);
      expect(s.count).toBe(186);
    });
    it("completes a stable cutover through containment, both checkpoints and final artifacts", async () => {
      const { s, result } = await harness({
        phase: "RETIREMENT_ACTIVATION_184_TO_186",
      });
      expect(result.status).toBe("complete");
      expect(s.count).toBe(186);
      expect(mutationCalls(s)).toHaveLength(32);
      expect(result.completedSteps).toContain("nonbilling");
      expect(result.observationStability.stable).toBe(true);
    });
    it("distinguishes null, absent and unknown status without discarding metadata", () => {
      const f = {
        name: "billing-create-paddle-checkout",
        version: 1,
        verify_jwt: true,
      };
      expect(normalizeFunctionInventory([f])).not.toEqual(
        normalizeFunctionInventory([{ ...f, status: null }]),
      );
      expect(
        normalizeFunctionInventory([{ ...f, status: "UNKNOWN" }])[0].status,
      ).toBe("UNKNOWN");
      expect(() =>
        normalizeFunctionInventory([{ ...f, status: undefined }]),
      ).toThrow("METADATA_INVALID");
    });
  },
);

describe("remote adapter boundaries with synthetic transport only", () => {
  function syntheticInventoryTransport(
    delay: number,
    drift = false,
    secrets: unknown = [],
    beforeRead?: (read: number) => void,
  ) {
    const facts = {
      versions: [],
      policy: { sales: false, reconciliation: false },
      functions: [],
      tables: ["example", ...WEBHOOK_HISTORY_TABLES].map((name) => ({
        name,
        acl: null,
        rls: true,
      })),
      schema: {},
    };
    let calls = 0;
    return vi.fn(async () => {
      calls++;
      if (delay) vi.setSystemTime(Date.now() + delay);
      const read = ((calls - 1) % 17) + 1;
      beforeRead?.(read);
      const position = read > 14 ? read - 13 : ((read - 1) % 7) + 1;
      const data =
        position === 1 || position === 7
          ? [
              {
                facts: {
                  ...facts,
                  versions: drift && calls === 7 ? ["99999999999999"] : [],
                },
              },
            ]
          : position === 2
            ? []
            : position === 3
              ? secrets
              : position === 4
                ? {
                    site_url: context.origin,
                    uri_allow_list: context.origin + "/auth/callback",
                    disable_signup: false,
                    mailer_autoconfirm: false,
                  }
                : position === 5
                  ? [{ history: { example: "unchanged" } }]
                  : [
                      {
                        work: { paddleWebhooks: 0 },
                        webhook_history: {
                          ...emptyWebhookTables(),
                          example: [],
                        },
                        scheduled: {
                          count: 0,
                          earliest: null,
                          invalidBoundaries: 0,
                        },
                      },
                    ];
      return new Response(JSON.stringify(data));
    });
  }
  async function observeSecrets(
    secrets: unknown,
    beforeRead?: (read: number) => void,
  ) {
    const base = syntheticInventoryTransport(0, false, secrets, beforeRead);
    const transport = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/secrets")) {
        // Interpretation of `value` is bound to this hosted GET endpoint.
        expect(url).toBe(
          `https://api.supabase.com/v1/projects/${context.project}/secrets`,
        );
        expect(options.method).toBe("GET");
      }
      return base();
    });
    return createRemoteAdapter(
      context,
      {
        STAGING_SUPABASE_PROJECT_REF: context.project,
        PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
      },
      transport,
    ).observe();
  }
  describe("secrets compatibility hosted GET normalization", () => {
    const component = "ab".repeat(32);
    const timestamp = "2026-10-05T10:00:00.123456Z";
    const valid = () => ({
      name: "SYNTHETIC_SECRET",
      value: component,
      updated_at: timestamp,
    });
    it("accepts the real shape while emitting only names and aggregate identity", async () => {
      const observation = await observeSecrets([valid()]);
      expect(observation.secretNames).toEqual(["SYNTHETIC_SECRET"]);
      expect(observation.secretDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(observation)).not.toContain(component);
      expect(JSON.stringify(observation)).not.toContain(timestamp);
      expect(observation).not.toHaveProperty("secrets");
      expect(observation).not.toHaveProperty("value");
    });
    it("accepts multiple records and omission with deterministic ordering", async () => {
      const records = [valid(), { name: "ANOTHER", value: hash("another") }];
      const opening = await observeSecrets(records);
      const reordered = await observeSecrets([...records].reverse());
      expect(opening.secretNames).toEqual(["ANOTHER", "SYNTHETIC_SECRET"]);
      expect(reordered.secretDigest).toBe(opening.secretDigest);
      const withinCycle = await observeSecrets(records, (read) => {
        if (read === 10 || read === 16) records.reverse();
      });
      expect(withinCycle.secretDigest).toBe(opening.secretDigest);
      expect(withinCycle.stability.stable).toBe(true);
    });
    it("preserves six-digit fractional precision in aggregate identity", async () => {
      const first = await observeSecrets([valid()]);
      const second = await observeSecrets([
        { ...valid(), updated_at: "2026-10-05T10:00:00.123457Z" },
      ]);
      expect(first.secretDigest).not.toBe(second.secretDigest);
    });
    it.each([
      "2024-02-29T23:59:59.123456+03:00",
      "2026-10-05T10:00:00-05:30",
      "2026-10-05T10:00:00Z",
    ])("accepts supported finite timestamp %s", async (updated_at) => {
      await expect(
        observeSecrets([{ ...valid(), updated_at }]),
      ).resolves.toHaveProperty("secretDigest");
    });
    const invalid: [string, unknown][] = [
      ["legacy digest", [{ name: "SECRET", digest: component }]],
      ["mixed digest/value", [{ ...valid(), digest: component }]],
      ["unexpected key", [{ ...valid(), extra: true }]],
      ["null record", [null]],
      ["array record", [[]]],
      ["string record", ["secret"]],
      ["missing name", [{ value: component }]],
      ["nonstring name", [{ ...valid(), name: 1 }]],
      ["empty name", [{ ...valid(), name: "" }]],
      ["padded name", [{ ...valid(), name: " SECRET " }]],
      ["control name", [{ ...valid(), name: "SECRET\u0000NAME" }]],
      ["C1 control name", [{ ...valid(), name: "SECRET\u0085NAME" }]],
      ["duplicate names", [valid(), valid()]],
      ["missing value", [{ name: "SECRET" }]],
      ["nonstring value", [{ ...valid(), value: 1 }]],
      ["short digest", [{ ...valid(), value: "ab" }]],
      ["uppercase digest", [{ ...valid(), value: component.toUpperCase() }]],
      ["nonhex digest", [{ ...valid(), value: "g".repeat(64) }]],
      ["padded digest", [{ ...valid(), value: " " + component }]],
      ["newline-padded digest", [{ ...valid(), value: component + "\n" }]],
      ["null timestamp", [{ ...valid(), updated_at: null }]],
      ["nonstring timestamp", [{ ...valid(), updated_at: 123 }]],
      ["invalid timestamp", [{ ...valid(), updated_at: "invalid" }]],
      [
        "newline-padded timestamp",
        [{ ...valid(), updated_at: timestamp + "\n" }],
      ],
      ["timezone absent", [{ ...valid(), updated_at: "2026-10-05T10:00:00" }]],
      [
        "invalid calendar day",
        [{ ...valid(), updated_at: "2026-02-29T10:00:00Z" }],
      ],
      ["invalid hour", [{ ...valid(), updated_at: "2026-10-05T24:00:00Z" }]],
      [
        "invalid timezone",
        [{ ...valid(), updated_at: "2026-10-05T10:00:00+24:00" }],
      ],
      ["unsupported date only", [{ ...valid(), updated_at: "2026-10-05" }]],
      ["CLI envelope", { secrets: [valid()] }],
      ["null response", null],
    ];
    it.each(invalid)("rejects %s fail closed", async (_name, records) => {
      await expect(observeSecrets(records)).rejects.toThrow(
        /^RELEASE_SECRET_INVENTORY_INVALID$/,
      );
    });
    it("does not disclose a fictional plaintext canary in errors or observation", async () => {
      const canary = "fictional-plaintext-private-canary";
      const result = await observeSecrets([
        { ...valid(), value: canary },
      ]).catch((error: Error) => error);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe(
        "RELEASE_SECRET_INVENTORY_INVALID",
      );
      expect(String(result)).not.toContain(canary);
      expect((result as Error).stack).not.toContain(canary);
      expect(JSON.stringify(result)).not.toContain(canary);
      const safe = await observeSecrets([valid()]);
      expect(JSON.stringify(safe)).not.toContain(canary);
    });
    it("binds digest, timestamp value and presence without emitting components", async () => {
      const inventories = [
        [valid()],
        [{ ...valid(), value: hash("new-component") }],
        [{ name: valid().name, value: component }],
        [{ ...valid(), updated_at: "2026-10-05T10:00:01.123456Z" }],
      ];
      const observations = await Promise.all(
        inventories.map((records) => observeSecrets(records)),
      );
      expect(new Set(observations.map((o) => o.secretDigest)).size).toBe(4);
      for (const o of observations) {
        expect(JSON.stringify(o)).not.toContain(component);
        expect(JSON.stringify(o)).not.toContain(hash("new-component"));
      }
    });
    it.each([10, 16])(
      "blocks timestamp appearance at read %s",
      async (tripRead) => {
        const records: { name: string; value: string; updated_at?: string }[] =
          [{ name: "SECRET", value: component }];
        await expect(
          observeSecrets(records, (read) => {
            if (read === tripRead) records[0].updated_at = timestamp;
          }),
        ).rejects.toThrow("CONFIGURATION_DRIFT");
      },
    );
    it.each([60_000, 60_001])(
      "retains the opening timestamp and 60-second boundary at %s ms",
      async (elapsed) => {
        expect(OBSERVATION_MAX_AGE_MS).toBe(60_000);
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        try {
          const pending = observeSecrets([valid()], (read) => {
            if (read === 17) vi.setSystemTime(NOW + elapsed);
          });
          if (elapsed > OBSERVATION_MAX_AGE_MS)
            await expect(pending).rejects.toThrow("RELEASE_OBSERVATION_STALE");
          else {
            const observation = await pending;
            expect(Date.parse(observation.observedAt)).toBe(NOW);
            expect(
              Date.parse(observation.stability.completedAt) -
                Date.parse(observation.observedAt),
            ).toBe(elapsed);
          }
        } finally {
          vi.useRealTimers();
        }
      },
    );
  });
  it.each([0, 2000, 20000])(
    "measures the oldest read with %s ms per request",
    async (delay) => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        const a = createRemoteAdapter(
          context,
          {
            STAGING_SUPABASE_PROJECT_REF: context.project,
            PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
          },
          syntheticInventoryTransport(delay),
        );
        if (delay === 20000)
          await expect(a.observe()).rejects.toThrow("OBSERVATION_STALE");
        else {
          const o = await a.observe();
          expect(Date.parse(o.observedAt)).toBe(NOW);
          expect(Date.now() - Date.parse(o.observedAt)).toBe(17 * delay);
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it("rejects database drift during an otherwise fresh observation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const a = createRemoteAdapter(
        context,
        {
          STAGING_SUPABASE_PROJECT_REF: context.project,
          PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
        },
        syntheticInventoryTransport(1, true),
      );
      await expect(a.observe()).rejects.toThrow("DATABASE_DRIFT");
    } finally {
      vi.useRealTimers();
    }
  });
  it("does not mutate when real observation collection exceeds the age budget", async () => {
    const s = simulation(180),
      a = authorization("BASELINE_180_TO_184", s);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const real = createRemoteAdapter(
        context,
        {
          STAGING_SUPABASE_PROJECT_REF: context.project,
          PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
        },
        syntheticInventoryTransport(20000),
      );
      const r = await runRelease(
        {
          phase: "BASELINE_180_TO_184",
          mode: "apply",
          authorization: a,
          context,
          identity,
          contracts,
        },
        { ...real, command: s.adapter.command },
        { now: Date.now, currentIdentity: () => identity },
      );
      expect(r.recovery.errorCode).toBe("RELEASE_OBSERVATION_STALE");
      expect(s.adapter.command).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([1, undefined, -1, "0"])(
    "rejects invalid or missing scheduled-boundary evidence %s",
    (invalidBoundaries) => {
      expect(() =>
        assertScheduled(
          {
            facts: {
              scheduled: {
                count: 2,
                earliest: "2099-01-01T00:00:00Z",
                invalidBoundaries,
              },
            },
          },
          {
            operational: { scheduledOperationsCount: 2 },
            expiresAt: iso(60000),
          },
        ),
      ).toThrow("SCHEDULED_BOUNDARY");
    },
  );
  it("accepts completely dated future schedules and queries invalid dates explicitly", () => {
    expect(() =>
      assertScheduled(
        {
          facts: {
            scheduled: {
              count: 2,
              earliest: "2099-01-01T00:00:00Z",
              invalidBoundaries: 0,
            },
          },
        },
        { operational: { scheduledOperationsCount: 2 }, expiresAt: iso(60000) },
      ),
    ).not.toThrow();
    expect(workQuery(true)).toContain(
      "effective_at is null or not isfinite(effective_at)",
    );
  });
  it("never requests production from inventory or handler probes", async () => {
    const transport = vi.fn();
    const a = createRemoteAdapter(
      { ...context, project: context.productionProject },
      {
        STAGING_SUPABASE_PROJECT_REF: context.project,
        PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
      },
      transport,
    );
    await expect(a.observe()).rejects.toThrow("PROJECT_BOUNDARY");
    await expect(a.probe(LS_TOMBSTONES[0])).rejects.toThrow("PROJECT_BOUNDARY");
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([401, 200, 503])(
    "rejects gateway/non-tombstone response %s",
    async (status) => {
      const transport = vi.fn(
        async () =>
          new Response(JSON.stringify({ code: "BILLING_PROVIDER_RETIRED" }), {
            status,
          }),
      );
      const a = createRemoteAdapter(
        context,
        {
          STAGING_SUPABASE_PROJECT_REF: context.project,
          PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
          STAGING_TOMBSTONE_PROBE_JWT: "synthetic-only",
        },
        transport,
      );
      await expect(a.probe(LS_TOMBSTONES[0])).rejects.toThrow("PROBE_FAILED");
    },
  );
  it("allows only the three approved inert tombstone probes", async () => {
    const transport = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "BILLING_PROVIDER_RETIRED" }), {
          status: 410,
        }),
    );
    const a = createRemoteAdapter(
      context,
      {
        STAGING_SUPABASE_PROJECT_REF: context.project,
        PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
        STAGING_TOMBSTONE_PROBE_JWT: "synthetic-only",
      },
      transport,
    );
    await a.probe(LS_TOMBSTONES[0]);
    await expect(a.probe("billing-create-paddle-checkout")).rejects.toThrow(
      "ALLOWLIST",
    );
    expect(transport).toHaveBeenCalledOnce();
  });
  it("rejects table-name interpolation outside the fixed SELECT inventory", () => {
    expect(() =>
      historyQuery(["billing_accounts;delete from auth.users"]),
    ).toThrow();
  });
});

// Fictional retained rows only: no staging/provider identifiers or secret values.
function webhookFixture(
  alias: string,
  kind = "transaction.completed",
  shape = "archive",
) {
  const t = emptyWebhookTables(),
    eventId = `event-${alias}`;
  const raw = hash(`serialized-payload-${alias}`),
    observationSha = hash(`pg-observation-${alias}`);
  const transaction = `transaction-${alias}`,
    subscription = `subscription-${alias}`,
    customer = `customer-${alias}`;
  const event = {
    id: eventId,
    provider: "paddle",
    environment: "test",
    provider_event_ref: `ref-${alias}`,
    provider_event_name: kind,
    resource_type: kind.startsWith("transaction")
      ? "transaction"
      : "subscription",
    resource_ref: kind.startsWith("transaction") ? transaction : subscription,
    subscription_ref: subscription,
    customer_ref: customer,
    processing_status: "deferred",
    first_payload_sha256: raw,
    occurred_at: "2026-09-20T10:00:00Z",
    attempt_count: 0,
  };
  t.billing_webhook_events_v2.push(event);
  const observation = {
    event_id: eventId,
    checkout_id: shape === "archive" ? null : `checkout-${alias}`,
    disposition: "pending",
    observation_sha256: observationSha,
    __release_content_sha256: observationSha,
    observation: {
      provider: "paddle",
      environment: "test",
      eventRef: event.provider_event_ref,
      eventType: kind,
      kind,
      subscriptionRef: subscription,
      customerRef: customer,
      ...(kind === "transaction.completed"
        ? { transactionRef: transaction }
        : {
            transactionCorrelationRef: shape === "archive" ? null : transaction,
          }),
      items: [{ priceRef: "same-fixture-price" }],
    },
  };
  t.billing_paddle_event_observations.push(observation);
  const verifiedSha = hash(`pg-proof-${alias}`);
  t.billing_paddle_event_deliveries.push({
    event_id: eventId,
    notification_ref: `notification-${alias}`,
    raw_payload_sha256: raw,
    verified_evidence_id: `verified-${alias}`,
  });
  t.billing_verified_evidence_v2.push({
    id: `verified-${alias}`,
    provider: "paddle",
    environment: "test",
    provider_event_ref: event.provider_event_ref,
    provider_notification_ref: `notification-${alias}`,
    proof_kind: "event",
    source_kind: "webhook",
    raw_payload_sha256: raw,
    normalized_sha256: verifiedSha,
    __release_content_sha256: verifiedSha,
    payment_authority: false,
    subscription_id: null,
    billing_account_id: null,
    commercial_effect_key: null,
    proof: {
      identity: { subscriptionRef: subscription, customerRef: customer },
      eventEvidence: {
        eventRef: event.provider_event_ref,
        eventName: kind,
        resourceType: event.resource_type,
        resourceRef: event.resource_ref,
      },
    },
  });
  if (shape !== "archive") {
    const account = `account-${alias}`,
      sid = `shadow-${alias}`;
    t.billing_customers_v2.push({
      id: `customer-row-${alias}`,
      billing_account_id: account,
      provider: "paddle",
      environment: "test",
      provider_customer_ref: customer,
    });
    t.billing_subscriptions_v2.push({
      id: sid,
      customer_id: `customer-row-${alias}`,
      billing_account_id: account,
      provider: "paddle",
      environment: "test",
      provider_subscription_ref: subscription,
      account_subscription_id:
        shape === "applied" ? `canonical-${alias}` : null,
      approved_additional_coach_seats: 0,
      reconciliation_status: shape === "applied" ? "processed" : "pending",
    });
    t.billing_checkouts_v2.push({
      id: `checkout-${alias}`,
      provider: "paddle",
      environment: "test",
      billing_account_id: account,
      provider_transaction_ref: transaction,
      status: shape === "applied" ? "completed" : "expired",
      completed_subscription_id: shape === "applied" ? sid : null,
      completed_at: shape === "applied" ? "2026-09-20T10:00:01Z" : null,
    });
    if (shape === "fixture")
      t.billing_paddle_checkout_certification_fixtures.push({
        run_id: `run-${alias}`,
        checkout_id: `checkout-${alias}`,
        closed_at: "2026-09-20T11:00:00Z",
      });
    if (shape === "applied") {
      const peerKind =
        kind === "transaction.completed"
          ? "subscription.created"
          : "transaction.completed";
      const peer = {
        ...event,
        id: `peer-${alias}`,
        provider_event_ref: `peer-ref-${alias}`,
        provider_event_name: peerKind,
        resource_type:
          peerKind === "transaction.completed" ? "transaction" : "subscription",
        resource_ref:
          peerKind === "transaction.completed" ? transaction : subscription,
        first_payload_sha256: hash(`peer-payload-${alias}`),
        processing_status: "processed",
      };
      t.billing_webhook_events_v2.push(peer);
      const peerObservation = structuredClone(observation);
      peerObservation.event_id = peer.id;
      peerObservation.observation.eventRef = peer.provider_event_ref;
      peerObservation.observation.kind = peerKind;
      peerObservation.observation.eventType = peerKind;
      delete peerObservation.observation.transactionRef;
      delete peerObservation.observation.transactionCorrelationRef;
      peerObservation.observation[
        peerKind === "transaction.completed"
          ? "transactionRef"
          : "transactionCorrelationRef"
      ] = transaction;
      peerObservation.observation_sha256 = hash(`peer-observation-${alias}`);
      peerObservation.__release_content_sha256 =
        peerObservation.observation_sha256;
      t.billing_paddle_event_observations.push(peerObservation);
      const peerReceipt = structuredClone(t.billing_verified_evidence_v2[0]);
      peerReceipt.id = `peer-receipt-${alias}`;
      peerReceipt.provider_event_ref = peer.provider_event_ref;
      peerReceipt.provider_notification_ref = `peer-notification-${alias}`;
      peerReceipt.raw_payload_sha256 = peer.first_payload_sha256;
      peerReceipt.normalized_sha256 = hash(`peer-proof-${alias}`);
      peerReceipt.__release_content_sha256 = peerReceipt.normalized_sha256;
      peerReceipt.proof.eventEvidence = {
        eventRef: peer.provider_event_ref,
        eventName: peerKind,
        resourceRef: peer.resource_ref,
        resourceType: peer.resource_type,
      };
      t.billing_verified_evidence_v2.push(peerReceipt);
      t.billing_paddle_event_deliveries.push({
        event_id: peer.id,
        notification_ref: peerReceipt.provider_notification_ref,
        raw_payload_sha256: peer.first_payload_sha256,
        verified_evidence_id: peerReceipt.id,
      });
      t.billing_payment_applications_v2.push({
        id: `payment-${alias}`,
        provider: "paddle",
        environment: "test",
        provider_transaction_ref: transaction,
        billing_account_id: account,
        subscription_id: sid,
        checkout_id: `checkout-${alias}`,
        evidence_id: `application-evidence-${alias}`,
        application_kind: "initial_purchase",
        operation_id: null,
        applied_at: "2026-09-20T10:00:01Z",
      });
      t.billing_evidence_v2.push({
        id: `application-evidence-${alias}`,
        provider_transaction_ref: transaction,
        subscription_id: sid,
        provider: "paddle",
        environment: "test",
        proof_kind: "transaction",
        proof_schema: "paddle-initial-purchase-v1",
        normalized_sha256: hash(`application-proof-${alias}`),
        __release_content_sha256: hash(`application-proof-${alias}`),
        proof: {
          identity: { transactionRef: transaction },
          observation: {
            checkoutId: `checkout-${alias}`,
            subscriptionId: sid,
            billingAccountId: account,
            transactionEventId:
              kind === "transaction.completed" ? eventId : peer.id,
            subscriptionEventId:
              kind === "transaction.completed" ? peer.id : eventId,
            transactionVerifiedEvidenceId:
              kind === "transaction.completed"
                ? `verified-${alias}`
                : peerReceipt.id,
            subscriptionVerifiedEvidenceId:
              kind === "transaction.completed"
                ? peerReceipt.id
                : `verified-${alias}`,
            transactionObservationSha256:
              kind === "transaction.completed"
                ? observationSha
                : peerObservation.observation_sha256,
            subscriptionObservationSha256:
              kind === "transaction.completed"
                ? peerObservation.observation_sha256
                : observationSha,
          },
        },
      });
      t.account_subscriptions.push({
        id: `canonical-${alias}`,
        billing_account_id: account,
        status: "active",
        subscription_kind: "paid",
        source: "billing_provider",
      });
      t.billing_canonical_origins.push({
        account_subscription_id: `canonical-${alias}`,
        billing_account_id: account,
        storage_contract: "billing.v2",
      });
    }
  }
  for (const rows of Object.values(t))
    for (const row of rows) row.__release_row_sha256 = evidenceDigest(row);
  return t;
}
function historyReview(tables: Record<string, any[]>, kinds: string[] = []) {
  for (const rows of Object.values(tables))
    for (const row of rows)
      row.__release_row_sha256 = evidenceDigest(
        Object.fromEntries(
          Object.entries(row).filter(([k]) => k !== "__release_row_sha256"),
        ),
      );
  return {
    schemaVersion: 1,
    evidenceSha256: hash("independently-reviewed-private-evidence"),
    records: inspectWebhookHistory(tables).map((i: any, index: number) => {
      const kind = kinds[index] ?? "archived_synthetic";
      return {
        eventSha256: i.eventSha256,
        inputsSha256: i.inputsSha256,
        classification:
          kind === "applied_purchase"
            ? "HISTORICAL_COMPLETED_OR_SUPERSEDED"
            : "SYNTHETIC_TEST_HISTORY",
        provenance:
          kind === "archived_synthetic"
            ? {
                kind,
                sourceArtifactSha256: hash("archived-harness-source"),
                reconstructionArtifactSha256: hash(
                  "exact-reconstruction-output",
                ),
                reconstructedPayloadSha256: i.payloadSha256,
              }
            : { kind },
      };
    }),
  };
}
function expectBlockedHistory(t: Record<string, any[]>, review: any) {
  const report = classifyWebhookHistory(t, review);
  expect(
    report.activeBlockingWebhookCount + report.missingReviewedCount,
  ).toBeGreaterThan(0);
  return report;
}
describe("evidence-bound historical webhook drain", () => {
  it.each([
    "override-expired",
    "override-revoked",
    "capacity-released",
    "capacity-expired",
  ])(
    "retains conclusively ended account history without live authority: %s",
    (kind) => {
      const t = webhookFixture("ended-safe", "subscription.created", "fixture");
      const { table, row } = lifecycleAuthority(
        kind,
        t.billing_checkouts_v2[0].billing_account_id,
      );
      t[table].push(row);
      const review = historyReview(t, ["closed_fixture"]),
        before = evidenceDigest(t);
      expect(classifyWebhookHistory(t, review).historicalSafeWebhookCount).toBe(
        1,
      );
      expect(evidenceDigest(t)).toBe(before);
      row.reason = "changed-retained-history";
      expectBlockedHistory(t, review);
    },
  );
  it.each([
    ["override", "expires_at", null],
    ["override", "expires_at", "2026-09-20T09:59:59.999999Z"],
    ["override", "expires_at", "2026-02-30T10:00:00Z"],
    ["override", "starts_at", null],
    ["override", "revoked_at", undefined],
    ["override", "effect", "superseded"],
    ["override", "expires_at", "infinity"],
    ["override", "expires_at", "-infinity"],
    ["capacity", "status", "superseded"],
    ["capacity", "quantity", 0],
    ["capacity", "expires_at", null],
    ["capacity", "expired_at", "2026-09-20T10:04:59.999999Z"],
    ["capacity", "expired_at", "2026-09-20T10:05:00.000002Z"],
    ["capacity", "released_at", "2026-09-20T10:05:00Z"],
    ["capacity", "expired_at", "infinity"],
    ["capacity", "expired_at", "2026-09-20T10:05:00.0000001Z"],
  ])(
    "fails closed on ambiguous account lifecycle: %s/%s/%s",
    (type, key, value) => {
      const { row } = lifecycleAuthority(
        type === "override" ? "override-expired" : "capacity-expired",
        "account",
      );
      if (value === undefined) delete row[key as string];
      else row[key as string] = value;
      expect(
        type === "override"
          ? isEffectiveEntitlementAuthority(row)
          : isEffectiveCapacityAuthority(row),
      ).toBe(true);
    },
  );
  it("preserves microsecond ordering across equivalent timezones", () => {
    const { row } = lifecycleAuthority("override-expired", "account");
    row.starts_at = "2026-09-20T13:00:00.000000+03:00";
    row.expires_at = "2026-09-20T10:00:00.000001Z";
    expect(isEffectiveEntitlementAuthority(row)).toBe(false);
    row.starts_at = "2026-09-20T13:00:00.000001+03:00";
    expect(isEffectiveEntitlementAuthority(row)).toBe(true);
  });
  it.each(fixtureAuthorityTables)(
    "requires the database lifecycle proof instead of status alone: %s",
    (table) => {
      const { row } = lifecycleAuthority(
        table === fixtureAuthorityTables[0]
          ? "override-revoked"
          : "capacity-released",
        "account",
      );
      delete row.__release_authority_lifecycle;
      expect(
        table === fixtureAuthorityTables[0]
          ? isEffectiveEntitlementAuthority(row)
          : isEffectiveCapacityAuthority(row),
      ).toBe(true);
    },
  );
  it("captures full-precision effective state in the same database snapshot", () => {
    const sql = webhookHistoryQuery(WEBHOOK_HISTORY_TABLES);
    expect(sql).toContain("__release_authority_lifecycle");
    expect(sql).toContain("t.expires_at<=transaction_timestamp()");
    expect(sql).toContain("t.expired_at>=t.expires_at");
    expect(sql).not.toMatch(/date_trunc|::date|delete|update |insert /i);
  });
  it.each([
    ["W01", "transaction.completed"],
    ["W02", "subscription.created"],
    ["W03", "subscription.updated"],
    ["W18", "subscription.updated"],
  ])("accepts exact archived provenance for %s", (alias, kind) => {
    const t = webhookFixture(alias, kind),
      review = historyReview(t);
    const original = structuredClone(t);
    const report = classifyWebhookHistory(t, review);
    expect(report.activeBlockingWebhookCount).toBe(0);
    expect(report.historicalSafeWebhookCount).toBe(1);
    expect(report.records[0].reason).toBe("ARCHIVED_EXACT_RECONSTRUCTION");
    expect(t).toEqual(original);
    expect(JSON.stringify(report)).not.toContain(`event-${alias}`);
  });
  it.each(["W01", "W02", "W03", "W18"])(
    "blocks payload or evidence tampering for %s",
    (alias) => {
      for (const mutate of [
        (t: any) =>
          (t.billing_webhook_events_v2[0].first_payload_sha256 =
            hash("changed")),
        (t: any) =>
          (t.billing_paddle_event_deliveries[0].raw_payload_sha256 =
            hash("changed")),
        (t: any) =>
          (t.billing_paddle_event_observations[0].observation_sha256 =
            hash("changed")),
        (t: any) =>
          (t.billing_verified_evidence_v2[0].normalized_sha256 =
            hash("changed")),
      ]) {
        const t = webhookFixture(alias),
          a = historyReview(t);
        mutate(t);
        expectBlockedHistory(t, a);
        expectBlockedHistory(t, historyReview(t));
      }
    },
  );
  it.each([
    "checkout",
    "payment",
    "owner",
    "canonical",
    "successor",
    "entitlement",
    "capacity",
    "unknownTable",
  ])(
    "blocks newly discovered %s authority, including with a refreshed review",
    (category) => {
      const t = webhookFixture(category),
        a = historyReview(t),
        event = t.billing_webhook_events_v2[0];
      if (category === "checkout")
        t.billing_checkouts_v2.push({
          id: "new",
          provider: "paddle",
          environment: "test",
          provider_transaction_ref: event.resource_ref,
          billing_account_id: "owner",
          status: "ambiguous",
        });
      else if (category === "payment")
        t.billing_payment_applications_v2.push({
          provider_transaction_ref: event.resource_ref,
          provider: "paddle",
          environment: "test",
        });
      else if (category === "owner")
        t.billing_customers_v2.push({
          id: "new",
          provider: "paddle",
          environment: "test",
          provider_customer_ref: event.customer_ref,
          billing_account_id: "owner",
        });
      else
        t[`authority_${category}`] = [
          { reference: event.subscription_ref, unresolved: true },
        ];
      expectBlockedHistory(t, a);
      expectBlockedHistory(t, historyReview(t));
    },
  );
  it.each(["W02", "W18"])(
    "blocks changed customer/subscription identity for %s",
    (alias) => {
      for (const key of ["customerRef", "subscriptionRef"]) {
        const t = webhookFixture(alias),
          a = historyReview(t);
        t.billing_paddle_event_observations[0].observation[key] =
          "changed-identity";
        expectBlockedHistory(t, a);
        expectBlockedHistory(t, historyReview(t));
      }
    },
  );
  it("accepts the W01/W02/W03 shared synthetic lineage without granting its resource authority", () => {
    const t = emptyWebhookTables();
    for (const [alias, kind] of [
      ["W01", "transaction.completed"],
      ["W02", "subscription.created"],
      ["W03", "subscription.updated"],
    ]) {
      const f = webhookFixture(alias, kind);
      f.billing_webhook_events_v2[0].subscription_ref = "shared-S2";
      if (kind !== "transaction.completed")
        f.billing_webhook_events_v2[0].resource_ref = "shared-S2";
      f.billing_verified_evidence_v2[0].proof.eventEvidence.resourceRef =
        f.billing_webhook_events_v2[0].resource_ref;
      f.billing_webhook_events_v2[0].customer_ref = "shared-C2";
      f.billing_paddle_event_observations[0].observation.subscriptionRef =
        "shared-S2";
      f.billing_paddle_event_observations[0].observation.customerRef =
        "shared-C2";
      f.billing_verified_evidence_v2[0].proof.identity = {
        subscriptionRef: "shared-S2",
        customerRef: "shared-C2",
      };
      for (const key of Object.keys(t)) t[key].push(...f[key]);
    }
    const a = historyReview(t);
    expect(classifyWebhookHistory(t, a).historicalSafeWebhookCount).toBe(3);
    t.billing_subscriptions_v2.push({
      id: "successor",
      provider: "paddle",
      environment: "test",
      provider_subscription_ref: "shared-S2",
      billing_account_id: "unexpected-owner",
      account_subscription_id: "canonical",
      approved_additional_coach_seats: 1,
    });
    expect(classifyWebhookHistory(t, a).activeBlockingWebhookCount).toBe(3);
  });
  it.each([
    "timing",
    "fixturePrice",
    "testEnvironment",
    "syntheticName",
    "manualReview",
    "deferred",
    "unknownPrice",
    "old",
  ])("does not infer W18 safety from %s", (hint) => {
    const t = webhookFixture("W18");
    if (hint === "manualReview")
      t.billing_webhook_events_v2[0].processing_status = "manual_review";
    if (hint === "old")
      t.billing_webhook_events_v2[0].occurred_at = "2000-01-01T00:00:00Z";
    if (hint === "timing" || hint === "fixturePrice")
      t.billing_paddle_checkout_certification_fixtures.push({
        checkout_id: "unrelated",
        closed_at: "2026-09-20T10:00:00Z",
        priceRef: "same-fixture-price",
      });
    expectBlockedHistory(t, EMPTY_WEBHOOK_REVIEW);
  });
  it.each([
    "missingDelivery",
    "missingObservation",
    "missingDigest",
    "wrongProof",
    "conflictingReceipt",
    "duplicateReceipt",
    "wrongEnvironment",
    "unsupportedEvent",
    "unknownProvenance",
  ])("blocks incomplete or unsupported %s", (category) => {
    const t = webhookFixture(category),
      a: any = historyReview(t);
    if (category === "missingDelivery") t.billing_paddle_event_deliveries = [];
    if (category === "missingObservation")
      t.billing_paddle_event_observations = [];
    if (category === "missingDigest")
      delete t.billing_paddle_event_deliveries[0].raw_payload_sha256;
    if (category === "wrongProof")
      t.billing_verified_evidence_v2[0].proof_kind = "transaction";
    if (category === "conflictingReceipt")
      t.billing_verified_evidence_v2[0].proof.identity.customerRef =
        "contradiction";
    if (category === "duplicateReceipt")
      t.billing_verified_evidence_v2.push({
        ...t.billing_verified_evidence_v2[0],
        id: "another",
      });
    if (category === "wrongEnvironment")
      t.billing_webhook_events_v2[0].environment = "live";
    if (category === "unsupportedEvent")
      t.billing_webhook_events_v2[0].provider_event_name = "unknown.event";
    if (category === "unknownProvenance") {
      a.records[0].provenance = { kind: "label_only" };
      expect(() => classifyWebhookHistory(t, a)).toThrow("REVIEW_INVALID");
      return;
    }
    expectBlockedHistory(t, a);
  });
  it.each(["closed", "expired", "supersededShadow"])(
    "accepts reviewed closed fixture history %s",
    (shape) => {
      const t = webhookFixture(shape, "subscription.updated", "fixture");
      if (shape === "supersededShadow")
        t.billing_subscriptions_v2[0].shadow_status = "superseded";
      const r = classifyWebhookHistory(t, historyReview(t, ["closed_fixture"]));
      expect(r.historicalSafeWebhookCount).toBe(1);
      expect(r.records[0].reason).toBe("CLOSED_FIXTURE");
    },
  );
  it.each([
    "openFixture",
    "canonicalEffect",
    "seatAuthority",
    "payment",
    "activeOperation",
    "ambiguousCheckout",
    "unrecognizedEffect",
  ])("blocks unsafe closed-fixture pattern %s", (category) => {
    const t = webhookFixture(category, "subscription.created", "fixture"),
      a = historyReview(t, ["closed_fixture"]);
    if (category === "openFixture")
      t.billing_paddle_checkout_certification_fixtures[0].closed_at = null;
    if (category === "canonicalEffect")
      t.billing_subscriptions_v2[0].account_subscription_id = "canonical";
    if (category === "seatAuthority")
      t.billing_subscriptions_v2[0].approved_additional_coach_seats = 1;
    if (category === "payment")
      t.billing_payment_applications_v2.push({
        checkout_id: t.billing_checkouts_v2[0].id,
      });
    if (category === "activeOperation")
      t.billing_operations_v2.push({
        billing_account_id: `account-${category}`,
        status: "provider_pending",
      });
    if (category === "ambiguousCheckout")
      t.billing_checkouts_v2[0].status = "ambiguous";
    if (category === "unrecognizedEffect") {
      const reservation = fixtureAccountAuthority(
        "account_capacity_reservations",
        `account-${category}`,
      );
      t.account_capacity_reservations.push(reservation);
      t.account_capacity_events = [
        {
          billing_account_id: reservation.billing_account_id,
          reservation_id: reservation.id,
        },
      ];
    }
    expectBlockedHistory(t, a);
    expectBlockedHistory(t, historyReview(t, ["closed_fixture"]));
  });
  it.each(fixtureAuthorityTables)(
    "blocks account-scoped closed-fixture effects with a refreshed review: %s",
    (table) => {
      const t = webhookFixture(
        "owner-effect",
        "subscription.updated",
        "fixture",
      );
      const previous = historyReview(t, ["closed_fixture"]);
      t[table].push(
        fixtureAccountAuthority(
          table,
          t.billing_checkouts_v2[0].billing_account_id,
        ),
      );
      expectBlockedHistory(t, previous);
      const review = historyReview(t, ["closed_fixture"]);
      const report = expectBlockedHistory(t, review);
      expect(report.records[0].reason).toBe("AUTHORITY_OR_PROVENANCE_UNPROVEN");
      // review construction refreshes row hash metadata; classification changes no rows.
      const reviewed = evidenceDigest(t);
      classifyWebhookHistory(t, review);
      expect(evidenceDigest(t)).toBe(reviewed);
    },
  );
  it.each(fixtureAuthorityTables)(
    "requires the account-authority snapshot table: %s",
    (table) => {
      const t = webhookFixture(
        "missing-authority-table",
        "subscription.created",
        "fixture",
      );
      const review = historyReview(t, ["closed_fixture"]);
      delete t[table];
      expect(() => classifyWebhookHistory(t, review)).toThrow(
        "RELEASE_WEBHOOK_SNAPSHOT_INVALID",
      );
      expect(() => webhookHistoryQuery(Object.keys(t))).toThrow(
        "RELEASE_WEBHOOK_TABLE_MISSING",
      );
    },
  );
  it.each(fixtureAuthorityTables)(
    "checks account authority through a peer fixture checkout: %s",
    (table) => {
      const t = webhookFixture("peer-owner", "subscription.updated", "fixture");
      const observation = t.billing_paddle_event_observations[0];
      t.billing_paddle_event_observations.push({
        ...structuredClone(observation),
        event_id: "peer-fixture-event",
      });
      observation.checkout_id = null;
      observation.observation.transactionCorrelationRef = null;
      t.billing_customers_v2 = [];
      t.billing_subscriptions_v2 = [];
      expect(
        classifyWebhookHistory(t, historyReview(t, ["closed_fixture"]))
          .historicalSafeWebhookCount,
      ).toBe(1);
      t[table].push(
        fixtureAccountAuthority(
          table,
          t.billing_checkouts_v2[0].billing_account_id,
        ),
      );
      expectBlockedHistory(t, historyReview(t, ["closed_fixture"]));
    },
  );
  it.each([null, undefined, "conflicting-account"])(
    "blocks incomplete or conflicting fixture account identity: %s",
    (account) => {
      const t = webhookFixture(
        "owner-conflict",
        "subscription.created",
        "fixture",
      );
      if (account === undefined)
        delete t.billing_checkouts_v2[0].billing_account_id;
      else t.billing_checkouts_v2[0].billing_account_id = account;
      expectBlockedHistory(t, historyReview(t, ["closed_fixture"]));
    },
  );
  it.each(fixtureAuthorityTables)(
    "does not infer closed-fixture authority clearance from terminal metadata: %s",
    (table) => {
      const t = webhookFixture(
        "ended-owner-effect",
        "subscription.created",
        "fixture",
      );
      const row = fixtureAccountAuthority(
        table,
        t.billing_checkouts_v2[0].billing_account_id,
      );
      if (table === "account_capacity_reservations")
        Object.assign(row, {
          status: "released",
          released_at: "2026-09-20T10:04:00Z",
        });
      else Object.assign(row, { revoked_at: "2026-09-20T10:04:00Z" });
      t[table].push(row);
      expectBlockedHistory(t, historyReview(t, ["closed_fixture"]));
    },
  );
  it.each(fixtureAuthorityTables)(
    "preserves applied-purchase history with account effects: %s",
    (table) => {
      const t = webhookFixture(
        "applied-owner-effect",
        "subscription.created",
        "applied",
      );
      t[table].push(
        fixtureAccountAuthority(
          table,
          t.billing_checkouts_v2[0].billing_account_id,
        ),
      );
      expect(
        classifyWebhookHistory(t, historyReview(t, ["applied_purchase"]))
          .historicalSafeWebhookCount,
      ).toBe(1);
    },
  );
  it.each(["active", "expired", "superseded"])(
    "accepts unique applied purchase with %s canonical history",
    (status) => {
      const t = webhookFixture(status, "subscription.created", "applied");
      t.account_subscriptions[0].status = status;
      if (status === "superseded") {
        t.account_subscriptions[0].superseded_at = "2026-09-21T00:00:00Z";
        t.account_subscriptions[0].superseded_by_subscription_id = "successor";
        t.account_subscriptions.push({
          ...t.account_subscriptions[0],
          id: "successor",
          status: "active",
          superseded_at: null,
          superseded_by_subscription_id: null,
        });
        t.billing_canonical_origins.push({
          ...t.billing_canonical_origins[0],
          account_subscription_id: "successor",
        });
      }
      expect(
        classifyWebhookHistory(t, historyReview(t, ["applied_purchase"]))
          .historicalSafeWebhookCount,
      ).toBe(1);
    },
  );
  it.each([
    "missingPayment",
    "duplicatePayment",
    "incompleteCheckout",
    "wrongSubscription",
    "missingCanonical",
    "missingOrigin",
    "missingApplicationEvidence",
    "wrongAccount",
    "busyOperation",
    "missingSourceEvent",
    "missingSourceObservation",
    "missingSourceReceipt",
    "missingSourceDelivery",
    "wrongSourceDigest",
    "contradictorySourceIdentity",
    "contradictorySourceReceipt",
    "orphanedSupersession",
    "cyclicSupersession",
    "foreignSupersession",
  ])("blocks incomplete applied history %s", (category) => {
    const t = webhookFixture(category, "subscription.created", "applied"),
      a = historyReview(t, ["applied_purchase"]);
    if (category === "missingPayment") t.billing_payment_applications_v2 = [];
    if (category === "duplicatePayment")
      t.billing_payment_applications_v2.push({
        ...t.billing_payment_applications_v2[0],
        id: "duplicate",
      });
    if (category === "incompleteCheckout")
      t.billing_checkouts_v2[0].status = "ambiguous";
    if (category === "wrongSubscription")
      t.billing_payment_applications_v2[0].subscription_id = "wrong";
    if (category === "missingCanonical") t.account_subscriptions = [];
    if (category === "missingOrigin") t.billing_canonical_origins = [];
    if (category === "missingApplicationEvidence") t.billing_evidence_v2 = [];
    if (category === "wrongAccount")
      t.billing_payment_applications_v2[0].billing_account_id = "wrong";
    if (category === "busyOperation")
      t.billing_operations_v2.push({
        billing_account_id: `account-${category}`,
        status: "awaiting_payment",
      });
    if (category === "missingSourceEvent") t.billing_webhook_events_v2.pop();
    if (category === "missingSourceObservation")
      t.billing_paddle_event_observations.pop();
    if (category === "missingSourceReceipt")
      t.billing_verified_evidence_v2.pop();
    if (category === "missingSourceDelivery")
      t.billing_paddle_event_deliveries.pop();
    if (category === "wrongSourceDigest")
      t.billing_paddle_event_observations[1].__release_content_sha256 =
        hash("incorrect");
    if (category === "contradictorySourceIdentity")
      t.billing_paddle_event_observations[1].observation.customerRef =
        "foreign";
    if (category === "contradictorySourceReceipt")
      t.billing_verified_evidence_v2[1].payment_authority = true;
    if (category.endsWith("Supersession")) {
      t.account_subscriptions[0].status = "superseded";
      t.account_subscriptions[0].superseded_at = "2026-09-21T00:00:00Z";
      t.account_subscriptions[0].superseded_by_subscription_id =
        category === "cyclicSupersession"
          ? t.account_subscriptions[0].id
          : "successor";
      if (category === "foreignSupersession") {
        t.account_subscriptions.push({
          ...t.account_subscriptions[0],
          id: "successor",
          status: "active",
          billing_account_id: "foreign",
        });
      }
    }
    expectBlockedHistory(t, a);
    expectBlockedHistory(t, historyReview(t, ["applied_purchase"]));
  });
  it("accepts the complete 18 synthetic plus 6 completed/superseded model without altering rows", () => {
    const t = emptyWebhookTables(),
      provenance = new Map<string, string>();
    for (let index = 0; index < 21; index++) {
      const shape = index < 4 ? "archive" : index < 18 ? "fixture" : "applied";
      const f = webhookFixture(
        `historical-${index}`,
        "subscription.created",
        shape,
      );
      if (shape === "applied")
        f.billing_webhook_events_v2[1].processing_status = "deferred";
      for (const key of Object.keys(t)) t[key].push(...f[key]);
      for (const event of f.billing_webhook_events_v2)
        provenance.set(
          evidenceDigest({
            id: event.id,
            provider: "paddle",
            environment: "test",
          }),
          shape === "archive"
            ? "archived_synthetic"
            : shape === "fixture"
              ? "closed_fixture"
              : "applied_purchase",
        );
    }
    const review = historyReview(
      t,
      inspectWebhookHistory(t).map((i: any) => provenance.get(i.eventSha256)!),
    );
    const original = evidenceDigest(t),
      report = classifyWebhookHistory(t, review);
    expect(report.activeBlockingWebhookCount).toBe(0);
    expect(report.historicalSafeWebhookCount).toBe(24);
    expect(t.billing_payment_applications_v2).toHaveLength(3);
    expect(
      report.records.filter(
        (r: any) => r.classification === "SYNTHETIC_TEST_HISTORY",
      ),
    ).toHaveLength(18);
    expect(
      report.records.filter(
        (r: any) => r.classification === "HISTORICAL_COMPLETED_OR_SUPERSEDED",
      ),
    ).toHaveLength(6);
    expect(evidenceDigest(t)).toBe(original);
    t.billing_operations_v2.push({
      id: "retained-schedule",
      billing_account_id: "account-historical-20",
      status: "scheduled",
      effective_at: "2026-10-23T10:01:34.296820Z",
    });
    const next = historyReview(
      t,
      review.records.map((r: any) => r.provenance.kind),
    );
    expect(classifyWebhookHistory(t, next).historicalSafeWebhookCount).toBe(24);
  });
  it.each([
    "addition",
    "removal",
    "statusChange",
    "authority",
    "sameCountReplacement",
  ])("binds exact retained inputs against %s", (category) => {
    const t = webhookFixture("binding"),
      a = historyReview(t);
    if (category === "addition")
      t.billing_webhook_events_v2.push({
        ...t.billing_webhook_events_v2[0],
        id: "new",
        processing_status: "manual_review",
      });
    if (category === "removal") t.billing_webhook_events_v2 = [];
    if (category === "statusChange")
      t.billing_webhook_events_v2[0].processing_status = "manual_review";
    if (category === "authority")
      t.account_subscriptions.push({ id: "new-authority" });
    if (category === "sameCountReplacement")
      t.billing_webhook_events_v2[0].id = "replacement";
    expectBlockedHistory(t, a);
  });
  it("normalizes unordered rows/object keys, preserves digest arrays and keeps missing distinct from null", () => {
    const t = webhookFixture("order"),
      review = historyReview(t);
    const reordered = Object.fromEntries(
      Object.entries(t)
        .reverse()
        .map(([k, rows]) => [
          k,
          rows
            .map((r) => Object.fromEntries(Object.entries(r).reverse()))
            .reverse(),
        ]),
    );
    expect(classifyWebhookHistory(reordered, review)).toEqual(
      classifyWebhookHistory(t, review),
    );
    expect(evidenceDigest({ a: null })).not.toBe(evidenceDigest({}));
    expect(() => evidenceDigest({ a: undefined })).toThrow("EVIDENCE_INVALID");
    expect(evidenceDigest([1, 2])).not.toBe(evidenceDigest([2, 1]));
  });
  it("requires the exact reconstruction for every repeated delivery", () => {
    const t = webhookFixture("W01-repeated"),
      delivery = structuredClone(t.billing_paddle_event_deliveries[0]),
      receipt = structuredClone(t.billing_verified_evidence_v2[0]);
    receipt.id = "second-receipt";
    receipt.provider_notification_ref = "second-notification";
    receipt.raw_payload_sha256 = hash("second-serialized-payload");
    delivery.notification_ref = receipt.provider_notification_ref;
    delivery.verified_evidence_id = receipt.id;
    delivery.raw_payload_sha256 = receipt.raw_payload_sha256;
    t.billing_verified_evidence_v2.push(receipt);
    t.billing_paddle_event_deliveries.push(delivery);
    const review = historyReview(t);
    expect(classifyWebhookHistory(t, review).historicalSafeWebhookCount).toBe(
      1,
    );
    expect(
      review.records[0].provenance.reconstructedPayloadSha256,
    ).toHaveLength(2);
    review.records[0].provenance.reconstructedPayloadSha256.pop();
    expectBlockedHistory(t, review);
  });
  it("binds PostgreSQL row bytes even when decoded JSON values are identical", () => {
    const t = webhookFixture("numeric-precision"),
      review = historyReview(t);
    const decoded = structuredClone(t.billing_webhook_events_v2[0]);
    t.billing_webhook_events_v2[0].__release_row_sha256 = hash(
      "different-pg-numeric-bytes",
    );
    const withoutMarker = (r: any) =>
      Object.fromEntries(
        Object.entries(r).filter(([key]) => key !== "__release_row_sha256"),
      );
    expect(withoutMarker(t.billing_webhook_events_v2[0])).toEqual(
      withoutMarker(decoded),
    );
    expectBlockedHistory(t, review);
  });
  it("constructs only SELECTs and rejects incomplete or injected table scope", () => {
    const sql = webhookHistoryQuery(WEBHOOK_HISTORY_TABLES);
    expect(sql.startsWith("select ")).toBe(true);
    expect(sql).not.toMatch(/\b(update|delete|insert|truncate|alter|drop)\b/i);
    expect(() => webhookHistoryQuery(["billing;delete"])).toThrow(
      "TABLE_INVALID",
    );
    expect(() => webhookHistoryQuery(["billing_accounts"])).toThrow(
      "TABLE_MISSING",
    );
  });
});
