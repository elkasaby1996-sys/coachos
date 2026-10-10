import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalV2,
  digestV2,
  parseSignedJson,
  signingMessageV2,
  validateSignedV2,
  validatePolicyV2,
  validateIntentV2,
  validateReferenceGraphV2,
  reviewedCapabilityPlan,
  validateLifecycleStateV2,
  validateTransitionV2,
  validateEpochReplacementV2,
  validateLiveStatusV2,
  validateExecutionReceiptV2,
  parseVersionedFounderDocument,
  capabilitySchema,
  V2_CAPABILITIES,
  V2_DOMAINS,
  V2_LIMITS,
} from "../../scripts/staging-founder-authorization-v2.mjs";
import {
  FOUNDER_DOMAINS,
  founderReviewMessage,
} from "../../scripts/staging-founder-governance.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import {
  PHASES,
  validateAuthorization,
} from "../../scripts/staging-release-contracts.mjs";
import { databaseProof } from "../../scripts/staging-bootstrap-database.mjs";
import { bootstrapBinding } from "../../scripts/staging-bootstrap-contracts.mjs";
import {
  evidenceV2,
  stampV2,
  stateV2,
  uuid,
  v2Fixture,
} from "../helpers/staging-founder-v2-fixture";

afterEach(() => vi.restoreAllMocks());
// Load the frozen 740-file identity once outside individual test deadlines.
beforeAll(() => {
  v2Fixture();
});
const check = (f: ReturnType<typeof v2Fixture>) =>
  validateReferenceGraphV2(f.graph, f.context);
function rebindBaseline(f: ReturnType<typeof v2Fixture>) {
  f.signDocument(f.baseline, "baseline");
  const index = f.graph.evidence.findIndex(
    (e: any) => e.reference.type === "baseline",
  );
  f.graph.evidence[index] = evidenceV2("baseline", f.baseline, 5);
  f.graph.authorization.baselineEvidenceSha256 = digestV2(f.baseline);
  f.graph.authorization.bindingDigest = digestV2(
    bootstrapBinding(
      f.context.identity,
      f.context.releaseContext,
      f.context.registry,
      f.context.contracts,
      f.baseline,
    ),
  );
  f.graph.timing.baselineEvidenceSha256 = digestV2(f.baseline);
  for (const entry of f.graph.timing.samples) {
    entry.receipt.binding.baselineEvidenceSha256 = digestV2(f.baseline);
    const at = f.graph.evidence.findIndex(
      (e: any) =>
        e.reference.type === "observation" &&
        e.reference.semanticSha256 === entry.receipt.completeObservationSha256,
    );
    const observation = JSON.parse(f.graph.evidence[at].json);
    observation.baselineEvidenceSha256 = digestV2(f.baseline);
    f.graph.evidence[at] = evidenceV2(
      "observation",
      observation,
      Number(f.graph.evidence[at].reference.objectId.slice(-12)),
    );
    entry.receipt.completeObservationSha256 =
      f.graph.evidence[at].reference.semanticSha256;
    entry.receiptSha256 = digestV2(entry.receipt);
  }
  const inventoryIndex = f.graph.evidence.findIndex(
    (e: any) => e.reference.objectId === uuid(13),
  );
  const inventory = JSON.parse(f.graph.evidence[inventoryIndex].json);
  inventory.baselineEvidenceSha256 = digestV2(f.baseline);
  f.graph.evidence[inventoryIndex] = evidenceV2("observation", inventory, 13);
  f.seal();
}

