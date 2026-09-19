import type {
  PaddleCheckoutInput,
  PaddleCheckoutObservation,
} from "./contract.ts";

export type CheckoutErrorCode =
  | "configuration"
  | "invalid_input"
  | "body_too_large"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "provider_unavailable"
  | "http_error"
  | "timeout"
  | "network"
  | "response_too_large"
  | "malformed_response"
  | "response_drift"
  | "unsafe_destination";
export class PaddleCheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    readonly status?: number,
    readonly mutationMayHaveSucceeded = false,
  ) {
    super(`Paddle checkout: ${code}`);
    this.name = "PaddleCheckoutError";
  }
}
export function fail(code: CheckoutErrorCode): never {
  throw new PaddleCheckoutError(code);
}
export function object(
  value: unknown,
  code: CheckoutErrorCode = "malformed_response",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(code);
  return value as Record<string, unknown>;
}
export function closed(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  const data = object(value, "invalid_input");
  if (
    required.some((key) => !Object.hasOwn(data, key)) ||
    Object.keys(data).some((key) => ![...required, ...optional].includes(key))
  )
    fail("invalid_input");
  return data;
}
export function reference(
  value: unknown,
  code: CheckoutErrorCode = "malformed_response",
): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 256 ||
    value === "." ||
    value === ".." ||
    Array.from(value).some(
      (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
    )
  )
    return fail(code);
  try {
    encodeURIComponent(value);
  } catch {
    return fail(code);
  }
  return value;
}
function item(value: unknown): { priceReference: string; quantity: number } {
  const row = closed(value, ["priceReference", "quantity"]);
  if (
    !Number.isSafeInteger(row.quantity) ||
    Number(row.quantity) < 1 ||
    Number(row.quantity) > 999999999
  )
    fail("invalid_input");
  return {
    priceReference: reference(row.priceReference, "invalid_input"),
    quantity: Number(row.quantity),
  };
}
export function checkoutInput(value: unknown): PaddleCheckoutInput {
  const data = closed(value, ["base", "correlation"], ["seats"]);
  const base = item(data.base),
    seats = data.seats === undefined ? undefined : item(data.seats);
  if (base.quantity !== 1 || seats?.priceReference === base.priceReference)
    fail("invalid_input");
  const correlation = closed(data.correlation, [
    "operationReference",
    "attemptReference",
  ]);
  return {
    base: { ...base, quantity: 1 },
    ...(seats ? { seats } : {}),
    correlation: {
      operationReference: reference(
        correlation.operationReference,
        "invalid_input",
      ),
      attemptReference: reference(
        correlation.attemptReference,
        "invalid_input",
      ),
    },
  };
}
export function expectedItems(input: PaddleCheckoutInput) {
  return [input.base, ...(input.seats ? [input.seats] : [])];
}

// Kept local to this prep lane; no dependency on unmerged webhook timestamp helpers.
function timestamp(value: unknown): string {
  if (typeof value !== "string") return fail("malformed_response");
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return fail("malformed_response");
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const zone = match[7]!;
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6]) > 59 ||
    zone === "-00:00" ||
    (zone !== "Z" &&
      (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) ||
    !Number.isFinite(Date.parse(value))
  )
    fail("malformed_response");
  return value;
}
function currency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    return fail("malformed_response");
  return value;
}
export function observation(
  raw: unknown,
  expected: PaddleCheckoutInput,
  requestedReference?: string,
): Omit<PaddleCheckoutObservation, "checkout"> {
  const data = object(raw),
    id = reference(data.id);
  if (requestedReference !== undefined && requestedReference !== id)
    fail("response_drift");
  const status = data.status;
  if (
    status !== "draft" &&
    status !== "ready" &&
    status !== "billed" &&
    status !== "paid" &&
    status !== "completed" &&
    status !== "past_due" &&
    status !== "canceled"
  )
    fail("malformed_response");
  if (data.collection_mode !== "automatic") fail("response_drift");
  const custom = object(data.custom_data);
  if (
    custom.repsync_operation_id !== expected.correlation.operationReference ||
    custom.repsync_attempt_id !== expected.correlation.attemptReference
  )
    fail("response_drift");
  const wanted = expectedItems(expected);
  if (!Array.isArray(data.items) || data.items.length !== wanted.length)
    fail("response_drift");
  const seen = new Set<string>();
  const items = data.items.map((rawItem) => {
    const row = object(rawItem),
      price = object(row.price),
      priceRef = reference(price.id);
    if (
      seen.has(priceRef) ||
      !wanted.some(
        (item) =>
          item.priceReference === priceRef && item.quantity === row.quantity,
      )
    )
      fail("response_drift");
    seen.add(priceRef);
    return {
      priceReference: priceRef,
      productReference:
        price.product_id == null ? null : reference(price.product_id),
      quantity: row.quantity as number,
    };
  });
  const code = currency(data.currency_code);
  let total: PaddleCheckoutObservation["total"] = null;
  if (data.details !== null) {
    const totals = object(object(data.details).totals);
    if (
      typeof totals.total !== "string" ||
      !/^(0|[1-9][0-9]{0,34})$/.test(totals.total)
    )
      fail("malformed_response");
    total = { amount: totals.total, currency: code };
  }
  return {
    provider: "paddle",
    environment: "test",
    transactionReference: id,
    status: status as PaddleCheckoutObservation["status"],
    correlation: { ...expected.correlation },
    items,
    currency: code,
    total,
    createdAt: timestamp(data.created_at),
    updatedAt: timestamp(data.updated_at),
    billedAt: data.billed_at == null ? null : timestamp(data.billed_at),
  };
}
