import { proofReference, type ProofScope } from "./billing-proof-v2.ts";

/** Sanitized authenticated catalogue facts; never payment evidence. */
export type CatalogueProofV1 = ProofScope & {
  schema: "billing-catalogue-v1";
  validator: "paddle-catalogue-contract-v1";
  kind: "catalogue";
  source: "catalogue_api";
  evidenceClass: "verified_catalogue";
  verificationRef: string;
  observedAt: string;
  catalogue: {
    productRef: string;
    priceRef: string;
    identityKind: "plan" | "addon";
    canonicalKey: "launch" | "growth" | "scale" | "coach-seat";
    canonicalVersionId: string;
    cadence: "monthly" | "annual";
    currency: string;
    unitAmountMinor: number;
    recurrenceUnit: "month" | "year";
    recurrenceCount: number;
    trial: null | { unit: "day" | "week" | "month" | "year"; count: number };
    productStatus: "active" | "archived";
    priceStatus: "active" | "archived";
    quantity: null | { minimum: number; maximum: number | null };
  };
};

function invalid(): never {
  throw new Error("BILLING_CATALOGUE_INVALID");
}
function closed(value: unknown, keys: string[]): Record<string, unknown> {
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
function integer(value: unknown, minimum: number, maximum = 2147483647) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  )
    invalid();
}

/** Parsing does not authenticate or mint a receipt. Invalid commercial facts may
 * be retained for diagnosis; independent SQL publication validation rejects them. */
export function parseCatalogueProofV1(value: unknown): CatalogueProofV1 {
  const p = closed(value, [
    "schema",
    "validator",
    "kind",
    "source",
    "evidenceClass",
    "provider",
    "environment",
    "verificationRef",
    "observedAt",
    "catalogue",
  ]);
  if (
    p.schema !== "billing-catalogue-v1" ||
    p.validator !== "paddle-catalogue-contract-v1" ||
    p.kind !== "catalogue" ||
    p.source !== "catalogue_api" ||
    p.evidenceClass !== "verified_catalogue" ||
    p.provider !== "paddle" ||
    !["test", "live"].includes(p.environment as string)
  )
    invalid();
  proofReference(p.verificationRef);
  if (
    typeof p.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.observedAt) ||
    p.observedAt.startsWith("0000") ||
    !Number.isFinite(Date.parse(p.observedAt)) ||
    new Date(p.observedAt).toISOString() !== p.observedAt
  )
    invalid();
  const c = closed(p.catalogue, [
    "productRef",
    "priceRef",
    "identityKind",
    "canonicalKey",
    "canonicalVersionId",
    "cadence",
    "currency",
    "unitAmountMinor",
    "recurrenceUnit",
    "recurrenceCount",
    "trial",
    "productStatus",
    "priceStatus",
    "quantity",
  ]);
  proofReference(c.productRef);
  proofReference(c.priceRef);
  if (
    typeof c.canonicalVersionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      c.canonicalVersionId,
    ) ||
    !["plan", "addon"].includes(c.identityKind as string) ||
    !["launch", "growth", "scale", "coach-seat"].includes(
      c.canonicalKey as string,
    ) ||
    !["monthly", "annual"].includes(c.cadence as string) ||
    typeof c.currency !== "string" ||
    !/^[A-Z]{3}$/.test(c.currency) ||
    !["month", "year"].includes(c.recurrenceUnit as string) ||
    !["active", "archived"].includes(c.productStatus as string) ||
    !["active", "archived"].includes(c.priceStatus as string)
  )
    invalid();
  integer(c.unitAmountMinor, 0, Number.MAX_SAFE_INTEGER);
  integer(c.recurrenceCount, 1);
  if (c.trial !== null) {
    const t = closed(c.trial, ["unit", "count"]);
    if (!["day", "week", "month", "year"].includes(t.unit as string)) invalid();
    integer(t.count, 1);
  }
  if (c.quantity !== null) {
    const q = closed(c.quantity, ["minimum", "maximum"]);
    integer(q.minimum, 1);
    if (q.maximum !== null) integer(q.maximum, q.minimum as number);
  }
  if (new TextEncoder().encode(JSON.stringify(p)).length > 8192) invalid();
  return structuredClone(p) as CatalogueProofV1;
}
