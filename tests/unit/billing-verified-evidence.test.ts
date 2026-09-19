import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseBillingProofV2,
  type EventProof,
  type SubscriptionProof,
  type TransactionProof,
} from "../../supabase/functions/_shared/billing-proof-v2";
import {
  createVerifiedEvidenceBoundaryV2,
  type AuthenticatedEvidenceVerifierV2,
  type VerifiedEventV2,
  type VerifiedSubscriptionV2,
  type VerifiedTransactionV2,
} from "../../supabase/functions/_shared/billing-verified-receipts-v2";
import {
  createEvidenceWriterV2,
  type EvidencePersistenceV2,
} from "../../supabase/functions/_shared/billing-evidence-writer-v2";

const fixtureText = readFileSync(
  "supabase/tests/fixtures/billing_verified_proof_fixture.psql",
  "utf8",
);
const fixtures = JSON.parse(fixtureText.split("$fixture$")[1]) as {
  event: EventProof;
  subscription: SubscriptionProof;
  transaction: TransactionProof;
};
const bytes = new TextEncoder().encode("synthetic authenticated bytes");
function verifier(): AuthenticatedEvidenceVerifierV2 {
  return {
    provider: "paddle",
    environment: "test",
    verifyEvent: vi.fn(async (raw, headers) => {
      // Fixture gate only, expressly not a Paddle HMAC implementation.
      if (
        new TextDecoder().decode(raw) !== "synthetic authenticated bytes" ||
        headers.get("fixture-verifier") !== "accepted"
      )
        throw new Error("FIXTURE_AUTH_REJECTED");
      return {
        proof: structuredClone(fixtures.event),
        notificationRef: "synthetic/notification",
      };
    }),
    retrieveSubscription: vi.fn(async () =>
      structuredClone(fixtures.subscription),
    ),
    retrieveTransaction: vi.fn(async () =>
      structuredClone(fixtures.transaction),
    ),
  };
}
const headers = () => new Headers({ "fixture-verifier": "accepted" });
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("NETWORK_FORBIDDEN");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

