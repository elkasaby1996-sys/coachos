import {
  BillingError,
  boundedBody,
  object,
  uuidPattern,
  type SubscriptionSnapshot,
} from "./lemon-squeezy.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

export const planChangeCodes = [
  "OWNER_REQUIRED",
  "NOT_ELIGIBLE",
  "NOOP",
  "MIXED_DIRECTION_UNSUPPORTED",
  "PAYPAL_UNSUPPORTED",
  "TARGET_MAPPING_UNAVAILABLE",
  "OPERATION_CONFLICT",
  "ALREADY_PENDING",
  "CAPACITY_BLOCKED",
  "DATA_QUALITY_BLOCKED",
  "PROVIDER_FAILED",
  "PROVIDER_AMBIGUOUS",
  "AWAITING_PAYMENT",
  "PAYMENT_FAILED",
  "UNAPPROVED_PROVIDER_STATE",
  "EFFECTIVE_DATE_INVALID",
  "CANNOT_CANCEL",
  "MANUAL_REVIEW",
].map((code) => `BILLING_PLAN_CHANGE_${code}`);
export function planChangeRequest(value: unknown) {
  const v = object(value);
  if (
    Object.keys(v).sort().join(",") !==
      "operationId,targetCadence,targetPlanKey" ||
    !["launch", "growth", "scale"].includes(v.targetPlanKey) ||
    !["monthly", "annual"].includes(v.targetCadence) ||
    typeof v.operationId !== "string" ||
    !uuidPattern.test(v.operationId)
  )
    throw new BillingError("BILLING_INVALID_INPUT");
  return {
    targetPlanKey: v.targetPlanKey as string,
    targetCadence: v.targetCadence as string,
    operationId: v.operationId as string,
  };
}
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
export async function handlePlanChange(
  request: Request,
  deps: BillingDependencies,
  action: "preview" | "apply" | "cancel" | "refresh",
) {
  if (request.method === "OPTIONS") return reply({});
  if (request.method !== "POST")
    return reply({ code: "BILLING_INVALID_INPUT" }, 405);
  let operation:
    | {
        id: string;
        dispatch: boolean;
        variant: string;
        product: string;
        price: string;
        timing: "immediate" | "period_end";
      }
    | undefined;
  let ownerId: string | undefined;
  let dispatched = false;
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const owner = token ? await deps.authenticate(token) : null;
    if (!owner || !token)
      throw new BillingError("BILLING_PLAN_CHANGE_OWNER_REQUIRED", 401);
    ownerId = owner.id;
    const input = object(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))),
    );
    if (action === "cancel") {
      if (
        Object.keys(input).join() !== "operationId" ||
        typeof input.operationId !== "string" ||
        !uuidPattern.test(input.operationId)
      )
        throw new BillingError("BILLING_INVALID_INPUT");
    } else if (action === "refresh") {
      if (Object.keys(input).length)
        throw new BillingError("BILLING_INVALID_INPUT");
    } else planChangeRequest(input);
    const config = deps.config();
    if (!config)
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    const ctx = await deps.serviceRpc("billing_plan_change_context", {
      p_owner: owner.id,
      p_environment: config.environment,
    });
    const id = ctx.subscription.provider_subscription_id;
    const current = await config.provider.retrieveSubscription(id);
    if (current.payment_processor === "paypal")
      throw new BillingError("BILLING_PLAN_CHANGE_PAYPAL_UNSUPPORTED", 409);
    if (current.payment_processor !== "card")
      throw new BillingError("BILLING_PLAN_CHANGE_NOT_ELIGIBLE", 409);
    if (
      action === "cancel" &&
      (current.status !== "active" ||
        current.cancelled ||
        current.variant_id !== ctx.subscription.provider_variant_id ||
        current.price_id !== ctx.subscription.provider_price_id ||
        current.customer_id !== ctx.subscription.provider_customer_id ||
        current.store_id !== ctx.subscription.provider_store_id ||
        current.environment !== config.environment)
    )
      throw new BillingError("BILLING_PLAN_CHANGE_CANNOT_CANCEL", 409);
    const base = { p_owner: owner.id, p_environment: config.environment };
    if (action === "refresh") {
      await deps.serviceRpc("finish_billing_plan_change", {
        ...base,
        p_snapshot: current,
      });
      for (const invoice of (await config.provider.listSubscriptionInvoices?.(
        id,
      )) ?? []) {
        if (invoice.billing_reason === "updated" && invoice.status === "paid")
          await deps.serviceRpc("finish_billing_plan_change", {
            ...base,
            p_snapshot: current,
            p_invoice: invoice,
          });
      }
      return reply(
        await deps.ownerRpc(token)("get_my_billing_plan_change_state", {}),
      );
    }
    if (action === "preview")
      return reply(
        await deps.serviceRpc("preview_billing_plan_change", {
          ...base,
          p_target_plan: input.targetPlanKey,
          p_target_cadence: input.targetCadence,
          p_snapshot: current,
        }),
      );
    if (!config.provider.updateSubscriptionVariant)
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    operation =
      action === "cancel"
        ? await deps.serviceRpc("begin_cancel_billing_plan_change", {
            ...base,
            p_operation: input.operationId,
          })
        : await deps.serviceRpc("begin_billing_plan_change", {
            ...base,
            p_target_plan: input.targetPlanKey,
            p_target_cadence: input.targetCadence,
            p_operation: input.operationId,
            p_snapshot: current,
          });
    if (operation?.dispatch) {
      dispatched = true;
      const validate = (snapshot: SubscriptionSnapshot) => {
        if (
          snapshot.subscription_id !== id ||
          snapshot.environment !== config.environment ||
          snapshot.store_id !== current.store_id ||
          snapshot.customer_id !== current.customer_id ||
          snapshot.order_id !== current.order_id ||
          snapshot.order_item_id !== current.order_item_id ||
          snapshot.first_subscription_item_id !==
            current.first_subscription_item_id ||
          snapshot.quantity !== 1 ||
          snapshot.payment_processor !== "card" ||
          snapshot.variant_id !== operation!.variant ||
          snapshot.product_id !== operation!.product ||
          snapshot.price_id !== operation!.price ||
          Date.parse(snapshot.updated_at) < Date.parse(current.updated_at) ||
          snapshot.trial_ends_at !== null ||
          (operation!.timing === "period_end" &&
            snapshot.renews_at !== current.renews_at)
        )
          throw new BillingError(
            "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
            503,
            true,
          );
      };
      validate(
        await config.provider.updateSubscriptionVariant(
          id,
          operation.variant,
          operation.timing,
        ),
      );
      // GET confirms state after PATCH, especially source restoration on cancel.
      const updated = await config.provider.retrieveSubscription(id);
      validate(updated);
      const result = await deps.serviceRpc("finish_billing_plan_change", {
        ...base,
        p_snapshot: updated,
      });
      if (!["processed", "replayed"].includes(result))
        throw new BillingError(
          "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS",
          503,
          true,
        );
    }
    return reply(
      await deps.ownerRpc(token)("get_my_billing_plan_change_state", {}),
    );
  } catch (error) {
    const code =
      error instanceof BillingError &&
      (planChangeCodes.includes(error.code) ||
        error.code === "BILLING_INVALID_INPUT")
        ? error.code
        : dispatched
          ? "BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS"
          : "BILLING_PLAN_CHANGE_PROVIDER_FAILED";
    if (operation?.dispatch && ownerId) {
      try {
        await deps.serviceRpc("fail_billing_plan_change", {
          p_owner: ownerId,
          p_operation: operation.id,
          p_ambiguous: code !== "BILLING_PLAN_CHANGE_PROVIDER_FAILED",
        });
      } catch {
        /* Durable provider_pending prevents repeat dispatch. */
      }
    }
    deps.log?.({ code, processingStatus: dispatched ? "pending" : "denied" });
    return reply(
      { code },
      error instanceof BillingError ? error.httpStatus : 503,
    );
  }
}
