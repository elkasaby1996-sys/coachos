// Synthetic timing authority for local tests only. Never used by workflows.
import { timingBinding } from "../../scripts/staging-timing-admission.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { generateKeyPairSync, sign } from "node:crypto";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import {
  timingReceipt,
  timingReviewPayload,
  timingReviewMessage,
} from "../../scripts/staging-timing-evidence.mjs";
// Ephemeral test key is trusted only by explicit runner test dependencies.
// The checked-in operational reviewKeys list stays empty and rejects these fixtures.
const keys = generateKeyPairSync("ed25519");
const keyId = hash(keys.publicKey.export({ type: "spki", format: "der" }));
export const timingTestReviewPolicy = () => ({
  schemaVersion: 1,
  reviewKeys: [
    {
      keyId,
      publicKey: keys.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
  ],
});
export function signTimingFixture(admission: any) {
  admission.review = { keyId, signature: "" };
  admission.reviewEvidenceSha256 = evidenceDigest(
    timingReviewPayload(admission),
  );
  admission.review.signature = sign(
    null,
    timingReviewMessage(admission),
    keys.privateKey,
  ).toString("base64");
  return admission;
}
export function timingFixture(
  phase: string,
  authorization: any,
  identity: any,
  context: any,
  contracts: any,
  now: number,
  policy?: any,
) {
  const stamp = (n: number) => new Date(n).toISOString();
  const kind = phase === "EMPTY_TO_180" ? "empty" : "release";
  const surface = Object.fromEntries(
    [
      "DATABASE_DRIFT",
      "FUNCTION_INVENTORY_DRIFT",
      "CONFIGURATION_DRIFT",
      "AUTH_CONFIGURATION_DRIFT",
      ...(kind === "empty" ? ["PROJECT_DRIFT"] : []),
    ].map((k) => [k, "a".repeat(64)]),
  );
  const group = () =>
    Array.from({ length: 3 }, (_, i) => {
      const observation = {
        digest: "a".repeat(64),
        observedAt: stamp(now - 10_000 - i * 1000),
        stability: {
          startedAt: stamp(now - 10_000 - i * 1000),
          completedAt: stamp(now - 9_900 - i * 1000),
          stable: true,
          categories: [],
          proof: {
            opening: structuredClone(surface),
            closing: structuredClone(surface),
            confirmation: structuredClone(surface),
          },
        },
      };
      const receipt = timingReceipt(kind, observation, identity, context);
      return { receipt, receiptSha256: evidenceDigest(receipt) };
    });
  return signTimingFixture({
    schemaVersion: 2,
    bindingDigest: evidenceDigest(
      timingBinding(phase, authorization, identity, context, contracts, policy),
    ),
    createdAt: stamp(now),
    expiresAt: stamp(now + 10 * 60_000),
    reviewEvidenceSha256: "b".repeat(64),
    completeObservationsReviewed: true,
    samples: {
      empty: phase === "EMPTY_TO_180" ? group() : [],
      release: phase === "EMPTY_TO_180" ? [] : group(),
    },
    allowances: {
      mutationMs: 1000,
      downloadMs: 1000,
      probeMs: 1000,
      localValidationMs: 1000,
    },
  });
}
