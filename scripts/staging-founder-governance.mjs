// Verification only. Operational approval/replay integrations are deliberately absent.
import { readFileSync } from "node:fs";
import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { phasePlan } from "./staging-release-contracts.mjs";

export const FOUNDER_MODE = "founder_owned_synthetic_staging_v1";
export const FOUNDER_ACCEPTANCE =
  "I am both operator and approver. This is not independent human review. Current observations and my attestations cannot prove the absence of undisclosed historical changes later restored. I accept the documented residual risk only for the identified isolated synthetic staging scope. My error, compromised credentials, or misuse of administrative authority may defeat controls under my ownership.";
export const FOUNDER_DOMAINS = Object.freeze({
  baseline: "repsync-founder-staging-baseline/v1",
  timing: "repsync-founder-staging-timing/v1",
  action: "repsync-founder-staging-action/v1",
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const id = z.string().regex(/^[1-9][0-9]*$/);
const timestamp = z.string().datetime();
const identitySchema = z.strictObject({
  subject: z.string().trim().min(1),
  githubUserId: id,
  authenticationEvidenceSha256: z.array(digest).min(1),
});
export const founderScopeSchema = z.strictObject({
  repository: z.literal("elkasaby1996-sys/coachos"),
  repositoryId: id,
  project: z.literal("exmrksgdikfprtfeltzu"),
  organization: z.literal("aerjnyzewgglcpkbrxyn"),
  origin: z.literal("https://repsync-staging-replacement.netlify.app"),
  environment: z.literal("supabase-staging"),
  paddleEnvironment: z.literal("sandbox"),
  customerData: z.literal("synthetic_only"),
});
export const founderPolicySchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal(FOUNDER_MODE),
  enabled: z.boolean(),
  scope: founderScopeSchema.extend({ repositoryId: id.nullable() }),
  founder: identitySchema.nullable(),
  validFrom: timestamp.nullable(),
  expiresAt: timestamp.nullable(),
  keys: z
    .array(
      z.strictObject({
        keyId: digest,
        publicKey: z.string().min(1),
        ownerSubject: z.string().trim().min(1),
        authority: z.enum(["evidence", "action"]),
        purposes: z.array(z.enum(["baseline", "timing", "action"])).min(1),
        phases: z.array(z.string().min(1)).min(1),
        scope: founderScopeSchema,
        validFrom: timestamp,
        expiresAt: timestamp,
        revoked: z.boolean(),
      }),
    )
    .max(10),
});
export const founderGovernanceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal(FOUNDER_MODE),
  policyDigest: digest,
  scope: founderScopeSchema,
  executionCommit: sha,
  executionTree: sha,
  founder: identitySchema,
  operatorIdentity: z.string().trim().min(1),
  approverIdentity: z.string().trim().min(1),
  independentOfOperator: z.literal(false),
  sameHuman: z.literal(true),
  provenanceEvidenceSha256: z.array(digest).min(1),
  historicalEvidenceSha256: z.array(digest).min(1),
  historicalLimitations: z.array(z.string().trim().min(1)).min(1),
  residualRiskAccepted: z.literal(true),
  residualRiskStatement: z.literal(FOUNDER_ACCEPTANCE),
  acceptanceVersion: z.literal(1),
  createdAt: timestamp,
  expiresAt: timestamp,
});
export const founderReviewSchema = z.strictObject({
  keyId: digest,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
export const founderWorkflowSchema = z.strictObject({
  repository: z.literal("elkasaby1996-sys/coachos"),
  repositoryId: id,
  environment: z.literal("supabase-staging"),
  name: z.enum([
    "Supabase Staging Empty Bootstrap",
    "Supabase Staging Commercial Certification",
  ]),
  workflowRef: z.string().min(1),
  ref: z.literal("refs/heads/main"),
  eventName: z.literal("workflow_dispatch"),
  runId: id,
  runAttempt: z.number().int().positive(),
  actorId: id,
  commit: sha,
  tree: sha,
});
export const founderActionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  governance: founderGovernanceSchema,
  phase: z.string().min(1),
  mode: z.enum(["preflight", "apply"]),
  authorizationDigest: digest,
  workflow: founderWorkflowSchema,
  nonce: z.string().uuid(),
  workflowEvidenceSha256: digest,
  migrationApproval: z
    .strictObject({
      reviewed: z.literal(true),
      orderedMigrationsDigest: digest,
      checkpointContractDigest: digest,
      recoveryEvidenceDigest: digest,
    })
    .nullable(),
  reviewEvidenceSha256: digest,
  review: founderReviewSchema,
});
const workflowProofSchema = z.strictObject({
  workflow: founderWorkflowSchema,
  approverIdentity: z.string().trim().min(1),
  environmentApproved: z.literal(true),
  bypassUsed: z.literal(false),
  protectedMain: z.literal(true),
  requiredChecksPassed: z.literal(true),
  checksCommit: sha,
  checksTree: sha,
  observedAt: timestamp,
  expiresAt: timestamp,
});

