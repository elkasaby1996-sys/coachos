// Ephemeral local authority; no operational key, credential or approval is created.
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import {
  FOUNDER_MODE,
  FOUNDER_ACCEPTANCE,
  founderPolicy,
  founderReviewPayload,
  founderReviewMessage,
  founderMigrationApproval,
} from "../../scripts/staging-founder-governance.mjs";
import { baselineSourceBinding } from "../../scripts/staging-bootstrap-baseline.mjs";
import { timingSampleBinding } from "../../scripts/staging-timing-evidence.mjs";
import { timingBinding } from "../../scripts/staging-timing-admission.mjs";
import { timingFixture } from "./staging-timing-fixture";
import { PHASES } from "../../scripts/staging-release-contracts.mjs";
import { replacementPolicy } from "../../scripts/staging-replacement-target.mjs";

export function founderFixture(baseContext: any, now: number) {
  const evidenceKey = generateKeyPairSync("ed25519");
  const actionKey = generateKeyPairSync("ed25519");
  const stamp = (offset = 0) => new Date(now + offset).toISOString();
  const policy: any = structuredClone(founderPolicy());
  policy.enabled = true;
  policy.scope.repositoryId = "123456789";
  policy.founder = {
    subject: "synthetic-founder",
    githubUserId: "12345",
    authenticationEvidenceSha256: ["a".repeat(64)],
  };
  policy.validFrom = stamp(-60_000);
  policy.expiresAt = stamp(60 * 60_000);
  const phases = ["CAPTURE_BASELINE", "EMPTY_TO_180", ...Object.keys(PHASES)];
  policy.keys = [evidenceKey, actionKey].map((key, i) => ({
    keyId: hash(key.publicKey.export({ type: "spki", format: "der" })),
    publicKey: key.publicKey.export({ type: "spki", format: "pem" }).toString(),
    ownerSubject: policy.founder.subject,
    authority: i ? "action" : "evidence",
    purposes: i ? ["action"] : ["baseline", "timing"],
    phases,
    scope: structuredClone(policy.scope),
    validFrom: policy.validFrom,
    expiresAt: policy.expiresAt,
    revoked: false,
  }));
  const context = {
    ...baseContext,
    governanceMode: FOUNDER_MODE,
    organization: policy.scope.organization,
  };
  function governance(expiresAt = stamp(30 * 60_000), createdAt = stamp()) {
    return {
      schemaVersion: 1,
      mode: FOUNDER_MODE,
      policyDigest: evidenceDigest(policy),
      scope: structuredClone(policy.scope),
      executionCommit: context.commit,
      executionTree: context.tree,
      founder: structuredClone(policy.founder),
      operatorIdentity: policy.founder.subject,
      approverIdentity: policy.founder.subject,
      independentOfOperator: false,
      sameHuman: true,
      provenanceEvidenceSha256: ["a".repeat(64)],
      historicalEvidenceSha256: ["b".repeat(64)],
      historicalLimitations: [
        "Synthetic test evidence does not prove historical non-modification.",
      ],
      residualRiskAccepted: true,
      residualRiskStatement: FOUNDER_ACCEPTANCE,
      acceptanceVersion: 1,
      createdAt,
      expiresAt,
    };
  }
  function signDocument(
    document: any,
    purpose: "baseline" | "timing" | "action",
  ) {
    const index = purpose === "action" ? 1 : 0;
    const key = index ? actionKey : evidenceKey;
    document.review = { keyId: policy.keys[index].keyId, signature: "" };
    document.reviewEvidenceSha256 = evidenceDigest(
      founderReviewPayload(document),
    );
    document.review.signature = sign(
      null,
      founderReviewMessage(document, purpose),
      key.privateKey,
    ).toString("base64");
    return document;
  }
  function baseline(document: any, identity: any) {
    const b = structuredClone(document);
    b.schemaVersion = 3;
    b.governance = governance(b.capture.expiresAt);
    b.source = baselineSourceBinding(
      identity,
      context,
      replacementPolicy(),
      policy,
    );
    b.creation.operatorIdentity = policy.founder.subject;
    b.historyReview.reviewerIdentity = policy.founder.subject;
    b.historyReview.independentOfOperator = false;
    b.historyReview.sameHuman = true;
    b.historyReview.residualRiskAccepted = true;
    b.historyReview.residualRiskStatement = FOUNDER_ACCEPTANCE;
    return signDocument(b, "baseline");
  }
  const workflow = (phase: string) => ({
    repository: policy.scope.repository,
    repositoryId: policy.scope.repositoryId,
    environment: policy.scope.environment,
    name: ["EMPTY_TO_180", "CAPTURE_BASELINE"].includes(phase)
      ? "Supabase Staging Empty Bootstrap"
      : "Supabase Staging Commercial Certification",
    workflowRef: `${policy.scope.repository}/.github/workflows/${["EMPTY_TO_180", "CAPTURE_BASELINE"].includes(phase) ? "supabase-staging-bootstrap.yml" : "supabase-deploy-staging.yml"}@refs/heads/main`,
    ref: "refs/heads/main",
    eventName: "workflow_dispatch",
    runId: String(Math.floor(Math.random() * 100000000) + 1),
    runAttempt: 1,
    actorId: policy.founder.githubUserId,
    commit: context.commit,
    tree: context.tree,
  });
  let proof: any;
  function action(input: any) {
    input.workflow ??= workflow(input.phase);
    proof = {
      workflow: structuredClone(input.workflow),
      approverIdentity: policy.founder.subject,
      environmentApproved: true,
      bypassUsed: false,
      protectedMain: true,
      requiredChecksPassed: true,
      checksCommit: context.commit,
      checksTree: context.tree,
      observedAt: stamp(),
      expiresAt: stamp(15 * 60_000),
    };
    return signDocument(
      {
        schemaVersion: 1,
        governance: governance(input.authorization.expiresAt),
        phase: input.phase,
        mode: input.mode,
        authorizationDigest: evidenceDigest(input.authorization),
        workflow: structuredClone(input.workflow),
        nonce: randomUUID(),
        workflowEvidenceSha256: evidenceDigest(proof),
        migrationApproval: founderMigrationApproval(
          input.phase,
          input.identity,
          input.contracts,
          input.authorization,
        ),
      },
      "action",
    );
  }
  function timing(input: any, actionEnvelope: any) {
    const a: any = timingFixture(
      input.phase,
      input.authorization,
      input.identity,
      context,
      input.contracts,
      now,
      replacementPolicy(),
    );
    a.schemaVersion = 3;
    a.governance = governance(a.expiresAt, a.createdAt);
    a.actionEnvelopeDigest = evidenceDigest(actionEnvelope);
    a.bindingDigest = evidenceDigest(
      timingBinding(
        input.phase,
        input.authorization,
        input.identity,
        context,
        input.contracts,
        replacementPolicy(),
        actionEnvelope,
        policy,
      ),
    );
    for (const group of Object.values(a.samples) as any[][])
      for (const s of group) {
        s.receipt.binding = timingSampleBinding(
          s.receipt.binding.kind,
          input.identity,
          context,
          s.receipt.binding.baselineEvidenceSha256,
          policy,
        );
        s.receiptSha256 = evidenceDigest(s.receipt);
      }
    return signDocument(a, "timing");
  }
  const claims = new Set<string>();
  const deps = {
    now: () => now,
    founderPolicy: () => policy,
    policy: () => policy,
    verifyWorkflowApproval: () => structuredClone(proof),
    claimAction: (a: any) => {
      const run = `${a.workflow.runId}/${a.workflow.runAttempt}/${a.phase}/${a.mode}`;
      if (claims.has(run) || claims.has(a.nonce))
        throw Error("FOUNDER_ACTION_REPLAYED");
      claims.add(run);
      claims.add(a.nonce);
      return {
        actionDigest: evidenceDigest(a),
        runId: a.workflow.runId,
        runAttempt: a.workflow.runAttempt,
        nonce: a.nonce,
        claimed: true,
      };
    },
  };
  return {
    policy,
    context,
    governance,
    signDocument,
    baseline,
    action,
    timing,
    deps,
    get proof() {
      return proof;
    },
  };
}
