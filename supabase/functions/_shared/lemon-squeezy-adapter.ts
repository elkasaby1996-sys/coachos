import { lemonSqueezyPortalCapability } from "./lemon-squeezy-portal.ts";
/** Compatibility adapter: existing parsers/transport remain the source of truth. */
import {
  BillingError,
  createLemonSqueezyProvider,
  normalizeWebhook,
  sha256,
  timestamp,
  validSignature,
  type BillingProvider as LemonSqueezyCompatibilityProvider,
  type SubscriptionSnapshot as LemonSqueezySubscription,
} from "./lemon-squeezy.ts";
import {
  opaqueProviderReference,
  type ApprovedBillingMapping,
  type BillingAdapter,
  type BillingEnvironment,
  type BillingMappingResolver,
  type NormalizedBillingEventType,
  type ProviderEvent,
  type ProviderPriceIdentity,
  type ProviderSubscriptionSnapshot,
  type ProviderTransactionSnapshot,
} from "./billing-provider.ts";

function environment(actual: unknown, expected: BillingEnvironment) {
  if (!["test", "live"].includes(expected) || actual !== expected)
    throw new BillingError("BILLING_WEBHOOK_ENVIRONMENT_MISMATCH");
}
function priceIdentity(s: LemonSqueezySubscription): ProviderPriceIdentity {
  if (s.provider !== "lemonsqueezy")
    throw new BillingError("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
  return {
    provider: "lemonsqueezy",
    environment: s.environment,
    merchantReference: opaqueProviderReference(s.store_id),
    productReference: opaqueProviderReference(s.product_id),
    offerReference: opaqueProviderReference(s.variant_id),
    priceReference: opaqueProviderReference(s.price_id),
  };
}
function verifyMapping(
  identity: ProviderPriceIdentity,
  mapping: ApprovedBillingMapping,
) {
  for (const key of Object.keys(identity) as (keyof ProviderPriceIdentity)[])
    if (mapping[key] !== identity[key])
      throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH");
  if (
    !["launch", "growth", "scale"].includes(mapping.planKey) ||
    !["monthly", "annual"].includes(mapping.cadence)
  )
    throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH");
}

/** Accepts the existing validated projection, not a raw provider response. */
export function mapLemonSqueezySubscription(
  s: LemonSqueezySubscription,
  expectedEnvironment: BillingEnvironment,
  mapping?: ApprovedBillingMapping,
): ProviderSubscriptionSnapshot {
  environment(s.environment, expectedEnvironment);
  const identity = priceIdentity(s);
  if (mapping) verifyMapping(identity, mapping);
  const statuses = {
    active: "active",
    paused: "paused",
    past_due: "past_due",
    unpaid: "unpaid",
    cancelled: "canceled",
    expired: "expired",
  } as const;
  const status = Object.hasOwn(statuses, s.status)
    ? statuses[s.status as keyof typeof statuses]
    : undefined;
  if (
    !status ||
    !Number.isSafeInteger(s.quantity) ||
    s.quantity < 1 ||
    typeof s.cancelled !== "boolean"
  )
    throw new BillingError("BILLING_SUBSCRIPTION_IDENTITY_MISMATCH");
  const periodEnd =
    s.status === "cancelled" || s.status === "expired"
      ? s.ends_at
      : s.renews_at;
  return {
    ...identity,
    subscriptionReference: opaqueProviderReference(s.subscription_id),
    customerReference: opaqueProviderReference(s.customer_id),
    initialTransactionReference: opaqueProviderReference(s.order_id),
    itemReference: opaqueProviderReference(s.first_subscription_item_id),
    status,
    ...(mapping ? { planKey: mapping.planKey, cadence: mapping.cadence } : {}),
    quantity: s.quantity,
    quantityScope: "subscription_item",
    ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    scheduledCancellation: {
      requested: s.cancelled,
      ...(s.ends_at ? { effectiveAt: s.ends_at } : {}),
    },
    ...(s.status === "past_due" || s.status === "unpaid"
      ? { paymentState: s.status }
      : {}),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}

/** Existing invoice proof omits amounts/currency/ID. Do not reconstruct missing facts. */
function transaction(
  proof: Record<string, unknown>,
  expectedEnvironment: BillingEnvironment,
  reference?: string,
): ProviderTransactionSnapshot {
  environment(
    typeof proof.test_mode === "boolean"
      ? proof.test_mode
        ? "test"
        : "live"
      : null,
    expectedEnvironment,
  );
  const statuses = {
    pending: "pending",
    paid: "paid",
    void: "void",
    refunded: "refunded",
    partial_refund: "partially_refunded",
  } as const;
  const reasons = {
    initial: "initial",
    renewal: "renewal",
    updated: "adjustment",
  } as const;
  const status =
    typeof proof.status === "string" && Object.hasOwn(statuses, proof.status)
      ? statuses[proof.status as keyof typeof statuses]
      : undefined;
  const billingReason =
    typeof proof.billing_reason === "string" &&
    Object.hasOwn(reasons, proof.billing_reason)
      ? reasons[proof.billing_reason as keyof typeof reasons]
      : undefined;
  return {
    provider: "lemonsqueezy",
    environment: expectedEnvironment,
    merchantReference: opaqueProviderReference(proof.store_id),
    subscriptionReference: opaqueProviderReference(proof.subscription_id),
    customerReference: opaqueProviderReference(proof.customer_id),
    ...(reference
      ? { transactionReference: opaqueProviderReference(reference) }
      : {}),
    ...(status ? { status } : {}),
    ...(billingReason ? { billingReason } : {}),
    createdAt: timestamp(proof.created_at)!,
    updatedAt: timestamp(proof.updated_at)!,
  };
}

const eventTypes: Partial<Record<string, NormalizedBillingEventType>> = {
  subscription_created: "subscription_created",
  subscription_updated: "subscription_updated",
  subscription_cancelled: "subscription_canceled",
  subscription_payment_success: "transaction_paid",
  subscription_payment_recovered: "transaction_paid",
  subscription_payment_failed: "transaction_failed",
};

export type LemonSqueezyAdapterOptions = {
  environment: BillingEnvironment;
  webhookSecret: string;
  resolveMapping?: BillingMappingResolver;
  portalAllowedHosts?: string;
};

export function adaptLemonSqueezyProvider(
  legacy: LemonSqueezyCompatibilityProvider,
  options: LemonSqueezyAdapterOptions,
): BillingAdapter {
  // Bind credentials and environment once; caller config mutations cannot retarget a port.
  options = Object.freeze({ ...options });
  environment(options.environment, options.environment);
  const snapshot = async (s: LemonSqueezySubscription) => {
    environment(s.environment, options.environment);
    const identity = priceIdentity(s);
    const mapping = await options.resolveMapping?.(Object.freeze(identity));
    return mapLemonSqueezySubscription(s, options.environment, mapping);
  };
  const adapter: BillingAdapter = {
    provider: "lemonsqueezy",
    environment: options.environment,
    capabilities: {
      subscriptions: {
        retrieve: async (reference) =>
          snapshot(await legacy.retrieveSubscription(reference)),
      },
      checkout: {
        async create(intent) {
          environment(intent.price.environment, options.environment);
          if (intent.price.provider !== "lemonsqueezy")
            throw new BillingError("BILLING_VARIANT_MAPPING_MISMATCH");
          const result = await legacy.createCheckout(
            {
              attempt: {
                id: intent.checkoutAttemptId,
                billing_account_id: intent.billingAccountId,
                plan_version_id: intent.planVersionId,
                environment: options.environment,
                status: "creating",
                expected_expires_at: intent.expiresAt,
                creation_lease_expires_at: intent.creationLeaseExpiresAt,
                provider_checkout_url: null,
              },
              mapping: {
                provider_store_id: opaqueProviderReference(
                  intent.price.merchantReference,
                ),
                provider_product_id: opaqueProviderReference(
                  intent.price.productReference,
                ),
                provider_variant_id: opaqueProviderReference(
                  intent.price.offerReference,
                ),
                provider_price_id: opaqueProviderReference(
                  intent.price.priceReference,
                ),
                unit_amount_minor: intent.price.unitAmountMinor,
              },
            },
            intent.returnUrl,
            intent.customer,
          );
          return {
            checkoutReference: result.id,
            url: result.url,
            expiresAt: result.expiresAt,
          };
        },
      },
    },
  };
  if (legacy.updateSubscriptionVariant)
    adapter.capabilities.planChanges = {
      change: async ({ subscriptionReference, targetOfferReference, timing }) =>
        snapshot(
          await legacy.updateSubscriptionVariant!(
            subscriptionReference,
            targetOfferReference,
            timing,
          ),
        ),
    };
  if (legacy.updateSubscriptionItemQuantity)
    adapter.capabilities.quantities = {
      async change({ itemReference, quantity, timing }) {
        const item = await legacy.updateSubscriptionItemQuantity!(
          itemReference,
          quantity,
          timing,
        );
        return {
          itemReference: item.item_id,
          subscriptionReference: item.subscription_id,
          priceReference: item.price_id,
          quantity: item.quantity,
          quantityScope: "subscription_item",
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      },
    };
  if (legacy.listSubscriptionInvoices)
    adapter.capabilities.transactions = {
      async listRecent(reference) {
        const proofs = await legacy.listSubscriptionInvoices!(reference);
        return {
          transactions: proofs.map((proof) =>
            transaction(proof, options.environment),
          ),
          completeness: "reconciliation_window",
        };
      },
    };
  if (options.webhookSecret)
    adapter.capabilities.webhooks = {
      async verifyAndNormalize({ rawBody, headers, merchantReference }) {
        if (rawBody.byteLength > 262_144)
          throw new BillingError("BILLING_INVALID_INPUT");
        if (
          !(await validSignature(
            rawBody,
            headers.get("x-signature"),
            options.webhookSecret,
          ))
        )
          throw new BillingError("BILLING_WEBHOOK_INVALID_SIGNATURE");
        const name = headers.get("x-event-name");
        if (!name || !/^[a-z_]{1,100}$/.test(name))
          throw new BillingError("BILLING_WEBHOOK_EVENT_MISMATCH");
        let value: unknown;
        try {
          value = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
          );
        } catch {
          throw new BillingError("BILLING_INVALID_INPUT");
        }
        const normalized = normalizeWebhook(
          value,
          name,
          options.environment,
          merchantReference,
        );
        const hash = await sha256(rawBody);
        const replayKey = await sha256(
          `${options.environment}\n${name}\n${hash}`,
        );
        const type = Object.hasOwn(eventTypes, name)
          ? eventTypes[name]
          : undefined;
        const identity = {
          provider: "lemonsqueezy",
          environment: options.environment,
          merchantReference,
          resourceReference: normalized.objectId,
          replayKey,
        };
        const event: ProviderEvent = type
          ? {
              ...identity,
              kind: "normalized",
              type,
              resourceType:
                normalized.objectType === "subscriptions"
                  ? "subscription"
                  : "transaction",
            }
          : {
              ...identity,
              kind: "provider_specific",
              providerEventType: name,
              resourceType: "provider_specific",
            };
        return {
          event,
          ...(normalized.supported &&
          normalized.objectType === "subscription-invoices"
            ? {
                transaction: transaction(
                  normalized.payload,
                  options.environment,
                  normalized.objectId,
                ),
              }
            : {}),
        };
      },
    };
  const portal = lemonSqueezyPortalCapability(
    legacy,
    options.portalAllowedHosts ?? "",
  );
  if (portal) adapter.capabilities.customerPortal = portal;
  // Subscription cancellation has no existing direct API operation.
  return adapter;
}

/** Runtime composition root; compatibility is explicitly separate from the neutral port. */
export function createLemonSqueezyBillingBoundary(
  apiKey: string,
  options: LemonSqueezyAdapterOptions,
  transport: typeof fetch = fetch,
) {
  const compatibility = createLemonSqueezyProvider(apiKey, transport);
  return {
    compatibility,
    adapter: adaptLemonSqueezyProvider(compatibility, options),
  };
}
