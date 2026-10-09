import {
  timingFixture,
  timingTestReviewPolicy,
  signTimingFixture,
  baselineFixture,
  emptyDatabaseFixture,
  checkpointDatabaseFixture,
  signBaselineFixture,
  retrospectiveBaselineFixture,
} from "../helpers/staging-timing-fixture";
import {
  bootstrapDatabaseProfiles,
  databaseProof,
  BOOTSTRAP_CATALOG_QUERY,
  SQL_CONTEXT,
} from "../../scripts/staging-bootstrap-database.mjs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { releaseIdentity } from "../../scripts/staging-release-artifacts.mjs";
import {
  replacementPolicy,
  assertReplacementTarget,
} from "../../scripts/staging-replacement-target.mjs";
import {
  disposableBootstrap,
  bootstrapArtifact,
  verifyBootstrapDirectory,
} from "../../scripts/staging-bootstrap-artifacts.mjs";
import {
  bootstrapBinding,
  validateBootstrapAuthorization,
  verifyBootstrapCheckpoint,
} from "../../scripts/staging-bootstrap-contracts.mjs";
import {
  createBootstrapObserver,
  EMPTY_DATABASE_QUERY,
  assertEmptySnapshot,
} from "../../scripts/staging-bootstrap-observation.mjs";
import { runBootstrap } from "../../scripts/staging-bootstrap-runner.mjs";
import {
  normalizeAuth,
  normalizeSecrets,
} from "../../scripts/staging-release-observation.mjs";
import {
  timingReceipt,
  validateTimingReceipt,
} from "../../scripts/staging-timing-evidence.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import {
  initialHandoff,
  phaseWorkload,
  phaseTimingAssessment,
} from "../../scripts/staging-bootstrap-handoff.mjs";
import { runBootstrapCli } from "../../scripts/staging-bootstrap.mjs";
import {
  validateBoundary,
  verifyFunctions,
} from "../../scripts/staging-release-contracts.mjs";
import {
  FUNCTION_CONTRACTS,
  LS_TOMBSTONES,
} from "../../scripts/billing-deployment-contract.mjs";
import { validateBackupEnvironment } from "../../scripts/staging-logical-backup.mjs";

let identity: any, bundle: any;
const contracts = JSON.parse(
  readFileSync("config/staging-release-checkpoints.json", "utf8"),
);
// Local harness time only: full signed security evidence is deliberately retained.
// Production observation clocks and their boundary assertions remain 60 seconds.
const runnerTestTimeout = 15_000;
const clock = Date.parse("2026-10-06T10:00:00Z");
const context = {
  commit: "c".repeat(40),
  tree: "f".repeat(40),
  project: "exmrksgdikfprtfeltzu",
  origin: "https://repsync-staging-replacement.netlify.app",
  expectedProject: "exmrksgdikfprtfeltzu",
  expectedOrigin: "https://repsync-staging-replacement.netlify.app",
  productionProject: "btrfmxjpjzbyowtvncnc",
  productionOrigin: "https://repsync-production.netlify.app",
  clean: true,
};
// All observer transports and mutation commands below remain synthetic.
const policy = replacementPolicy();
const emptyFacts = () => ({
  databaseProof: emptyDatabaseFixture(),
  sqlContext: SQL_CONTEXT,
  ledgerPresent: false,
  versions: [],
  applicationRelations: 0,
  applicationFunctions: 0,
  customSchemas: 0,
  authUsers: 0,
  storageObjects: 0,
  storageBuckets: 0,
});
const stamp = (ms = clock) => new Date(ms).toISOString();

beforeAll(() => {
  identity = releaseIdentity();
  bundle = disposableBootstrap(process.cwd(), identity);
}, 60_000);
afterAll(() => bundle?.cleanup());

function transportHarness(
  change?: (state: any, pass: number) => void,
  delay?: (pass: number) => number,
) {
  let now = clock,
    pass = 0,
    catalogReads = 0,
    catalogChange: ((state: any, count: number) => void) | undefined;
  const state = {
    facts: emptyFacts(),
    project: {
      id: context.project,
      status: "ACTIVE_HEALTHY",
      region: "test-region",
      organization_id: "synthetic-test-organization",
      created_at: stamp(clock - 30_000),
    },
    functions: [] as any[],
    secrets: [{ name: "CONFIG_A", value: "d".repeat(64) }],
    auth: {
      site_url: context.origin,
      uri_allow_list: context.origin + "/auth/callback",
      disable_signup: false,
      mailer_autoconfirm: false,
      ...Object.fromEntries(
        bootstrapDatabaseProfiles().authBooleanFields.map((k: string) => [
          k,
          false,
        ]),
      ),
      ...Object.fromEntries(
        bootstrapDatabaseProfiles().authEmptyStringFields.map((k: string) => [
          k,
          "",
        ]),
      ),
    },
  };
  const requests: any[] = [];
  const transport = async (url: string, options: any) => {
    requests.push({ url, method: options.method });
    expect(
      url.startsWith(`https://api.supabase.com/v1/projects/${context.project}`),
    ).toBe(true);
    expect(options.redirect).toBe("error");
    let result;
    if (url.endsWith("database/query/read-only")) {
      const query = JSON.parse(options.body).query;
      if (query === BOOTSTRAP_CATALOG_QUERY)
        catalogChange?.(state, ++catalogReads);
      expect(query.toLowerCase()).not.toMatch(
        /\b(insert|update|delete|alter|drop|create)\b/,
      );
      result =
        query === EMPTY_DATABASE_QUERY
          ? [{ facts: structuredClone(state.facts) }]
          : query === BOOTSTRAP_CATALOG_QUERY
            ? [
                {
                  proof: {
                    ...state.facts.databaseProof,
                    platformComplete: true,
                  },
                },
              ]
            : [
                {
                  ledger: {
                    versions: state.facts.versions,
                    sqlContext: SQL_CONTEXT,
                  },
                },
              ];
    } else if (url.endsWith("/" + context.project)) {
      pass++;
      if (pass >= 2) change?.(state, pass);
      now += delay?.(pass) ?? 0;
      result = state.project;
    } else if (url.endsWith("/functions")) result = state.functions;
    else if (url.endsWith("/secrets")) result = state.secrets;
    else if (url.endsWith("/config/auth")) result = state.auth;
    else if (url.endsWith("/config/auth/sso/providers")) result = { items: [] };
    else if (url.endsWith("/config/auth/third-party-auth")) result = [];
    else throw Error("unexpected endpoint");
    return new Response(JSON.stringify(result));
  };
  const secrets = normalizeSecrets(state.secrets),
    auth = normalizeAuth(state.auth);
  const baseline = baselineFixture(identity, context, policy, clock, {
    facts: state.facts,
    project: state.project,
    projectDigest: evidenceDigest(state.project),
    functions: [],
    secretNames: secrets.names,
    secretDigest: secrets.digest,
    authConfig: auth.fields,
    authDigest: auth.digest,
    authCustomerState: {
      complete: true,
      unapprovedIntegrations: 0,
      integrationDigest: evidenceDigest({
        sso: { items: [] },
        integrations: [],
      }),
    },
  });
  const observer = createBootstrapObserver(
    context,
    {
      STAGING_SUPABASE_PROJECT_REF: context.project,
      PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
    },
    transport,
    {
      now: () => now,
      policy: () => policy,
      identity,
      baseline,
      reviewPolicy: timingTestReviewPolicy,
    },
  );
  return {
    observer,
    baseline,
    state,
    requests,
    now: () => now,
    setNow: (value: number) => {
      now = value;
    },
    setCatalogChange: (value: (state: any, count: number) => void) => {
      catalogChange = value;
    },
    catalogReads: () => catalogReads,
  };
}

