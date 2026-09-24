import { BillingError, object } from "./billing-common.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

type Context = {
  subscriptionRef: string;
  customerRef: string;
  sourcePriceRef: string;
  sourceProductRef: string;
  sourceAmount: number;
  periodStart: string;
  periodEnd: string;
  cadence: "monthly" | "annual";
};
type Target = { priceRef: string; productRef: string; amount: number };
const fail = (ambiguous = false): never => {
  throw new BillingError(
    ambiguous
      ? "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS"
      : "BILLING_PLAN_CHANGE_PROVIDER_FAILED",
    503,
    ambiguous,
  );
};
const reference = (v: string, prefix: string) => {
  if (!new RegExp(`^${prefix}_[a-z0-9]{26}$`).test(v)) fail();
  return v;
};
/** Server-only, fixed Sandbox origin, bounded IO, no implicit retries. */
export function createPaddlePlanTransport(
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
              throw new BillingError("BILLING_PLAN_CHANGE_PAYMENT_FAILED", 409);
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
                "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
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
  function inspect(value: unknown, context: Context, target?: Target) {
    const d = object(value);
    const item =
      Array.isArray(d.items) && d.items.length === 1
        ? object(d.items[0])
        : fail(Boolean(target));
    const price = object(item.price),
      money = object(price.unit_price),
      cycle = object(d.billing_cycle);
    const period = object(d.current_billing_period);
    const expected = target ?? {
      priceRef: context.sourcePriceRef,
      productRef: context.sourceProductRef,
      amount: context.sourceAmount,
    };
    if (
      d.id !== context.subscriptionRef ||
      d.customer_id !== context.customerRef ||
      d.status !== "active" ||
      d.collection_mode !== "automatic" ||
      d.scheduled_change !== null ||
      d.canceled_at !== null ||
      d.paused_at !== null ||
      item.quantity !== 1 ||
      item.status !== "active" ||
      price.id !== expected.priceRef ||
      price.product_id !== expected.productRef ||
      money.currency_code !== "USD" ||
      String(money.amount) !== String(expected.amount) ||
      cycle.frequency !== 1 ||
      cycle.interval !== (context.cadence === "monthly" ? "month" : "year") ||
      Date.parse(period.starts_at) !== Date.parse(context.periodStart) ||
      Date.parse(period.ends_at) !== Date.parse(context.periodEnd) ||
      !Number.isFinite(Date.parse(period.starts_at)) ||
      !Number.isFinite(Date.parse(period.ends_at)) ||
      !Number.isFinite(Date.parse(d.updated_at)) ||
      Date.parse(d.next_billed_at) !== Date.parse(period.ends_at)
    )
      fail(Boolean(target));
    const custom = d.custom_data === null ? {} : object(d.custom_data);
    if (JSON.stringify(custom).length > 8192) fail();
    return {
      snapshot: {
        subscriptionRef: d.id,
        customerRef: d.customer_id,
        priceRef: price.id,
        productRef: price.product_id,
        status: d.status,
        cadence: context.cadence,
        quantity: 1,
        cancelled: false,
        updatedAt: d.updated_at,
        periodStart: period.starts_at,
        periodEnd: period.ends_at,
      },
      custom,
    };
  }
  function body(
    target: Target,
    timing: string,
    operation: string,
    custom: Record<string, unknown>,
  ) {
    reference(target.priceRef, "pri");
    if (
      !/^[0-9a-f-]{36}$/.test(operation) ||
      !["immediate", "period_end"].includes(timing)
    )
      fail();
    return {
      items: [{ price_id: target.priceRef, quantity: 1 }],
      proration_billing_mode:
        timing === "immediate" ? "prorated_immediately" : "do_not_bill",
      on_payment_failure: "prevent_change",
      custom_data: { ...custom, repsync_plan_change_operation: operation },
    };
  }
  return {
    retrieve: async (context: Context) =>
      inspect(await call("GET", context.subscriptionRef, false), context),
    preview: async (
      context: Context,
      target: Target,
      timing: string,
      operation: string,
      custom: Record<string, unknown>,
    ) => {
      const d = object(
        await call(
          "PATCH",
          context.subscriptionRef,
          true,
          body(target, timing, operation, custom),
        ),
      );
      inspect(d, context, target);
      // Quote is advisory; only authenticated payment webhooks grant authority.
      if (
        timing === "immediate" &&
        (!d.immediate_transaction ||
          !/^\d+$/.test(
            String(d.immediate_transaction.details?.totals?.grand_total),
          ))
      )
        fail();
    },
    update: async (
      context: Context,
      target: Target,
      timing: string,
      operation: string,
      custom: Record<string, unknown>,
    ) => {
      const d = await call(
        "PATCH",
        context.subscriptionRef,
        false,
        body(target, timing, operation, custom),
      );
      try {
        inspect(d, context, target);
      } catch {
        fail(true);
      }
    },
  };
}
export type PaddlePlanTransport = ReturnType<typeof createPaddlePlanTransport>;

export async function handlePaddlePlanAction(
  deps: BillingDependencies,
  owner: string,
  token: string,
  action: "preview" | "apply" | "cancel" | "refresh",
  input: Record<string, any>,
) {
  if (action === "cancel")
    throw new BillingError("BILLING_PLAN_CHANGE_CANNOT_CANCEL", 409);
  const state = () =>
    deps.ownerRpc(token)("get_my_billing_plan_change_state", {});
  // Refresh reads durable authority only. It never resends an ambiguous PATCH.
  if (action === "refresh") return state();
  const args = {
    p_owner: owner,
    p_target_plan: input.targetPlanKey,
    p_target_cadence: input.targetCadence,
    p_operation: input.operationId,
  };
  if (action === "apply") {
    const retry = await deps.serviceRpc("begin_paddle_plan_change_v1", {
      ...args,
      p_snapshot: null,
    });
    if (!retry.needsSnapshot) return state();
  }
  const context = await deps.serviceRpc("paddle_plan_change_context_v1", {
    p_owner: owner,
  });
  const transport = deps.paddlePlans!();
  const current = await transport.retrieve(context);
  if (action === "preview") {
    const v = await deps.serviceRpc("preview_paddle_plan_change_v1", {
      p_owner: owner,
      p_target_plan: input.targetPlanKey,
      p_target_cadence: input.targetCadence,
      p_snapshot: current.snapshot,
    });
    await transport.preview(
      context,
      {
        priceRef: v.targetPriceRef,
        productRef: v.targetProductRef,
        amount: v.preview.targetPriceMinor,
      },
      v.preview.effectiveTiming,
      input.operationId,
      current.custom,
    );
    return v.preview;
  }
  const operation = await deps.serviceRpc("begin_paddle_plan_change_v1", {
    ...args,
    p_snapshot: current.snapshot,
  });
  if (operation.dispatch) {
    try {
      await transport.update(
        context,
        operation,
        operation.timing,
        input.operationId,
        current.custom,
      );
    } catch (error) {
      try {
        await deps.serviceRpc("fail_paddle_plan_change_v1", {
          p_owner: owner,
          p_operation: operation.id,
          p_ambiguous: !(
            error instanceof BillingError &&
            error.code === "BILLING_PLAN_CHANGE_PAYMENT_FAILED"
          ),
        });
      } catch {
        /* Durable provider_pending remains non-dispatchable. */
      }
      throw error;
    }
  }
  return state();
}
