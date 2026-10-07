// Integrity and review authority are separate from causal measurement provenance.
// The independent reviewer must inspect the retained complete observations before
// signing. There is no operational signer, fixture fallback or environment key.
import { readFileSync } from "node:fs";
import { createPublicKey, verify, randomUUID } from "node:crypto";
import { z } from "zod";
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { hash } from "./billing-retirement-release.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const surfaces = z.record(z.string(), digest);
export const timingReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  evidenceClass: z.literal("hosted_complete_observation"),
  sampleId: z.string().uuid(),
  binding: z.strictObject({
    kind: z.enum(["empty", "release"]),
    executionCommit: z.string().regex(/^[a-f0-9]{40}$/),
    identityDigest: digest,
    projectSha256: digest,
    originSha256: digest,
    observerSha256: digest,
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
export function timingSampleBinding(kind, identity, context) {
  const files = [
    "staging-bootstrap-observation.mjs",
    "staging-bootstrap-database.mjs",
    "staging-release-observation.mjs",
    "billing-retirement-remote-inventory.mjs",
    "staging-release-webhook-history.mjs",
    "staging-timing-evidence.mjs",
  ];
  return {
    kind,
    executionCommit: context.commit,
    identityDigest: evidenceDigest(identity),
    projectSha256: hash(context.project),
    originSha256: hash(context.origin),
    observerSha256: evidenceDigest(
      files.map((path) => ({
        path,
        sha256: hash(
          readFileSync(new URL(path, import.meta.url), "utf8").replace(
            /\r\n/g,
            "\n",
          ),
        ),
      })),
    ),
  };
}
export function validateTimingReceipt(receipt, kind, identity, context) {
  const parsed = timingReceiptSchema.safeParse(receipt);
  ensure(parsed.success, "TIMING_RECEIPT_INVALID");
  const r = parsed.data;
  ensure(
    evidenceDigest(r.binding) ===
      evidenceDigest(timingSampleBinding(kind, identity, context)),
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
export function timingReceipt(kind, observation, identity, context) {
  ensure(
    observation.observedAt === observation.stability?.startedAt,
    "TIMING_RECEIPT_INVALID",
  );
  const receipt = {
    schemaVersion: 1,
    evidenceClass: "hosted_complete_observation",
    sampleId: randomUUID(),
    binding: timingSampleBinding(kind, identity, context),
    observationDigest: observation.digest,
    completeObservationSha256: evidenceDigest(observation),
    startedAt: observation.stability.startedAt,
    completedAt: observation.stability.completedAt,
    stable: observation.stability.stable,
    categories: observation.stability.categories,
    proof: observation.stability.proof,
  };
  return validateTimingReceipt(receipt, kind, identity, context);
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
          timingReviewMessage(admission),
          key,
          Buffer.from(admission.review.signature, "base64"),
        ),
      "TIMING_REVIEW_REQUIRED",
    );
  } catch {
    throw new Error("TIMING_REVIEW_REQUIRED");
  }
}
