import type {
  PaddleCycle,
  PaddleMoney,
  PaddlePriceObservation,
  PaddleProductObservation,
} from "./contract.ts";

export type PaddleErrorCode =
  | "configuration"
  | "invalid_reference"
  | "malformed_response"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "provider_unavailable"
  | "http_error"
  | "network"
  | "timeout"
  | "response_too_large"
  | "pagination_limit";

/** Never attach raw bodies, URLs, headers, provider messages or exception causes. */
export class PaddleCatalogueError extends Error {
  constructor(
    readonly code: PaddleErrorCode,
    readonly status?: number,
  ) {
    super(`Paddle catalogue: ${code}`);
    this.name = "PaddleCatalogueError";
  }
}
export function malformed(): never {
  throw new PaddleCatalogueError("malformed_response");
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return malformed();
  return value as Record<string, unknown>;
}
export function reference(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 256 ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    ) ||
    value === "." ||
    value === ".."
  )
    return malformed();
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    return malformed();
  return value;
}
function status(value: unknown): "active" | "archived" {
  if (value !== "active" && value !== "archived") return malformed();
  return value;
}
function cycle(value: unknown): PaddleCycle {
  const data = object(value);
  const interval = data.interval;
  if (
    interval !== "day" &&
    interval !== "week" &&
    interval !== "month" &&
    interval !== "year"
  )
    return malformed();
  return { interval, frequency: positive(data.frequency) };
}
function money(value: unknown): PaddleMoney {
  const data = object(value);
  if (
    typeof data.amount !== "string" ||
    !/^(0|[1-9][0-9]{0,34})$/.test(data.amount) ||
    typeof data.currency_code !== "string" ||
    !/^[A-Z]{3}$/.test(data.currency_code)
  )
    return malformed();
  return { amount: data.amount, currency: data.currency_code };
}
function overrides(value: unknown): boolean {
  if (!Array.isArray(value)) return malformed();
  return value.length > 0;
}
export function productObservation(value: unknown): PaddleProductObservation {
  const data = object(value);
  if (
    typeof data.tax_category !== "string" ||
    !/^[a-z_]{1,100}$/.test(data.tax_category)
  )
    return malformed();
  return {
    productReference: reference(data.id),
    status: status(data.status),
    taxCategory: data.tax_category,
  };
}
export function priceObservation(value: unknown): PaddlePriceObservation {
  const data = object(value);
  const quantity = object(data.quantity);
  const minimum = positive(quantity.minimum);
  const maximum = positive(quantity.maximum);
  if (minimum > maximum || maximum > 999999999) return malformed();
  const billingCycle =
    data.billing_cycle === null ? null : cycle(data.billing_cycle);
  let trial: PaddlePriceObservation["trial"] = null;
  if (data.trial_period !== null) {
    const raw = object(data.trial_period);
    if (!billingCycle || typeof raw.requires_payment_method !== "boolean")
      return malformed();
    trial = {
      ...cycle(raw),
      requiresPaymentMethod: raw.requires_payment_method,
      unitPrice: raw.unit_price == null ? null : money(raw.unit_price),
      hasUnitPriceOverrides:
        raw.unit_price_overrides === undefined
          ? false
          : overrides(raw.unit_price_overrides),
    };
  }
  const taxMode = data.tax_mode;
  if (
    taxMode !== "account_setting" &&
    taxMode !== "internal" &&
    taxMode !== "external"
  )
    return malformed();
  return {
    priceReference: reference(data.id),
    productReference: reference(data.product_id),
    status: status(data.status),
    unitPrice: money(data.unit_price),
    billingCycle,
    trial,
    quantity: { minimum, maximum },
    taxMode,
    hasUnitPriceOverrides: overrides(data.unit_price_overrides),
  };
}
