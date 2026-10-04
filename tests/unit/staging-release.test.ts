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
} from "../../scripts/staging-release-observation.mjs";

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
    schemaVersion: 2,
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
      const { history, work, scheduled, contractDigest, ...facts } = o.facts;
      return {
        ...facts,
        tables: Object.keys(history).map((name) => ({
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
          digest: hash("synthetic-" + name),
        })),
        auth: {
          ...s.observation().authConfig,
          smtp_pass: "synthetic-private-never-export",
        },
        overrideFacts: null as any,
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
        else response = [{ work: o.facts.work, scheduled: o.facts.scheduled }];
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
      );
      const reviewed = await real.observe();
      const a = authorization(phase, { observation: () => reviewed } as any);
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
        (s) => (s.secrets[0].digest = hash("synthetic-rotation")),
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
          s.secrets[0].digest = hash("new");
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
  function syntheticInventoryTransport(delay: number, drift = false) {
    const facts = {
      versions: [],
      policy: { sales: false, reconciliation: false },
      functions: [],
      tables: [{ name: "example", acl: null, rls: true }],
      schema: {},
    };
    let calls = 0;
    return vi.fn(async () => {
      calls++;
      vi.setSystemTime(Date.now() + delay);
      const read = ((calls - 1) % 17) + 1;
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
          : position === 2 || position === 3
            ? []
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
                      work: {},
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
