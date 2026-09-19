/** Closed, sanitized evidence contract. Validation is NOT transport authentication
 * or permission to grant access. No real Paddle validator is installed here. */
export type ProofEnvironment = "test" | "live";
export type ProofScope = { provider: "paddle"; environment: ProofEnvironment };
export type ProofItem = {
  priceRef: string;
  itemRef: string | null;
  productRef: string | null;
  quantity: number;
  unitAmountMinor: number;
};
type Identity = {
  customerRef: string | null;
  subscriptionRef: string | null;
  transactionRef: string | null;
};
type Base = ProofScope & {
  schema: "billing-proof-v2";
  validator: "paddle-contract-v1";
  identity: Identity;
};
export type EventProof = Base & {
  kind: "event";
  source: "webhook";
  evidenceClass: "authenticated_provider";
  eventEvidence: {
    eventRef: string;
    eventName: string;
    resourceType: "subscription" | "transaction";
    resourceRef: string;
    occurredAt: string;
  };
};
export type SubscriptionProof = Base & {
  kind: "subscription";
  source: "api_reconciliation";
  evidenceClass: "authenticated_provider";
  subscriptionEvidence: {
    providerStatus: string;
    providerCreatedAt: string | null;
    providerUpdatedAt: string;
    periodStartedAt: string | null;
    periodEndsAt: string | null;
    items: ProofItem[];
  };
};
export type TransactionProof = Base & {
  kind: "transaction";
  source: "api_reconciliation";
  evidenceClass: "verified_transaction";
  transactionEvidence: {
    providerStatus: "completed";
    providerOrigin: string;
    providerCreatedAt: string | null;
    providerUpdatedAt: string;
    completedAt: string;
    currency: string;
    subtotalMinor: number;
    taxMinor: number;
    discountMinor: number;
    totalMinor: number;
    paidMinor: number;
    balanceMinor: 0;
    adjustmentRefs: [];
    items: ProofItem[];
  };
};
export type BillingProofV2 = EventProof | SubscriptionProof | TransactionProof;

function invalid(): never {
  throw new Error("BILLING_PROOF_INVALID");
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length) invalid();
  for (const key of keys)
    if (!descriptors[key]?.enumerable || !("value" in descriptors[key]))
      invalid();
  return value as Record<string, unknown>;
}
export function proofReference(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.includes("\0") ||
    new TextEncoder().encode(value).length > 512 ||
    new TextDecoder().decode(new TextEncoder().encode(value)) !== value
  )
    invalid();
}
function nullableReference(value: unknown) {
  if (value !== null) proofReference(value);
}
function stamp(value: unknown, nullable = false) {
  if (nullable && value === null) return;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  )
    invalid();
  const date = new Date(value);
  if (
    !Number.isFinite(date.valueOf()) ||
    value.startsWith("0000-") ||
    date.toISOString() !== value
  )
    invalid();
}
function money(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    invalid();
}
function items(value: unknown): asserts value is ProofItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) invalid();
  const identities = new Set<string>();
  const itemIdentities = new Set<string>();
  for (const entry of value) {
    const row = object(entry, [
      "priceRef",
      "itemRef",
      "productRef",
      "quantity",
      "unitAmountMinor",
    ]);
    proofReference(row.priceRef);
    nullableReference(row.itemRef);
    nullableReference(row.productRef);
    money(row.quantity);
    money(row.unitAmountMinor);
    if (row.quantity < 1 || row.quantity > 2147483647) invalid();
    // Ambiguous duplicate price/item rows require a future reviewed contract.
    if (identities.has(row.priceRef)) invalid();
    identities.add(row.priceRef);
    if (row.itemRef !== null) {
      if (itemIdentities.has(String(row.itemRef))) invalid();
      itemIdentities.add(String(row.itemRef));
    }
  }
}