describe("V2 pure authorization contracts", () => {
  it("validates a complete signed graph while withholding ALL operational authority", () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
    const f = v2Fixture();
    expect(check(f)).toMatchObject({
      status: "CONTRACT_GRAPH_VALID",
      operational: false,
      executionEligible: false,
    });
    expect(network).not.toHaveBeenCalled();
    expect(check(f).externalRequirements).toContain("DURABLE_UNIQUE_CLAIM");
    expect(check(f).externalRequirements).toContain("INDEPENDENT_RETENTION");
  });

  it.each([
    "CAPTURE_BASELINE",
    "STATUS",
    "BACKUP_180",
    "BACKUP_184",
    "RECOVERY_INSPECT",
    "MEASURE_TIMING",
  ])(
    "supports the distinct %s contract without granting release authority",
    (kind) => {
      const capability: any = {
        kind,
        mode: "preflight",
        ...(kind === "RECOVERY_INSPECT"
          ? {
              blockedOperationId: uuid(60),
              blockedActionDigest: "1".repeat(64),
            }
          : {}),
        ...(kind === "MEASURE_TIMING"
          ? {
              phase: "EMPTY_TO_180",
              observationKind: "empty",
              sampleCount: 3,
              measurementForIntentDigest: "2".repeat(64),
            }
          : {}),
      };
      const f = v2Fixture(capability);
      expect(check(f).operational).toBe(false);
      expect(f.graph.timing).toBeNull();
      expect(f.graph.claim.slot.phase).toBe(
        kind === "MEASURE_TIMING" ? "MEASURE_TIMING:EMPTY_TO_180" : kind,
      );
    },
  );

  it("binds every existing fixed recovery phase to the canonical migration/contract plan", () => {
    const f = v2Fixture();
    for (const [kind, phase] of Object.entries(PHASES) as any[]) {
      const plan = reviewedCapabilityPlan(
        { kind, mode: "apply" },
        f.context.identity,
        f.context.contracts,
      );
      expect(plan.startCheckpoint).toBe(phase.start);
      expect(plan.endCheckpoint).toBe(phase.end);
      expect(plan.orderedMigrationsDigest).toBe(
        digestV2(
          f.context.identity.manifest.migrations.approved.slice(
            phase.start,
            phase.end,
          ),
        ),
      );
    }
    expect(V2_CAPABILITIES).toHaveLength(17);
  });

  it.each(Object.keys(PHASES))(
    "validates the complete %s graph through the unchanged inner release authorization",
    (kind) => {
      const f = v2Fixture({ kind, mode: "apply" });
      // Use the unchanged release producer's serialization independently of
      // the V2 plan and fixture, so a shared digest mistake cannot pass.
      const checkpointDigest = hash(JSON.stringify(f.context.contracts));
      expect(f.graph.authorization.checkpointContractDigest).toBe(
        checkpointDigest,
      );
      expect(
        validateAuthorization(
          f.graph.authorization,
          kind,
          f.context.identity,
          f.context.releaseContext,
          checkpointDigest,
          f.context.now,
        ),
      ).toEqual(f.graph.authorization);
      expect(check(f)).toMatchObject({
        operational: false,
        executionEligible: false,
      });
      expect(f.graph.timing.workload).toHaveProperty("observations");
    },
  );

  it("rejects a resealed release authorization using the incompatible sorted checkpoint digest", () => {
    const f = v2Fixture({ kind: "BASELINE_180_TO_184", mode: "apply" });
    expect(check(f).operational).toBe(false);
    const sortedDigest = digestV2(f.context.contracts);
    expect(sortedDigest).not.toBe(hash(JSON.stringify(f.context.contracts)));
    f.graph.authorization.checkpointContractDigest = sortedDigest;
    f.seal();
    expect(() => check(f)).toThrow("RELEASE_AUTHORIZATION_BINDING");
  });

  it.each([
    ["STATUS", "preflight", 900_000],
    ["BACKUP_180", "preflight", 1_800_000],
    ["BACKUP_184", "preflight", 1_800_000],
    ["EMPTY_TO_180", "apply", 2_700_000],
    ["BASELINE_180_TO_184", "apply", 2_700_000],
  ])(
    "preserves the existing %s job deadline without resetting fresh authority",
    (kind, mode, limit) => {
      const f = v2Fixture({ kind, mode });
      f.policy.validFrom = stampV2(-3_600_000);
      f.policy.activatedAt = stampV2(-3_500_000);
      f.graph.intent.policyDigest = digestV2(f.policy);
      const setElapsed = (elapsed: number) => {
        f.graph.intent.workflow.jobStartedAt = new Date(
          f.context.now - elapsed,
        ).toISOString();
        f.graph.intent.workflow.runCreatedAt = new Date(
          f.context.now - elapsed - 1000,
        ).toISOString();
        f.context.intent = structuredClone(f.graph.intent);
        f.graph.authorization.intentDigest = digestV2(f.graph.intent);
        // Release/bootstrap inner envelopes do not contain intentDigest.
        if (f.graph.timing) delete f.graph.authorization.intentDigest;
        f.seal();
      };
      setElapsed(Number(limit) - 1);
      expect(validateIntentV2(f.graph.intent, f.context)).toEqual(
        f.graph.intent,
      );
      if (!f.graph.timing) expect(check(f).executionEligible).toBe(false);
      for (const elapsed of [Number(limit), Number(limit) + 1]) {
        setElapsed(elapsed);
        expect(() => check(f)).toThrow("V2_ACTIVATION_WORKFLOW_BINDING");
      }
    },
  );

  it("validates the separate initial-gateway contract without permitting billing deployment", () => {
    const f = v2Fixture({
      kind: "PREPARE_INITIAL_NONBILLING_184",
      mode: "apply",
    });
    expect(check(f).executionEligible).toBe(false);
    expect(f.graph.timing).toBeNull();
    expect(f.graph.intent.plan.orderedMigrationsDigest).toBe(digestV2([]));
  });

  it.each(["configuration", "backup", "webhookHistory"])(
    "rejects substituted %s evidence despite otherwise valid release authorization and signatures",
    (part) => {
      const f = v2Fixture({ kind: "BASELINE_180_TO_184", mode: "apply" });
      expect(check(f).operational).toBe(false);
      if (part === "webhookHistory")
        f.graph.authorization.webhookHistory.review.evidenceSha256 = "f".repeat(
          64,
        );
      else f.graph.authorization[part].evidenceSha256 = "f".repeat(64);
      if (part === "backup")
        f.graph.authorization.backup.restore.backupEvidenceSha256 = "f".repeat(
          64,
        );
      f.seal();
      expect(() => check(f)).toThrow("V2_INNER_EVIDENCE_MISSING");
    },
  );

  it("restricts initial gateway preparation to exactly the two frozen JWT functions", () => {
    const f = v2Fixture();
    const c = { kind: "PREPARE_INITIAL_NONBILLING_184", mode: "apply" };
    const plan = reviewedCapabilityPlan(
      c,
      f.context.identity,
      f.context.contracts,
    );
    expect(plan.startCheckpoint).toBe(184);
    expect(plan.endCheckpoint).toBe(184);
    expect(plan.artifactPlanDigest).toBe(
      digestV2(
        f.context.identity.functions.filter((x: any) =>
          ["open-wearables", "exercise-dataset-search"].includes(x.name),
        ),
      ),
    );
    const changed = structuredClone(f.context.identity);
    changed.functions.find((x: any) => x.name === "open-wearables").verifyJwt =
      false;
    expect(() =>
      reviewedCapabilityPlan(c, changed, f.context.contracts),
    ).toThrow("V2_PREPARATION_ARTIFACT_INVALID");
  });

  it.each([
    { kind: "shell", mode: "apply" },
    { kind: "CAPTURE_BASELINE", mode: "apply" },
    {
      kind: "MEASURE_TIMING",
      mode: "apply",
      phase: "EMPTY_TO_180",
      observationKind: "empty",
      sampleCount: 3,
      measurementForIntentDigest: "2".repeat(64),
    },
    { kind: "EMPTY_TO_180", mode: "apply", command: "arbitrary" },
    { kind: "STATUS", mode: "preflight", url: "https://attacker.invalid" },
    { kind: "PREPARE_INITIAL_NONBILLING_184", mode: "preflight" },
    { kind: "RESUME_ANYTHING", mode: "apply" },
  ])("rejects unsupported or broadened capability %j", (c) =>
    expect(capabilitySchema.safeParse(c).success).toBe(false),
  );

  it.each(["action", "baseline", "timing", "delivery", "retention"])(
    "uses only the %s signature purpose",
    (purpose) => {
      const f = v2Fixture();
      const documents: any = {
        action: f.graph.action,
        baseline: f.baseline,
        timing: f.graph.timing,
        delivery: f.graph.delivery,
        retention: f.graph.acknowledgement,
      };
      expect(validateSignedV2(documents[purpose], purpose, f.context)).toEqual(
        documents[purpose],
      );
      f.signDocument(
        documents[purpose],
        purpose,
        purpose === "action" ? "baseline" : "action",
      );
      expect(() =>
        validateSignedV2(documents[purpose], purpose, f.context),
      ).toThrow("V2_KEY_PURPOSE_DENIED");
    },
  );

  it("is deterministic and recursively key canonical, with stable signing vectors", () => {
    const f = v2Fixture();
    expect(canonicalV2({ z: 1, a: { z: 3, a: 2 } })).toBe(
      '{"a":{"a":2,"z":3},"z":1}',
    );
    expect(f.graph.action.signature).toEqual(
      v2Fixture().graph.action.signature,
    );
    expect(hash(signingMessageV2(f.graph.action, "action"))).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(signingMessageV2(f.graph.action, "action").toString()).toContain(
      V2_DOMAINS.action + "\n",
    );
    // Signing graph is acyclic: the action precedes delivery and claim/retention.
    expect(Object.keys(f.graph.action)).not.toContain("deliveryManifestDigest");
    expect(Object.keys(f.graph.timing)).not.toContain("actionDigest");
    const vector = {
      schemaVersion: 2,
      fixture: "canonical-vector",
      nested: { z: 1, a: 2 },
    };
    const signed = f.signDocument(vector, "action");
    expect(signed.signature.keyId).toBe(
      "fd110d301d2f077de1414b8f99f441b1403fab207b2052fbd2c065e4ee8e7dc2",
    );
    expect(hash(signingMessageV2(signed, "action"))).toBe(
      "246a6fa60f42ec048ea6ddfb40a4f7da953fdd12980d33c8bd824363585c3264",
    );
    expect(signed.signature.signature).toBe(
      "DClDNXgnC4L6siCZIg71lSIIzc22vGmtX5yL3DiYmJI3giFhXQ1JoStorwTnSVE+9LPXDLqev7nH3aFpItWMCQ==",
    );
  });

  it("rejects a genuine V1-domain signature even on otherwise valid V2 fields", () => {
    const f = v2Fixture();
    const old = {
      ...f.graph.action,
      review: { keyId: f.graph.action.signature.keyId, signature: "" },
    };
    // Test-only sign hook deliberately uses the legacy byte construction.
    const message = founderReviewMessage(old, "action");
    expect(message.toString().startsWith(FOUNDER_DOMAINS.action + "\n")).toBe(
      true,
    );
    const wrong = structuredClone(f.graph.action);
    wrong.signature.signature = f.signBytes(message, "action");
    expect(() => validateSignedV2(wrong, "action", f.context)).toThrow(
      "V2_SIGNATURE_INVALID",
    );
    expect(V2_DOMAINS.action).not.toBe(FOUNDER_DOMAINS.action);
  });

  it.each([
    ["run", (i: any) => (i.workflow.runId = "999")],
    ["attempt", (i: any) => i.workflow.runAttempt++],
    ["source tree", (i: any) => (i.source.tree = "e".repeat(40))],
  ])("rejects substituted expected %s identity", (_name, mutate: any) => {
    const f = v2Fixture();
    mutate(f.graph.intent);
    expect(() => check(f)).toThrow("V2_EXPECTED_INTENT_BINDING");
  });

  it.each([
    [
      "repository",
      (i: any) => (i.workflow.repository = "other/repo"),
      "V2_INTENT_INVALID",
    ],
    [
      "environment",
      (i: any) => (i.scope.environment = "production"),
      "V2_INTENT_INVALID",
    ],
    [
      "target",
      (i: any) => (i.scope.project = "btrfmxjpjzbyowtvncnc"),
      "V2_INTENT_INVALID",
    ],
    [
      "archived",
      (i: any) => (i.scope.project = "dgogugyuyfourdttvwuy"),
      "V2_INTENT_INVALID",
    ],
    ["epoch", (i: any) => (i.epoch = uuid(99)), "V2_EPOCH_POLICY_BINDING"],
    [
      "workflow SHA",
      (i: any) => (i.workflow.workflowSha = "e".repeat(40)),
      "V2_WORKFLOW_BINDING",
    ],
    ["actor", (i: any) => (i.workflow.actorId = "4567"), "V2_WORKFLOW_BINDING"],
    [
      "owner",
      (i: any) => (i.workflow.repositoryOwnerId = "4567"),
      "V2_WORKFLOW_BINDING",
    ],
    [
      "migration plan",
      (i: any) => (i.plan.orderedMigrationsDigest = "e".repeat(64)),
      "V2_PLAN_BINDING",
    ],
    [
      "checkpoint",
      (i: any) => (i.plan.checkpointContractDigest = "e".repeat(64)),
      "V2_PLAN_BINDING",
    ],
    [
      "activation",
      (i: any) => (i.workflow.runCreatedAt = stampV2(-60_000)),
      "V2_ACTIVATION_WORKFLOW_BINDING",
    ],
    [
      "workflow deadline",
      (i: any) => {
        i.workflow.jobStartedAt = stampV2(-2_700_000);
        i.workflow.runCreatedAt = stampV2(-2_700_000);
      },
      "V2_ACTIVATION_WORKFLOW_BINDING",
    ],
  ])(
    "enforces %s independently of expected intent equality",
    (_name, mutate: any, code: any) => {
      const f = v2Fixture();
      mutate(f.context.intent);
      if (_name === "workflow deadline")
        ((f.context.policy.activatedAt = stampV2(-2_700_001)),
          (f.context.policy.validFrom = stampV2(-2_700_002)),
          (f.context.intent.policyDigest = digestV2(f.context.policy)));
      expect(() => validateIntentV2(f.context.intent, f.context)).toThrow(code);
    },
  );

  it.each([
    [
      "raw bytes",
      (f: any) => (f.graph.evidence[0].json += " "),
      "V2_EVIDENCE_RAW_BINDING",
    ],
    [
      "semantic identity",
      (f: any) =>
        (f.graph.evidence[0].reference.semanticSha256 = "f".repeat(64)),
      "V2_EVIDENCE_SEMANTIC_BINDING",
    ],
    [
      "duplicate object",
      (f: any) => f.graph.evidence.push(structuredClone(f.graph.evidence[0])),
      "V2_EVIDENCE_DUPLICATE",
    ],
    [
      "missing timing",
      (f: any) => (f.graph.timing = null),
      "V2_TIMING_REQUIRED",
    ],
    [
      "inner binding",
      (f: any) => (f.graph.authorization.bindingDigest = "f".repeat(64)),
      "V2_INNER_BINDING",
    ],
    [
      "missing baseline",
      (f: any) =>
        (f.graph.evidence = f.graph.evidence.filter(
          (e: any) => e.reference.type !== "baseline",
        )),
      "V2_BASELINE_REQUIRED",
    ],
    [
      "claim run",
      (f: any) => (f.graph.claim.slot.runId = "9876"),
      "V2_CLAIM_SLOT_BINDING",
    ],
    [
      "claim attempt",
      (f: any) => f.graph.claim.slot.runAttempt++,
      "V2_CLAIM_SLOT_BINDING",
    ],
    [
      "claim nonce",
      (f: any) => (f.graph.claim.nonce = uuid(93)),
      "V2_CLAIM_BINDING",
    ],
    [
      "retention identity",
      (f: any) => (f.graph.retention.claimDigest = "f".repeat(64)),
      "V2_RETENTION_BINDING",
    ],
  ])(
    "rejects %s at its intended graph edge",
    (_name, mutate: any, code: any) => {
      const f = v2Fixture();
      expect(check(f).operational).toBe(false);
      mutate(f);
      expect(() => check(f)).toThrow(code);
    },
  );

  it.each([
    [
      "sample target",
      (t: any) => (t.samples[0].receipt.binding.projectSha256 = "e".repeat(64)),
      "V2_TIMING_SAMPLE_BINDING",
    ],
    [
      "duplicate sample",
      (t: any) => (t.samples[1] = structuredClone(t.samples[0])),
      "V2_TIMING_SAMPLE_INVALID",
    ],
    [
      "missing actual observation",
      (t: any) =>
        (t.samples[0].receipt.completeObservationSha256 = "e".repeat(64)),
      "V2_TIMING_OBSERVATION_MISSING",
    ],
    [
      "actual observation disagreement",
      (t: any) => (t.samples[0].receipt.observationDigest = "e".repeat(64)),
      "V2_TIMING_OBSERVATION_BINDING",
    ],
    [
      "workload",
      (t: any) => t.workload.observations++,
      "V2_TIMING_WORKLOAD_BINDING",
    ],
    [
      "budget",
      (t: any) => (t.allowances.controlPlaneMs = 600_000),
      "V2_TIMING_BUDGET_BLOCKED",
    ],
  ])(
    "rejects %s with valid synthetic timing signatures",
    (_name, mutate: any, code: any) => {
      const f = v2Fixture();
      mutate(f.graph.timing);
      for (const entry of f.graph.timing.samples)
        entry.receiptSha256 = digestV2(entry.receipt);
      f.seal();
      expect(() => check(f)).toThrow(code);
    },
  );

  it("rejects substituted delivery objects even with a valid delivery signature", () => {
    const f = v2Fixture();
    f.graph.delivery.objects[0].rawSha256 = "e".repeat(64);
    f.signDocument(f.graph.delivery, "delivery");
    expect(() => check(f)).toThrow("V2_DELIVERY_OBJECT_BINDING");
  });
  it("rejects unbound history references even with valid signatures and downstream bindings", () => {
    const f = v2Fixture();
    const governance = f.governance();
    governance.historicalEvidenceSha256 = ["e".repeat(64)];
    f.seal(governance);
    expect(validateSignedV2(f.graph.action, "action", f.context)).toEqual(
      f.graph.action,
    );
    expect(() => check(f)).toThrow("V2_GOVERNANCE_EVIDENCE_MISSING");
  });

  it("never turns measurement into mutation authorization", () => {
    const f = v2Fixture({
      kind: "MEASURE_TIMING",
      mode: "preflight",
      phase: "EMPTY_TO_180",
      observationKind: "empty",
      sampleCount: 3,
      measurementForIntentDigest: "2".repeat(64),
    });
    expect(check(f).executionEligible).toBe(false);
    f.graph.intent.capability.mode = "apply";
    expect(() => check(f)).toThrow("V2_GRAPH_INVALID");
  });

  it("preserves independent ACL enforcement inside a fully signed matching V4 baseline", () => {
    const f = v2Fixture();
    expect(check(f).operational).toBe(false);
    const proof = structuredClone(f.baseline.databaseProof);
    proof.customerSecurity.find(
      (r: any) =>
        r[0] === "acl" &&
        r[1].join(".") === "relation.storage.objects" &&
        r[3][1] === "anon" &&
        r[4] === "UPDATE",
    )[5] = true;
    f.baseline.databaseProof = databaseProof(proof);
    for (const key of ["opening", "closing", "confirmation"])
      f.baseline.capture[key].facts.databaseProof = structuredClone(
        f.baseline.databaseProof,
      );
    rebindBaseline(f);
    expect(validateSignedV2(f.baseline, "baseline", f.context)).toEqual(
      f.baseline,
    );
    expect(() => check(f)).toThrow("BOOTSTRAP_CUSTOMER_SECURITY_MISMATCH");
  });

  it("preserves genuine final-confirmation index/overlay rejection with valid signatures", () => {
    const f = v2Fixture();
    expect(check(f).operational).toBe(false);
    const proof = structuredClone(
      f.baseline.capture.confirmation.facts.databaseProof,
    );
    proof.catalog.push([
      "index",
      "storage.objects.customer_unique",
      ["supabase_storage_admin", "UNIQUE", true, true],
    ]);
    proof.catalogCount++;
    delete proof.catalogDigest;
    f.baseline.capture.confirmation.facts.databaseProof = databaseProof(proof);
    rebindBaseline(f);
    expect(() => check(f)).toThrow("BOOTSTRAP_BASELINE_DATABASE_BINDING");
  });

  it.each([
    "clientsExcluded",
    "providerIngressExcluded",
    "manualWritersExcluded",
    "backgroundWritersExcluded",
  ])("requires current %s independently of historical approval", (field) => {
    const f = v2Fixture();
    expect(check(f).operational).toBe(false);
    f.graph.authorization.operational[field] = false;
    expect(() => check(f)).toThrow("V2_GRAPH_INVALID");
  });

  it.each([
    "noRestoreOrImport",
    "noManagedSchemaCustomizationSinceProjectCreation",
  ])("rejects absent/false %s despite a valid baseline signature", (field) => {
    const f = v2Fixture();
    expect(check(f).operational).toBe(false);
    f.baseline.creation[field] = false;
    rebindBaseline(f);
    expect(() => check(f)).toThrow("V2_DOCUMENT_INVALID");
  });

  it("requires an unexpired exclusion window beyond authorization expiry", () => {
    const f = v2Fixture();
    f.graph.authorization.operational.quietWindowEndsAt =
      f.graph.authorization.expiresAt;
    expect(() => check(f)).toThrow("V2_INNER_WINDOW_INVALID");
  });

  it("retains the retrospective route as an explicit founder risk acceptance, not independent historical truth", () => {
    const f = v2Fixture();
    const authentication = f.graph.evidence[0].reference.semanticSha256;
    const history = f.graph.evidence[2].reference.semanticSha256;
    f.baseline.creation.history = {
      schemaVersion: 1,
      mode: "retrospective_non_modification",
      operatorAuthenticationEvidenceSha256: [authentication],
      noUnreviewedCustomerModification: true,
      customerModificationHistoryKnown: true,
      historicalAccess: {
        writeCapabilityMayHaveExisted: true,
        actors: [
          {
            identity: f.policy.founder.subject,
            writeCapable: true,
            evidenceSha256: [history],
          },
        ],
        evidenceSha256: [history],
        limitations: [
          "Synthetic access inventory cannot establish historical truth.",
        ],
      },
      knownConfigurationChanges: [],
    };
    Object.assign(f.baseline.historyReview, {
      mode: "retrospective_non_modification",
      historicalWriteCapabilityAcknowledged: true,
      accessLimitationsReviewed: true,
      configurationChangesReviewed: true,
    });
    rebindBaseline(f);
    expect(check(f)).toMatchObject({
      operational: false,
      executionEligible: false,
    });
    f.baseline.creation.history.noUnreviewedCustomerModification = false;
    rebindBaseline(f);
    expect(() => check(f)).toThrow("V2_DOCUMENT_INVALID");
  });

  it("does not trust a key registry supplied inside the candidate graph", () => {
    const f = v2Fixture();
    f.graph.policy = f.policy;
    expect(() => check(f)).toThrow("V2_GRAPH_INVALID");
  });

  it("requires the actual inner-authorization inventory in retention, not timing observations alone", () => {
    const f = v2Fixture();
    expect(check(f).operational).toBe(false);
    f.graph.evidence = f.graph.evidence.filter(
      (e: any) => e.reference.objectId !== uuid(13),
    );
    f.seal();
    expect(() => check(f)).toThrow("V2_INVENTORY_EVIDENCE_MISSING");
  });

  it("requires explicit complete-observation review, not merely a timing signature", () => {
    const f = v2Fixture();
    f.graph.timing.completeObservationsReviewed = false;
    f.signDocument(f.graph.timing, "timing");
    expect(() => check(f)).toThrow("V2_GRAPH_INVALID");
  });

  it("rejects duplicate or incorrectly owned purpose keys without operational enrollment", () => {
    const f = v2Fixture();
    expect(validatePolicyV2(f.policy, f.context.now)).toEqual(f.policy);
    const duplicate = structuredClone(f.policy);
    duplicate.keys.push(duplicate.keys[0]);
    expect(() => validatePolicyV2(duplicate, f.context.now)).toThrow(
      "V2_KEY_POLICY_INVALID",
    );
    const custody = structuredClone(f.policy);
    custody.retentionIdentity = custody.founder.subject;
    expect(() => validatePolicyV2(custody, f.context.now)).toThrow(
      "V2_KEY_POLICY_INVALID",
    );
  });

  it("rejects a revoked key even after all policy bindings are refreshed and the signature is otherwise valid", () => {
    const f = v2Fixture();
    expect(validateSignedV2(f.graph.action, "action", f.context)).toEqual(
      f.graph.action,
    );
    f.policy.keys.find((k: any) => k.purpose === "action").revoked = true;
    f.context.intent.policyDigest = digestV2(f.policy);
    f.graph.action.governance.policyDigest = digestV2(f.policy);
    f.signDocument(f.graph.action, "action");
    expect(() => validateSignedV2(f.graph.action, "action", f.context)).toThrow(
      "V2_KEY_PURPOSE_DENIED",
    );
  });

  it.each(["disabled", "revoked", "expired", "unknown key", "wrong policy"])(
    "fails closed for %s authority",
    (condition) => {
      const f = v2Fixture();
      let code = "V2_KEY_PURPOSE_DENIED";
      if (condition === "disabled")
        ((f.context.policy.enabled = false), (code = "V2_POLICY_DISABLED"));
      if (condition === "revoked")
        ((f.context.policy.keys.find(
          (k: any) => k.purpose === "action",
        ).revoked = true),
          (code = "V2_EPOCH_POLICY_BINDING"));
      if (condition === "expired")
        ((f.context.now += 600_000), (code = "V2_DOCUMENT_EXPIRED"));
      if (condition === "unknown key")
        f.graph.action.signature.keyId = "0".repeat(64);
      if (condition === "wrong policy")
        ((f.graph.action.governance.policyDigest = "0".repeat(64)),
          (code = "V2_EPOCH_POLICY_BINDING"));
      expect(() =>
        validateSignedV2(f.graph.action, "action", f.context),
      ).toThrow(code);
    },
  );

  it("keeps signature version dispatch explicit and existing configuration disarmed", () => {
    const f = v2Fixture();
    expect(
      parseVersionedFounderDocument(f.graph.action, "action").operational,
    ).toBe(false);
    const oldPolicy = JSON.parse(
      readFileSync("config/staging-founder-governance.json", "utf8"),
    );
    expect(parseVersionedFounderDocument(oldPolicy, "policy").document).toEqual(
      oldPolicy,
    );
    expect(oldPolicy.enabled).toBe(false);
    expect(oldPolicy.keys).toEqual([]);
    expect(
      JSON.parse(readFileSync("config/staging-timing-review.json", "utf8"))
        .reviewKeys,
    ).toEqual([]);
    for (const version of [0, 1, 3, 5, 999]) {
      const action = { ...f.graph.action, schemaVersion: version };
      expect(() => parseVersionedFounderDocument(action, "action")).toThrow(
        "V2_VERSION_MODE_UNSUPPORTED",
      );
    }
  });
});

