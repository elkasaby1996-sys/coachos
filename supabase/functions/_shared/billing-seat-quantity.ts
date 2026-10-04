import {
  BillingError,
  boundedBody,
  object,
  uuidPattern,
} from "./billing-common.ts";
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
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const owner = token ? await deps.authenticate(token) : null;
    if (!owner || !token)
      throw new BillingError("BILLING_SEAT_QUANTITY_OWNER_REQUIRED", 401);
    const input = seatQuantityRequest(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))),
      action,
    );
    const provider = await deps.serviceRpc("billing_workflow_provider_v1", {
      p_owner: owner.id,
    });
    if (provider !== null && typeof provider !== "string")
      throw new BillingError("BILLING_SEAT_QUANTITY_PROVIDER_FAILED", 503);
    if (provider === null)
      throw new BillingError("BILLING_SEAT_QUANTITY_NOT_ELIGIBLE", 409);
    if (!deps.providerAvailable?.(provider))
      throw new BillingError("BILLING_SEAT_QUANTITY_PROVIDER_FAILED", 503);
    if (!deps.seatAction)
      throw new BillingError("BILLING_SEAT_QUANTITY_PROVIDER_FAILED", 503);
    return reply(
      await deps.seatAction(provider, owner.id, token, action, input),
    );
  } catch (error) {
    const code =
      error instanceof BillingError && seatQuantityCodes.includes(error.code)
        ? error.code
        : "BILLING_SEAT_QUANTITY_PROVIDER_FAILED";
    deps.log?.({ code, processingStatus: "denied" });
    return reply(
      { code },
      error instanceof BillingError ? error.httpStatus : 503,
    );
  }
}