export function founderPolicy() {
  return founderPolicySchema.parse(
    JSON.parse(
      readFileSync(
        new URL("../config/staging-founder-governance.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}
export function assertFounderPolicy(policy, now = Date.now()) {
  const p = founderPolicySchema.parse(policy);
  ensure(
    p.enabled && p.founder && p.scope.repositoryId && p.keys.length > 0,
    "FOUNDER_OPERATIONAL_AUTHORITY_DISABLED",
  );
  ensure(
    Date.parse(p.validFrom) <= now && now < Date.parse(p.expiresAt),
    "FOUNDER_POLICY_EXPIRED",
  );
  ensure(
    new Set(p.keys.map((k) => k.keyId)).size === p.keys.length,
    "FOUNDER_KEY_POLICY_INVALID",
  );
  for (const k of p.keys) {
    ensure(
      evidenceDigest(k.scope) === evidenceDigest(p.scope) &&
        k.ownerSubject === p.founder.subject &&
        new Set(k.purposes).size === k.purposes.length &&
        new Set(k.phases).size === k.phases.length &&
        (k.authority === "action"
          ? k.purposes.length === 1 && k.purposes[0] === "action"
          : k.purposes.every((purpose) => purpose !== "action")),
      "FOUNDER_KEY_POLICY_INVALID",
    );
  }
  return p;
}
export function assertFounderContext(context, policy) {
  ensure(
    context.governanceMode === FOUNDER_MODE &&
      context.project === policy.scope.project &&
      context.origin === policy.scope.origin &&
      context.organization === policy.scope.organization &&
      /^[a-f0-9]{40}$/.test(context.commit) &&
      /^[a-f0-9]{40}$/.test(context.tree),
    "FOUNDER_SCOPE_MISMATCH",
  );
}
export function validateFounderGovernance(
  raw,
  context,
  policy,
  now = Date.now(),
) {
  const p = assertFounderPolicy(policy, now);
  const g = founderGovernanceSchema.parse(raw);
  assertFounderContext(context, p);
  ensure(
    g.policyDigest === evidenceDigest(p) &&
      evidenceDigest(g.scope) === evidenceDigest(p.scope) &&
      g.executionCommit === context.commit &&
      g.executionTree === context.tree &&
      evidenceDigest(g.founder) === evidenceDigest(p.founder) &&
      g.operatorIdentity === p.founder.subject &&
      g.approverIdentity === p.founder.subject,
    "FOUNDER_GOVERNANCE_BINDING",
  );
  const start = Date.parse(g.createdAt),
    end = Date.parse(g.expiresAt);
  ensure(
    start <= now &&
      now < end &&
      end > start &&
      end - start <= 30 * 60_000 &&
      start >= Date.parse(p.validFrom) &&
      end <= Date.parse(p.expiresAt),
    "FOUNDER_AUTHORITY_EXPIRED",
  );
  return g;
}
export function founderReviewPayload(document) {
  const { reviewEvidenceSha256: _digest, review, ...body } = document;
  return { ...body, reviewKeyId: review.keyId };
}
export function founderReviewMessage(document, purpose) {
  ensure(Object.hasOwn(FOUNDER_DOMAINS, purpose), "FOUNDER_KEY_PURPOSE_DENIED");
  return Buffer.from(
    FOUNDER_DOMAINS[purpose] +
      "\n" +
      evidenceDigest(founderReviewPayload(document)),
    "utf8",
  );
}
export function assertFounderReview(
  document,
  purpose,
  phase,
  context,
  policy = founderPolicy(),
  now = Date.now(),
) {
  const g = validateFounderGovernance(
    document.governance,
    context,
    policy,
    now,
  );
  try {
    const review = founderReviewSchema.parse(document.review);
    const entry = policy.keys.find((k) => k.keyId === review.keyId);
    ensure(
      entry &&
        !entry.revoked &&
        entry.purposes.includes(purpose) &&
        entry.phases.includes(phase) &&
        entry.authority === (purpose === "action" ? "action" : "evidence") &&
        Date.parse(entry.validFrom) <= Date.parse(g.createdAt) &&
        Date.parse(g.expiresAt) <= Date.parse(entry.expiresAt),
      "FOUNDER_KEY_PURPOSE_DENIED",
    );
    const key = createPublicKey(entry.publicKey);
    ensure(
      key.asymmetricKeyType === "ed25519" &&
        hash(key.export({ type: "spki", format: "der" })) === entry.keyId &&
        document.reviewEvidenceSha256 ===
          evidenceDigest(founderReviewPayload(document)) &&
        verify(
          null,
          founderReviewMessage(document, purpose),
          key,
          Buffer.from(review.signature, "base64"),
        ),
      "FOUNDER_SIGNATURE_INVALID",
    );
  } catch {
    throw new Error("FOUNDER_SIGNATURE_OR_PURPOSE_INVALID");
  }
  return g;
}
export function founderWorkflowFromEnvironment(env, context) {
  return founderWorkflowSchema.parse({
    repository: env.GITHUB_REPOSITORY,
    repositoryId: env.GITHUB_REPOSITORY_ID,
    environment: "supabase-staging",
    name: env.GITHUB_WORKFLOW,
    workflowRef: env.GITHUB_WORKFLOW_REF,
    ref: env.GITHUB_REF,
    eventName: env.GITHUB_EVENT_NAME,
    runId: env.GITHUB_RUN_ID,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
    actorId: env.GITHUB_ACTOR_ID,
    commit: env.GITHUB_SHA,
    tree: context.tree,
  });
}
export function founderMigrationApproval(
  phase,
  identity,
  contracts,
  authorization,
) {
  if (phase === "CAPTURE_BASELINE") return null;
  const migrations =
    phase === "EMPTY_TO_180"
      ? identity.manifest.migrations.approved.slice(0, 180)
      : phasePlan(phase, identity).pendingMigrations;
  return {
    reviewed: true,
    orderedMigrationsDigest: evidenceDigest(migrations),
    checkpointContractDigest: evidenceDigest(contracts),
    recoveryEvidenceDigest: evidenceDigest({
      backup: authorization.backup ?? null,
      recovery: authorization.recovery ?? null,
    }),
  };
}
export function validateFounderAction(raw, input, options = {}) {
  const a = founderActionSchema.parse(raw);
  const policy = (options.policy ?? founderPolicy)();
  const now = (options.now ?? Date.now)();
  assertFounderReview(a, "action", input.phase, input.context, policy, now);
  const bootstrap = ["EMPTY_TO_180", "CAPTURE_BASELINE"].includes(input.phase);
  const file = bootstrap
    ? "supabase-staging-bootstrap.yml"
    : "supabase-deploy-staging.yml";
  const expectedRef = `${policy.scope.repository}/.github/workflows/${file}@refs/heads/main`;
  ensure(
    a.phase === input.phase &&
      a.mode === input.mode &&
      a.authorizationDigest === evidenceDigest(input.authorization) &&
      evidenceDigest(a.workflow) === evidenceDigest(input.workflow) &&
      a.workflow.repositoryId === policy.scope.repositoryId &&
      a.workflow.actorId === policy.founder.githubUserId &&
      a.workflow.commit === input.context.commit &&
      a.workflow.tree === input.context.tree &&
      a.workflow.workflowRef === expectedRef &&
      a.workflow.name ===
        (bootstrap
          ? "Supabase Staging Empty Bootstrap"
          : "Supabase Staging Commercial Certification") &&
      evidenceDigest(a.migrationApproval) ===
        evidenceDigest(
          founderMigrationApproval(
            input.phase,
            input.identity,
            input.contracts,
            input.authorization,
          ),
        ),
    "FOUNDER_ACTION_BINDING",
  );
  ensure(
    Date.parse(a.governance.expiresAt) <=
      Date.parse(input.authorization.expiresAt),
    "FOUNDER_ACTION_EXPIRY_BINDING",
  );
  // Only a trusted integration can fetch/verify GitHub approval and required checks.
  // Signed founder assertions and caller-supplied booleans are not that integration.
  ensure(
    typeof options.verifyWorkflowApproval === "function",
    "FOUNDER_WORKFLOW_VERIFICATION_UNCONFIGURED",
  );
  const proof = workflowProofSchema.parse(options.verifyWorkflowApproval(a));
  ensure(
    evidenceDigest(proof) === a.workflowEvidenceSha256 &&
      evidenceDigest(proof.workflow) === evidenceDigest(a.workflow) &&
      proof.approverIdentity === policy.founder.subject &&
      proof.checksCommit === input.context.commit &&
      proof.checksTree === input.context.tree &&
      Date.parse(proof.observedAt) <= now &&
      now - Date.parse(proof.observedAt) <= 15 * 60_000 &&
      now < Date.parse(proof.expiresAt),
    "FOUNDER_WORKFLOW_APPROVAL_REQUIRED",
  );
  return a;
}
export function beginFounderOperation(raw, input, options = {}) {
  const action = validateFounderAction(raw, input, options);
  ensure(
    typeof options.claimAction === "function",
    "FOUNDER_REPLAY_GUARD_UNCONFIGURED",
  );
  const receiptSchema = z.strictObject({
    actionDigest: digest,
    runId: id,
    runAttempt: z.number().int().positive(),
    nonce: z.string().uuid(),
    claimed: z.literal(true),
  });
  const receipt = receiptSchema.parse(options.claimAction(action));
  ensure(
    receipt.actionDigest === evidenceDigest(action) &&
      receipt.runId === action.workflow.runId &&
      receipt.runAttempt === action.workflow.runAttempt &&
      receipt.nonce === action.nonce,
    "FOUNDER_ACTION_REPLAYED",
  );
  const originalDigest = evidenceDigest(action);
  return {
    digest: originalDigest,
    check() {
      ensure(evidenceDigest(raw) === originalDigest, "FOUNDER_ACTION_CHANGED");
      return validateFounderAction(raw, input, options);
    },
  };
}
