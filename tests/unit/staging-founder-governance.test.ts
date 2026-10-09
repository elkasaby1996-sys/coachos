import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  FOUNDER_MODE,
  founderPolicy,
  assertFounderReview,
  validateFounderAction,
  beginFounderOperation,
  founderReviewMessage,
  founderReviewPayload,
} from "../../scripts/staging-founder-governance.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { releaseIdentity } from "../../scripts/staging-release-artifacts.mjs";
import {
  validateVirginBaseline,
  validateBaselineCandidate,
} from "../../scripts/staging-bootstrap-baseline.mjs";
import {
  bootstrapBinding,
  validateBootstrapAuthorization,
} from "../../scripts/staging-bootstrap-contracts.mjs";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";
import {
  createTimingAdmission,
  timingBinding,
} from "../../scripts/staging-timing-admission.mjs";
import {
  timingReviewPolicy,
  assertTimingReview,
} from "../../scripts/staging-timing-evidence.mjs";
import { captureBaselineCandidate } from "../../scripts/staging-bootstrap-capture.mjs";
import { createBootstrapObserver } from "../../scripts/staging-bootstrap-observation.mjs";
import { runBootstrap } from "../../scripts/staging-bootstrap-runner.mjs";
import { runRelease } from "../../scripts/staging-release-runner.mjs";
import { createRemoteAdapter } from "../../scripts/staging-release-observation.mjs";
import { validateProductionAuthorization } from "../../scripts/production-billing-retirement.mjs";
import {
  captureFixture,
  captureContext,
  captureClock,
} from "../helpers/staging-capture-fixture";
import {
  timingTestReviewPolicy,
  checkpointDatabaseFixture,
  retrospectiveBaselineFixture,
} from "../helpers/staging-timing-fixture";
import { founderFixture } from "../helpers/staging-founder-fixture";

let identity: any;
const contracts = JSON.parse(
  readFileSync("config/staging-release-checkpoints.json", "utf8"),
);
beforeAll(() => {
  identity = releaseIdentity();
}, 30_000);
function fixture() {
  const h = captureFixture(identity);
  const f = founderFixture(captureContext, captureClock);
  const baseline = f.baseline(h.baseline, identity);
  const authorization: any = {
    schemaVersion: 2,
    phase: "EMPTY_TO_180",
    executionCommit: f.context.commit,
    bindingDigest: evidenceDigest(
      bootstrapBinding(
        identity,
        f.context,
        replacementPolicy(),
        contracts,
        baseline,
      ),
    ),
    inventoryDigest: "a".repeat(64),
    inventoryObservedAt: new Date(captureClock).toISOString(),
    baselineEvidenceSha256: evidenceDigest(baseline),
    createdAt: new Date(captureClock).toISOString(),
    expiresAt: new Date(captureClock + 10 * 60_000).toISOString(),
    operational: {
      newlyCreatedEmptyProject: true,
      noImportedHistory: true,
      clientsExcluded: true,
      providerIngressExcluded: true,
      manualWritersExcluded: true,
      backgroundWritersExcluded: true,
      noManagedSchemaCustomizationSinceProjectCreation: true,
      quietWindowEndsAt: new Date(captureClock + 31 * 60_000).toISOString(),
    },
  };
  const input: any = {
    phase: "EMPTY_TO_180",
    mode: "preflight",
    identity,
    context: f.context,
    contracts,
    authorization,
    baseline,
    workflowStartedAt: new Date(captureClock).toISOString(),
  };
  input.actionEnvelope = f.action(input);
  input.timingAdmission = f.timing(input, input.actionEnvelope);
  const options: any = { ...f.deps, policy: () => f.policy };
  const validateBaseline = () =>
    validateVirginBaseline(
      baseline,
      identity,
      f.context,
      replacementPolicy(),
      captureClock,
      timingReviewPolicy(),
      f.policy,
    );
  const validateAction = () =>
    validateFounderAction(input.actionEnvelope, input, options);
  return {
    h,
    f,
    baseline,
    authorization,
    input,
    options,
    validateBaseline,
    validateAction,
  };
}