describe("instance-bound receipt provenance", () => {
  it.each([{}, fixtures.subscription, Object.create(null), { verified: true }])(
    "rejects caller/forged JSON %#",
    (forged) => {
      const boundary = createVerifiedEvidenceBoundaryV2(verifier());
      expect(() =>
        boundary.subscriptionArguments(forged as VerifiedSubscriptionV2),
      ).toThrow("BILLING_RECEIPT_INVALID");
    },
  );
  it("does not turn a parsed observation into a receipt", () => {
    const boundary = createVerifiedEvidenceBoundaryV2(verifier());
    const observation = parseBillingProofV2(fixtures.subscription);
    expect(() =>
      boundary.subscriptionArguments(
        observation as unknown as VerifiedSubscriptionV2,
      ),
    ).toThrow();
  });
  it("is nonserializable and contains no normalized/raw evidence", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier());
    const receipt = await b.verifyEvent(bytes, headers());
    expect(Object.keys(receipt)).toEqual(["toJSON"]);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.getPrototypeOf(receipt)).toBe(null);
    expect(() => JSON.stringify(receipt)).toThrow(
      "BILLING_RECEIPT_NOT_SERIALIZABLE",
    );
    expect(() => structuredClone(receipt)).toThrow();
    expect(() => b.eventArguments({ ...receipt } as VerifiedEventV2)).toThrow();
  });
  it("rejects cross-instance and cross-kind tokens", async () => {
    const a = createVerifiedEvidenceBoundaryV2(verifier()),
      b = createVerifiedEvidenceBoundaryV2(verifier());
    const receipt = await a.retrieveSubscription("synthetic/subscription");
    expect(() => b.subscriptionArguments(receipt)).toThrow();
    expect(() =>
      a.transactionArguments(receipt as unknown as VerifiedTransactionV2),
    ).toThrow();
  });
  it("rejects cross-provider and cross-environment destinations", async () => {
    const a = createVerifiedEvidenceBoundaryV2(verifier());
    const receipt = await a.retrieveTransaction("synthetic/transaction");
    expect(() =>
      a.transactionArguments(receipt, {
        provider: "lemonsqueezy" as "paddle",
        environment: "test",
      }),
    ).toThrow();
    expect(() =>
      a.transactionArguments(receipt, {
        provider: "paddle",
        environment: "live",
      }),
    ).toThrow();
  });
  it("binds scope immutably and checks verifier output scope", async () => {
    const port = verifier(),
      boundary = createVerifiedEvidenceBoundaryV2(port);
    port.environment = "live";
    const receipt = await boundary.retrieveSubscription(
      "synthetic/subscription",
    );
    expect(boundary.subscriptionArguments(receipt).p_proof.environment).toBe(
      "test",
    );
    const wrong = verifier();
    wrong.retrieveSubscription = async () => ({
      ...fixtures.subscription,
      environment: "live",
    });
    await expect(
      createVerifiedEvidenceBoundaryV2(wrong).retrieveSubscription(
        "synthetic/subscription",
      ),
    ).rejects.toThrow();
  });
  it("rejects unsupported provider composition", () => {
    expect(() =>
      createVerifiedEvidenceBoundaryV2({
        ...verifier(),
        provider: "lemonsqueezy" as "paddle",
      }),
    ).toThrow();
  });
  it("requires successful authentication, not an event name", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier());
    await expect(
      b.verifyEvent(
        new TextEncoder().encode(JSON.stringify(fixtures.event)),
        headers(),
      ),
    ).rejects.toThrow();
    await expect(b.verifyEvent(bytes, new Headers())).rejects.toThrow();
    const receipt = await b.verifyEvent(bytes, headers());
    expect(b.eventArguments(receipt).p_proof.evidenceClass).toBe(
      "authenticated_provider",
    );
    expect(() =>
      b.transactionArguments(receipt as unknown as VerifiedTransactionV2),
    ).toThrow();
  });
  it("binds retrieved resource identity to the requested reference", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier());
    await expect(
      b.retrieveSubscription("different/subscription"),
    ).rejects.toThrow();
    await expect(
      b.retrieveTransaction("different/transaction"),
    ).rejects.toThrow();
  });
  it("snapshots raw bytes/headers before await and hashes only original bytes", async () => {
    const raw = bytes.slice(),
      h = headers(),
      port = verifier();
    const b = createVerifiedEvidenceBoundaryV2(port);
    const pending = b.verifyEvent(raw, h);
    raw.fill(0);
    h.delete("fixture-verifier");
    const args = b.eventArguments(await pending);
    expect(args.p_raw_payload_sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    expect(args.p_notification_ref).toBe("synthetic/notification");
    expect(JSON.stringify(args)).not.toContain("fixture-verifier");
  });
  it("cannot mutate retained evidence through a returned SQL argument", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier());
    const receipt = await b.retrieveSubscription("synthetic/subscription");
    b.subscriptionArguments(receipt).p_proof.identity.customerRef = "forged";
    expect(b.subscriptionArguments(receipt).p_proof.identity.customerRef).toBe(
      "synthetic/customer",
    );
  });
});

