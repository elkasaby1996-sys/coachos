import {
  parseBillingProofV2,
  proofReference,
  type BillingProofV2,
  type EventProof,
  type ProofScope,
  type SubscriptionProof,
  type TransactionProof,
} from "./billing-proof-v2.ts";

declare const receipt: unique symbol;
export type VerifiedEventV2 = { readonly [receipt]: "event-v2" };
export type VerifiedSubscriptionV2 = { readonly [receipt]: "subscription-v2" };
export type VerifiedTransactionV2 = { readonly [receipt]: "transaction-v2" };

/** TRUSTED COMPOSITION ONLY. This port must authenticate raw webhook bytes or
 * an independently retrieved provider response before returning sanitized facts.
 * No implementation, default verifier, HTTP client or HMAC exists for Paddle.
 * Tests inject synthetic verifiers; callers cannot supply this port via JSON.
 * Arbitrary server code/DB service credentials remain inside the trust boundary. */
export interface AuthenticatedEvidenceVerifierV2 extends ProofScope {
  verifyEvent(
    raw: Uint8Array,
    headers: Headers,
  ): Promise<{ proof: unknown; notificationRef: string | null }>;
  retrieveSubscription(reference: string): Promise<unknown>;
  retrieveTransaction(reference: string): Promise<unknown>;
}

function denied(): never {
  throw new Error("BILLING_RECEIPT_INVALID");
}
async function digest(raw: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(raw))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}

/** Only the composed verifier's successful result can mint a token. The returned
 * interface has no seal/fromJSON/import/observation-to-receipt method. */
export function createVerifiedEvidenceBoundaryV2(
  verifier: AuthenticatedEvidenceVerifierV2,
) {
  const scope: ProofScope = Object.freeze({
    provider: verifier.provider,
    environment: verifier.environment,
  });
  if (
    scope.provider !== "paddle" ||
    !["test", "live"].includes(scope.environment)
  )
    denied();
  const verifyEvent = verifier.verifyEvent.bind(verifier);
  const retrieveSubscription = verifier.retrieveSubscription.bind(verifier);
  const retrieveTransaction = verifier.retrieveTransaction.bind(verifier);
  const receipts = new WeakMap<
    object,
    { proof: BillingProofV2; rawHash?: string; notification?: string | null }
  >();
  function parse(value: unknown, kind: BillingProofV2["kind"]) {
    const proof = parseBillingProofV2(value);
    if (
      proof.provider !== scope.provider ||
      proof.environment !== scope.environment ||
      proof.kind !== kind
    )
      denied();
    return proof;
  }
  function seal<T extends object>(
    proof: BillingProofV2,
    rawHash?: string,
    notification?: string | null,
  ): T {
    const token = Object.freeze(
      Object.assign(Object.create(null), {
        toJSON(): never {
          throw new Error("BILLING_RECEIPT_NOT_SERIALIZABLE");
        },
      }),
    ) as T;
    receipts.set(token, { proof, rawHash, notification });
    return token;
  }
  function read(
    token: object,
    kind: BillingProofV2["kind"],
    destination: ProofScope,
  ) {
    if (
      destination.provider !== scope.provider ||
      destination.environment !== scope.environment
    )
      denied();
    const stored = receipts.get(token);
    if (!stored || stored.proof.kind !== kind) denied();
    return stored;
  }
  return Object.freeze({
    async verifyEvent(
      raw: Uint8Array,
      headers: Headers,
    ): Promise<VerifiedEventV2> {
      if (
        !(raw instanceof Uint8Array) ||
        raw.length === 0 ||
        raw.length > 262144
      )
        denied();
      const bytes = raw.slice(),
        copiedHeaders = new Headers(headers);
      const rawHash = await digest(bytes);
      // Verifier receives another copy; it cannot change the retained raw digest.
      const verified = await verifyEvent(bytes.slice(), copiedHeaders);
      if (
        !verified ||
        Object.keys(verified).sort().join() !== "notificationRef,proof"
      )
        denied();
      if (verified.notificationRef !== null)
        proofReference(verified.notificationRef);
      return seal(
        parse(verified.proof, "event"),
        rawHash,
        verified.notificationRef,
      );
    },
    async retrieveSubscription(
      reference: string,
    ): Promise<VerifiedSubscriptionV2> {
      proofReference(reference);
      const proof = parse(
        await retrieveSubscription(reference),
        "subscription",
      );
      if (proof.identity.subscriptionRef !== reference) denied();
      return seal(proof);
    },
    async retrieveTransaction(
      reference: string,
    ): Promise<VerifiedTransactionV2> {
      proofReference(reference);
      const proof = parse(await retrieveTransaction(reference), "transaction");
      if (proof.identity.transactionRef !== reference) denied();
      return seal(proof);
    },
    eventArguments(token: VerifiedEventV2, destination: ProofScope = scope) {
      const stored = read(token, "event", destination);
      return {
        p_proof: structuredClone(stored.proof) as EventProof,
        p_raw_payload_sha256: stored.rawHash!,
        p_notification_ref: stored.notification!,
      };
    },
    subscriptionArguments(
      token: VerifiedSubscriptionV2,
      destination: ProofScope = scope,
    ) {
      return {
        p_proof: structuredClone(
          read(token, "subscription", destination).proof,
        ) as SubscriptionProof,
      };
    },
    transactionArguments(
      token: VerifiedTransactionV2,
      destination: ProofScope = scope,
    ) {
      return {
        p_proof: structuredClone(
          read(token, "transaction", destination).proof,
        ) as TransactionProof,
      };
    },
  });
}