describe("signed JSON ambiguity protection", () => {
  it.each([
    ['{"a":1,"a":2}', "V2_JSON_DUPLICATE_KEY"],
    ['{"a":1,"\\u0061":2}', "V2_JSON_DUPLICATE_KEY"],
    ['{"nested":{"x":1,"x":1}}', "V2_JSON_DUPLICATE_KEY"],
    ['{"a":-0}', "V2_JSON_AMBIGUOUS"],
    ['{"a":9007199254740993}', "V2_JSON_AMBIGUOUS"],
    ['{"a":1e3}', "V2_JSON_AMBIGUOUS"],
    ['{"a":1.0}', "V2_JSON_AMBIGUOUS"],
    ['{"a":"\\ud800"}', "V2_JSON_AMBIGUOUS"],
    ['{"a":1} trailing', "V2_JSON_INVALID"],
    ['{"a":1,}', "V2_JSON_INVALID"],
  ])("rejects %s without exposing input", (json, code) =>
    expect(() => parseSignedJson(json)).toThrow(code),
  );
  it("preserves __proto__ as data, never prototype mutation", () => {
    const parsed = parseSignedJson('{"__proto__":{"polluted":true}}');
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(canonicalV2(parsed)).toBe('{"__proto__":{"polluted":true}}');
    expect(({} as any).polluted).toBeUndefined();
  });
  it("rejects malformed UTF8, deep recursion, oversized and already ambiguous object inputs", () => {
    expect(() => parseSignedJson(new Uint8Array([255]))).toThrow(
      "V2_JSON_INVALID",
    );
    expect(() =>
      parseSignedJson("[".repeat(66) + "0" + "]".repeat(66)),
    ).toThrow("V2_JSON_COMPLEXITY");
    expect(() =>
      parseSignedJson(" ".repeat(V2_LIMITS.baselineBytes + 1)),
    ).toThrow("V2_JSON_SIZE");
    const cycle: any = {};
    cycle.self = cycle;
    for (const value of [
      cycle,
      { n: undefined },
      { n: NaN },
      new Date(),
      Array(2),
      Object.defineProperty({}, "secret", {
        enumerable: true,
        get() {
          throw new Error("SECRET");
        },
      }),
    ])
      expect(() => canonicalV2(value)).toThrow("V2_JSON_AMBIGUOUS");
    expect(() =>
      signingMessageV2(
        { signature: { keyId: "a", signature: "b" } },
        "unknown",
      ),
    ).toThrow("V2_SIGNING_PURPOSE_INVALID");
  });
  it("rejects self-references and unknown fields before signature validation", () => {
    const f = v2Fixture();
    f.graph.action.deliveryManifestDigest = digestV2(f.graph.delivery);
    expect(() => check(f)).toThrow("V2_GRAPH_INVALID");
    delete f.graph.action.deliveryManifestDigest;
    f.graph.timing.actionDigest = digestV2(f.graph.action);
    expect(() => check(f)).toThrow("V2_GRAPH_INVALID");
  });
});

