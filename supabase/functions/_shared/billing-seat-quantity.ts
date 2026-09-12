import {
  BillingError,
  boundedBody,
  object,
  uuidPattern,
  type SubscriptionSnapshot,
} from "./lemon-squeezy.ts";
import { validateSubscriptionItem } from "./billing-seat-item.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

export const seatQuantityCodes = [
  "OWNER_REQUIRED",
  "NOT_ELIGIBLE",
  "MAPPING_UNAVAILABLE",
  "PRICE_CONTRACT_MISMATCH",
  "ITEM_MISSING",
  "PAYPAL_UNSUPPORTED",
  "TARGET_INVALID",
  "OPERATION_CONFLICT",
  "CAPACITY_BLOCKED",
  "PROVIDER_FAILED",
  "PROVIDER_AMBIGUOUS",
  "AWAITING_PAYMENT",
  "PAYMENT_FAILED",
  "UNAPPROVED_DRIFT",
  "MANUAL_REVIEW",
  "CANNOT_CANCEL",
].map((c) => `BILLING_SEAT_QUANTITY_${c}`);
export type SeatAction = "preview" | "apply" | "cancel" | "refresh";
export function seatQuantityRequest(value: unknown, action: SeatAction) {
  const v = object(value);
  const keys = Object.keys(v).sort().join(",");
  if (
    keys !==
      {
        preview: "targetAdditionalSeats",
        apply: "operationId,targetAdditionalSeats",
        cancel: "operationId",
        refresh: "",
      }[action] ||
    ((action === "apply" || action === "cancel") &&
      (typeof v.operationId !== "string" ||
        !uuidPattern.test(v.operationId))) ||
    ((action === "preview" || action === "apply") &&
      (!Number.isSafeInteger(v.targetAdditionalSeats) ||
        v.targetAdditionalSeats < 0 ||
        v.targetAdditionalSeats > 5))
  )
    throw new BillingError("BILLING_SEAT_QUANTITY_TARGET_INVALID");
  return v;
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
  new Response(JSON.stringify(value), { headers, status });

export async function handleSeatQuantity(
  request: Request,
  deps: BillingDependencies,
  action: SeatAction,
) {
  if (request.method === "OPTIONS") return reply({});
  if (request.method !== "POST")
    return reply({ code: "BILLING_INVALID_INPUT" }, 405);
  let operation:
    | {
        id: string;
        dispatch: boolean;
        quantity: number;
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
      throw new BillingError("BILLING_SEAT_QUANTITY_OWNER_REQUIRED", 401);
    ownerId = owner.id;
    const input = seatQuantityRequest(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))),
      action,
    );
    const config = deps.config();
    if (!config || !config.provider.retrieveSubscriptionItem)
      throw new BillingError("BILLING_SEAT_QUANTITY_PROVIDER_FAILED", 503);
    const base = { p_owner: owner.id, p_environment: config.environment };
    const ctx = await deps.serviceRpc("billing_seat_quantity_context", base);
    const id = ctx.subscription.provider_subscription_id;
    const current = await config.provider.retrieveSubscription(id);
    const read = async (s: SubscriptionSnapshot) => {
      const item = await config.provider.retrieveSubscriptionItem!(
        s.first_subscription_item_id,
      );
      if (action !== "refresh") validateSubscriptionItem(s, item);
      return { ...s, verified_item: item };
    };
    let verified = await read(current);
    if (action === "refresh") {
      await deps.serviceRpc("finish_billing_plan_change", {
        ...base,
        p_snapshot: verified,
      });
      for (const invoice of (await config.provider.listSubscriptionInvoices?.(
        id,
      )) ?? []) {
        if (invoice.billing_reason === "updated" && invoice.status === "paid") {
          verified = await read(await config.provider.retrieveSubscription(id));
          await deps.serviceRpc("finish_billing_plan_change", {
            ...base,
            p_snapshot: verified,
            p_invoice: invoice,
          });
        }
      }
    } else if (action === "preview") {
      return reply(
        await deps.serviceRpc("preview_billing_seat_quantity", {
          ...base,
          p_target: input.targetAdditionalSeats,
          p_snapshot: verified,
        }),
      );
    } else {
      if (!config.provider.updateSubscriptionItemQuantity)
        throw new BillingError("BILLING_SEAT_QUANTITY_PROVIDER_FAILED", 503);
      if (
        action === "cancel" &&
        (current.status !== "active" ||
          current.cancelled ||
          current.payment_processor !== "card" ||
          current.subscription_id !== id ||
          current.customer_id !== ctx.subscription.provider_customer_id ||
          current.store_id !== ctx.subscription.provider_store_id ||
          current.environment !== config.environment ||
          current.variant_id !== ctx.subscription.provider_variant_id ||
          current.price_id !== ctx.subscription.provider_price_id ||
          current.first_subscription_item_id !==
            ctx.subscription.first_subscription_item_id)
      )
        throw new BillingError("BILLING_SEAT_QUANTITY_CANNOT_CANCEL", 409);
      operation = await deps.serviceRpc(
        action === "cancel"
          ? "begin_cancel_billing_seat_quantity"
          : "begin_billing_seat_quantity",
        {
          ...base,
          p_operation: input.operationId,
          ...(action === "apply"
            ? { p_target: input.targetAdditionalSeats, p_snapshot: verified }
            : {}),
        },
      );
      if (operation?.dispatch) {
        dispatched = true;
        const item = await config.provider.updateSubscriptionItemQuantity(
          current.first_subscription_item_id,
          operation.quantity,
          operation.timing,
        );
        validateSubscriptionItem(current, item, operation.quantity);
        const updated = await config.provider.retrieveSubscription(id);
        if (
          updated.quantity !== operation.quantity ||
          updated.variant_id !== current.variant_id ||
          updated.price_id !== current.price_id ||
          updated.customer_id !== current.customer_id ||
          updated.store_id !== current.store_id ||
          updated.environment !== current.environment ||
          updated.first_subscription_item_id !==
            current.first_subscription_item_id ||
          updated.payment_processor !== "card" ||
          Date.parse(updated.updated_at) < Date.parse(current.updated_at)
        )
          throw new BillingError(
            "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
            503,
            true,
          );
        verified = await read(updated);
        const result = await deps.serviceRpc("finish_billing_plan_change", {
          ...base,
          p_snapshot: verified,
        });
        if (!["processed", "replayed"].includes(result))
          throw new BillingError(
            "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
            503,
            true,
          );
      }
    }
    return reply(
      await deps.ownerRpc(token)("get_my_billing_seat_quantity_state", {}),
    );
  } catch (error) {
    const code =
      error instanceof BillingError && seatQuantityCodes.includes(error.code)
        ? error.code
        : dispatched
          ? "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS"
          : "BILLING_SEAT_QUANTITY_PROVIDER_FAILED";
    if (dispatched && operation && ownerId) {
      try {
        await deps.serviceRpc("fail_billing_seat_quantity", {
          p_owner: ownerId,
          p_operation: operation.id,
          p_ambiguous: code !== "BILLING_SEAT_QUANTITY_PROVIDER_FAILED",
        });
      } catch {
        /* Durable pending state prevents a blind second charge. */
      }
    }
    deps.log?.({ code, processingStatus: dispatched ? "pending" : "denied" });
    return reply(
      { code },
      error instanceof BillingError ? error.httpStatus : 503,
    );
  }
}
