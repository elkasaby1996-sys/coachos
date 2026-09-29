import { BillingError, object, uuidPattern } from "./billing-common.ts";
import type { BillingDependencies } from "./billing-handlers.ts";
import type { SeatAction } from "./billing-seat-quantity.ts";
import { observedTimestamp } from "./paddle-webhook/observation.ts";
export type PaddleSeatContext = {
  subscriptionRef: string;
  customerRef: string;
  cadence: "monthly" | "annual";
  base: { priceRef: string; productRef: string; amount: number };
  seat: { priceRef: string; productRef: string; amount: number };
  additionalSeats: number;
  maximumAdditionalSeats: number;
  periodStart: string;
  periodEnd: string;
  providerUpdatedAt: string;
  // Exact retained RFC3339 resource revision, never the event-ordering watermark.
  // Explicit null is allowed only by the database's historical-evidence guard.
  resourceUpdatedAt: string | null;
};
const fail = (ambiguous = false): never => {
  throw new BillingError(
    ambiguous
      ? "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS"
      : "BILLING_SEAT_QUANTITY_PROVIDER_FAILED",
    503,
    ambiguous,
  );
};
const reference = (v: string, prefix: string) => {
  if (!new RegExp(`^${prefix}_[a-z0-9]{26}$`).test(v)) fail();
  return v;
};
/** Match SQL's exact UTC nanosecond key without parsing away the fraction. */
function resourceRevisionKey(value: unknown): bigint {
  const spelling = observedTimestamp(value);
  const fraction = /\.([0-9]{1,9})(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(spelling);
  const wholeSecond = spelling.replace(
    /\.[0-9]{1,9}(Z|[+-][0-9]{2}:[0-9]{2})$/,
    "$1",
  );
  // Validated four-digit years keep whole-second milliseconds safely integral.
  // Date handles only the offset/calendar; the original fraction stays exact.
  const milliseconds = Date.parse(wholeSecond);
  if (!Number.isSafeInteger(milliseconds)) fail();
  return (
    BigInt(milliseconds) * 1_000_000n +
    BigInt((fraction?.[1] ?? "").padEnd(9, "0"))
  );
}
export function comparePaddleResourceRevisions(a: unknown, b: unknown): number {
  const left = resourceRevisionKey(a),
    right = resourceRevisionKey(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
/** Sandbox only. Private mappings, bounded IO and exactly one dispatch; no retries. */
export function createPaddleSeatTransport(
  environment: string,
  key: string,
  fetcher: typeof fetch,
) {
  if (environment !== "test" || !/^pdl_sdbx_[A-Za-z0-9_]+$/.test(key)) fail();
  async function call(
    method: "GET" | "PATCH",
    id: string,
    preview: boolean,
    body?: unknown,
  ) {
    reference(id, "sub");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const mutation = method === "PATCH" && !preview;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(
            `https://sandbox-api.paddle.com/subscriptions/${id}${preview ? "/preview" : ""}`,
            {
              method,
              redirect: "error",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                "Paddle-Version": "1",
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            },
          );
          if (response.status !== 200) {
            // Only definite validation/auth/payment rejection permits a new intent.
            if (mutation && [400, 401, 403, 404, 422].includes(response.status))
              throw new BillingError(
                "BILLING_SEAT_QUANTITY_PAYMENT_FAILED",
                409,
              );
            fail(mutation);
          }
          if (
            !/^application\/json(?:;|$)/i.test(
              response.headers.get("content-type") ?? "",
            )
          )
            fail(mutation);
          const stream = response.body?.getReader();
          if (!stream) return fail(mutation);
          reader = stream;
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const chunk = await stream.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 1048576) fail(mutation);
            chunks.push(chunk.value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          return object(
            JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
          ).data;
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new BillingError(
                "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
                503,
                true,
              ),
            );
          }, 30000);
        }),
      ]);
    } catch (error) {
      if (
        error instanceof BillingError &&
        error.code !== "BILLING_INVALID_INPUT"
      )
        throw error;
      return fail(mutation);
    } finally {
      clearTimeout(timer);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  }

  function inspect(
    value: unknown,
    c: PaddleSeatContext,
    n = c.additionalSeats,
    preview = false,
  ) {
    const d = object(value),
      period = object(d.current_billing_period),
      cycle = object(d.billing_cycle);
    const updatedAt = observedTimestamp(d.updated_at);
    const time = (x: unknown) => Date.parse(observedTimestamp(x));
    if (
      (preview
        ? d.id !== undefined && d.id !== c.subscriptionRef
        : d.id !== c.subscriptionRef) ||
      d.customer_id !== c.customerRef ||
      d.status !== "active" ||
      d.collection_mode !== "automatic" ||
      d.scheduled_change !== null ||
      d.canceled_at !== null ||
      d.paused_at !== null ||
      cycle.frequency !== 1 ||
      cycle.interval !== (c.cadence === "monthly" ? "month" : "year") ||
      time(period.starts_at) !== time(c.periodStart) ||
      time(period.ends_at) !== time(c.periodEnd) ||
      time(d.next_billed_at) !== time(c.periodEnd) ||
      (c.resourceUpdatedAt !== null &&
        comparePaddleResourceRevisions(updatedAt, c.resourceUpdatedAt) < 0) ||
      !Array.isArray(d.items) ||
      d.items.length !== (n === 0 ? 1 : 2)
    )
      fail();
    const expected = [
      { ...c.base, quantity: 1 },
      ...(n ? [{ ...c.seat, quantity: n }] : []),
    ];
    const seen = new Set<string>();
    for (const raw of d.items) {
      const item = object(raw),
        price = object(item.price),
        money = object(price.unit_price),
        recurrence = object(price.billing_cycle);
      const target = expected.find((x) => x.priceRef === price.id);
      if (
        !target ||
        seen.has(price.id) ||
        price.product_id !== target.productRef ||
        item.quantity !== target.quantity ||
        item.status !== "active" ||
        money.currency_code !== "USD" ||
        money.amount !== String(target.amount) ||
        recurrence.frequency !== 1 ||
        recurrence.interval !== cycle.interval
      )
        fail();
      seen.add(price.id);
    }
    const custom = d.custom_data === null ? {} : object(d.custom_data);
    if (JSON.stringify(custom).length > 8192) fail();
    return {
      snapshot: {
        subscriptionRef: d.id ?? c.subscriptionRef,
        customerRef: d.customer_id,
        status: d.status,
        cadence: c.cadence,
        additionalSeats: n,
        basePriceRef: c.base.priceRef,
        seatPriceRef: n ? c.seat.priceRef : null,
        updatedAt: d.updated_at,
        periodStart: period.starts_at,
        periodEnd: period.ends_at,
      },
      custom,
    };
  }
  function body(
    c: PaddleSeatContext,
    n: number,
    operation: string,
    custom: Record<string, unknown>,
  ) {
    if (
      !Number.isSafeInteger(n) ||
      n < 0 ||
      n > c.maximumAdditionalSeats ||
      n === c.additionalSeats ||
      !uuidPattern.test(operation)
    )
      fail();
    reference(c.base.priceRef, "pri");
    reference(c.seat.priceRef, "pri");
    // A previous plan marker is not allowed to authorize the new seat settlement.
    const unrelated = { ...custom };
    delete unrelated.repsync_plan_change_operation;
    return {
      items: [
        { price_id: c.base.priceRef, quantity: 1 },
        ...(n ? [{ price_id: c.seat.priceRef, quantity: n }] : []),
      ],
      proration_billing_mode:
        n > c.additionalSeats ? "prorated_immediately" : "do_not_bill",
      on_payment_failure: "prevent_change",
      custom_data: { ...unrelated, repsync_seat_quantity_operation: operation },
    };
  }
  return {
    retrieve: async (c: PaddleSeatContext) =>
      inspect(await call("GET", c.subscriptionRef, false), c),
    preview: async (
      c: PaddleSeatContext,
      n: number,
      operation: string,
      custom: Record<string, unknown>,
    ) => {
      const d = await call(
        "PATCH",
        c.subscriptionRef,
        true,
        body(c, n, operation, custom),
      );
      inspect(d, c, n, true);
    },
    update: async (
      c: PaddleSeatContext,
      n: number,
      operation: string,
      custom: Record<string, unknown>,
    ) => {
      const payload = body(c, n, operation, custom);
      try {
        inspect(await call("PATCH", c.subscriptionRef, false, payload), c, n);
      } catch (e) {
        if (
          e instanceof BillingError &&
          e.code === "BILLING_SEAT_QUANTITY_PAYMENT_FAILED"
        )
          throw e;
        fail(true);
      }
    },
  };
}
export type PaddleSeatTransport = ReturnType<typeof createPaddleSeatTransport>;
export async function handlePaddleSeatAction(
  deps: BillingDependencies,
  owner: string,
  token: string,
  action: SeatAction,
  input: Record<string, unknown>,
) {
  const state = () =>
    deps.ownerRpc(token)("get_my_billing_seat_quantity_state", {});
  if (action === "refresh") return state();
  if (action === "cancel")
    throw new BillingError("BILLING_SEAT_QUANTITY_CANNOT_CANCEL", 409);
  const args = { p_owner: owner, p_target: input.targetAdditionalSeats };
  if (action === "apply") {
    const retry = await deps.serviceRpc("begin_paddle_seat_quantity_v1", {
      ...args,
      p_operation: input.operationId,
      p_snapshot: null,
    });
    if (!retry.needsSnapshot) return state();
  }
  // Local eligibility/conflict checks precede any provider IO, including preview.
  const context = (await deps.serviceRpc(
    "paddle_seat_quantity_context_v1",
    args,
  )) as PaddleSeatContext;
  const transport = deps.paddleSeats!(),
    current = await transport.retrieve(context);
  if (action === "preview") {
    const preview = await deps.serviceRpc("preview_paddle_seat_quantity_v1", {
      ...args,
      p_snapshot: current.snapshot,
    });
    if (preview.eligible && preview.direction !== "no-op")
      await transport.preview(
        context,
        input.targetAdditionalSeats as number,
        crypto.randomUUID(),
        current.custom,
      );
    return preview;
  }
  const operation = await deps.serviceRpc("begin_paddle_seat_quantity_v1", {
    ...args,
    p_operation: input.operationId,
    p_snapshot: current.snapshot,
  });
  if (operation.dispatch) {
    try {
      await transport.update(
        operation.context as PaddleSeatContext,
        input.targetAdditionalSeats as number,
        input.operationId as string,
        current.custom,
      );
    } catch (error) {
      const definite =
        error instanceof BillingError &&
        error.code === "BILLING_SEAT_QUANTITY_PAYMENT_FAILED";
      try {
        await deps.serviceRpc("fail_paddle_seat_quantity_v1", {
          p_owner: owner,
          p_operation: operation.id,
          p_ambiguous: !definite,
        });
      } catch {
        /* Committed pending operation still prohibits redispatch. */
      }
      if (definite) throw error;
      fail(true);
    }
  }
  return state();
}
