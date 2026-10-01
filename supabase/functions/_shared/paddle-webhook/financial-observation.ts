import { fail } from "./signature.ts";

export interface PaddleFinancialObservation {
  resourceUpdatedAt: string;
  collectionMode: "automatic" | "manual";
  totals: {
    subtotal: string;
    tax: string;
    discount: string;
    total: string;
    credit: string;
    creditToBalance: string;
    grandTotal: string;
    balance: string;
  };
  payments: { attemptReference: string; amount: string; status: string }[];
  captured: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("event_invalid");
  return value as Record<string, unknown>;
}
export function financialMinor(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,15})$/.test(value) ||
    BigInt(value) > 9007199254740991n
  )
    return fail("event_invalid");
  return value;
}

/** Parsing only; payment/access authority is recomputed from signed history in SQL. */
export function financialObservation(
  data: Record<string, unknown>,
  timestamp: (value: unknown) => string,
  reference: (value: unknown) => string,
): PaddleFinancialObservation {
  const totals = object(object(data.details).totals);
  if (!Array.isArray(data.payments) || data.payments.length > 32)
    return fail("event_invalid");
  const collectionMode = data.collection_mode;
  if (collectionMode !== "automatic" && collectionMode !== "manual")
    return fail("event_invalid");
  const payments = data.payments.map((raw) => {
    const payment = object(raw);
    if (
      typeof payment.status !== "string" ||
      !/^[a-z_]{2,40}$/.test(payment.status)
    )
      return fail("event_invalid");
    return {
      attemptReference: reference(payment.payment_attempt_id),
      amount: financialMinor(payment.amount),
      status: payment.status,
    };
  });
  if (new Set(payments.map((p) => p.attemptReference)).size !== payments.length)
    return fail("event_invalid");
  const captured = payments
    .filter((p) => p.status === "captured")
    .reduce((sum, p) => sum + BigInt(p.amount), 0n);
  const result: PaddleFinancialObservation = {
    resourceUpdatedAt: timestamp(data.updated_at),
    collectionMode,
    totals: {
      subtotal: financialMinor(totals.subtotal),
      tax: financialMinor(totals.tax),
      discount: financialMinor(totals.discount),
      total: financialMinor(totals.total),
      credit: financialMinor(totals.credit),
      creditToBalance: financialMinor(totals.credit_to_balance),
      grandTotal: financialMinor(totals.grand_total),
      balance: financialMinor(totals.balance),
    },
    payments,
    captured: financialMinor(captured.toString()),
  };
  const t = result.totals;
  if (
    BigInt(t.subtotal) + BigInt(t.tax) - BigInt(t.discount) !==
      BigInt(t.total) ||
    BigInt(t.total) - BigInt(t.credit) !== BigInt(t.grandTotal) ||
    captured + BigInt(t.balance) !== BigInt(t.grandTotal)
  )
    return fail("event_invalid");
  return result;
}
