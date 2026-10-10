// Public, deterministic OFFLINE vectors. These keys must never be enrolled.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  captureClock,
  captureContext,
  captureFixture,
} from "./staging-capture-fixture";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import { releaseIdentity } from "../../scripts/staging-release-artifacts.mjs";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";
import { bootstrapBinding } from "../../scripts/staging-bootstrap-contracts.mjs";
import { timingWorkload } from "../../scripts/staging-timing-admission.mjs";
import { FOUNDER_ACCEPTANCE } from "../../scripts/staging-founder-governance.mjs";
import { PHASES, phasePlan } from "../../scripts/staging-release-contracts.mjs";
import { SECRET_NAMES } from "../../scripts/billing-deployment-contract.mjs";
import { EMPTY_WEBHOOK_REVIEW } from "../../scripts/staging-release-observation.mjs";
import {
  CONTROL_PLANE_MODE,
  V2_CAPABILITIES,
  V2_DOMAINS,
  canonicalV2,
  digestV2,
  reviewedCapabilityPlan,
  signingMessageV2,
  operationSlotV2,
} from "../../scripts/staging-founder-authorization-v2.mjs";

export const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const stampV2 = (offset: number) =>
  new Date(captureClock + offset).toISOString();
export function evidenceV2(type: string, document: any, n: number) {
  const json = canonicalV2(document);
  return {
    reference: {
      objectId: uuid(n),
      version: 1,
      type,
      byteLength: Buffer.byteLength(json),
      rawSha256: hash(json),
      semanticSha256: digestV2(document),
    },
    json,
  };
}
let cachedIdentity: any;
export function v2Fixture(
  capability: any = { kind: "EMPTY_TO_180", mode: "apply" },
) {
  cachedIdentity ??= releaseIdentity();
  const identity = structuredClone(cachedIdentity);
  const contracts = JSON.parse(
    readFileSync("config/staging-release-checkpoints.json", "utf8"),
  );
  const registry = replacementPolicy();
  const evidence: any[] = [
    evidenceV2(
      "github",
      { fixture: "synthetic authenticated identity; NOT hosted proof" },
      1,
    ),
    evidenceV2(
      "creation",
      { fixture: "synthetic creation provenance; NOT hosted proof" },
      2,
    ),
    evidenceV2(
      "history",
      { fixture: "synthetic history evidence; NOT historical proof" },
      3,
    ),
  ];
  const epoch = uuid(90);
  const founder = {
    subject: "synthetic-v2-founder",
    githubUserId: "12345",
    authenticationEvidenceSha256: [evidence[0].reference.semanticSha256],
  };
  const scope = {
    repository: "elkasaby1996-sys/coachos",
    repositoryId: "123456789",
    repositoryOwnerId: "6789",
    project: captureContext.project,
    organization: captureContext.organization,
    origin: captureContext.origin,
    environment: "supabase-staging",
    paddleEnvironment: "sandbox",
    customerData: "synthetic_only",
  };
  const privateKeys: any = {};
  const keys = Object.keys(V2_DOMAINS).map((purpose, index) => {
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        Buffer.alloc(32, index + 1),
      ]),
      type: "pkcs8",
      format: "der",
    });
    privateKeys[purpose] = privateKey;
    const publicKey = createPublicKey(privateKey);
    return {
      keyId: hash(publicKey.export({ type: "spki", format: "der" })),
      publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
      ownerSubject:
        purpose === "delivery"
          ? "synthetic-delivery"
          : purpose === "retention"
            ? "synthetic-retention"
            : founder.subject,
      purpose,
      capabilities: [...V2_CAPABILITIES],
      validFrom: stampV2(-60_000),
      expiresAt: stampV2(3_600_000),
      revoked: false,
    };
  });
  const policy: any = {
    schemaVersion: 2,
    mode: CONTROL_PLANE_MODE,
    enabled: true,
    epoch,
    activatedAt: stampV2(-50_000),
    scope,
    founder,
    deliveryIdentity: "synthetic-delivery",
    retentionIdentity: "synthetic-retention",
    oidcSubject: "repo:elkasaby1996-sys/coachos:environment:supabase-staging",
    executorBuildDigest: "5".repeat(64),
    validFrom: stampV2(-60_000),
    expiresAt: stampV2(3_600_000),
    keys,
  };
  function signDocument(
    document: any,
    purpose: string,
    signingPurpose = purpose,
  ) {
    document.signature = {
      keyId: keys.find((k) => k.purpose === signingPurpose)!.keyId,
      signature: "",
    };
    document.signature.signature = sign(
      null,
      signingMessageV2(document, purpose),
      privateKeys[signingPurpose],
    ).toString("base64");
    return document;
  }
  function governance(created = 8000) {
    return {
      schemaVersion: 2,
      mode: CONTROL_PLANE_MODE,
      epoch,
      policyDigest: digestV2(policy),
      scope: structuredClone(scope),
      executionCommit: captureContext.commit,
      executionTree: captureContext.tree,
      founder: structuredClone(founder),
      operatorIdentity: founder.subject,
      approverIdentity: founder.subject,
      independentOfOperator: false,
      sameHuman: true,
      provenanceEvidenceSha256: [evidence[1].reference.semanticSha256],
      historicalEvidenceSha256: [evidence[2].reference.semanticSha256],
      historicalLimitations: [
        "Synthetic evidence cannot prove historical non-modification.",
      ],
      residualRiskAccepted: true,
      residualRiskStatement: FOUNDER_ACCEPTANCE,
      acceptanceVersion: 2,
      approvalModel: "founder_signature_external_execution",
      createdAt: stampV2(created),
      expiresAt: stampV2(600_000),
    };
  }
  const baseline: any = structuredClone(captureFixture(identity).baseline);
  baseline.schemaVersion = 4;
  delete baseline.review;
  delete baseline.reviewEvidenceSha256;
  baseline.governance = governance(1000);
  baseline.creation.operatorIdentity = founder.subject;
  baseline.creation.provenanceEvidenceSha256 = [
    evidence[1].reference.semanticSha256,
  ];
  baseline.creation.history.operatorAuthenticationEvidenceSha256 = [
    evidence[0].reference.semanticSha256,
  ];
  Object.assign(baseline.historyReview, {
    reviewerIdentity: founder.subject,
    independentOfOperator: false,
    sameHuman: true,
    residualRiskAccepted: true,
    residualRiskStatement: FOUNDER_ACCEPTANCE,
  });
  signDocument(baseline, "baseline");
  evidence.push(
    evidenceV2("exclusions", baseline.creation.captureExclusion, 4),
  );
  const requiresBaseline =
    capability.kind === "EMPTY_TO_180" ||
    (capability.kind === "MEASURE_TIMING" &&
      capability.phase === "EMPTY_TO_180");
  if (requiresBaseline) evidence.push(evidenceV2("baseline", baseline, 5));
  const file =
    ["CAPTURE_BASELINE", "EMPTY_TO_180"].includes(capability.kind) ||
    (capability.kind === "MEASURE_TIMING" &&
      capability.phase === "EMPTY_TO_180")
      ? "supabase-staging-bootstrap.yml"
      : capability.kind === "STATUS"
        ? "supabase-migration-status.yml"
        : capability.kind.startsWith("BACKUP_")
          ? "supabase-manual-backup.yml"
          : "supabase-deploy-staging.yml";
  const names: any = {
    "supabase-staging-bootstrap.yml": "Supabase Staging Empty Bootstrap",
    "supabase-deploy-staging.yml": "Supabase Staging Commercial Certification",
    "supabase-migration-status.yml": "Supabase Migration Status",
    "supabase-manual-backup.yml": "Supabase Staging Logical Backup",
  };
  const intent: any = {
    schemaVersion: 2,
    mode: CONTROL_PLANE_MODE,
    epoch,
    policyDigest: digestV2(policy),
    scope: structuredClone(scope),
    workflow: {
      repository: scope.repository,
      repositoryId: scope.repositoryId,
      repositoryOwnerId: scope.repositoryOwnerId,
      environment: scope.environment,
      name: names[file],
      workflowRef: `${scope.repository}/.github/workflows/${file}@refs/heads/main`,
      workflowSha: captureContext.commit,
      subject: policy.oidcSubject,
      runId: "87654321",
      runAttempt: 1,
      actorId: founder.githubUserId,
      ref: "refs/heads/main",
      eventName: "workflow_dispatch",
      runCreatedAt: stampV2(-40_000),
      jobStartedAt: stampV2(-30_000),
    },
    source: {
      commit: captureContext.commit,
      tree: captureContext.tree,
      executorBuildDigest: policy.executorBuildDigest,
      identityDigest: digestV2(identity),
      observerSha256: baseline.source.observerSha256,
      securityPolicyDigest: "a".repeat(64),
      querySha256: baseline.source.querySha256,
      payloadDigest: identity.payload.digest,
      manifestDigest: hash(JSON.stringify(identity.manifest)),
    },
    capability,
    plan: reviewedCapabilityPlan(capability, identity, contracts),
  };
  let authorization: any =
    capability.kind === "EMPTY_TO_180"
      ? {
          schemaVersion: 2,
          phase: "EMPTY_TO_180",
          executionCommit: intent.source.commit,
          bindingDigest: digestV2(
            bootstrapBinding(
              identity,
              captureContext,
              registry,
              contracts,
              baseline,
            ),
          ),
          inventoryDigest: "b".repeat(64),
          inventoryObservedAt: stampV2(5500),
          baselineEvidenceSha256: digestV2(baseline),
          createdAt: stampV2(6000),
          expiresAt: stampV2(600_000),
          operational: {
            newlyCreatedEmptyProject: true,
            noImportedHistory: true,
            clientsExcluded: true,
            providerIngressExcluded: true,
            manualWritersExcluded: true,
            backgroundWritersExcluded: true,
            noManagedSchemaCustomizationSinceProjectCreation: true,
            quietWindowEndsAt: stampV2(1_860_000),
          },
        }
      : {
          schemaVersion: 1,
          kind: capability.kind,
          intentDigest: digestV2(intent),
          createdAt: stampV2(6000),
          expiresAt: stampV2(600_000),
          inventoryObservedAt: stampV2(6000),
          exclusions: structuredClone(baseline.creation.captureExclusion),
        };
  if (Object.hasOwn(PHASES, capability.kind)) {
    const p = phasePlan(capability.kind, identity);
    const configuration = evidenceV2(
      "configuration",
      { fixture: "synthetic configuration proof" },
      40,
    );
    const backup = evidenceV2(
      "backup",
      { fixture: "synthetic backup proof; no backup created" },
      41,
    );
    const restore = evidenceV2(
      "backup",
      { fixture: "synthetic restore proof; no database used" },
      42,
    );
    const history = evidenceV2("history", [], 43);
    const recovery = evidenceV2(
      "recovery",
      { fixture: "synthetic fixed recovery plan" },
      44,
    );
    evidence.push(configuration, backup, restore, history, recovery);
    const provider = JSON.parse(
      readFileSync("config/staging-commercial-provider.fake.json", "utf8"),
    );
    for (const m of provider.mappings)
      for (const field of [
        "productRef",
        "priceRef",
        "seatProductRef",
        "seatPriceRef",
      ])
        m[field] = "sha256:" + hash(m[field]);
    provider.liveReferences = provider.liveReferences.map(
      (r: string) => "sha256:" + hash(r),
    );
    authorization = {
      schemaVersion: 3,
      phase: capability.kind,
      operationId: uuid(50),
      executionCommit: intent.source.commit,
      frozenPayloadCommit: identity.payload.frozenCommit,
      payloadDigest: identity.payload.digest,
      manifestDigest: hash(JSON.stringify(identity.manifest)),
      projectSha256: hash(scope.project),
      originSha256: hash(scope.origin),
      productionDenyProjectSha256: hash(captureContext.productionProject),
      productionDenyOriginSha256: hash(captureContext.productionOrigin),
      createdAt: stampV2(6000),
      expiresAt: stampV2(600_000),
      startVersions: p.startVersions,
      endVersions: p.endVersions,
      pendingMigrations: p.pendingMigrations,
      migrationArtifacts: p.migrationArtifacts,
      finalFunctions: p.finalFunctions,
      outsideFunctions: p.outsideFunctions,
      containmentFunctions: p.containmentFunctions,
      inventory: { digest: "b".repeat(64), observedAt: stampV2(5500) },
      webhookHistory: {
        review: structuredClone(EMPTY_WEBHOOK_REVIEW),
        dispositionDigest: "b".repeat(64),
      },
      backup: {
        evidenceSha256: backup.reference.semanticSha256,
        createdAt: stampV2(-30_000),
        expiresAt: stampV2(3_600_000),
        executionCommit: intent.source.commit,
        projectSha256: hash(scope.project),
        ledger: p.startVersions,
        quietWindowReviewed: true,
        releaseLock: "supabase-staging-commercial",
        componentsVerified: true,
        authUsersIncluded: true,
        applicationCompletenessVerified: true,
        migrationLedgerIncluded: true,
        migrationLedgerSha256: "1".repeat(64),
        ledgerRowsSha256: "2".repeat(64),
        storageObjectsIncluded: false,
        managedExclusionsReviewed: true,
        restore: {
          evidenceSha256: restore.reference.semanticSha256,
          backupEvidenceSha256: backup.reference.semanticSha256,
          verifiedAt: stampV2(-20_000),
          isolatedTarget: true,
          allApplicationTargetsRestored: true,
          authUsersRestored: true,
          retainedHistoryVerified: true,
          ledgerVerified: true,
          migrationLedgerSha256: "1".repeat(64),
          restoredLedgerRowsSha256: "2".repeat(64),
        },
      },
      configuration: {
        evidenceSha256: configuration.reference.semanticSha256,
        observedAt: stampV2(6000),
        secretInventorySha256: "3".repeat(64),
        authConfigurationSha256: "4".repeat(64),
        requiredNames: [...SECRET_NAMES],
        paddleEnvironment: "sandbox",
        checkoutAccessMode: "disabled",
        siteUrl: scope.origin,
        redirectUrls: [scope.origin + "/auth/callback"],
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
        evidenceSha256: evidence[2].reference.semanticSha256,
        result: "synthetic_only",
      },
      checkpointContractDigest: hash(JSON.stringify(contracts)),
      operational: {
        quiescenceEvidenceSha256: evidence[3].reference.semanticSha256,
        providerRequestAuditEvidenceSha256:
          configuration.reference.semanticSha256,
        retryWindowReviewed: true,
        retryWindowEndsAt: stampV2(1_860_000),
        clientsAndJobsPaused: true,
        oldInvocationsDrained: true,
        scheduledOperationsCount: 0,
      },
    };
    if (capability.kind.startsWith("RESUME_")) {
      const e = {
        schemaVersion: 2,
        status: "blocked",
        phase: capability.kind,
        authorizationDigest: "f".repeat(64),
        executionCommit: intent.source.commit,
        observedAt: stampV2(1000),
        ledgerCount: p.start,
        inventoryDigest: "b".repeat(64),
        functionStates: [],
        completedSteps: [],
        failedStep: "synthetic",
        errorCode: "LOCAL_TEST_ONLY",
        newAuthorizationRequired: true,
      };
      const record = evidenceV2("recovery", e, 45);
      record.json = JSON.stringify(e);
      record.reference.rawSha256 = hash(record.json);
      record.reference.byteLength = Buffer.byteLength(record.json);
      evidence.push(record);
      authorization.recovery = {
        evidence: e,
        digest: record.reference.rawSha256,
      };
    }
  }
  if (capability.kind === "PREPARE_INITIAL_NONBILLING_184")
    evidence.push(
      ...["configuration", "backup", "recovery"].map((type, n) =>
        evidenceV2(
          type,
          { fixture: `synthetic ${type} gate at checkpoint 184` },
          40 + n,
        ),
      ),
    );
  let timing: any = null;
  if (
    capability.kind === "EMPTY_TO_180" ||
    Object.hasOwn(PHASES, capability.kind)
  ) {
    const surface = Object.fromEntries(
      [
        "DATABASE_DRIFT",
        "FUNCTION_INVENTORY_DRIFT",
        "CONFIGURATION_DRIFT",
        "AUTH_CONFIGURATION_DRIFT",
        ...(requiresBaseline ? ["PROJECT_DRIFT"] : []),
      ].map((k) => [k, "d".repeat(64)]),
    );
    const samples = [0, 1, 2].map((n) => {
      const observation = {
        digest: "b".repeat(64),
        observedAt: stampV2(2000 + n * 1000),
        baselineEvidenceSha256: requiresBaseline ? digestV2(baseline) : null,
        stability: {
          startedAt: stampV2(2000 + n * 1000),
          completedAt: stampV2(2100 + n * 1000),
          stable: true,
          categories: [],
          proof: {
            opening: structuredClone(surface),
            closing: structuredClone(surface),
            confirmation: structuredClone(surface),
          },
        },
      };
      const record = evidenceV2("observation", observation, 10 + n);
      evidence.push(record);
      const receipt = {
        schemaVersion: 4,
        evidenceClass: "hosted_complete_observation",
        sampleId: uuid(20 + n),
        binding: {
          kind: requiresBaseline ? "empty" : "release",
          executionCommit: intent.source.commit,
          identityDigest: intent.source.identityDigest,
          projectSha256: hash(scope.project),
          originSha256: hash(scope.origin),
          observerSha256: intent.source.observerSha256,
          securityPolicyDigest: intent.source.securityPolicyDigest,
          baselineEvidenceSha256: requiresBaseline ? digestV2(baseline) : null,
          intentDigest: digestV2(intent),
          epoch,
          policyDigest: digestV2(policy),
          executionTree: intent.source.tree,
          executorBuildDigest: policy.executorBuildDigest,
        },
        observationDigest: observation.digest,
        completeObservationSha256: record.reference.semanticSha256,
        ...observation.stability,
      };
      return { receipt, receiptSha256: digestV2(receipt) };
    });
    const inventoryObservation = JSON.parse(
      evidence.find((e: any) => e.reference.objectId === uuid(10))!.json,
    );
    inventoryObservation.observedAt = stampV2(5500);
    inventoryObservation.stability.startedAt = stampV2(5500);
    inventoryObservation.stability.completedAt = stampV2(5600);
    evidence.push(evidenceV2("observation", inventoryObservation, 13));
    timing = signDocument(
      {
        schemaVersion: 4,
        completeObservationsReviewed: true,
        governance: governance(7000),
        intentDigest: digestV2(intent),
        authorizationDigest: digestV2(authorization),
        evidenceSetDigest: digestV2(evidence.map((e) => e.reference)),
        baselineEvidenceSha256: requiresBaseline ? digestV2(baseline) : null,
        samples,
        workload: timingWorkload(capability.kind, identity),
        allowances: {
          mutationMs: 1000,
          downloadMs: 1000,
          probeMs: 1000,
          localValidationMs: 1000,
          controlPlaneMs: 1000,
        },
        observationLimitMs: 60_000,
        freshnessMs: 900_000,
        authorizationLimitMs: 1_800_000,
        workflowLimitMs: 2_700_000,
        margin: 1.25,
      },
      "timing",
    );
  }
  const graph: any = { intent, evidence, authorization, timing };
  function seal(actionGovernance = governance()) {
    const refs = graph.evidence.map((e: any) => e.reference);
    if (graph.timing) {
      graph.timing.evidenceSetDigest = digestV2(refs);
      graph.timing.authorizationDigest = digestV2(graph.authorization);
      signDocument(graph.timing, "timing");
    }
    graph.action = signDocument(
      {
        schemaVersion: 2,
        governance: actionGovernance,
        intentDigest: digestV2(graph.intent),
        authorizationDigest: digestV2(graph.authorization),
        timingAdmissionDigest: graph.timing ? digestV2(graph.timing) : null,
        evidence: structuredClone(refs),
        nonce: uuid(30),
      },
      "action",
    );
    graph.delivery = signDocument(
      {
        schemaVersion: 3,
        mode: CONTROL_PLANE_MODE,
        epoch,
        policyDigest: digestV2(policy),
        intentDigest: digestV2(graph.intent),
        actionDigest: digestV2(graph.action),
        objects: structuredClone(refs),
        createdAt: stampV2(9000),
        expiresAt: stampV2(600_000),
      },
      "delivery",
    );
    graph.claim = {
      schemaVersion: 1,
      mode: CONTROL_PLANE_MODE,
      epoch,
      policyDigest: digestV2(policy),
      claimId: uuid(31),
      actionDigest: digestV2(graph.action),
      intentDigest: digestV2(graph.intent),
      nonce: graph.action.nonce,
      slot: operationSlotV2(graph.intent),
      consumed: true,
      state: "CLAIMED_PENDING_RETENTION",
      targetOwnership:
        capability.kind === "RECOVERY_INSPECT" ? "INSPECTION" : "RESERVED",
      claimedAt: stampV2(10_000),
    };
    graph.retention = {
      schemaVersion: 1,
      mode: CONTROL_PLANE_MODE,
      epoch,
      policyDigest: digestV2(policy),
      actionDigest: digestV2(graph.action),
      intentDigest: digestV2(graph.intent),
      deliveryManifestDigest: digestV2(graph.delivery),
      claimDigest: digestV2(graph.claim),
      objects: structuredClone(refs),
      createdAt: stampV2(11_000),
      retainUntil: stampV2(86_400_000),
    };
    graph.acknowledgement = signDocument(
      {
        schemaVersion: 1,
        mode: CONTROL_PLANE_MODE,
        epoch,
        policyDigest: digestV2(policy),
        actionDigest: digestV2(graph.action),
        claimId: graph.claim.claimId,
        packageManifestDigest: digestV2(graph.retention),
        encryptedArchiveSha256: "e".repeat(64),
        archiveByteLength: 1234,
        custodyIdentity: policy.retentionIdentity,
        retainedAt: stampV2(12_000),
        retainUntil: graph.retention.retainUntil,
      },
      "retention",
    );
  }
  seal();
  const context: any = {
    policy,
    intent: structuredClone(intent),
    now: captureClock + 20_000,
    identity,
    contracts,
    registry,
    releaseContext: structuredClone(captureContext),
    baselineSource: structuredClone(baseline.source),
  };
  const signBytes = (bytes: Buffer, purpose: string) =>
    sign(null, bytes, privateKeys[purpose]).toString("base64");
  return {
    graph,
    context,
    baseline,
    policy,
    signDocument,
    seal,
    governance,
    signBytes,
  };
}

export function stateV2(
  f: ReturnType<typeof v2Fixture>,
  state: string,
  overrides: any = {},
) {
  const retained = ["RETENTION_CONFIRMED", "RUNNING", "SUCCEEDED"].includes(
    state,
  );
  return {
    schemaVersion: 1,
    actionDigest: digestV2(f.graph.action),
    claimId: f.graph.claim.claimId,
    epoch: f.graph.intent.epoch,
    state,
    consumed: state !== "VALIDATED",
    targetOwnership:
      state === "VALIDATED" || state === "SUCCEEDED"
        ? "NONE"
        : state === "RUNNING"
          ? "OWNED"
          : state === "OUTCOME_UNKNOWN"
            ? "QUARANTINED"
            : "RESERVED",
    dispatchCount: 0,
    credentialAccessCount: 0,
    executorFenced: state === "SUCCEEDED",
    processTerminated: state === "SUCCEEDED",
    terminalEvidenceRetained: state === "SUCCEEDED",
    retentionAckDigest: retained ? digestV2(f.graph.acknowledgement) : null,
    updatedAt: stampV2(15_000),
    ...overrides,
  };
}