describe("permanent consumption, retention-before-execution and target ownership", () => {
  it.each(["FAILED", "REVOKED", "OUTCOME_UNKNOWN"])(
    "rejects protected activity before retention through %s, including a supplied ack digest",
    (state) => {
      const f = v2Fixture();
      const pending = stateV2(f, "CLAIMED_PENDING_RETENTION");
      const stopped = stateV2(f, state, { targetOwnership: "QUARANTINED" });
      expect(validateTransitionV2(pending, stopped).consumed).toBe(true);
      for (const counters of [
        { dispatchCount: 1 },
        { credentialAccessCount: 1 },
        { dispatchCount: 1, credentialAccessCount: 1 },
      ]) {
        expect(() =>
          validateTransitionV2(pending, { ...stopped, ...counters }),
        ).toThrow("V2_RETENTION_REQUIRED");
        expect(() =>
          validateTransitionV2(
            pending,
            {
              ...stopped,
              ...counters,
              retentionAckDigest: digestV2(f.graph.acknowledgement),
            },
            f.graph,
            f.context,
          ),
        ).toThrow("V2_PREDISPATCH_REQUIRED");
      }
      const retained = stateV2(f, "RETENTION_CONFIRMED");
      const running = stateV2(f, "RUNNING");
      expect(
        validateTransitionV2(retained, running, f.graph, f.context).operational,
      ).toBe(false);
      const terminalState = {
        ...stopped,
        retentionAckDigest: running.retentionAckDigest,
        dispatchCount: 1,
        credentialAccessCount: 1,
      };
      expect(() =>
        validateTransitionV2(retained, terminalState, f.graph, f.context),
      ).toThrow("V2_PREDISPATCH_REQUIRED");
      expect(validateTransitionV2(running, terminalState).targetOwnership).toBe(
        "QUARANTINED",
      );
    },
  );
  it("accepts only the complete retention-confirmed lifecycle with a valid bound acknowledgement", () => {
    const f = v2Fixture();
    const states = [
      "VALIDATED",
      "CLAIMED_PENDING_RETENTION",
      "RETENTION_CONFIRMED",
      "RUNNING",
      "SUCCEEDED",
    ].map((s) => stateV2(f, s));
    for (let n = 0; n < states.length - 1; n++)
      expect(
        validateTransitionV2(states[n], states[n + 1], f.graph, f.context)
          .operational,
      ).toBe(false);
  });
  it("retention export/ack failure consumes the action but permits zero dispatch and no credentials", () => {
    const f = v2Fixture();
    const failed = stateV2(f, "BLOCKED_RETENTION", {
      targetOwnership: "NONE",
      executorFenced: true,
      processTerminated: true,
    });
    expect(
      validateTransitionV2(stateV2(f, "CLAIMED_PENDING_RETENTION"), failed)
        .consumed,
    ).toBe(true);
    expect(failed.dispatchCount).toBe(0);
    expect(failed.credentialAccessCount).toBe(0);
    expect(() =>
      validateTransitionV2(
        failed,
        stateV2(f, "RETENTION_CONFIRMED"),
        f.graph,
        f.context,
      ),
    ).toThrow("V2_TERMINAL_IMMUTABLE");
  });
  it.each([
    ["RUNNING", { retentionAckDigest: null }, "V2_RETENTION_REQUIRED"],
    [
      "CLAIMED_PENDING_RETENTION",
      { dispatchCount: 1 },
      "V2_PREDISPATCH_REQUIRED",
    ],
    [
      "CLAIMED_PENDING_RETENTION",
      { credentialAccessCount: 1 },
      "V2_PREDISPATCH_REQUIRED",
    ],
    [
      "FAILED",
      {
        targetOwnership: "NONE",
        dispatchCount: 1,
        executorFenced: true,
        processTerminated: true,
      },
      "V2_UNSAFE_TARGET_RELEASE",
    ],
    ["REVOKED", { targetOwnership: "NONE" }, "V2_UNSAFE_TARGET_RELEASE"],
    [
      "OUTCOME_UNKNOWN",
      { targetOwnership: "NONE" },
      "V2_UNSAFE_TARGET_RELEASE",
    ],
    [
      "SUCCEEDED",
      { terminalEvidenceRetained: false },
      "V2_SUCCESS_RELEASE_INVALID",
    ],
    ["RUNNING", { executorFenced: true }, "V2_STATE_OWNERSHIP_INVALID"],
    ["RUNNING", { consumed: false }, "V2_CONSUMPTION_INVALID"],
  ])(
    "rejects unsafe %s state at the intended rule",
    (state, overrides, code) => {
      const f = v2Fixture();
      expect(() =>
        validateLifecycleStateV2(stateV2(f, state as string, overrides)),
      ).toThrow(code as string);
    },
  );
  it("does not accept RUNNING or retained state from a boolean/status claim alone", () => {
    const f = v2Fixture();
    expect(() =>
      validateTransitionV2(
        stateV2(f, "RETENTION_CONFIRMED"),
        stateV2(f, "RUNNING"),
      ),
    ).toThrow("V2_RETENTION_REQUIRED");
    expect(() =>
      validateTransitionV2(
        stateV2(f, "CLAIMED_PENDING_RETENTION"),
        stateV2(f, "RUNNING"),
        f.graph,
        f.context,
      ),
    ).toThrow("V2_TRANSITION_INVALID");
    f.graph.acknowledgement.signature.signature = "A".repeat(86) + "==";
    expect(() =>
      validateTransitionV2(
        stateV2(f, "CLAIMED_PENDING_RETENTION"),
        stateV2(f, "RETENTION_CONFIRMED"),
        f.graph,
        f.context,
      ),
    ).toThrow("V2_SIGNATURE_INVALID");
  });
  it("keeps unknown outcomes quarantined and permits separate non-writing inspection", () => {
    const f = v2Fixture();
    expect(
      validateTransitionV2(
        stateV2(f, "RUNNING"),
        stateV2(f, "OUTCOME_UNKNOWN", {
          retentionAckDigest: digestV2(f.graph.acknowledgement),
          targetOwnership: "QUARANTINED",
          dispatchCount: 1,
        }),
      ).targetOwnership,
    ).toBe("QUARANTINED");
    const inspection = v2Fixture({
      kind: "RECOVERY_INSPECT",
      mode: "preflight",
      blockedOperationId: uuid(99),
      blockedActionDigest: "f".repeat(64),
    });
    expect(inspection.graph.claim.targetOwnership).toBe("INSPECTION");
    expect(check(inspection).executionEligible).toBe(false);
  });
  it("ledger restoration is disarmed and cannot reuse epochs or release quarantines", () => {
    const f = v2Fixture();
    const request = {
      schemaVersion: 1,
      oldEpoch: f.graph.intent.epoch,
      newEpoch: uuid(91),
      bootChallenge: "a".repeat(64),
      executorBuildDigest: f.policy.executorBuildDigest,
      restoredLedgerDigest: "b".repeat(64),
      authoritativeHeadDigest: "c".repeat(64),
      previousEpochRetired: true,
      startsDisarmed: true,
      unresolvedTargetsRemainQuarantined: true,
      activatedAt: stampV2(20_000),
    };
    expect(validateEpochReplacementV2(request, request)).toMatchObject({
      operational: false,
      oldApprovalsReusable: false,
      quarantinesReleased: false,
    });
    const same = { ...request, newEpoch: request.oldEpoch };
    expect(() => validateEpochReplacementV2(same, same)).toThrow(
      "V2_EPOCH_REUSE_DENIED",
    );
    expect(() =>
      validateEpochReplacementV2(
        { ...request, startsDisarmed: false },
        request,
      ),
    ).toThrow("V2_EPOCH_REPLACEMENT_INVALID");
  });
  it("treats live status as a separate unauthenticated binding, never an amendment to signed action", () => {
    const f = v2Fixture();
    const status = {
      schemaVersion: 1,
      actionDigest: digestV2(f.graph.action),
      claimId: f.graph.claim.claimId,
      epoch: f.graph.intent.epoch,
      policyDigest: f.graph.intent.policyDigest,
      observedAt: stampV2(15_000),
      revoked: false,
      state: "RUNNING",
    };
    expect(
      validateLiveStatusV2(
        status,
        f.graph.action,
        f.graph.claim,
        f.context.now,
      ),
    ).toMatchObject({ operational: false, authenticated: false });
    const changed = structuredClone(f.graph.action);
    changed.governance.expiresAt = stampV2(700_000);
    expect(() =>
      validateLiveStatusV2(status, changed, f.graph.claim, f.context.now),
    ).toThrow("V2_LIVE_STATUS_REJECTED");
    expect(() =>
      validateLiveStatusV2(
        { ...status, revoked: true },
        f.graph.action,
        f.graph.claim,
        f.context.now,
      ),
    ).toThrow("V2_LIVE_STATUS_REJECTED");
  });
  it("binds a terminal receipt without claiming executor attestation", () => {
    const f = v2Fixture();
    const receipt = {
      schemaVersion: 1,
      mode: f.graph.intent.mode,
      epoch: f.graph.intent.epoch,
      actionDigest: digestV2(f.graph.action),
      claimId: f.graph.claim.claimId,
      retentionAckDigest: digestV2(f.graph.acknowledgement),
      executorBuildDigest: f.policy.executorBuildDigest,
      startedAt: stampV2(13_000),
      completedAt: stampV2(14_000),
      result: "SUCCEEDED",
      outcomeEvidenceDigest: "f".repeat(64),
    };
    expect(
      validateExecutionReceiptV2(receipt, f.graph, f.context),
    ).toMatchObject({ operational: false, authenticated: false });
    expect(() =>
      validateExecutionReceiptV2(
        { ...receipt, startedAt: stampV2(1000) },
        f.graph,
        f.context,
      ),
    ).toThrow("V2_EXECUTION_RECEIPT_BINDING");
  });
});
