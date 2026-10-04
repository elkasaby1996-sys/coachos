import {
  BillingError,
  boundedBody,
  object,
  uuidPattern,
} from "./billing-common.ts";
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
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const owner = token ? await deps.authenticate(token) : null;
    if (!owner || !token)
      throw new BillingError("BILLING_PLAN_CHANGE_OWNER_REQUIRED", 401);
    let input = object(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))),
    );
    let previewContractVersion: 1 | 2 = 1;
    if (
      action === "preview" &&
      Object.hasOwn(input, "previewContractVersion")
    ) {
      if (input.previewContractVersion !== 2)
        throw new BillingError("BILLING_INVALID_INPUT");
      previewContractVersion = 2;
      input = { ...input };
      delete input.previewContractVersion;
    }
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
    const provider = await deps.serviceRpc("billing_workflow_provider_v1", {
      p_owner: owner.id,
    });
    if (provider !== null && typeof provider !== "string")
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    if (provider === null)
      throw new BillingError("BILLING_PLAN_CHANGE_NOT_ELIGIBLE", 409);
    if (!deps.providerAvailable?.(provider))
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    if (!deps.providerAvailable?.(provider))
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    if (!deps.planAction)
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    const result = await deps.planAction(
      provider,
      owner.id,
      token,
      action,
      input,
    );
    // Both established wire versions use the adapter's compatibility translation.
    if (action === "preview" && deps.legacyPlanPreview)
      return reply(deps.legacyPlanPreview(result, previewContractVersion));
    if (action === "preview" && previewContractVersion === 1) {
      const compatible = { ...result };
      delete compatible.quote;
      return reply(compatible);
    }
    if (action === "preview")
      throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
    return reply(result);
  } catch (error) {
    const code =
      error instanceof BillingError &&
      (planChangeCodes.includes(error.code) ||
        error.code === "BILLING_INVALID_INPUT")
        ? error.code
        : "BILLING_PLAN_CHANGE_PROVIDER_FAILED";
    deps.log?.({ code, processingStatus: "denied" });
    return reply(
      { code },
      error instanceof BillingError ? error.httpStatus : 503,
    );
  }
}