describe("disarmed founder authority and exact signed scope", () => {
  it("keeps both operational registries disarmed and rejects test authority by default", () => {
    const h = fixture();
    expect(founderPolicy()).toMatchObject({
      enabled: false,
      keys: [],
      founder: null,
    });
    expect(timingReviewPolicy().reviewKeys).toEqual([]);
    expect(() =>
      assertFounderReview(
        h.input.actionEnvelope,
        "action",
        "EMPTY_TO_180",
        h.f.context,
      ),
    ).toThrow("FOUNDER_OPERATIONAL_AUTHORITY_DISABLED");
    expect(() => h.validateBaseline()).not.toThrow();
    expect(() => h.validateAction()).not.toThrow();
  });
  it("keeps truthful identities equal without conferring independent human approval", () => {
    const h = fixture();
    const b = h.validateBaseline();
    expect(b.governance.independentOfOperator).toBe(false);
    expect(b.governance.sameHuman).toBe(true);
    expect(b.governance.operatorIdentity).toBe(b.governance.approverIdentity);
    expect(
      validateBootstrapAuthorization(
        h.authorization,
        identity,
        h.f.context,
        replacementPolicy(),
        contracts,
        captureClock,
        b,
        timingReviewPolicy(),
        h.f.policy,
      ),
    ).toEqual(h.authorization);
    const {
      governance: _g,
      historyReview: _h,
      review: _r,
      reviewEvidenceSha256: _d,
      completeEvidenceReviewed: _c,
      creationHistoryReviewed: _ch,
      ...candidate
    } = b;
    expect(
      validateBaselineCandidate(
        candidate,
        identity,
        h.f.context,
        replacementPolicy(),
        captureClock,
        h.f.policy,
      ),
    ).toMatchObject({
      operational: false,
      status: "CANDIDATE_REQUIRES_FOUNDER_REVIEW",
    });
  });
  it.each([
    "acceptance",
    "independence",
    "same human",
    "approver",
    "operator",
    "authentication",
    "project",
    "archive",
    "production",
    "origin",
    "organization",
    "repository",
    "environment",
    "live",
    "customer data",
    "commit",
    "tree",
    "mode",
    "policy",
    "expiry",
    "unknown field",
  ])("rejects signed %s tampering", (kind) => {
    const h = fixture(),
      a = h.input.actionEnvelope,
      g = a.governance;
    const changes: Record<string, () => void> = {
      acceptance: () => {
        delete g.residualRiskStatement;
      },
      independence: () => {
        g.independentOfOperator = true;
      },
      "same human": () => {
        g.sameHuman = false;
      },
      approver: () => {
        g.approverIdentity = "second-founder-account";
      },
      operator: () => {
        g.operatorIdentity = "unknown";
      },
      authentication: () => {
        g.founder.githubUserId = "99999";
      },
      project: () => {
        g.scope.project = "a".repeat(20);
      },
      archive: () => {
        g.scope.project = "dgogugyuyfourdttvwuy";
      },
      production: () => {
        g.scope.project = "btrfmxjpjzbyowtvncnc";
      },
      origin: () => {
        g.scope.origin = "https://repsync-staging.netlify.app";
      },
      organization: () => {
        g.scope.organization = "other";
      },
      repository: () => {
        g.scope.repository = "other/coachos";
      },
      environment: () => {
        g.scope.environment = "supabase-production";
      },
      live: () => {
        g.scope.paddleEnvironment = "live";
      },
      "customer data": () => {
        g.scope.customerData = "production";
      },
      commit: () => {
        g.executionCommit = "e".repeat(40);
      },
      tree: () => {
        g.executionTree = "e".repeat(40);
      },
      mode: () => {
        g.mode = "independent";
      },
      policy: () => {
        g.policyDigest = "e".repeat(64);
      },
      expiry: () => {
        g.expiresAt = g.createdAt;
      },
      "unknown field": () => {
        g.waiver = true;
      },
    };
    changes[kind]();
    h.f.signDocument(a, "action");
    expect(h.validateAction).toThrow();
  });
  it.each([
    "revoked",
    "untrusted",
    "purpose",
    "authority",
    "key lifetime",
    "duplicate key",
    "scope",
  ])("rejects %s key enrollment", (kind) => {
    const h = fixture(),
      p = h.f.policy,
      key = p.keys[1];
    if (kind === "revoked") key.revoked = true;
    if (kind === "untrusted") key.keyId = "f".repeat(64);
    if (kind === "purpose") key.purposes = ["baseline"];
    if (kind === "authority") key.authority = "evidence";
    if (kind === "key lifetime") key.expiresAt = key.validFrom;
    if (kind === "duplicate key") p.keys.push(structuredClone(key));
    if (kind === "scope") key.scope.project = "a".repeat(20);
    h.input.actionEnvelope.governance.policyDigest = evidenceDigest(p);
    h.f.signDocument(h.input.actionEnvelope, "action");
    expect(h.validateAction).toThrow();
  });
  it("rejects unsigned approval, altered bytes, version/domain confusion and legacy promotion", () => {
    const h = fixture();
    h.input.actionEnvelope.review.signature = "A".repeat(86) + "==";
    expect(h.validateAction).toThrow();
    h.f.signDocument(h.input.actionEnvelope, "timing");
    expect(h.validateAction).toThrow();
    h.f.signDocument(h.input.actionEnvelope, "action");
    h.input.actionEnvelope.schemaVersion = 2;
    expect(h.validateAction).toThrow();
    expect(() => assertTimingReview(h.input.timingAdmission)).toThrow();
    expect(() =>
      validateVirginBaseline(
        h.baseline,
        identity,
        captureContext,
        replacementPolicy(),
        captureClock,
        timingTestReviewPolicy(),
      ),
    ).toThrow();
    expect(() =>
      validateVirginBaseline(
        h.h.baseline,
        identity,
        h.f.context,
        replacementPolicy(),
        captureClock,
        timingTestReviewPolicy(),
        h.f.policy,
      ),
    ).toThrow();
    expect(() =>
      validateVirginBaseline(
        h.h.baseline,
        identity,
        captureContext,
        replacementPolicy(),
        captureClock,
        timingTestReviewPolicy(),
      ),
    ).not.toThrow();
    expect(founderReviewMessage(h.input.actionEnvelope, "action")).not.toEqual(
      founderReviewMessage(h.input.actionEnvelope, "baseline"),
    );
    expect(founderReviewPayload(h.input.actionEnvelope)).toHaveProperty(
      "reviewKeyId",
    );
  });
});