describe("closed evidence contract", () => {
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])(
    "accepts synthetic %s contract facts without granting authority",
    (kind) => {
      expect(parseBillingProofV2(fixtures[kind])).toEqual(fixtures[kind]);
    },
  );
  it.each([
    ["schema", "billing-foundation-v1"],
    ["validator", "structure-only-v1"],
    ["environment", "sandbox"],
    ["provider", "lemonsqueezy"],
    ["source", "webhook"],
    ["verified", true],
    ["rawPayload", {}],
    ["normalizedSha256", "0".repeat(64)],
    ["paymentAuthority", true],
  ])("rejects unsupported envelope field/value %s", (key, value) => {
    expect(() =>
      parseBillingProofV2({ ...fixtures.subscription, [key as string]: value }),
    ).toThrow();
  });
  it.each([null, "", "   ", 123, "x".repeat(513), "\ud800"])(
    "rejects missing/invalid required identity %#",
    (customerRef) => {
      expect(() =>
        parseBillingProofV2({
          ...fixtures.subscription,
          identity: { ...fixtures.subscription.identity, customerRef },
        }),
      ).toThrow();
    },
  );
  it("rejects nested unknown fields, missing keys, accessors and hidden fields", () => {
    const p = structuredClone(fixtures.subscription) as unknown as Record<
      string,
      unknown
    >;
    expect(() =>
      parseBillingProofV2({
        ...p,
        identity: {
          ...fixtures.subscription.identity,
          email: "private@example.test",
        },
      }),
    ).toThrow();
    delete p.identity;
    expect(() => parseBillingProofV2(p)).toThrow();
    const getter = Object.defineProperty(
      structuredClone(fixtures.subscription),
      "identity",
      {
        get() {
          throw new Error("SHOULD_NOT_EXECUTE");
        },
      },
    );
    expect(() => parseBillingProofV2(getter)).toThrow("BILLING_PROOF_INVALID");
    const hidden = Object.defineProperty(
      structuredClone(fixtures.subscription),
      "secret",
      { value: "secret" },
    );
    expect(() => parseBillingProofV2(hidden)).toThrow();
  });
  it.each([
    null,
    "2026-09-01",
    "2026-02-30T10:00:00.000Z",
    "2026-09-01T10:00:00+00:00",
  ])(
    "requires actual canonical provider timestamps %#",
    (providerUpdatedAt) => {
      expect(() =>
        parseBillingProofV2({
          ...fixtures.subscription,
          subscriptionEvidence: {
            ...fixtures.subscription.subscriptionEvidence,
            providerUpdatedAt,
          },
        }),
      ).toThrow();
    },
  );
  it("never derives payment completion from created/updated timestamps", () => {
    expect(() =>
      parseBillingProofV2({
        ...fixtures.transaction,
        transactionEvidence: {
          ...fixtures.transaction.transactionEvidence,
          completedAt: null,
        },
      }),
    ).toThrow();
  });
  it.each([
    { paidMinor: 1 },
    { balanceMinor: 1 },
    { totalMinor: 0 },
    { providerStatus: "paid" },
    { adjustmentRefs: ["synthetic/refund"] },
    { taxMinor: -1 },
    { subtotalMinor: Number.MAX_SAFE_INTEGER + 1 },
    { paymentFacts: { verified: true } },
  ])("rejects unsupported/unsettled transaction facts %#", (changes) => {
    expect(() =>
      parseBillingProofV2({
        ...fixtures.transaction,
        transactionEvidence: {
          ...fixtures.transaction.transactionEvidence,
          ...changes,
        },
      }),
    ).toThrow();
  });
  it("treats items as a set without first-item semantics", () => {
    const p = structuredClone(fixtures.subscription);
    p.subscriptionEvidence.items.reverse();
    expect(parseBillingProofV2(p)).toEqual(fixtures.subscription);
    p.subscriptionEvidence.items.push(p.subscriptionEvidence.items[0]);
    expect(() => parseBillingProofV2(p)).toThrow();
  });
  it("preserves opaque identity bytes", () => {
    const p = structuredClone(fixtures.subscription);
    p.identity.customerRef = "  CuStOmEr / opaque Ω  ";
    expect(parseBillingProofV2(p).identity.customerRef).toBe(
      p.identity.customerRef,
    );
  });
});

describe("core evidence writer", () => {
  it("only calls three fixed evidence RPCs with receipts", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier()),
      rpc = vi.fn<EvidencePersistenceV2["rpc"]>(async () => ({
        data: { paymentAuthority: false },
        error: null,
      }));
    const writer = createEvidenceWriterV2(b, { rpc });
    await writer.event(await b.verifyEvent(bytes, headers()));
    await writer.subscription(
      await b.retrieveSubscription("synthetic/subscription"),
    );
    await writer.transaction(
      await b.retrieveTransaction("synthetic/transaction"),
    );
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "record_verified_billing_event_v2",
      "record_verified_billing_subscription_v2",
      "record_verified_billing_transaction_v2",
    ]);
    expect(() =>
      writer.transaction(
        fixtures.transaction as unknown as VerifiedTransactionV2,
      ),
    ).toThrow();
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("sanitizes database errors", async () => {
    const b = createVerifiedEvidenceBoundaryV2(verifier());
    const writer = createEvidenceWriterV2(b, {
      rpc: async () => ({ data: null, error: { credential: "not for logs" } }),
    });
    await expect(
      writer.transaction(await b.retrieveTransaction("synthetic/transaction")),
    ).rejects.toThrow("BILLING_EVIDENCE_PERSISTENCE_FAILED");
  });
});