async function setup(
  change?: (state: any, pass: number) => void,
  delay?: (pass: number) => number,
  retrospective = false,
) {
  const stable = transportHarness();
  if (retrospective) retrospectiveBaselineFixture(stable.baseline);
  const inventory = await stable.observer.observe();
  const h = transportHarness(change, delay);
  if (retrospective) retrospectiveBaselineFixture(h.baseline);
  const auth: any = {
    schemaVersion: 2,
    phase: "EMPTY_TO_180",
    executionCommit: context.commit,
    bindingDigest: evidenceDigest(
      bootstrapBinding(identity, context, policy, contracts, h.baseline),
    ),
    inventoryDigest: inventory.digest,
    baselineEvidenceSha256: evidenceDigest(h.baseline),
    inventoryObservedAt: stamp(),
    createdAt: stamp(),
    expiresAt: stamp(clock + 20 * 60_000),
    operational: {
      newlyCreatedEmptyProject: true,
      noImportedHistory: true,
      clientsExcluded: true,
      providerIngressExcluded: true,
      manualWritersExcluded: true,
      backgroundWritersExcluded: true,
      noManagedSchemaCustomizationSinceProjectCreation: true,
      quietWindowEndsAt: stamp(clock + 30 * 60_000),
    },
  };
  const mutations: any[] = [],
    commands: any[] = [];
  const after: any = {
    facts: {
      versions: identity.manifest.migrations.approved
        .slice(0, 180)
        .map((m: any) => m.filename.slice(0, 14)),
      databaseProof: checkpointDatabaseFixture(h.baseline),
      contractDigest: contracts.checkpoints[180].digest,
      policy: { sales: false, reconciliation: false },
      work: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [String(i), 0]),
      ),
      scheduled: { count: 0, invalidBoundaries: 0 },
      tables: [{ name: "billing_accounts" }],
      history: {
        "auth.users": "d751713988987e9331980363e24189ce",
        billing_accounts: "d751713988987e9331980363e24189ce",
      },
      webhookHistory: {
        retainedNonterminalWebhookCount: 0,
        activeBlockingWebhookCount: 0,
        historicalSafeWebhookCount: 0,
      },
    },
    functions: [],
    secretDigest: inventory.secretDigest,
    authDigest: inventory.authDigest,
    observedAt: stamp(),
    stability: { stable: true, startedAt: stamp(), completedAt: stamp() },
  };
  const adapter: any = {
    observeEmpty: () => h.observer.observe(),
    ledgerCount: async () => 0,
    observeRelease: async () => after,
    command: (args: string[], directory: string) => {
      commands.push(args);
      expect(directory).toBe(bundle.directory);
      if (args.includes("--yes") || args[0] === "functions")
        mutations.push(args);
      if (args.includes("--dry-run"))
        return identity.manifest.migrations.approved
          .slice(0, 180)
          .map((m: any) => ` • ${m.filename}`)
          .join("\n");
      return "";
    },
  };
  const deps: any = {
    now: h.now,
    timingReviewPolicy: timingTestReviewPolicy,
    policy: () => policy,
    currentIdentity: () => identity,
    currentContext: () => context,
    disposableBootstrap: () => ({ ...bundle, cleanup: () => {} }),
  };
  const input: any = {
    mode: "apply",
    phase: "EMPTY_TO_180",
    identity,
    context,
    contracts,
    authorization: auth,
    baseline: h.baseline,
    timingAdmission: timingFixture(
      "EMPTY_TO_180",
      auth,
      identity,
      context,
      contracts,
      clock,
      policy,
    ),
    workflowStartedAt: stamp(),
  };
  return {
    h,
    auth,
    after,
    adapter,
    deps,
    input,
    mutations,
    commands,
    run: () => runBootstrap(input, adapter, deps),
  };
}