describe("workflow approval, replay and real runner boundaries", () => {
  it("cannot reuse a preflight delivery claim for runner apply", async () => {
    const h = fixture();
    const operation = beginFounderOperation(
      h.input.actionEnvelope,
      h.input,
      h.options,
    );
    const adapter = { observeEmpty: vi.fn(), command: vi.fn() };
    const result = await runBootstrap({ ...h.input, mode: "apply" }, adapter, {
      ...h.f.deps,
      policy: () => replacementPolicy(),
      founderOperation: operation,
      currentIdentity: () => identity,
    });
    expect(result).toMatchObject({
      status: "blocked",
      remoteExecuted: false,
      errorCode: "FOUNDER_ACTION_BINDING",
    });
    expect(adapter.observeEmpty).not.toHaveBeenCalled();
    expect(adapter.command).not.toHaveBeenCalled();
  });
  it("completes founder bootstrap with real observation extraction, canonical artifacts and checkpoint 180", async () => {
    const h = fixture();
    const observer = createBootstrapObserver(
      h.f.context,
      {
        STAGING_SUPABASE_PROJECT_REF: h.f.context.project,
        PRODUCTION_SUPABASE_PROJECT_REF: captureContext.productionProject,
      },
      h.h.transport,
      {
        identity,
        baseline: h.baseline,
        now: () => captureClock,
        founderPolicy: () => h.f.policy,
        authorizeFounder: vi.fn(),
      },
    );
    const inventory = await observer.observe();
    h.authorization.inventoryDigest = inventory.digest;
    h.input.mode = "apply";
    h.input.actionEnvelope = h.f.action(h.input);
    h.input.timingAdmission = h.f.timing(h.input, h.input.actionEnvelope);
    const after = {
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
      observedAt: new Date(captureClock).toISOString(),
      stability: {
        stable: true,
        startedAt: new Date(captureClock).toISOString(),
        completedAt: new Date(captureClock).toISOString(),
      },
    };
    const commands = vi.fn((args: string[]) =>
      args.includes("--dry-run")
        ? identity.manifest.migrations.approved
            .slice(0, 180)
            .map((m: any) => m.filename)
            .join("\n")
        : "",
    );
    const adapter = {
      observeEmpty: () => observer.observe(),
      observeRelease: async () => after,
      ledgerCount: async () => 180,
      command: commands,
    };
    const result = await runBootstrap(h.input, adapter, {
      ...h.f.deps,
      policy: () => replacementPolicy(),
      currentIdentity: () => identity,
    });
    expect(result).toMatchObject({
      status: "complete",
      commercialCertification: "not_run",
      checkpoint: { ledgerCount: 180, noFunctionsDeployed: true },
    });
    expect(
      commands.mock.calls.filter(([args]) => args.includes("--yes")),
    ).toHaveLength(1);
    const repeated = await runBootstrap(h.input, adapter, {
      ...h.f.deps,
      policy: () => replacementPolicy(),
      currentIdentity: () => identity,
    });
    expect(repeated).toMatchObject({
      status: "blocked",
      remoteExecuted: false,
      errorCode: "FOUNDER_ACTION_REPLAYED",
      automaticResume: false,
    });
  }, 30_000);
  it.each([
    "run",
    "attempt",
    "workflow",
    "actor",
    "mode",
    "phase",
    "authorization",
    "migrations",
  ])("rejects signed %s substitution", (kind) => {
    const h = fixture(),
      a = h.input.actionEnvelope;
    if (kind === "run") a.workflow.runId = "999999";
    if (kind === "attempt") a.workflow.runAttempt++;
    if (kind === "workflow")
      a.workflow.workflowRef = "other/workflow@refs/heads/main";
    if (kind === "actor") a.workflow.actorId = "99999";
    if (kind === "mode") a.mode = "apply";
    if (kind === "phase") a.phase = "RESUME_FINAL_186";
    if (kind === "authorization") a.authorizationDigest = "f".repeat(64);
    if (kind === "migrations")
      a.migrationApproval.orderedMigrationsDigest = "f".repeat(64);
    h.f.signDocument(a, "action");
    expect(h.validateAction).toThrow();
  });
  it("requires trusted workflow verification and durable claims, never signed booleans alone", () => {
    const h = fixture();
    expect(() =>
      validateFounderAction(h.input.actionEnvelope, h.input, {
        policy: () => h.f.policy,
        now: () => captureClock,
      }),
    ).toThrow("FOUNDER_WORKFLOW_VERIFICATION_UNCONFIGURED");
    expect(() =>
      beginFounderOperation(h.input.actionEnvelope, h.input, {
        ...h.options,
        claimAction: undefined,
      }),
    ).toThrow("FOUNDER_REPLAY_GUARD_UNCONFIGURED");
    h.f.proof.requiredChecksPassed = false;
    expect(h.validateAction).toThrow();
  });
  it("checks approval, bypass protection, freshness and exact required-check revision", () => {
    for (const field of [
      "environmentApproved",
      "protectedMain",
      "bypassUsed",
      "checksCommit",
      "checksTree",
      "observedAt",
    ]) {
      const h = fixture();
      h.f.proof[field] =
        field === "bypassUsed"
          ? true
          : field === "observedAt"
            ? new Date(captureClock - 16 * 60_000).toISOString()
            : field.startsWith("checks")
              ? "e".repeat(40)
              : false;
      h.input.actionEnvelope.workflowEvidenceSha256 = evidenceDigest(h.f.proof);
      h.f.signDocument(h.input.actionEnvelope, "action");
      expect(h.validateAction).toThrow();
    }
  });
  it("permits gate revalidation but denies reuse and a replacement nonce in the same action slot", () => {
    const h = fixture();
    const operation = beginFounderOperation(
      h.input.actionEnvelope,
      h.input,
      h.options,
    );
    expect(() => operation.check()).not.toThrow();
    expect(() =>
      beginFounderOperation(h.input.actionEnvelope, h.input, h.options),
    ).toThrow("FOUNDER_ACTION_REPLAYED");
    h.input.actionEnvelope.nonce = "00000000-0000-4000-8000-000000000001";
    h.f.signDocument(h.input.actionEnvelope, "action");
    expect(() =>
      beginFounderOperation(h.input.actionEnvelope, h.input, h.options),
    ).toThrow("FOUNDER_ACTION_REPLAYED");
    expect(() => operation.check()).toThrow("FOUNDER_ACTION_CHANGED");
  });
  it("blocks capture before transport when founder authority is absent", async () => {
    const h = fixture();
    await expect(
      captureBaselineCandidate(
        {
          identity,
          context: h.f.context,
          env: {},
          operator: h.baseline.creation,
          expiresAt: h.baseline.capture.expiresAt,
        },
        { transport: h.h.transport, now: () => captureClock },
      ),
    ).rejects.toThrow();
    expect(h.h.transport).not.toHaveBeenCalled();
  });
  it("blocks bootstrap and release before observations or mutations without signed actions", async () => {
    const h = fixture();
    const adapter = {
      observeEmpty: vi.fn(),
      observe: vi.fn(),
      command: vi.fn(),
    };
    const deps = { now: () => captureClock, currentIdentity: () => identity };
    expect(
      await runBootstrap(
        { ...h.input, actionEnvelope: undefined },
        adapter,
        deps,
      ),
    ).toMatchObject({ status: "blocked", remoteExecuted: false });
    expect(
      await runRelease(
        { ...h.input, phase: "BASELINE_180_TO_184", actionEnvelope: undefined },
        adapter,
        deps,
      ),
    ).toMatchObject({ status: "blocked", remoteExecuted: false });
    expect(adapter.observeEmpty).not.toHaveBeenCalled();
    expect(adapter.observe).not.toHaveBeenCalled();
    expect(adapter.command).not.toHaveBeenCalled();
  });
  it("denies a remote adapter without action checking and denies staging evidence to production", async () => {
    const h = fixture(),
      transport = vi.fn();
    const adapter = createRemoteAdapter(h.f.context, {}, transport);
    await expect(adapter.observe()).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    expect(() =>
      validateProductionAuthorization(
        h.input.actionEnvelope,
        identity.manifest,
        {},
        {},
      ),
    ).toThrow();
  });
});

