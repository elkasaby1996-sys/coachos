import {
  BillingError,
  object,
  providerId,
  timestamp,
  type SubscriptionSnapshot,
} from "./lemon-squeezy.ts";

export type SubscriptionItemSnapshot = {
  item_id: string;
  subscription_id: string;
  price_id: string;
  quantity: number;
  is_usage_based: false;
  created_at: string;
  updated_at: string;
};

export function subscriptionItemQuantityRequest(
  id: string,
  quantity: number,
  timing: "immediate" | "period_end",
) {
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !["immediate", "period_end"].includes(timing)
  )
    throw new BillingError("BILLING_SEAT_QUANTITY_TARGET_INVALID");
  return {
    data: {
      type: "subscription-items",
      id: providerId(id),
      attributes: {
        quantity,
        invoice_immediately: timing === "immediate",
        disable_prorations: timing === "period_end",
      },
    },
  };
}

export function parseSubscriptionItem(
  value: unknown,
  id: string,
): SubscriptionItemSnapshot {
  try {
    const d = object(object(value).data),
      a = object(d.attributes);
    if (
      d.type !== "subscription-items" ||
      providerId(d.id) !== providerId(id) ||
      !Number.isSafeInteger(a.quantity) ||
      a.quantity < 1 ||
      a.is_usage_based !== false
    )
      throw new Error();
    const created = timestamp(a.created_at)!,
      updated = timestamp(a.updated_at)!;
    if (Date.parse(updated) < Date.parse(created)) throw new Error();
    return {
      item_id: providerId(d.id),
      subscription_id: providerId(a.subscription_id),
      price_id: providerId(a.price_id),
      quantity: a.quantity,
      is_usage_based: false,
      created_at: created,
      updated_at: updated,
    };
  } catch {
    throw new BillingError("BILLING_SEAT_QUANTITY_MANUAL_REVIEW", 409);
  }
}

export function validateSubscriptionItem(
  s: SubscriptionSnapshot,
  item: SubscriptionItemSnapshot,
  quantity = s.quantity,
) {
  if (
    item.item_id !== s.first_subscription_item_id ||
    item.subscription_id !== s.subscription_id ||
    item.price_id !== s.price_id ||
    item.quantity !== quantity ||
    item.is_usage_based !== false
  )
    throw new BillingError("BILLING_SEAT_QUANTITY_UNAPPROVED_DRIFT", 409);
}
