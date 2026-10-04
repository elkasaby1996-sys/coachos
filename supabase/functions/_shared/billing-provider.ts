/** Provider-neutral observations and ports. No SDK, wire payload or SQL DTO imports. */
export type BillingProviderKey = string;
export type BillingEnvironment = "test" | "live";
export type ProviderReference = string;
export type BillingPlanKey = "launch" | "growth" | "scale";
export type BillingCadence = "monthly" | "annual";

/** Never parse, trim, case-fold or numerically coerce an external reference. */
export function opaqueProviderReference(value: unknown): ProviderReference {
  if (typeof value !== "string" || !value.trim())
    throw new Error("BILLING_PROVIDER_REFERENCE_INVALID");
  return value;
}

export type ProviderIdentity = {
  provider: BillingProviderKey;
  environment: BillingEnvironment;
  merchantReference?: ProviderReference;
};
export type ProviderPriceIdentity = ProviderIdentity & {
  productReference?: ProviderReference;
  offerReference?: ProviderReference;
  priceReference?: ProviderReference;
};
/** Supplied by trusted RepSync mapping storage, never inferred from a provider ID. */
export type ApprovedBillingMapping = ProviderPriceIdentity & {
  planKey: BillingPlanKey;
  cadence: BillingCadence;
};
export type BillingMappingResolver = (
  identity: Readonly<ProviderPriceIdentity>,
) => Promise<ApprovedBillingMapping | undefined>;

export type ProviderSubscriptionSnapshot = ProviderPriceIdentity & {
  subscriptionReference: ProviderReference;
  customerReference?: ProviderReference;
  initialTransactionReference?: ProviderReference;
  itemReference?: ProviderReference;
  status:
    | "active"
    | "paused"
    | "past_due"
    | "unpaid"
    | "canceled"
    | "expired"
    | "unknown";
  planKey?: BillingPlanKey;
  cadence?: BillingCadence;
  /** Billed subscription-item units. Not total/included/additional coach capacity. */
  quantity?: number;
  quantityScope?: "subscription_item";
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  scheduledCancellation?: { requested: boolean; effectiveAt?: string };
  /** Active subscription state alone is not proof of payment. */
  paymentState?: "past_due" | "unpaid";
  createdAt?: string;
  updatedAt?: string;
};

