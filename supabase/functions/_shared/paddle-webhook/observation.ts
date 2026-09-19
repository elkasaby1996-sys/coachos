import { proofReference, type EventProof } from "../billing-proof-v2.ts";
import type {
  PaddleEventObservation,
  PaddleSupportedEventObservation,
  PaddleWebhookItem,
} from "./contract.ts";
import { fail } from "./signature.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("event_invalid");
  return value as Record<string, unknown>;
}
function reference(value: unknown): string {
  try {
    proofReference(value);
  } catch {
    return fail("event_invalid");
  }
  return value;
}
function nullableReference(value: unknown): string | null {
  return value === null || value === undefined ? null : reference(value);
}
/** Preserve the provider's RFC3339 spelling; reject dates JS would silently roll over. */
export function observedTimestamp(value: unknown): string {
  if (typeof value !== "string") return fail("event_invalid");
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!m) return fail("event_invalid");
  const year = Number(m[1]),
    month = Number(m[2]),
    day = Number(m[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = m[7]!;
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    Number(m[4]) > 23 ||
    Number(m[5]) > 59 ||
    Number(m[6]) > 59 ||
    (zone !== "Z" &&
      (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) ||
    !Number.isFinite(Date.parse(value))
  )
    fail("event_invalid");
  const projected = new Date(value).toISOString();
  if (!/^[0-9]{4}-/.test(projected) || projected.startsWith("0000-"))
    fail("event_invalid");
  return value;
}
function currency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    return fail("event_invalid");
  return value;
}
function items(value: unknown): PaddleWebhookItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32)
    return fail("event_invalid");
  return value.map((raw) => {
    const item = object(raw),
      price = object(item.price),
      money = object(price.unit_price);
    if (
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 2147483647 ||
      typeof money.amount !== "string" ||
      !/^(0|[1-9][0-9]{0,34})$/.test(money.amount)
    )
      fail("event_invalid");
    return {
      priceRef: reference(price.id),
      productRef: nullableReference(price.product_id),
      quantity: item.quantity,
      unitPrice: {
        amount: money.amount,
        currency: currency(money.currency_code),
      },
    };
  });
}

/** Structural only; cannot mint receipts. Call only AFTER signature verification. */
export function observeEvent(raw: Uint8Array): PaddleEventObservation {
  let envelope: Record<string, unknown>;
  try {
    // Keep a BOM visible so JSON parsing rejects it instead of silently removing bytes.
    envelope = object(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw),
      ),
    );
  } catch {
    return fail("event_invalid");
  }
  const base = {
    provider: "paddle" as const,
    environment: "test" as const,
    eventRef: reference(envelope.event_id),
    notificationRef: reference(envelope.notification_id),
    eventType: reference(envelope.event_type),
    occurredAt: observedTimestamp(envelope.occurred_at),
  };
  const data = object(envelope.data);
  if (base.eventType === "transaction.completed") {
    if (data.status !== "completed") fail("event_invalid");
    return {
      ...base,
      kind: "transaction.completed",
      transactionRef: reference(data.id),
      subscriptionRef: nullableReference(data.subscription_id),
      customerRef: nullableReference(data.customer_id),
      status: "completed",
      currency: currency(data.currency_code),
      items: items(data.items),
    };
  }
  if (
    base.eventType === "subscription.created" ||
    base.eventType === "subscription.updated"
  ) {
    const status = data.status;
    if (
      status !== "active" &&
      status !== "trialing" &&
      status !== "past_due" &&
      status !== "paused" &&
      status !== "canceled"
    )
      return fail("event_invalid");
    const rows = items(data.items).map(
      (
        item,
        index,
      ): PaddleWebhookItem & { status: "active" | "inactive" | "trialing" } => {
        const state = object((data.items as unknown[])[index]).status;
        if (state !== "active" && state !== "inactive" && state !== "trialing")
          return fail("event_invalid");
        return { ...item, status: state };
      },
    );
    return {
      ...base,
      kind: base.eventType,
      subscriptionRef: reference(data.id),
      customerRef: nullableReference(data.customer_id),
      status,
      transactionCorrelationRef:
        base.eventType === "subscription.created"
          ? nullableReference(data.transaction_id)
          : null,
      items: rows,
    };
  }
  return { ...base, kind: "unsupported", reason: "event_type_not_supported" };
}

export function eventProof(
  observation: PaddleSupportedEventObservation,
): EventProof {
  const transaction = observation.kind === "transaction.completed";
  return {
    schema: "billing-proof-v2",
    validator: "paddle-contract-v1",
    provider: "paddle",
    environment: "test",
    kind: "event",
    source: "webhook",
    evidenceClass: "authenticated_provider",
    identity: {
      customerRef: observation.customerRef,
      subscriptionRef: observation.subscriptionRef,
      transactionRef: transaction ? observation.transactionRef : null,
    },
    eventEvidence: {
      eventRef: observation.eventRef,
      eventName: observation.eventType,
      resourceType: transaction ? "transaction" : "subscription",
      resourceRef: transaction
        ? observation.transactionRef
        : observation.subscriptionRef!,
      // Existing v2 proof format requires milliseconds. Exact time stays in replay facts.
      occurredAt: new Date(observation.occurredAt).toISOString(),
    },
  };
}
