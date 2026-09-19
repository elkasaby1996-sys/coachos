import {
  createVerifiedEvidenceBoundaryV2,
  type VerifiedEventV2,
} from "../billing-verified-receipts-v2.ts";
import type { ProofScope } from "../billing-proof-v2.ts";
import type {
  PaddleEventObservation,
  PaddleReplayFacts,
  PaddleSupportedEventObservation,
  PaddleWebhookRequest,
  PaddleWebhookResult,
} from "./contract.ts";
import { eventProof, observeEvent } from "./observation.ts";
import {
  assertServer,
  createSignatureVerifier,
  fail,
  PaddleWebhookError,
  snapshotRequest,
  type PaddleWebhookConfiguration,
} from "./signature.ts";
export type * from "./contract.ts";
export type { PaddleWebhookConfiguration } from "./signature.ts";
export { PaddleWebhookError, PADDLE_WEBHOOK_LIMITS } from "./signature.ts";

const unsupported = Symbol("authenticated unsupported Paddle event");
const scope = Object.freeze({
  provider: "paddle",
  environment: "test",
} as const);
function replay(
  observation: PaddleEventObservation,
  rawPayloadSha256: string,
): PaddleReplayFacts {
  return {
    ...scope,
    eventRef: observation.eventRef,
    notificationRef: observation.notificationRef,
    eventType: observation.eventType,
    occurredAt: observation.occurredAt,
    rawPayloadSha256,
    observation: structuredClone(observation),
  };
}

/** Dormant server-only PREP capability: no HTTP handler, DB port or commercial effect. */
export function createPaddleSandboxWebhookVerifier(
  config: PaddleWebhookConfiguration,
) {
  const authenticate = createSignatureVerifier(config);
  const observations = new WeakMap<
    VerifiedEventV2,
    PaddleSupportedEventObservation
  >();
  const boundary = createVerifiedEvidenceBoundaryV2({
    ...scope,
    async verifyEvent(raw, headers) {
      authenticate(raw, headers);
      const observation = observeEvent(raw);
      if (observation.kind === "unsupported") throw unsupported;
      return {
        proof: eventProof(observation),
        notificationRef: observation.notificationRef,
      };
    },
    // Mandatory merged port slots fail closed and are never exposed by this facade.
    async retrieveSubscription() {
      return fail("verification_failed");
    },
    async retrieveTransaction() {
      return fail("verification_failed");
    },
  });
  function readReplayFacts(
    receipt: VerifiedEventV2,
    destination: ProofScope = scope,
  ): PaddleReplayFacts {
    assertServer();
    try {
      const evidence = boundary.eventArguments(receipt, destination);
      const observation = observations.get(receipt);
      if (!observation) return fail("receipt_invalid");
      return replay(observation, evidence.p_raw_payload_sha256);
    } catch {
      return fail("receipt_invalid");
    }
  }
  return Object.freeze({
    async verify(request: PaddleWebhookRequest): Promise<PaddleWebhookResult> {
      try {
        const { raw, headers } = snapshotRequest(request);
        let receipt: VerifiedEventV2;
        try {
          receipt = await boundary.verifyEvent(raw, headers);
        } catch (error) {
          if (error !== unsupported) throw error;
          // Only our authenticated port can throw this private marker. Preserve the
          // same byte snapshot; unsupported resources cannot fit merged EventProof.
          const observation = observeEvent(raw);
          if (observation.kind !== "unsupported")
            return fail("verification_failed");
          const hash = new Uint8Array(
            await crypto.subtle.digest("SHA-256", new Uint8Array(raw)),
          );
          return {
            kind: "unsupported",
            receipt: null,
            observation,
            replay: replay(
              observation,
              Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join(""),
            ),
          };
        }
        // Re-parse the private snapshot only after the boundary authenticated it.
        // No shared mutable per-request slot: concurrent verifications stay isolated.
        const observation = observeEvent(raw);
        if (observation.kind === "unsupported")
          return fail("verification_failed");
        observations.set(receipt, observation);
        return {
          kind: "supported",
          receipt,
          observation: structuredClone(observation),
        };
      } catch (error) {
        if (error instanceof PaddleWebhookError) throw error;
        return fail("verification_failed");
      }
    },
    readReplayFacts,
  });
}
