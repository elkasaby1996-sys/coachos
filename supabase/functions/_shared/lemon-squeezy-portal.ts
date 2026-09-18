import { BillingError, type BillingProvider } from "./lemon-squeezy.ts";
import type {
  CustomerPortalCapability,
  PortalLinkPurpose,
} from "./billing-provider.ts";

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
  // URL.port hides an explicit default :443; inspect the original authority too.
  const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
  if (
    !authority ||
    /[:@]/.test(authority) ||
    value.includes("#") ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  )
    throw invalid();
  if (!hosts.includes(url.hostname))
    throw new BillingError("BILLING_PORTAL_HOST_NOT_ALLOWED", 503);
  const path =
    purpose === "manage_billing"
      ? "/billing"
      : `/subscription/${subscriptionId}/payment-details`;
  if (url.pathname !== path && url.pathname !== `${path}/`) throw invalid();
  // Only called after authenticated provider retrieval and canonical identity rechecks.
  // The provider owns the query, including signature/expiry semantics. Never parse,
  // reconstruct, or use it for RepSync authorization, ownership, or routing.
  return { purpose, portalUrl: value };
}

/** URLs live only in this request-local closure. Identity is safe to compare;
 * destination release happens after the core's second ownership check. */
export function lemonSqueezyPortalCapability(
  provider: BillingProvider,
  allowedHosts: string,
): CustomerPortalCapability | undefined {
  if (!provider.retrieveSubscriptionForPortal) return undefined;
  return {
    validateConfiguration() {
      portalHosts(allowedHosts);
    },
    async prepare({ subscriptionReference, purpose }) {
      const snapshot = await provider.retrieveSubscriptionForPortal!(
        subscriptionReference,
      );
      return {
        identity: {
          provider: snapshot.provider,
          environment: snapshot.environment,
          merchantReference: snapshot.store_id,
          customerReference: snapshot.customer_id,
          subscriptionReference: snapshot.subscription_id,
        },
        destination() {
          if (
            purpose === "update_payment_method" &&
            !["past_due", "unpaid"].includes(snapshot.status)
          )
            throw new BillingError("BILLING_PORTAL_NOT_AVAILABLE", 409);
          const result = validatePortalUrl(
            purpose === "manage_billing"
              ? snapshot.customerPortal
              : snapshot.updatePaymentMethod,
            purpose,
            portalHosts(allowedHosts),
            snapshot.subscription_id,
          );
          return { url: result.portalUrl };
        },
      };
    },
  };
}