export type ProviderTransactionSnapshot = ProviderIdentity & {
  transactionReference?: ProviderReference;
  subscriptionReference: ProviderReference;
  customerReference?: ProviderReference;
  status?: "pending" | "paid" | "void" | "refunded" | "partially_refunded";
  amountMinor?: number;
  currency?: string;
  billingReason?: "initial" | "renewal" | "adjustment";
  occurredAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedBillingEventType =
  | "subscription_created"
  | "subscription_updated"
  | "subscription_canceled"
  | "transaction_paid"
  | "transaction_failed";
type ProviderEventIdentity = ProviderIdentity & {
  /** Absent when the provider does not supply a delivery/event ID. */
  providerEventReference?: ProviderReference;
  resourceType: "subscription" | "transaction" | "provider_specific";
  resourceReference: ProviderReference;
  occurredAt?: string;
  /** Adapter-defined deterministic delivery identity, scoped by provider/environment. */
  replayKey: string;
};
export type ProviderEvent = ProviderEventIdentity &
  (
    | { kind: "normalized"; type: NormalizedBillingEventType }
    | { kind: "provider_specific"; providerEventType: string }
  );
export type VerifiedProviderEvent = {
  event: ProviderEvent;
  transaction?: ProviderTransactionSnapshot;
};

export type CheckoutIntent = {
  checkoutAttemptId: string;
  billingAccountId: string;
  planVersionId: string;
  price: ProviderPriceIdentity & { unitAmountMinor: number };
  expiresAt: string;
  creationLeaseExpiresAt: string;
  returnUrl: string;
  customer: { email?: string; name?: string };
};
export interface CheckoutCapability {
  create(intent: CheckoutIntent): Promise<{
    checkoutReference: ProviderReference;
    url: string;
    expiresAt: string;
  }>;
}
export interface SubscriptionRetrievalCapability {
  retrieve(reference: ProviderReference): Promise<ProviderSubscriptionSnapshot>;
}
/** This controls provider proration. The commercial core owns effective access timing. */
export type BillingChangeTiming = "immediate" | "period_end";
export interface PlanChangeCapability {
  change(input: {
    subscriptionReference: ProviderReference;
    targetOfferReference: ProviderReference;
    timing: BillingChangeTiming;
  }): Promise<ProviderSubscriptionSnapshot>;
}
export interface QuantityChangeCapability {
  change(input: {
    itemReference: ProviderReference;
    quantity: number;
    timing: BillingChangeTiming;
  }): Promise<{
    itemReference: ProviderReference;
    subscriptionReference: ProviderReference;
    priceReference: ProviderReference;
    quantity: number;
    quantityScope: "subscription_item";
    createdAt: string;
    updatedAt: string;
  }>;
}
export interface TransactionRetrievalCapability {
  listRecent(subscriptionReference: ProviderReference): Promise<{
    transactions: ProviderTransactionSnapshot[];
    /** Deliberately not a complete invoice ledger or accounting export. */
    completeness: "reconciliation_window";
  }>;
}
export interface WebhookVerificationCapability {
  verifyAndNormalize(input: {
    rawBody: Uint8Array;
    headers: Headers;
    merchantReference: ProviderReference;
  }): Promise<VerifiedProviderEvent>;
}
export type PortalLinkPurpose = "manage_billing" | "update_payment_method";
export interface CustomerPortalCapability {
  validateConfiguration(): void;
  prepare(input: {
    subscriptionReference: ProviderReference;
    purpose: PortalLinkPurpose;
  }): Promise<{
    identity: ProviderIdentity & {
      customerReference: ProviderReference;
      subscriptionReference: ProviderReference;
    };
    /** Invoke only after the core rechecks canonical ownership and purpose eligibility.
     * Never log, persist or cache the returned opaque URL. */
    destination(): { url: string; expiresAt?: string };
  }>;
}
/** Private server capability. A checkout token is released only after durable
 * preparation and a fresh canonical authority check. */
export type PaymentMethodUpdateIdentity = ProviderIdentity & {
  customerReference: ProviderReference;
  subscriptionReference: ProviderReference;
};
export type PaymentMethodUpdateMode = "update_only" | "settle_existing_balance";
export type PaymentMethodUpdateItem = {
  priceReference: ProviderReference;
  productReference: ProviderReference;
  quantity: number;
  unitAmountMinor: string;
};
export type PaymentMethodUpdateExpectation = {
  identity: PaymentMethodUpdateIdentity;
  mode: PaymentMethodUpdateMode;
  items: readonly PaymentMethodUpdateItem[];
  obligation?: {
    transactionReference: ProviderReference;
    amountMinor: string;
    currency: string;
    period: { startsAt: string; endsAt: string };
  };
};
export type PaymentMethodDispatchPermit = {
  /** Returns true once, after a committed service-side dispatch claim. */
  consume(): boolean;
};
export type PreparedPaymentMethodUpdate = {
  transactionReference: ProviderReference;
  effect:
    | { kind: "update_only" }
    | {
        kind: "settle_existing_balance";
        amountMinor: string;
        currency: string;
      };
  normalizedResultSha256: string;
  status: "checkout_ready" | "settlement_pending";
  /** One-use opaque Paddle.js transaction token, never a provider URL. */
  release(): {
    kind: "provider_checkout";
    provider: BillingProviderKey;
    environment: BillingEnvironment;
    token: string;
  };
};
export interface PaymentMethodUpdateCapability {
  readonly validatorVersion: string;
  validateConfiguration(): void;
  prepare(
    expectation: PaymentMethodUpdateExpectation,
    permit: PaymentMethodDispatchPermit,
  ): Promise<PreparedPaymentMethodUpdate>;
  inspect(
    expectation: PaymentMethodUpdateExpectation,
    transactionReference: ProviderReference,
  ): Promise<PreparedPaymentMethodUpdate>;
}
export interface SubscriptionCancellationCapability {
  cancel(input: {
    subscriptionReference: ProviderReference;
    timing: BillingChangeTiming;
  }): Promise<ProviderSubscriptionSnapshot>;
}

/** Absent capability means unavailable through this boundary; never silently emulate it. */
export type BillingAdapter = {
  provider: BillingProviderKey;
  environment: BillingEnvironment;
  capabilities: {
    checkout?: CheckoutCapability;
    subscriptions?: SubscriptionRetrievalCapability;
    planChanges?: PlanChangeCapability;
    quantities?: QuantityChangeCapability;
    transactions?: TransactionRetrievalCapability;
    webhooks?: WebhookVerificationCapability;
    customerPortal?: CustomerPortalCapability;
    paymentMethodUpdate?: PaymentMethodUpdateCapability;
    cancellation?: SubscriptionCancellationCapability;
  };
};
