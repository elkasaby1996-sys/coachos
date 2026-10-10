// Integrity and review authority are separate from causal measurement provenance.
// The independent reviewer must inspect the retained complete observations before
// signing. There is no operational signer, fixture fallback or environment key.
import { readFileSync } from "node:fs";
import { createPublicKey, verify, randomUUID } from "node:crypto";
import { z } from "zod";
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { bootstrapDatabasePolicyDigest } from "./staging-bootstrap-database.mjs";
import { FOUNDER_MODE, founderPolicy } from "./staging-founder-governance.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const surfaces = z.record(z.string(), digest);
export const timingReceiptSchema = z.strictObject({
  schemaVersion: z.literal(2),
  evidenceClass: z.literal("hosted_complete_observation"),
  sampleId: z.string().uuid(),
  binding: z.strictObject({
    kind: z.enum(["empty", "release"]),
    executionCommit: z.string().regex(/^[a-f0-9]{40}$/),
    identityDigest: digest,
    projectSha256: digest,
    originSha256: digest,
    observerSha256: digest,
    securityPolicyDigest: digest,
    baselineEvidenceSha256: digest.nullable(),
  }),
  observationDigest: digest,
  completeObservationSha256: digest,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  stable: z.literal(true),
  categories: z.array(z.string()).length(0),
  proof: z.strictObject({
    opening: surfaces,
    closing: surfaces,
    confirmation: surfaces,
  }),
});
export const founderTimingReceiptSchema = timingReceiptSchema.extend({
  schemaVersion: z.literal(3),
  binding: timingReceiptSchema.shape.binding.extend({
    executionTree: z.string().regex(/^[a-f0-9]{40}$/),
    governanceMode: z.literal(FOUNDER_MODE),
    governancePolicyDigest: digest,
  }),
});
const observerSourceCache = new Map();
export function timingSampleBinding(
  kind,
  identity,
  context,
  baselineEvidenceSha256 = null,
  governancePolicy = founderPolicy(),
) {
  const files = [
    "staging-bootstrap-observation.mjs",
    "staging-bootstrap-capture.mjs",
    "staging-bootstrap-delivery.mjs",
    "staging-bootstrap-database.mjs",
    "staging-bootstrap-baseline.mjs",
    "staging-bootstrap-contracts.mjs",
    "staging-bootstrap.mjs",
    "staging-bootstrap-runner.mjs",
    "staging-timing-admission.mjs",
    "staging-release-observation.mjs",
    "billing-retirement-remote-inventory.mjs",
    "staging-release-webhook-history.mjs",
    "staging-timing-evidence.mjs",
    ...(context.governanceMode === FOUNDER_MODE
      ? ["staging-founder-governance.mjs"]
      : []),
  ];
  return {
    kind,
    executionCommit: context.commit,
    identityDigest: evidenceDigest(identity),
    projectSha256: hash(context.project),
    originSha256: hash(context.origin),
    securityPolicyDigest: bootstrapDatabasePolicyDigest(),
    baselineEvidenceSha256,
    ...(context.governanceMode === FOUNDER_MODE
      ? {
          executionTree: context.tree,
          governanceMode: FOUNDER_MODE,
          governancePolicyDigest: evidenceDigest(governancePolicy),
        }
      : {}),
    observerSha256: evidenceDigest(
      files.map((path) => {
        const bytes = readFileSync(new URL(path, import.meta.url));
        let prior = observerSourceCache.get(path);
        // Always reread the complete source. Reuse only its normalized digest
        // when actual bytes agree, never on a pathname/stat/mtime shortcut.
        if (!prior || !bytes.equals(prior.bytes)) {
          prior = {
            bytes,
            sha256: hash(bytes.toString("utf8").replace(/\r\n/g, "\n")),
          };
          observerSourceCache.set(path, prior);
        }
        return { path, sha256: prior.sha256 };
      }),
    ),
  };
}
export function validateTimingReceipt(
  receipt,
  kind,
  identity,
  context,
  baselineEvidenceSha256 = null,
  governancePolicy = founderPolicy(),
) {
  const parsed = (
    context.governanceMode === FOUNDER_MODE
      ? founderTimingReceiptSchema
      : timingReceiptSchema
  ).safeParse(receipt);
  ensure(parsed.success, "TIMING_RECEIPT_INVALID");
  const r = parsed.data;
  ensure(
    kind !== "empty" || /^[a-f0-9]{64}$/.test(baselineEvidenceSha256),
    "TIMING_RECEIPT_BASELINE_REQUIRED",
  );
  ensure(
    evidenceDigest(r.binding) ===
      evidenceDigest(
        timingSampleBinding(
          kind,
          identity,
          context,
          baselineEvidenceSha256,
          governancePolicy,
        ),
      ),
    "TIMING_RECEIPT_BINDING",
  );
  const expected = [
    "DATABASE_DRIFT",
    "FUNCTION_INVENTORY_DRIFT",
    "CONFIGURATION_DRIFT",
    "AUTH_CONFIGURATION_DRIFT",
    ...(kind === "empty" ? ["PROJECT_DRIFT"] : []),
  ].sort();
  for (const snapshot of Object.values(r.proof))
    ensure(
      evidenceDigest(Object.keys(snapshot).sort()) === evidenceDigest(expected),
      "TIMING_RECEIPT_INCOMPLETE",
    );
  ensure(
    evidenceDigest(r.proof.opening) === evidenceDigest(r.proof.closing) &&
      evidenceDigest(r.proof.closing) === evidenceDigest(r.proof.confirmation),
    "TIMING_RECEIPT_UNSTABLE",
  );
  return r;
}
// Called only after a complete observer returns; creates evidence, not authority.
export function timingReceipt(
  kind,
  observation,
  identity,
  context,
  governancePolicy = founderPolicy(),
) {
  ensure(
    observation.observedAt === observation.stability?.startedAt,
    "TIMING_RECEIPT_INVALID",
  );
  const receipt = {
    schemaVersion: context.governanceMode === FOUNDER_MODE ? 3 : 2,
    evidenceClass: "hosted_complete_observation",
    sampleId: randomUUID(),
    binding: timingSampleBinding(
      kind,
      identity,
      context,
      kind === "empty" ? observation.baselineEvidenceSha256 : null,
      governancePolicy,
    ),
    observationDigest: observation.digest,
    completeObservationSha256: evidenceDigest(observation),
    startedAt: observation.stability.startedAt,
    completedAt: observation.stability.completedAt,
    stable: observation.stability.stable,
    categories: observation.stability.categories,
    proof: observation.stability.proof,
  };
  return validateTimingReceipt(
    receipt,
    kind,
    identity,
    context,
    kind === "empty" ? observation.baselineEvidenceSha256 : null,
    governancePolicy,
  );
}
export const timingReviewSchema = z.strictObject({
  keyId: digest,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
const policySchema = z.strictObject({
  schemaVersion: z.literal(1),
  reviewKeys: z
    .array(z.strictObject({ keyId: digest, publicKey: z.string() }))
    .max(10),
});
export function timingReviewPolicy() {
  return JSON.parse(
    readFileSync(
      new URL("../config/staging-timing-review.json", import.meta.url),
      "utf8",
    ),
  );
}
export function timingReviewPayload(admission) {
  const { reviewEvidenceSha256: _digest, review, ...body } = admission;
  return { ...body, reviewKeyId: review.keyId };
}
export const timingReviewMessage = (admission) =>
  Buffer.from(
    "repsync-staging-timing-admission/v2\n" +
      evidenceDigest(timingReviewPayload(admission)),
    "utf8",
  );
export function assertTimingReview(admission, policy = timingReviewPolicy()) {
  return assertEvidenceReview(
    admission,
    "repsync-staging-timing-admission/v2",
    policy,
    "TIMING_REVIEW_REQUIRED",
  );
}
// Domain-separated independent evidence authentication. The source-reviewed
// registry, never a candidate-supplied key, is the authority for both contracts.
export function assertEvidenceReview(admission, domain, policy, errorCode) {
  try {
    const p = policySchema.parse(policy);
    ensure(
      new Set(p.reviewKeys.map((k) => k.keyId)).size === p.reviewKeys.length,
      "TIMING_REVIEW_REQUIRED",
    );
    const entry = p.reviewKeys.find((k) => k.keyId === admission.review.keyId);
    ensure(entry, "TIMING_REVIEW_REQUIRED");
    const key = createPublicKey(entry.publicKey);
    ensure(
      key.asymmetricKeyType === "ed25519" &&
        hash(key.export({ type: "spki", format: "der" })) === entry.keyId,
      "TIMING_REVIEW_REQUIRED",
    );
    ensure(
      admission.reviewEvidenceSha256 ===
        evidenceDigest(timingReviewPayload(admission)) &&
        verify(
          null,
          Buffer.from(
            domain + "\n" + evidenceDigest(timingReviewPayload(admission)),
            "utf8",
          ),
          key,
          Buffer.from(admission.review.signature, "base64"),
        ),
      "TIMING_REVIEW_REQUIRED",
    );
  } catch {
    throw new Error(errorCode);
  }
}
