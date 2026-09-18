import { BillingError, type SubscriptionSnapshot } from "./lemon-squeezy.ts";
import type {
  CanonicalSubscriptionIdentity,
  PlanTarget,
} from "./billing-commercial-ports.ts";

export function assertPlanEligible(current: SubscriptionSnapshot) {
  if (current.payment_processor === "paypal")
    throw new BillingError("BILLING_PLAN_CHANGE_PAYPAL_UNSUPPORTED", 409);
  if (current.payment_processor !== "card")
    throw new BillingError("BILLING_PLAN_CHANGE_NOT_ELIGIBLE", 409);
}
export function assertPlanCancelable(
  current: SubscriptionSnapshot,
  identity: CanonicalSubscriptionIdentity,
) {
  if (
    current.status !== "active" ||
    current.cancelled ||
    current.variant_id !== identity.offerReference ||
    current.price_id !== identity.priceReference ||
    current.customer_id !== identity.customerReference ||
    current.store_id !== identity.merchantReference ||
    current.environment !== identity.environment
  )
    throw new BillingError("BILLING_PLAN_CHANGE_CANNOT_CANCEL", 409);
}
export function assertPlanResult(
  snapshot: SubscriptionSnapshot,
  current: SubscriptionSnapshot,
  target: PlanTarget,
  environment: string,
) {
  if (
    snapshot.subscription_id !== target.subscriptionReference ||
    snapshot.environment !== environment ||
    snapshot.store_id !== current.store_id ||
    snapshot.customer_id !== current.customer_id ||
    snapshot.order_id !== current.order_id ||
    snapshot.order_item_id !== current.order_item_id ||
    snapshot.first_subscription_item_id !==
      current.first_subscription_item_id ||
    snapshot.quantity !== target.expectedQuantity ||
    snapshot.payment_processor !== "card" ||
    snapshot.variant_id !== target.offerReference ||
    snapshot.product_id !== target.productReference ||
    snapshot.price_id !== target.priceReference ||
    Date.parse(snapshot.updated_at) < Date.parse(current.updated_at) ||
    snapshot.trial_ends_at !== null ||
    (target.timing === "period_end" && snapshot.renews_at !== current.renews_at)
  )
    throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_AMBIGUOUS", 503, true);
}
export function assertSeatCancelable(
  current: SubscriptionSnapshot,
  identity: CanonicalSubscriptionIdentity,
) {
  if (
    current.status !== "active" ||
    current.cancelled ||
    current.payment_processor !== "card" ||
    current.subscription_id !== identity.subscriptionReference ||
    current.customer_id !== identity.customerReference ||
    current.store_id !== identity.merchantReference ||
    current.environment !== identity.environment ||
    current.variant_id !== identity.offerReference ||
    current.price_id !== identity.priceReference ||
    current.first_subscription_item_id !== identity.itemReference
  )
    throw new BillingError("BILLING_SEAT_QUANTITY_CANNOT_CANCEL", 409);
}
export function assertSeatResult(
  updated: SubscriptionSnapshot,
  current: SubscriptionSnapshot,
  quantity: number,
) {
  if (
    updated.quantity !== quantity ||
    updated.variant_id !== current.variant_id ||
    updated.price_id !== current.price_id ||
    updated.customer_id !== current.customer_id ||
    updated.store_id !== current.store_id ||
    updated.environment !== current.environment ||
    updated.first_subscription_item_id !== current.first_subscription_item_id ||
    updated.payment_processor !== "card" ||
    Date.parse(updated.updated_at) < Date.parse(current.updated_at)
  )
    throw new BillingError(
      "BILLING_SEAT_QUANTITY_PROVIDER_AMBIGUOUS",
      503,
      true,
    );
}
