import { BillingError, boundedBody, object } from "./billing-common.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

import type { PortalLinkPurpose } from "./billing-provider.ts";
import { canonicalPortalIdentity } from "./billing-legacy-records.ts";
export type { PortalLinkPurpose } from "./billing-provider.ts";
// Compatibility exports for existing validator consumers.
export { portalHosts, validatePortalUrl } from "./lemon-squeezy-portal.ts";
export const portalCodes = new Set([
  "BILLING_PORTAL_NOT_AVAILABLE",
  "BILLING_PORTAL_OWNER_REQUIRED",
  "BILLING_PORTAL_PROVIDER_NOT_CONFIGURED",
  "BILLING_PORTAL_SUBSCRIPTION_NOT_FOUND",
  "BILLING_PORTAL_IDENTITY_MISMATCH",
  "BILLING_PORTAL_URL_MISSING",
  "BILLING_PORTAL_URL_INVALID",
  "BILLING_PORTAL_HOST_NOT_ALLOWED",
  "BILLING_PORTAL_RETRIEVAL_FAILED",
]);
export function portalPurpose(input: unknown): PortalLinkPurpose {
  const value = object(input);
  if (
    Object.keys(value).join() !== "purpose" ||
    !["manage_billing", "update_payment_method"].includes(value.purpose)
  )
    throw new BillingError("BILLING_PORTAL_NOT_AVAILABLE", 400);
  return value.purpose;
}
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
};
export async function handleCustomerPortalLink(
  request: Request,
  deps: BillingDependencies,
): Promise<Response> {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST")
    return reply({ code: "BILLING_PORTAL_NOT_AVAILABLE" }, 405);
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const user = token ? await deps.authenticate(token) : null;
    if (!user) throw new BillingError("BILLING_PORTAL_OWNER_REQUIRED", 401);
    let purpose: PortalLinkPurpose;
    try {
      purpose = portalPurpose(
        JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))),
      );
    } catch {
      throw new BillingError("BILLING_PORTAL_NOT_AVAILABLE", 400);
    }
    const config = deps.config();
    const capability = config?.adapter?.capabilities.customerPortal;
    if (!config || !capability)
      throw new BillingError("BILLING_PORTAL_PROVIDER_NOT_CONFIGURED", 503);
    capability.validateConfiguration();
    const args = { p_owner: user.id, p_environment: config.environment };
    const link = object(
      await deps.serviceRpc("get_billing_portal_subscription", args),
    );
    const prepared = await capability.prepare({
      subscriptionReference: link.subscription_id,
      purpose,
    });
    const expected = canonicalPortalIdentity(link);
    for (const key of Object.keys(expected) as (keyof typeof expected)[])
      if (prepared.identity[key] !== expected[key])
        throw new BillingError("BILLING_PORTAL_IDENTITY_MISMATCH", 409);
    // Revalidate ownership and the current local linkage after the network request.
    const current = object(
      await deps.serviceRpc("get_billing_portal_subscription", args),
    );
    for (const key of Object.keys(link))
      if (current[key] !== link[key])
        throw new BillingError("BILLING_PORTAL_IDENTITY_MISMATCH", 409);
    if (
      purpose === "update_payment_method" &&
      !["past_due", "grace"].includes(current.local_status)
    )
      throw new BillingError("BILLING_PORTAL_NOT_AVAILABLE", 409);
    return reply({ purpose, portalUrl: prepared.destination().url });
  } catch (error) {
    const safe =
      error instanceof BillingError && portalCodes.has(error.code)
        ? error
        : new BillingError("BILLING_PORTAL_RETRIEVAL_FAILED", 503);
    deps.log?.({ code: safe.code, processingStatus: "failed" });
    return reply({ code: safe.code }, safe.httpStatus);
  }
}