describe("fixed bootstrap artifacts and replacement boundary", () => {
  it("contains precisely 1-180 and matches all canonical identities", () => {
    expect(bundle.artifact.target).toBe(180);
    expect(
      readdirSync(join(bundle.directory, "supabase/migrations")).sort(),
    ).toEqual(
      identity.manifest.migrations.approved
        .slice(0, 180)
        .map((m: any) => m.filename),
    );
    verifyBootstrapDirectory(bundle.directory, bundle.artifact);
    expect(bootstrapArtifact(identity).digest).toBe(bundle.artifact.digest);
    expect(() => bootstrapArtifact(identity, "181")).toThrow(
      "BOOTSTRAP_PHASE_INVALID",
    );
  });
  it.each([
    "modified",
    "missing",
    "extra181",
    "extra186",
    "config",
    "parentLink",
  ])("rejects %s artifact tampering", (kind) => {
    const root = mkdtempSync(join(tmpdir(), "repsync-bootstrap-test-"));
    try {
      mkdirSync(join(root, "supabase/migrations"), { recursive: true });
      for (const m of bundle.artifact.migrations)
        writeFileSync(
          join(root, "supabase/migrations", m.filename),
          readFileSync(
            join(bundle.directory, "supabase/migrations", m.filename),
          ),
        );
      writeFileSync(
        join(root, "supabase/config.toml"),
        readFileSync(join(bundle.directory, "supabase/config.toml")),
      );
      const first = join(
        root,
        "supabase/migrations",
        bundle.artifact.migrations[0].filename,
      );
      if (kind === "modified") writeFileSync(first, "tampered");
      if (kind === "missing") unlinkSync(first);
      if (kind.startsWith("extra"))
        writeFileSync(
          join(
            root,
            "supabase/migrations",
            identity.manifest.migrations.approved[
              kind === "extra181" ? 180 : 185
            ].filename,
          ),
          "extra",
        );
      if (kind === "config")
        writeFileSync(join(root, "supabase/config.toml"), "changed");
      if (kind === "parentLink") {
        rmSync(join(root, "supabase/migrations"), { recursive: true });
        symlinkSync(
          join(bundle.directory, "supabase/migrations"),
          join(root, "supabase/migrations"),
          "junction",
        );
      }
      expect(() => verifyBootstrapDirectory(root, bundle.artifact)).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(["dgogugyuyfourdttvwuy", "btrfmxjpjzbyowtvncnc"])(
    "denies actual retired/production target %s before any capability",
    (project) => {
      expect(() =>
        assertReplacementTarget(project, context.origin, policy, true),
      ).toThrow();
      expect(() =>
        validateBoundary({ ...context, project, expectedProject: project }),
      ).toThrow();
      expect(() =>
        validateBackupEnvironment({ STAGING_SUPABASE_PROJECT_REF: project }),
      ).toThrow();
    },
  );
  it("requires a configured registry and rejects another project", () => {
    expect(() =>
      assertReplacementTarget(
        context.project,
        context.origin,
        { ...policy, replacement: null },
        true,
      ),
    ).toThrow("REPLACEMENT_NOT_CONFIGURED");
    expect(() =>
      assertReplacementTarget("z".repeat(20), context.origin, policy, true),
    ).toThrow("REPLACEMENT_TARGET_MISMATCH");
  });
  it.each([
    "versions",
    "applicationRelations",
    "applicationFunctions",
    "customSchemas",
    "authUsers",
    "storageObjects",
    "storageBuckets",
  ])("rejects nonempty %s", (key) => {
    const h = transportHarness();
    const snapshot = structuredClone(h.baseline.capture.confirmation);
    expect(() => assertEmptySnapshot(snapshot, h.baseline)).not.toThrow();
    snapshot.facts[key] = key === "versions" ? ["20260101000000"] : 1;
    expect(() => assertEmptySnapshot(snapshot, h.baseline)).toThrow(
      "BOOTSTRAP_BASELINE_CUSTOMER_STATE",
    );
  });
});

describe("actual empty observation adapter through mutation runner", () => {
  it("rejects validly signed matching unsafe privileges before any transport or mutation", async () => {
    const h = await setup();
    const b = h.h.baseline;
    const proof = structuredClone(b.databaseProof);
    proof.customerSecurity.find(
      (r: any) =>
        r[0] === "acl" &&
        r[1].join(".") === "relation.storage.objects" &&
        r[3][1] === "anon" &&
        r[4] === "UPDATE",
    )[5] = true;
    b.databaseProof = databaseProof(proof);
    for (const key of ["opening", "closing", "confirmation"])
      b.capture[key].facts.databaseProof = structuredClone(b.databaseProof);
    signBaselineFixture(b);
    expect((await h.run()).errorCode).toBe(
      "BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH",
    );
    expect(h.h.requests).toEqual([]);
    expect(h.commands).toEqual([]);
    expect(h.mutations).toEqual([]);
  });
  it.each(["role_setting", "parameter_acl"])(
    "stops %s drift before any mutation",
    async (kind) => {
      const h = await setup();
      h.h.setCatalogChange((state, count) => {
        if (count !== 1) return;
        const p = state.facts.databaseProof;
        p.catalog.push(
          kind === "role_setting"
            ? [
                kind,
                '[null, "authenticated"]',
                [null, "authenticated", ["search_path=public, auth"]],
              ]
            : [
                kind,
                "session_replication_role",
                {
                  isNull: false,
                  privileges: [
                    ["supabase_admin", ["role", "authenticated"], "SET", false],
                  ],
                },
              ],
        );
        p.securityCatalogs[
          kind === "role_setting" ? "roleSettings" : "parameterAcls"
        ]++;
        p.catalogCount++;
        delete p.catalogDigest;
        state.facts.databaseProof = databaseProof(p);
      });
      expect((await h.run()).errorCode).toBe(
        kind === "role_setting"
          ? "BOOTSTRAP_DATABASE_PROFILE_MISMATCH"
          : "BOOTSTRAP_CUSTOMER_PARAMETER_ACL_MISMATCH",
      );
      expect(h.commands).toEqual([]);
      expect(h.mutations).toEqual([]);
    },
  );
  it("exports complete receipt evidence from the actual observer", async () => {
    const h = transportHarness(undefined, () => 10);
    const observation = await h.observer.observe();
    const receipt = timingReceipt("empty", observation, identity, context);
    expect(receipt.completeObservationSha256).toBe(evidenceDigest(observation));
    expect(receipt.proof.opening).toEqual(receipt.proof.closing);
    expect(receipt.proof.closing).toEqual(receipt.proof.confirmation);
    expect(Object.keys(receipt.proof.confirmation)).toHaveLength(5);
    expect(
      validateTimingReceipt(
        receipt,
        "empty",
        identity,
        context,
        evidenceDigest(h.baseline),
      ),
    ).toEqual(receipt);
  });
  const changes: [string, (s: any) => void][] = [
    [
      "function added",
      (s) => {
        s.functions = [
          {
            name: "open-wearables",
            id: "synthetic",
            version: 1,
            status: "ACTIVE",
            verify_jwt: true,
          },
        ];
      },
    ],
    [
      "secret removed",
      (s) => {
        s.secrets = [];
      },
    ],
    [
      "equal-count secret renamed",
      (s) => {
        s.secrets[0].name = "CONFIG_B";
      },
    ],
    [
      "secret digest changed",
      (s) => {
        s.secrets[0].value = "e".repeat(64);
      },
    ],
    [
      "secret metadata changed",
      (s) => {
        s.secrets[0].updated_at = stamp();
      },
    ],
    [
      "Auth site changed",
      (s) => {
        s.auth.site_url = "https://other.example.com";
      },
    ],
    [
      "Auth callback changed",
      (s) => {
        s.auth.uri_allow_list += "/other";
      },
    ],
    [
      "Auth signup changed",
      (s) => {
        s.auth.disable_signup = true;
      },
    ],
    [
      "other Auth setting changed",
      (s) => {
        s.auth.security_captcha_enabled = true;
      },
    ],
    [
      "multiple surfaces",
      (s) => {
        s.auth.disable_signup = true;
        s.secrets = [];
      },
    ],
    [
      "project identity",
      (s) => {
        s.project.id = "z".repeat(20);
      },
    ],
    [
      "database ledger",
      (s) => {
        s.facts.versions = ["20260101000000"];
        s.facts.ledgerPresent = true;
      },
    ],
  ];
  it.each(changes)(
    "blocks %s with zero migration/function mutations",
    async (_, change) => {
      const t = await setup((s, pass) => {
        if (pass === 2) change(s);
      });
      const report = await t.run();
      expect(report.status).toBe("blocked");
      expect(t.mutations).toHaveLength(0);
      expect(JSON.stringify(report)).not.toContain("CONFIG_A");
      expect(JSON.stringify(report)).not.toContain("d".repeat(64));
    },
  );
  it("catches drift during final metadata confirmation", async () => {
    const t = await setup((s, pass) => {
      if (pass === 3) s.auth.disable_signup = true;
    });
    expect((await t.run()).errorCode).toBe("AUTH_CONFIGURATION_DRIFT");
    expect(t.mutations).toHaveLength(0);
  });
  it.each([2, 3])(
    "keeps original 60-second clock across collection %s",
    async (pass) => {
      const t = await setup(undefined, (p) => (p === pass ? 60_001 : 0));
      expect((await t.run()).errorCode).toBe("RELEASE_OBSERVATION_STALE");
      expect(t.mutations).toHaveLength(0);
    },
  );
  it("re-observes after dry-run and blocks later drift", async () => {
    const t = await setup((s, pass) => {
      if (pass === 5) s.auth.disable_signup = true;
    });
    expect((await t.run()).status).toBe("blocked");
    expect(t.commands.some((a: any) => a.includes("--dry-run"))).toBe(true);
    expect(t.mutations).toHaveLength(0);
  });
  it(
    "rejects local validation consuming the last freshness margin",
    async () => {
      const t = await setup();
      let calls = 0;
      t.deps.currentIdentity = () => {
        if (++calls === 5) t.h.setNow(clock + 60_001);
        return identity;
      };
      expect((await t.run()).status).toBe("blocked");
      expect(t.mutations).toHaveLength(0);
    },
    runnerTestTimeout,
  );
  it(
    "stable control performs one bounded push, no function deployment",
    async () => {
      const t = await setup();
      const result = await t.run();
      expect(result.status).toBe("complete");
      expect(t.mutations).toEqual([["db", "push", "--linked", "--yes"]]);
      expect(result.checkpoint.ledgerCount).toBe(180);
    },
    runnerTestTimeout,
  );
  it("preflight has no link/dry-run/mutation", async () => {
    const t = await setup();
    t.input.mode = "preflight";
    expect((await t.run()).status).toBe("preflight_pass");
    expect(t.commands).toHaveLength(0);
  });
  it.each([
    "phase",
    "commit",
    "stale",
    "extra",
    "binding",
    "v1",
    "missing-history",
    "false-history",
  ])("rejects %s authorization before reads or mutation", async (kind) => {
    const t = await setup();
    if (kind === "phase") t.auth.phase = "BASELINE_180_TO_184";
    if (kind === "commit") t.auth.executionCommit = "d".repeat(40);
    if (kind === "stale") t.auth.expiresAt = stamp(clock - 1);
    if (kind === "extra") t.auth.force = true;
    if (kind === "binding") t.auth.bindingDigest = "e".repeat(64);
    if (kind === "v1") t.auth.schemaVersion = 1;
    if (kind === "missing-history")
      delete t.auth.operational
        .noManagedSchemaCustomizationSinceProjectCreation;
    if (kind === "false-history")
      t.auth.operational.noManagedSchemaCustomizationSinceProjectCreation = false;
    expect((await t.run()).status).toBe("blocked");
    expect(t.h.requests).toHaveLength(0);
    expect(t.mutations).toHaveLength(0);
  });
  it("strict binding rejects changed config/identity", async () => {
    const t = await setup();
    expect(() =>
      validateBootstrapAuthorization(
        t.auth,
        { ...identity, containment: [] },
        context,
        policy,
        contracts,
        clock,
        t.h.baseline,
        timingTestReviewPolicy(),
      ),
    ).toThrow("BOOTSTRAP_BASELINE_BINDING");
  });
  it(
    "stops on partial apply and cannot automatically resume",
    async () => {
      const t = await setup();
      const command = t.adapter.command;
      t.adapter.command = (args: any, dir: any) => {
        const result = command(args, dir);
        if (args.includes("--yes")) throw Error("CLI_FAILED");
        return result;
      };
      t.adapter.ledgerCount = async () => 37;
      const report = await t.run();
      expect(report.status).toBe("blocked");
      expect(report.ledgerCount).toBe(37);
      expect(report.automaticResume).toBe(false);
      expect(t.mutations).toHaveLength(1);
      const retry = await setup();
      retry.h.state.facts.ledgerPresent = true;
      (retry.h.state.facts.versions as any[]).push("20260101000000");
      expect((await retry.run()).status).toBe("blocked");
      expect(retry.mutations).toHaveLength(0);
    },
    runnerTestTimeout,
  );
  it("does not claim success from CLI exit when checkpoint fails", async () => {
    const t = await setup();
    t.after.facts.policy.sales = true;
    expect((await t.run()).status).toBe("blocked");
    expect(t.mutations).toHaveLength(1);
  });
  it("forbids arbitrary target/phase from CLI before remote capability", async () => {
    await expect(runBootstrapCli(["apply", "181"], {})).rejects.toThrow(
      "BOOTSTRAP_ARGUMENTS_INVALID",
    );
  });
});

describe("PAY-05AW retrospective runner boundaries", () => {
  it(
    "permits the signed retrospective control through the actual observer and runner",
    async () => {
      const t = await setup(undefined, undefined, true);
      expect((await t.run()).status).toBe("complete");
      expect(t.mutations).toHaveLength(1);
      expect(t.mutations[0]).toEqual(["db", "push", "--linked", "--yes"]);
    },
    runnerTestTimeout,
  );
  it.each([
    "no modification",
    "unknown history",
    "managed customization",
    "restore",
    "unsigned",
    "self approval",
    "risk acceptance",
    "identity evidence",
    "copied target",
    "old baseline",
    "expired authority",
    "current clients",
    "current ingress",
    "current manual",
    "current background",
  ])(
    "blocks retrospective %s before any read or command",
    async (kind) => {
      const t = await setup(undefined, undefined, true);
      const b = t.input.baseline;
      if (kind === "no modification")
        b.creation.history.noUnreviewedCustomerModification = false;
      if (kind === "unknown history")
        b.creation.history.customerModificationHistoryKnown = false;
      if (kind === "managed customization")
        b.creation.knownCustomerCustomizations = ["customer Storage index"];
      if (kind === "restore") b.creation.noRestoreOrImport = false;
      if (kind === "self approval")
        b.historyReview.reviewerIdentity = b.creation.operatorIdentity;
      if (kind === "risk acceptance")
        b.historyReview.residualRiskAccepted = false;
      if (kind === "identity evidence")
        b.creation.history.operatorAuthenticationEvidenceSha256 = [];
      if (kind === "copied target") b.target.project = "z".repeat(20);
      if (kind === "old baseline") b.schemaVersion = 1;
      signBaselineFixture(b);
      if (kind === "unsigned") b.review.signature = "A".repeat(86) + "==";
      if (kind === "expired authority") t.auth.expiresAt = stamp();
      const current: Record<string, string> = {
        "current clients": "clientsExcluded",
        "current ingress": "providerIngressExcluded",
        "current manual": "manualWritersExcluded",
        "current background": "backgroundWritersExcluded",
      };
      if (current[kind]) t.auth.operational[current[kind]] = false;
      // Rebind every unrelated digest/sample so the intended precondition rejects.
      t.auth.baselineEvidenceSha256 = evidenceDigest(b);
      t.auth.bindingDigest = evidenceDigest(
        bootstrapBinding(identity, context, policy, contracts, b),
      );
      t.input.timingAdmission = timingFixture(
        "EMPTY_TO_180",
        t.auth,
        identity,
        context,
        contracts,
        clock,
        policy,
      );
      const result = await t.run();
      const expected =
        kind === "unsigned"
          ? "BOOTSTRAP_BASELINE_REVIEW_REQUIRED"
          : kind === "self approval"
            ? "BOOTSTRAP_BASELINE_HISTORY_REVIEW_INVALID"
            : kind === "copied target"
              ? "BOOTSTRAP_BASELINE_BINDING"
              : kind === "expired authority"
                ? "BOOTSTRAP_AUTHORIZATION_STALE"
                : current[kind]
                  ? "BOOTSTRAP_AUTHORIZATION_INVALID"
                  : "BOOTSTRAP_BASELINE_INVALID";
      expect(result.status).toBe("blocked");
      expect(result.errorCode).toBe(expected);
      expect(t.h.requests).toHaveLength(0);
      expect(t.commands).toHaveLength(0);
      expect(t.mutations).toHaveLength(0);
    },
    runnerTestTimeout,
  );
  it(
    "retrospective approval cannot override an unsafe matching ACL",
    async () => {
      const t = await setup(undefined, undefined, true);
      const b = t.input.baseline;
      const proof = structuredClone(b.databaseProof);
      proof.customerSecurity.find(
        (r: any) =>
          r[0] === "acl" &&
          r[1].join(".") === "relation.storage.objects" &&
          r[3][1] === "anon" &&
          r[4] === "UPDATE",
      )[5] = true;
      b.databaseProof = databaseProof(proof);
      for (const key of ["opening", "closing", "confirmation"])
        b.capture[key].facts.databaseProof = structuredClone(b.databaseProof);
      signBaselineFixture(b);
      t.auth.baselineEvidenceSha256 = evidenceDigest(b);
      t.auth.bindingDigest = evidenceDigest(
        bootstrapBinding(identity, context, policy, contracts, b),
      );
      expect((await t.run()).errorCode).toBe(
        "BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH",
      );
      expect(t.h.requests).toHaveLength(0);
      expect(t.commands).toHaveLength(0);
    },
    runnerTestTimeout,
  );
  it.each(["index", "final read"])(
    "retrospective %s drift withholds the push",
    async (kind) => {
      const t = await setup(undefined, undefined, true);
      t.h.setCatalogChange((s, n) => {
        if (n !== (kind === "final read" ? 6 : 2)) return;
        const proof = s.facts.databaseProof;
        if (kind === "index") {
          proof.catalog.push([
            "index_security",
            "storage.objects.customer_unique",
            ["supabase_storage_admin", true, true, true],
          ]);
          proof.catalogCount++;
          delete proof.catalogDigest;
          delete proof.platformDigest;
          s.facts.databaseProof = databaseProof(proof);
        } else proof.sqlPlatformDigest = "f".repeat(64);
      });
      const result = await t.run();
      expect(result.status).toBe("blocked");
      expect(result.errorCode).toMatch(
        kind === "index"
          ? /BOOTSTRAP_DATABASE_PROFILE_MISMATCH/
          : /DATABASE_DRIFT/,
      );
      expect(t.commands).toHaveLength(0);
      expect(t.mutations).toHaveLength(0);
    },
    runnerTestTimeout,
  );
  it.each(["before push", "after push"])(
    "stops when live exclusions lapse %s",
    async (when) => {
      const t = await setup(undefined, undefined, true);
      const original = t.adapter.command;
      t.adapter.command = (args: string[], directory: string) => {
        const result = original(args, directory);
        if (when === "before push" && args.includes("--dry-run")) {
          t.auth.operational.manualWritersExcluded = false;
        }
        return result;
      };
      if (when === "after push")
        t.adapter.observeRelease = async () => {
          // Lapse during the post-push observation, immediately before the next
          // authorization guard; earlier timing checks still have valid bindings.
          t.auth.operational.manualWritersExcluded = false;
          return t.after;
        };
      t.adapter.ledgerCount = async () => (when === "after push" ? 180 : 0);
      const result = await t.run();
      expect(result.errorCode).toBe("BOOTSTRAP_AUTHORIZATION_INVALID");
      expect(result.status).toBe("blocked");
      expect(result.ledgerCount).toBe(when === "after push" ? 180 : 0);
      expect(result.automaticResume).toBe(false);
      expect(t.mutations).toHaveLength(when === "after push" ? 1 : 0);
      expect(t.commands).toHaveLength(when === "after push" ? 3 : 2);
    },
    runnerTestTimeout,
  );
  it.each(["authorization", "timing receipts"])(
    "cannot reuse creation-time %s for retrospective approval",
    async (kind) => {
      const t = await setup();
      retrospectiveBaselineFixture(t.input.baseline);
      if (kind === "timing receipts") {
        const oldSamples = t.input.timingAdmission.samples;
        t.auth.baselineEvidenceSha256 = evidenceDigest(t.input.baseline);
        t.auth.bindingDigest = evidenceDigest(
          bootstrapBinding(
            identity,
            context,
            policy,
            contracts,
            t.input.baseline,
          ),
        );
        t.input.timingAdmission = timingFixture(
          "EMPTY_TO_180",
          t.auth,
          identity,
          context,
          contracts,
          clock,
          policy,
        );
        t.input.timingAdmission.samples = oldSamples;
        signTimingFixture(t.input.timingAdmission);
      }
      const result = await t.run();
      expect(result.errorCode).toBe(
        kind === "authorization"
          ? "BOOTSTRAP_AUTHORIZATION_BINDING"
          : "TIMING_RECEIPT_BINDING",
      );
      expect(t.h.requests).toHaveLength(0);
      expect(t.commands).toHaveLength(0);
    },
    runnerTestTimeout,
  );
});

describe("PAY-05AQ hard gates before any subsequent mutation", () => {
  it.each([
    [
      "inherited-owner Storage unique index",
      "relation",
      "storage.customer_unique",
    ],
    ["custom Auth trigger", "trigger", "auth.users.customer_trigger"],
    ["custom Storage policy", "policy", "storage.objects.customer_policy"],
    ["custom Realtime policy", "policy", "realtime.messages.customer_policy"],
    ["hidden Auth function", "routine", "auth.customer_function()"],
    ["hidden Realtime type", "type", "realtime.customer_type"],
    [
      "managed owner/name camouflage",
      "index_security",
      "storage.objects_provider_index",
    ],
    [
      "extension camouflage",
      "dependency",
      "function auth.extension_camouflage()",
    ],
    ["altered built-in cast", "cast", "text->uuid"],
    [
      "cross-boundary dependency",
      "dependency",
      "function auth.customer_dependency()",
    ],
    ["provider migration", "extension", "provider_new_extension"],
    [
      "provider partition rotation",
      "relation_security",
      "realtime.messages_new",
    ],
    ["duplicate catalog record", "duplicate", "*"],
  ])(
    "blocks %s through the observer and runner before mutation",
    async (_name, kind, name) => {
      const t = await setup((s, pass) => {
        if (pass !== 2) return;
        const p = s.facts.databaseProof;
        p.catalog.push(
          kind === "duplicate"
            ? structuredClone(p.catalog[0])
            : [kind, name, ["unexpected", "supabase_storage_admin"]],
        );
        p.catalogCount = p.catalog.length;
        delete p.catalogDigest;
        delete p.platformDigest;
        // Recompute internally consistent proof hashes: rejection must depend on
        // the approved baseline, not merely an invalid caller-computed digest.
        s.facts.databaseProof = databaseProof(p);
      });
      expect((await t.run()).status).toBe("blocked");
      expect(t.commands).toHaveLength(0);
      expect(t.mutations).toHaveLength(0);
    },
  );
  it.each([
    "missing baseline",
    "copied baseline",
    "forged approval",
    "unreviewed attestation",
  ])("rejects %s before transport or commands", async (kind) => {
    const t = await setup();
    if (kind === "missing baseline") t.input.baseline = undefined;
    if (kind === "copied baseline")
      t.input.baseline.target.project = "z".repeat(20);
    if (kind === "forged approval")
      t.input.baseline.review.signature = "A".repeat(86) + "==";
    if (kind === "unreviewed attestation")
      t.input.baseline.creation.noManagedSchemaCustomizationSinceProjectCreation = false;
    expect((await t.run()).status).toBe("blocked");
    expect(t.h.requests).toHaveLength(0);
    expect(t.commands).toHaveLength(0);
  });
  it.each([6, 12])(
    "rejects database drift only at final read %s before push",
    async (read) => {
      const t = await setup();
      t.h.setCatalogChange((s, n) => {
        if (n === read)
          s.facts.databaseProof.sqlPlatformDigest = "f".repeat(64);
      });
      expect((await t.run()).status).toBe("blocked");
      expect(t.h.catalogReads()).toBe(read);
      expect(t.mutations).toHaveLength(0);
    },
  );
  it.each([
    "hook",
    "OAuth",
    "missing Auth field",
    "Auth session",
    "queued work",
    "permission filtered",
  ])("blocks %s before mutation", async (kind) => {
    const t = await setup((s, pass) => {
      if (pass !== 2) return;
      if (kind === "hook") s.auth.hook_custom_access_token_enabled = true;
      if (kind === "OAuth") s.auth.external_google_enabled = true;
      if (kind === "missing Auth field")
        delete s.auth.hook_before_user_created_enabled;
      if (kind === "Auth session")
        s.facts.databaseProof.platform.find(
          (p: any) => p.name === "auth.sessions",
        ).count = 1;
      if (kind === "queued work")
        s.facts.databaseProof.platform.find(
          (p: any) => p.name === "net.http_request_queue",
        ).count = 1;
      if (kind === "permission filtered")
        s.facts.databaseProof.platform[0].unfiltered = false;
    });
    expect((await t.run()).status).toBe("blocked");
    expect(t.mutations).toHaveLength(0);
  });
});

describe("handoff and whole-phase feasibility", () => {
  it("proves the existing containment contract needs two initial nonbilling artifacts", () => {
    const artifacts = Object.fromEntries(
      [
        ...identity.containment,
        ...identity.functions.filter((f: any) =>
          LS_TOMBSTONES.includes(f.name),
        ),
      ].map((f: any) => [f.name, f.digest]),
    );
    const functions = FUNCTION_CONTRACTS.filter(
      (f) => f.classification !== "NON_BILLING",
    ).map((f) => ({
      name: f.name,
      version: 1,
      verify_jwt: f.verifyJwt,
      status: "ACTIVE",
    }));
    expect(() =>
      verifyFunctions({ functions, artifacts }, identity, "containment"),
    ).toThrow();
    functions.push(
      ...FUNCTION_CONTRACTS.filter(
        (f) => f.classification === "NON_BILLING",
      ).map((f) => ({
        name: f.name,
        version: 1,
        verify_jwt: f.verifyJwt,
        status: "ACTIVE",
      })),
    );
    expect(() =>
      verifyFunctions({ functions, artifacts }, identity, "containment"),
    ).not.toThrow();
  });
  it.each(["ACTIVE", "THROTTLED", "FAILED", undefined])(
    "requires verified ACTIVE nonbilling handoff: %s",
    (status) => {
      const required = identity.functions.filter((f: any) =>
        FUNCTION_CONTRACTS.some(
          (c) => c.name === f.name && c.classification === "NON_BILLING",
        ),
      );
      const observation = {
        secretNames: [],
        functions: required.map((f: any) => ({
          name: f.name,
          verify_jwt: f.verifyJwt,
          status,
        })),
        artifacts: Object.fromEntries(
          required.map((f: any) => [f.name, f.digest]),
        ),
      };
      expect(
        initialHandoff(observation, identity).missingNonbilling.length,
      ).toBe(status === "ACTIVE" ? 0 : 2);
    },
  );
  it("keeps backup boundary executable without npm dependencies", () => {
    const directory = mkdtempSync(
      join(tmpdir(), "repsync-bootstrap-backup-contract-"),
    );
    try {
      mkdirSync(join(directory, "scripts"));
      mkdirSync(join(directory, "config"));
      for (const name of [
        "staging-logical-backup.mjs",
        "staging-logical-backup-data.mjs",
        "staging-backup-ledger.mjs",
        "staging-replacement-target.mjs",
      ])
        writeFileSync(
          join(directory, "scripts", name),
          readFileSync(join("scripts", name)),
        );
      writeFileSync(
        join(directory, "config/staging-replacement-target.json"),
        JSON.stringify(replacementPolicy()),
      );
      const env = {
        STAGING_SUPABASE_PROJECT_REF: context.project,
        STAGING_APPLICATION_ORIGIN: context.origin,
        PRODUCTION_APPLICATION_ORIGIN: context.productionOrigin,
        PRODUCTION_SUPABASE_PROJECT_REF: context.productionProject,
        CONFIRM_PROJECT_REF: context.project,
        STAGING_SUPABASE_DB_URL: `postgres://postgres:synthetic@db.${context.project}.supabase.co:5432/postgres`,
        EVIDENCE_LABEL: "local-only",
      };
      const code =
        'import {validateBackupEnvironment} from "./scripts/staging-logical-backup.mjs";validateBackupEnvironment(JSON.parse(process.argv[1]));console.log("PASS");';
      expect(
        execFileSync(
          process.execPath,
          ["--input-type=module", "-e", code, JSON.stringify(env)],
          { cwd: directory, encoding: "utf8" },
        ).trim(),
      ).toBe("PASS");
      // A configured source registry also works in the dependency-free CLI.
      expect(
        execFileSync(
          process.execPath,
          ["scripts/staging-logical-backup.mjs", "validate"],
          { cwd: directory, env: { ...process.env, ...env }, stdio: "pipe" },
        ).toString(),
      ).toBe("");
      // An unset registry must still block an otherwise valid environment.
      writeFileSync(
        join(directory, "config/staging-replacement-target.json"),
        JSON.stringify({ ...policy, replacement: null }),
      );
      expect(() =>
        execFileSync(
          process.execPath,
          ["scripts/staging-logical-backup.mjs", "validate"],
          {
            cwd: directory,
            env: { ...process.env, ...env },
            stdio: "pipe",
          },
        ),
      ).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("manual workflow preserves protected-main, exclusion and shell boundaries", () => {
    const workflow = createRequire(import.meta.url)("js-yaml").load(
      readFileSync(".github/workflows/supabase-staging-bootstrap.yml", "utf8"),
    );
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "supabase-staging-commercial",
      "cancel-in-progress": false,
    });
    expect(workflow.jobs.bootstrap.environment).toBe("supabase-staging");
    expect(workflow.jobs.bootstrap.if).toBe("github.ref == 'refs/heads/main'");
    expect(workflow.on.workflow_dispatch.inputs.mode.options).toEqual([
      "plan",
      "preflight",
      "apply",
    ]);
    expect(Object.keys(workflow.on.workflow_dispatch.inputs)).not.toContain(
      "target",
    );
    for (const step of workflow.jobs.bootstrap.steps)
      expect(step.run ?? "").not.toContain("${{");
  });
  it("fresh project does not satisfy full configuration or initial nonbilling handoff", () => {
    const result = initialHandoff({ secretNames: [], functions: [] }, identity);
    expect(result.missingNonbilling).toEqual([
      "open-wearables",
      "exercise-dataset-search",
    ]);
    expect(result.missingConfiguration).toContain(
      "PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY",
    );
    expect(result.readyForRelease).toBe(false);
  });
  it("counts the actual runner workload, not one observation", () => {
    expect(phaseWorkload("BASELINE_180_TO_184")).toEqual({
      observations: 4,
      migrations: 1,
      deployments: 0,
    });
    expect(phaseWorkload("RETIREMENT_ACTIVATION_184_TO_186")).toEqual({
      observations: 129,
      migrations: 2,
      deployments: 30,
    });
  });
  it("blocks historical 42-45s observations despite individual freshness passing", () => {
    const result = phaseTimingAssessment({
      phase: "RETIREMENT_ACTIVATION_184_TO_186",
      observationSamplesMs: [42267, 43500, 44586],
      mutationAllowanceMs: 60_000,
      localValidationAllowanceMs: 30_000,
      authorizationRemainingMs: 1_800_000,
      workflowRemainingMs: 2_700_000,
      inventoryRemainingMs: 900_000,
      configurationRemainingMs: 900_000,
      recoveryRemainingMs: 3_600_000,
      quietWindowRemainingMs: 3_600_000,
    });
    expect(result.observationMarginPass).toBe(true);
    expect(result.wholePhaseMarginPass).toBe(false);
    expect(result.verdict).toBe("BLOCK_AND_REVIEW");
  });
  it("fast measured control fits but is explicitly not a guarantee", () => {
    const result = phaseTimingAssessment({
      phase: "RETIREMENT_ACTIVATION_184_TO_186",
      observationSamplesMs: [900, 1000, 1100],
      mutationAllowanceMs: 300_000,
      localValidationAllowanceMs: 60_000,
      authorizationRemainingMs: 1_800_000,
      workflowRemainingMs: 2_700_000,
      inventoryRemainingMs: 900_000,
      configurationRemainingMs: 900_000,
      recoveryRemainingMs: 3_600_000,
      quietWindowRemainingMs: 3_600_000,
    });
    expect(result.verdict).toBe("MEASURED_PLAN_FITS");
    expect(result.guarantee).toBe(false);
  });
  it("cold checkpoint rejects retained history, extra functions and missing scope", async () => {
    const t = await setup();
    verifyBootstrapCheckpoint(t.after, identity, contracts, t.h.baseline);
    t.after.facts.history.billing_accounts = "f".repeat(32);
    expect(() =>
      verifyBootstrapCheckpoint(t.after, identity, contracts, t.h.baseline),
    ).toThrow("BOOTSTRAP_HISTORY_NOT_EMPTY");
  });
});

describe("PAY-05AD-R2 completion and positive database admission", () => {
  it.each(["catalogDigest", "platformDigest"])(
    "rejects changed empty %s before commands",
    async (key) => {
      const t = await setup();
      t.h.state.facts.databaseProof = {
        ...t.h.state.facts.databaseProof,
        [key]: "f".repeat(64),
      };
      expect((await t.run()).errorCode).toBe(
        "BOOTSTRAP_DATABASE_PROFILE_MISMATCH",
      );
      expect(t.commands).toHaveLength(0);
    },
  );
  it.each(["catalogDigest", "platformDigest", "seedDigest"])(
    "blocks changed checkpoint %s after push",
    async (key) => {
      const t = await setup();
      t.after.facts.databaseProof = {
        ...t.after.facts.databaseProof,
        [key]: "f".repeat(64),
      };
      t.adapter.ledgerCount = async () => 180;
      const result = await t.run();
      expect(result.status).toBe("blocked");
      expect(result.errorCode).toBe("BOOTSTRAP_DATABASE_PROFILE_MISMATCH");
      expect(result.ledgerCount).toBe(180);
      expect(result.automaticResume).toBe(false);
    },
  );
  it.each([
    "identity",
    "context",
    "policy",
    "expiry",
    "freshness",
    "finalExpiry",
  ])(
    "rechecks %s after push",
    async (kind) => {
      const t = await setup();
      let afterPush = false,
        closingIdentityReads = 0;
      t.deps.currentIdentity = () => {
        if (afterPush && ++closingIdentityReads === 2 && kind === "finalExpiry")
          t.h.setNow(clock + 31 * 60_000);
        if (afterPush && kind === "freshness") t.h.setNow(clock + 60_001);
        return afterPush && kind === "identity"
          ? { ...identity, containment: [] }
          : identity;
      };
      t.deps.currentContext = () =>
        afterPush && kind === "context"
          ? { ...context, clean: false }
          : context;
      t.deps.policy = () =>
        afterPush && kind === "policy"
          ? { ...policy, archivedOrigins: [context.origin] }
          : policy;
      t.adapter.observeRelease = async () => {
        afterPush = true;
        if (kind === "expiry") t.h.setNow(clock + 31 * 60_000);
        return t.after;
      };
      t.adapter.ledgerCount = async () => 180;
      const result = await t.run();
      expect(result.status).toBe("blocked");
      expect(result.ledgerCount).toBe(180);
      expect(t.mutations).toHaveLength(1);
    },
    runnerTestTimeout,
  );
  it("requires archived origin review and rejects reuse with a different project", () => {
    expect(() =>
      assertReplacementTarget(
        context.project,
        context.origin,
        { ...policy, archivedOrigins: null },
        true,
      ),
    ).toThrow("ARCHIVED_ORIGINS_REVIEW_REQUIRED");
    expect(() =>
      assertReplacementTarget(
        context.project,
        context.origin,
        { ...policy, archivedOrigins: [context.origin] },
        true,
      ),
    ).toThrow("REPLACEMENT_TARGET_DENIED");
    expect(() =>
      assertReplacementTarget(context.project, undefined, policy, true),
    ).toThrow("REPLACEMENT_TARGET_MISMATCH");
  });
  it.each(["missing", "binding", "sample", "duplicate", "workflow", "slow"])(
    "rejects %s timing admission before reads",
    async (kind) => {
      const t = await setup(),
        a = t.input.timingAdmission;
      if (kind === "missing") t.input.timingAdmission = undefined;
      if (kind === "binding") a.bindingDigest = "f".repeat(64);
      if (kind === "sample") a.samples.empty = [];
      if (kind === "duplicate") a.samples.empty[1] = a.samples.empty[0];
      if (kind === "workflow") t.input.workflowStartedAt = undefined;
      if (kind === "slow")
        for (const sample of [...a.samples.empty, ...a.samples.release])
          sample.receipt.startedAt = stamp(
            Date.parse(sample.receipt.completedAt) - 49_000,
          );
      for (const sample of [...a.samples.empty, ...a.samples.release])
        sample.receiptSha256 = evidenceDigest(sample.receipt);
      signTimingFixture(a);
      const result = await t.run();
      expect(result.status).toBe("blocked");
      expect(t.h.requests).toHaveLength(0);
      expect(t.commands).toHaveLength(0);
    },
  );
  it("blocks a late mutation return with actual ledger evidence", async () => {
    const t = await setup(),
      command = t.adapter.command;
    t.adapter.command = (args: any, dir: any) => {
      const result = command(args, dir);
      if (args.includes("--yes")) t.h.setNow(clock + 1001);
      return result;
    };
    t.adapter.ledgerCount = async () => 180;
    const result = await t.run();
    expect(result.errorCode).toBe("TIMING_OPERATION_OVERRUN");
    expect(result.ledgerCount).toBe(180);
    expect(result.status).toBe("blocked");
  });
});

it(
  "rechecks the bounded artifact after the checkpoint read",
  async () => {
    const t = await setup(),
      path = join(
        bundle.directory,
        "supabase/migrations",
        bundle.artifact.migrations[0].filename,
      ),
      original = readFileSync(path);
    t.adapter.observeRelease = async () => {
      writeFileSync(path, "changed after push");
      return t.after;
    };
    t.adapter.ledgerCount = async () => 180;
    try {
      const result = await t.run();
      expect(result.status).toBe("blocked");
      expect(result.ledgerCount).toBe(180);
      expect(t.mutations).toHaveLength(1);
    } finally {
      writeFileSync(path, original);
    }
  },
  runnerTestTimeout,
);

it("rejects incomplete platform row extraction before any command", async () => {
  const t = await setup();
  // Use the real proof parser through a deliberately incomplete SQL response.
  const { databaseProof } =
    await import("../../scripts/staging-bootstrap-database.mjs");
  expect(() =>
    databaseProof({
      ...t.h.state.facts.databaseProof,
      platformComplete: false,
    }),
  ).toThrow("BOOTSTRAP_PLATFORM_PROOF_INCOMPLETE");
  expect(t.commands).toHaveLength(0);
});

it("reserves the full terminal observation budget before empty bootstrap", async () => {
  const t = await setup();
  t.input.timingAdmission.expiresAt = stamp(clock + 60_000);
  signTimingFixture(t.input.timingAdmission);
  const result = await t.run();
  expect(result.errorCode).toBe("TIMING_ADMISSION_BLOCKED");
  expect(t.h.requests).toHaveLength(0);
  expect(t.commands).toHaveLength(0);
});

it(
  "retains the inclusive 60-second terminal observation boundary",
  async () => {
    const t = await setup();
    t.adapter.observeRelease = async () => {
      t.h.setNow(clock + 60_000);
      t.after.stability.completedAt = stamp(clock + 60_000);
      return t.after;
    };
    expect((await t.run()).status).toBe("complete");
    expect(t.mutations).toHaveLength(1);
  },
  runnerTestTimeout,
);
