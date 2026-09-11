import { BillingError, boundedBody, object } from "./lemon-squeezy.ts";
import type { BillingDependencies } from "./billing-handlers.ts";

export type PortalLinkPurpose = "manage_billing" | "update_payment_method";
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
export function portalHosts(value: string): string[] {
  const hosts = value
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    !hosts.length ||
    hosts.some(
      (host) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host),
    )
  )
    throw new BillingError("BILLING_PORTAL_PROVIDER_NOT_CONFIGURED", 503);
  return hosts;
}
export function validatePortalUrl(
  value: unknown,
  purpose: PortalLinkPurpose,
  hosts: string[],
  subscriptionId: string,
  now = Date.now(),
) {
  if (value == null || value === "")
    throw new BillingError("BILLING_PORTAL_URL_MISSING", 503);
  const invalid = () => new BillingError("BILLING_PORTAL_URL_INVALID", 503);
  if (typeof value !== "string" || value.length > 4096 || /[\s\\]/.test(value))
    throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw invalid();
  if (!hosts.includes(url.hostname))
    throw new BillingError("BILLING_PORTAL_HOST_NOT_ALLOWED", 503);
  if (
    url.pathname !==
    (purpose === "manage_billing"
      ? "/billing"
      : `/subscription/${subscriptionId}/payment-details`)
  )
    throw invalid();
  const keys = Array.from(url.searchParams.keys());
  if (
    keys.some((key) => !["expires", "signature"].includes(key)) ||
    url.searchParams.getAll("signature").length !== 1 ||
    !/^[a-f0-9]{64}$/i.test(url.searchParams.get("signature") ?? "") ||
    url.searchParams.getAll("expires").length > 1
  )
    throw invalid();
  const expires = url.searchParams.get("expires");
  let expiresAt: string | undefined;
  if (expires !== null) {
    const ms = Number(expires) * 1000;
    if (
      !/^[1-9][0-9]{0,12}$/.test(expires) ||
      !Number.isSafeInteger(ms) ||
      ms <= now ||
      ms > 8.64e15
    )
      throw invalid();
    expiresAt = new Date(ms).toISOString();
  }
  return { purpose, portalUrl: value, ...(expiresAt ? { expiresAt } : {}) };
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
    if (!config?.provider.retrieveSubscriptionForPortal)
      throw new BillingError("BILLING_PORTAL_PROVIDER_NOT_CONFIGURED", 503);
    const hosts = portalHosts(config.portalAllowedHosts ?? "");
    const args = { p_owner: user.id, p_environment: config.environment };
    const link = object(
      await deps.serviceRpc("get_billing_portal_subscription", args),
    );
    const snapshot = await config.provider.retrieveSubscriptionForPortal(
      link.subscription_id,
    );
    for (const key of [
      "provider",
      "environment",
      "store_id",
      "customer_id",
      "subscription_id",
    ] as const)
      if (snapshot[key] !== link[key])
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
      (!["past_due", "grace"].includes(current.local_status) ||
        !["past_due", "unpaid"].includes(snapshot.status))
    )
      throw new BillingError("BILLING_PORTAL_NOT_AVAILABLE", 409);
    return reply(
      validatePortalUrl(
        purpose === "manage_billing"
          ? snapshot.customerPortal
          : snapshot.updatePaymentMethod,
        purpose,
        hosts,
        snapshot.subscription_id,
      ),
    );
  } catch (error) {
    const safe =
      error instanceof BillingError && portalCodes.has(error.code)
        ? error
        : new BillingError("BILLING_PORTAL_RETRIEVAL_FAILED", 503);
    deps.log?.({ code: safe.code, processingStatus: "failed" });
    return reply({ code: safe.code }, safe.httpStatus);
  }
}