describe("founder baseline technical gates and unchanged timing budgets", () => {
  it("accepts truthful retrospective founder review but retains complete-history predicates", () => {
    const h = fixture();
    const b = h.f.baseline(
      retrospectiveBaselineFixture(h.h.baseline),
      identity,
    );
    const validate = () =>
      validateVirginBaseline(
        b,
        identity,
        h.f.context,
        replacementPolicy(),
        captureClock,
        timingReviewPolicy(),
        h.f.policy,
      );
    expect(validate()).toMatchObject({
      historyReview: {
        independentOfOperator: false,
        sameHuman: true,
        historicalWriteCapabilityAcknowledged: true,
      },
    });
    b.creation.history.customerModificationHistoryKnown = false;
    h.f.signDocument(b, "baseline");
    expect(validate).toThrow("BOOTSTRAP_BASELINE_INVALID");
  });
  it("rechecks revoked founder authority after claiming an operation", () => {
    const h = fixture();
    const operation = beginFounderOperation(
      h.input.actionEnvelope,
      h.input,
      h.options,
    );
    h.f.policy.keys[1].revoked = true;
    expect(() => operation.check()).toThrow();
  });
  it("does not allow bootstrap authorization to outlive founder baseline acceptance", () => {
    const h = fixture();
    h.baseline.governance.expiresAt = new Date(
      captureClock + 5 * 60_000,
    ).toISOString();
    h.f.signDocument(h.baseline, "baseline");
    h.authorization.baselineEvidenceSha256 = evidenceDigest(h.baseline);
    h.authorization.bindingDigest = evidenceDigest(
      bootstrapBinding(
        identity,
        h.f.context,
        replacementPolicy(),
        contracts,
        h.baseline,
      ),
    );
    expect(() =>
      validateBootstrapAuthorization(
        h.authorization,
        identity,
        h.f.context,
        replacementPolicy(),
        contracts,
        captureClock,
        h.baseline,
        timingReviewPolicy(),
        h.f.policy,
      ),
    ).toThrow("BOOTSTRAP_FOUNDER_AUTHORIZATION_WINDOW");
  });
  it.each([
    "customer",
    "import",
    "customization",
    "unknown history",
    "roles",
    "RLS",
    "snapshot",
    "signed bytes",
  ])("rejects %s even with founder approval", (kind) => {
    const h = fixture(),
      b = h.baseline;
    if (kind === "customer") b.capture.opening.facts.authUsers = 1;
    if (kind === "import") b.creation.noRestoreOrImport = false;
    if (kind === "customization")
      b.creation.knownCustomerCustomizations.push("unknown SQL");
    if (kind === "unknown history")
      delete b.creation.history.operatorAuthenticationEvidenceSha256;
    if (kind === "roles") b.databaseProof.securityCatalogs.roleSettings = 1;
    if (kind === "RLS") b.databaseProof.customerSecurity = [];
    if (kind === "snapshot") b.capture.confirmation.project.status = "UNKNOWN";
    if (kind === "signed bytes")
      b.governance.historicalLimitations.push("changed after signing");
    if (kind !== "signed bytes") h.f.signDocument(b, "baseline");
    expect(h.validateBaseline).toThrow();
  });
  it("admits three complete founder-bound samples and stops expired authority", () => {
    const h = fixture();
    const input = { ...h.input, admission: h.input.timingAdmission };
    const options = {
      now: () => captureClock,
      founderPolicy: () => h.f.policy,
    };
    expect(createTimingAdmission(input, options).check()).toMatchObject({
      guarantee: false,
    });
    expect(() =>
      createTimingAdmission(input, {
        ...options,
        now: () => captureClock + 10 * 60_000,
      }),
    ).toThrow();
  });
  it.each([
    "samples",
    "legacy receipt",
    "tree",
    "action",
    "receipt tamper",
    "allowance",
    "baseline deadline",
  ])("blocks timing %s", (kind) => {
    const h = fixture(),
      a = h.input.timingAdmission;
    if (kind === "samples") a.samples.empty.pop();
    if (kind === "legacy receipt") a.samples.empty[0].receipt.schemaVersion = 2;
    if (kind === "tree")
      a.samples.empty[0].receipt.binding.executionTree = "e".repeat(40);
    if (kind === "action") a.actionEnvelopeDigest = "e".repeat(64);
    if (kind === "receipt tamper")
      a.samples.empty[0].receipt.proof.confirmation.DATABASE_DRIFT = "f".repeat(
        64,
      );
    if (kind === "allowance") a.allowances.mutationMs = 999;
    if (kind === "baseline deadline") {
      h.baseline.capture.startedAt = new Date(
        captureClock - 15 * 60_000 + 1000,
      ).toISOString();
      h.authorization.baselineEvidenceSha256 = evidenceDigest(h.baseline);
      h.input.actionEnvelope = h.f.action(h.input);
      h.input.timingAdmission = h.f.timing(h.input, h.input.actionEnvelope);
    } else h.f.signDocument(a, "timing");
    expect(() =>
      createTimingAdmission(
        { ...h.input, admission: h.input.timingAdmission },
        { now: () => captureClock, founderPolicy: () => h.f.policy },
      ),
    ).toThrow();
  });
  it("binds the full founder policy and signed action into timing admission", () => {
    const h = fixture();
    const binding = timingBinding(
      h.input.phase,
      h.authorization,
      identity,
      h.f.context,
      contracts,
      replacementPolicy(),
      h.input.actionEnvelope,
      h.f.policy,
    );
    expect(binding.actionEnvelopeDigest).toBe(
      evidenceDigest(h.input.actionEnvelope),
    );
    expect(binding.governancePolicyDigest).toBe(evidenceDigest(h.f.policy));
    expect(binding.margin).toBe(1.25);
    expect(binding.observationLimitMs).toBe(60_000);
    expect(binding.workflowLimitMs).toBe(45 * 60_000);
    expect(h.f.context.governanceMode).toBe(FOUNDER_MODE);
  });
});