/** Public structural parser deliberately cannot mint a verified receipt. */
export function parseBillingProofV2(value: unknown): BillingProofV2 {
  if (!value || typeof value !== "object") invalid();
  const kind = Object.getOwnPropertyDescriptor(value, "kind")?.value as unknown;
  if (kind !== "event" && kind !== "subscription" && kind !== "transaction")
    invalid();
  const p = object(value, [
    "schema",
    "validator",
    "provider",
    "environment",
    "source",
    "kind",
    "evidenceClass",
    "identity",
    `${kind}Evidence`,
  ]);
  if (
    p.schema !== "billing-proof-v2" ||
    p.validator !== "paddle-contract-v1" ||
    p.provider !== "paddle" ||
    !["test", "live"].includes(p.environment as string)
  )
    invalid();
  const i = object(p.identity, [
    "customerRef",
    "subscriptionRef",
    "transactionRef",
  ]);
  for (const v of Object.values(i)) nullableReference(v);
  if (kind === "event") {
    if (p.source !== "webhook" || p.evidenceClass !== "authenticated_provider")
      invalid();
    const e = object(p.eventEvidence, [
      "eventRef",
      "eventName",
      "resourceType",
      "resourceRef",
      "occurredAt",
    ]);
    proofReference(e.eventRef);
    proofReference(e.eventName);
    proofReference(e.resourceRef);
    stamp(e.occurredAt);
    if (e.resourceType !== "subscription" && e.resourceType !== "transaction")
      invalid();
    const resource =
      e.resourceType === "subscription" ? i.subscriptionRef : i.transactionRef;
    if (
      resource !== e.resourceRef ||
      (e.resourceType === "subscription" && i.transactionRef !== null)
    )
      invalid();
  } else {
    proofReference(i.customerRef);
    proofReference(i.subscriptionRef);
    if (p.source !== "api_reconciliation") invalid();
    if (kind === "subscription") {
      if (
        p.evidenceClass !== "authenticated_provider" ||
        i.transactionRef !== null
      )
        invalid();
      const s = object(p.subscriptionEvidence, [
        "providerStatus",
        "providerCreatedAt",
        "providerUpdatedAt",
        "periodStartedAt",
        "periodEndsAt",
        "items",
      ]);
      proofReference(s.providerStatus);
      stamp(s.providerCreatedAt, true);
      stamp(s.providerUpdatedAt);
      stamp(s.periodStartedAt, true);
      stamp(s.periodEndsAt, true);
      items(s.items);
      if (
        (s.periodStartedAt === null) !== (s.periodEndsAt === null) ||
        (s.periodStartedAt !== null &&
          String(s.periodStartedAt) >= String(s.periodEndsAt))
      )
        invalid();
      if (
        s.providerCreatedAt !== null &&
        String(s.providerCreatedAt) > String(s.providerUpdatedAt)
      )
        invalid();
    } else {
      proofReference(i.transactionRef);
      if (p.evidenceClass !== "verified_transaction") invalid();
      const t = object(p.transactionEvidence, [
        "providerStatus",
        "providerOrigin",
        "providerCreatedAt",
        "providerUpdatedAt",
        "completedAt",
        "currency",
        "subtotalMinor",
        "taxMinor",
        "discountMinor",
        "totalMinor",
        "paidMinor",
        "balanceMinor",
        "adjustmentRefs",
        "items",
      ]);
      if (t.providerStatus !== "completed") invalid();
      proofReference(t.providerOrigin);
      stamp(t.providerCreatedAt, true);
      stamp(t.providerUpdatedAt);
      stamp(t.completedAt);
      if (typeof t.currency !== "string" || !/^[A-Z]{3}$/.test(t.currency))
        invalid();
      for (const key of [
        "subtotalMinor",
        "taxMinor",
        "discountMinor",
        "totalMinor",
        "paidMinor",
        "balanceMinor",
      ])
        money(t[key]);
      items(t.items);
      const subtotal = t.items.reduce(
        (sum, item) => sum + item.quantity * item.unitAmountMinor,
        0,
      );
      const total =
        Number(t.subtotalMinor) + Number(t.taxMinor) - Number(t.discountMinor);
      if (
        !Number.isSafeInteger(subtotal) ||
        !Number.isSafeInteger(total) ||
        subtotal !== t.subtotalMinor ||
        total !== t.totalMinor ||
        total <= 0 ||
        t.paidMinor !== total ||
        t.balanceMinor !== 0 ||
        !Array.isArray(t.adjustmentRefs) ||
        t.adjustmentRefs.length !== 0
      )
        invalid();
      if (
        String(t.completedAt) > String(t.providerUpdatedAt) ||
        (t.providerCreatedAt !== null &&
          String(t.providerCreatedAt) > String(t.completedAt))
      )
        invalid();
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > 32768) invalid();
  const result = structuredClone(value) as BillingProofV2;
  if (result.kind !== "event") {
    const list =
      result.kind === "subscription"
        ? result.subscriptionEvidence.items
        : result.transactionEvidence.items;
    // UTF-8 byte order matches PostgreSQL COLLATE "C". Never normalize refs.
    list.sort((a, b) => {
      const x = new TextEncoder().encode(a.priceRef),
        y = new TextEncoder().encode(b.priceRef);
      for (let n = 0; n < Math.min(x.length, y.length); n++)
        if (x[n] !== y[n]) return x[n] - y[n];
      return x.length - y.length;
    });
  }
  return result;
}
