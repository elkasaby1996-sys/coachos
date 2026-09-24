import {
  BillingError,
  boundedBody,
  object,
  uuidPattern,
} from "./billing-common.ts";
import { canonicalSubscriptionIdentity } from "./billing-legacy-records.ts";
import type { BillingDependencies } from "./billing-handlers.ts";
import { handlePaddlePlanAction } from "./paddle-plan-change.ts";

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
    if (
      deps.paddlePlans &&
      (await deps.serviceRpc("paddle_plan_change_route_v1", {
        p_owner: owner.id,
      }))
    )
      return reply(
        await handlePaddlePlanAction(deps, owner.id, token, action, input),
      );
    const config = deps.config();
    if (!config?.commercial?.plans)
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    const { subscriptions, reconciliation: proof, plans } = config.commercial;
    const ctx = await deps.serviceRpc("billing_plan_change_context", {
      p_owner: owner.id,
      p_environment: config.environment,
    });
    const id = ctx.subscription.provider_subscription_id;
    const current = await subscriptions.withItem(
      await subscriptions.retrieve(id),
    );
    plans.assertEligible(current);
    if (action === "cancel")
      plans.assertCancelable(
        current,
        canonicalSubscriptionIdentity(ctx.subscription, config.environment),
      );
    const base = { p_owner: owner.id, p_environment: config.environment };
    if (action === "refresh") {
      await deps.serviceRpc("finish_billing_plan_change", {
        ...base,
        ...proof.snapshotArguments(current),
      });
      for (const invoice of await proof.paidAdjustments(id)) {
        await deps.serviceRpc("finish_billing_plan_change", {
          ...base,
          ...proof.snapshotArguments(current),
          ...proof.invoiceArguments(invoice),
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
          ...proof.snapshotArguments(current),
        }),
      );
    if (!plans.canChange)
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
            ...proof.snapshotArguments(current),
          });
    if (operation?.dispatch) {
      dispatched = true;
      const target = {
        subscriptionReference: id,
        offerReference: operation.variant,
        productReference: operation.product,
        priceReference: operation.price,
        // RepSync owns the approved seat quantity; the provider only verifies it.
        expectedQuantity:
          1 + (ctx.subscription.approved_additional_coach_seats ?? 0),
        timing: operation.timing,
      };
      plans.assertResult(await plans.change(target), current, target);
      // GET confirms state after PATCH, especially source restoration on cancel.
      const updated = await subscriptions.retrieve(id);
      plans.assertResult(updated, current, target);
      const verified = await subscriptions.withItem(updated);
      const result = await deps.serviceRpc("finish_billing_plan_change", {
        ...base,
        ...proof.snapshotArguments(verified),
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
