import { BillingError } from "./billing-common.ts";
import type {
  PaymentMethodDispatchPermit,
  PaymentMethodUpdateCapability,
  PaymentMethodUpdateExpectation,
  PreparedPaymentMethodUpdate,
} from "./billing-provider.ts";
import { comparePaddleResourceRevisions } from "./paddle-seat-quantity.ts";
import { observedTimestamp } from "./paddle-webhook/observation.ts";

const failed = (ambiguous = false): never => {
  throw new BillingError(
    ambiguous
      ? "BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS"
      : "BILLING_PAYMENT_METHOD_PROVIDER_FAILED",
    503,
    ambiguous,
  );
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) failed();
  return value as Record<string, unknown>;
};
const money = (value: unknown): string => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/.test(value))
    failed();
  return value as string;
};
const ref = (value: unknown, prefix: "sub" | "ctm" | "txn" | "pri" | "pro") => {
  if (
    typeof value !== "string" ||
    !new RegExp(`^${prefix}_[a-z0-9]{26}$`).test(value)
  )
    failed();
  return value as string;
};
const sameInstant = (left: unknown, right: unknown) =>
  comparePaddleResourceRevisions(
    observedTimestamp(left),
    observedTimestamp(right),
  ) === 0;

/** Dedicated sandbox transport. The prepare GET may create a Paddle transaction. */
export function createPaddlePaymentMethodTransport(
  environment: string,
  dedicatedKey: string,
  fetcher: typeof fetch,
): PaymentMethodUpdateCapability {
  function validateConfiguration() {
    if (
      environment !== "test" ||
      !/^pdl_sdbx_[A-Za-z0-9_]+$/.test(dedicatedKey)
    )
      failed();
  }
  async function retrieve(
    path: string,
    mutationSensitive: boolean,
  ): Promise<unknown> {
    validateConfiguration();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(
            `https://sandbox-api.paddle.com/${path}`,
            {
              method: "GET",
              redirect: "error",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${dedicatedKey}`,
                "Paddle-Version": "1",
              },
            },
          );
          if (response.status !== 200) failed(mutationSensitive);
          if (
            !/^application\/json(?:;|$)/i.test(
              response.headers.get("content-type") ?? "",
            )
          )
            failed(mutationSensitive);
          reader = response.body?.getReader();
          if (!reader) failed(mutationSensitive);
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const part = await reader!.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 1_048_576) failed(mutationSensitive);
            chunks.push(part.value);
          }
          const bytes = new Uint8Array(size);
          let position = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, position);
            position += chunk.byteLength;
          }
          return record(
            JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
          ).data;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new BillingError(
                mutationSensitive
                  ? "BILLING_PAYMENT_METHOD_PROVIDER_AMBIGUOUS"
                  : "BILLING_PAYMENT_METHOD_PROVIDER_FAILED",
                503,
                mutationSensitive,
              ),
            );
          }, 30_000);
        }),
      ]);
    } catch (error) {
      if (error instanceof BillingError) throw error;
      return failed(mutationSensitive);
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  }
  async function validate(
    raw: unknown,
    expected: PaymentMethodUpdateExpectation,
    requestedRef?: string,
  ): Promise<PreparedPaymentMethodUpdate> {
    const row = record(raw);
    const transactionReference = ref(row.id, "txn");
    if (requestedRef && transactionReference !== requestedRef) failed();
    if (
      expected.identity.provider !== "paddle" ||
      expected.identity.environment !== "test" ||
      row.customer_id !== ref(expected.identity.customerReference, "ctm") ||
      row.subscription_id !==
        ref(expected.identity.subscriptionReference, "sub") ||
      row.collection_mode !== "automatic" ||
      row.currency_code !== "USD" ||
      !Array.isArray(row.items) ||
      row.items.length !== expected.items.length ||
      row.items.length < 1 ||
      row.items.length > 2
    )
      failed();
    const actual = (row.items as unknown[]).map((rawItem: unknown) => {
      const item = record(rawItem),
        price = record(item.price),
        unit = record(price.unit_price);
      if (
        !Number.isSafeInteger(item.quantity) ||
        (item.quantity as number) < 1 ||
        unit.currency_code !== "USD"
      )
        failed();
      return {
        priceReference: ref(price.id, "pri"),
        productReference: ref(price.product_id, "pro"),
        quantity: item.quantity as number,
        unitAmountMinor: money(unit.amount),
      };
    });
    const sort = (rows: typeof actual) =>
      rows.map((item) => JSON.stringify(item)).sort();
    if (
      JSON.stringify(sort(actual)) !== JSON.stringify(sort([...expected.items]))
    )
      failed();
    const totals = record(record(row.details).totals);
    const grandTotal = money(totals.grand_total),
      balance = money(totals.balance);
    const otherTotals = [
      "subtotal",
      "tax",
      "discount",
      "total",
      "credit",
      "credit_to_balance",
    ];
    for (const key of otherTotals) money(totals[key]);
    // For debt collection an omitted adjustment list does not prove absence.
    // Active zero-value updates may omit this permission-dependent field.
    if (
      row.discount_id !== null ||
      (expected.mode === "settle_existing_balance" &&
        !Array.isArray(row.adjustments)) ||
      (row.adjustments !== undefined &&
        (!Array.isArray(row.adjustments) || row.adjustments.length !== 0))
    )
      failed();
    if (!Array.isArray(row.payments) || row.payments.length > 32) failed();
    const payments = (row.payments as unknown[]).map((rawPayment) => {
      const payment = record(rawPayment);
      return { status: payment.status, amount: money(payment.amount) };
    });
    let status: PreparedPaymentMethodUpdate["status"] = "checkout_ready";
    let effect: PreparedPaymentMethodUpdate["effect"] = { kind: "update_only" };
    if (expected.mode === "update_only") {
      if (
        row.origin !== "subscription_payment_method_change" ||
        row.status !== "ready" ||
        grandTotal !== "0" ||
        balance !== "0" ||
        otherTotals.some((key) => totals[key] !== "0") ||
        payments.length !== 0
      )
        failed();
      effect = { kind: "update_only" };
    } else {
      const obligation = expected.obligation;
      if (!obligation)
        throw new BillingError("BILLING_PAYMENT_METHOD_PROVIDER_FAILED", 503);
      const period = record(row.billing_period);
      const expectedSubtotal = actual.reduce(
        (sum, item) =>
          sum + BigInt(item.unitAmountMinor) * BigInt(item.quantity),
        0n,
      );
      if (
        !obligation ||
        transactionReference !== ref(obligation.transactionReference, "txn") ||
        row.origin !== "subscription_recurring" ||
        row.currency_code !== obligation.currency ||
        grandTotal !== obligation.amountMinor ||
        !sameInstant(period.starts_at, obligation.period.startsAt) ||
        !sameInstant(period.ends_at, obligation.period.endsAt) ||
        BigInt(money(totals.subtotal)) !== expectedSubtotal ||
        BigInt(money(totals.subtotal)) + BigInt(money(totals.tax)) !==
          BigInt(money(totals.total)) ||
        totals.total !== grandTotal ||
        totals.credit !== "0" ||
        totals.credit_to_balance !== "0" ||
        totals.discount !== "0"
      )
        failed();
      if (row.status === "past_due" && balance === grandTotal) {
        if (
          payments.length === 0 ||
          payments.some(
            (payment) =>
              !["error", "failed"].includes(String(payment.status)) ||
              payment.amount !== grandTotal,
          )
        )
          failed();
        effect = {
          kind: "settle_existing_balance",
          amountMinor: grandTotal,
          currency: obligation.currency,
        };
      } else if (row.status === "paid" || row.status === "completed") {
        if (
          balance !== "0" ||
          payments.filter(
            (payment) =>
              payment.status === "captured" && payment.amount === grandTotal,
          ).length !== 1 ||
          payments.some(
            (payment) =>
              !["error", "failed", "captured"].includes(String(payment.status)),
          )
        )
          failed();
        status = "settlement_pending";
        effect = {
          kind: "settle_existing_balance",
          amountMinor: grandTotal,
          currency: obligation.currency,
        };
      } else failed();
    }
    const normalized = {
      transactionReference,
      subscriptionReference: row.subscription_id,
      customerReference: row.customer_id,
      status: row.status,
      origin: row.origin,
      collectionMode: row.collection_mode,
      currency: row.currency_code,
      grandTotal,
      balance,
      items: sort(actual),
      effect,
    };
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(normalized)),
    );
    const normalizedResultSha256 = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    let released = false;
    return {
      transactionReference,
      effect,
      normalizedResultSha256,
      status,
      release: () => {
        if (released || status !== "checkout_ready") failed();
        released = true;
        return {
          kind: "provider_checkout",
          provider: "paddle",
          environment: "test",
          token: transactionReference,
        };
      },
    };
  }
  return {
    validatorVersion: "paddle-payment-method-transaction-v1",
    validateConfiguration,
    prepare: async (expected, permit) => {
      validateConfiguration();
      if (!permit.consume()) failed();
      const id = ref(expected.identity.subscriptionReference, "sub");
      return validate(
        await retrieve(
          `subscriptions/${encodeURIComponent(id)}/update-payment-method-transaction`,
          true,
        ),
        expected,
      );
    },
    inspect: async (expected, transactionReference) => {
      const id = ref(transactionReference, "txn");
      return validate(
        await retrieve(`transactions/${encodeURIComponent(id)}`, false),
        expected,
        id,
      );
    },
  };
}
