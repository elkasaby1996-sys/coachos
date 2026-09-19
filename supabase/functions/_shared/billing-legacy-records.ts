import type { BillingEnvironment } from "./billing-provider.ts";
import type { CanonicalSubscriptionIdentity } from "./billing-commercial-ports.ts";

/** Core-side translation of historical column names. Never imported by providers. */
export function canonicalSubscriptionIdentity(
  subscription: Record<string, string>,
  environment: BillingEnvironment,
): CanonicalSubscriptionIdentity {
  return {
    subscriptionReference: subscription.provider_subscription_id,
    customerReference: subscription.provider_customer_id,
    merchantReference: subscription.provider_store_id,
    offerReference: subscription.provider_variant_id,
    priceReference: subscription.provider_price_id,
    itemReference: subscription.first_subscription_item_id,
    environment,
  };
}
export function canonicalPortalIdentity(link: Record<string, unknown>) {
  return {
    provider: link.provider,
    environment: link.environment,
    merchantReference: link.store_id,
    customerReference: link.customer_id,
    subscriptionReference: link.subscription_id,
  };
}
