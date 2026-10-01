import type { BillingProviderKey } from "./billing-provider.ts";

/** Private server authority. Never serialize to browser responses or telemetry. */
export interface OutstandingBillingObligation {
  provider: BillingProviderKey;
  environment: "test" | "live";
  billingAccountId: string;
  canonicalSubscriptionId: string;
  providerSubscriptionReference: string;
  providerCustomerReference: string;
  providerTransactionReference: string;
  kind: "subscription_renewal";
  state: "outstanding";
  amountMinor: string;
  currency: string;
  servicePeriod: { startsAt: string; endsAt: string };
  observedAt: string;
  resourceRevision: string;
  evidence: { transactionEventId: string; subscriptionEventId: string };
  authorityRevision: string;
}
