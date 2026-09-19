import type {
  BillingChangeTiming,
  BillingEnvironment,
} from "./billing-provider.ts";

declare const receipt: unique symbol;
/** Issued by trusted server ports, not constructible from neutral observations.
 * Implementations must check provenance at runtime, not just this TS brand. */
export type VerifiedSubscription = { readonly [receipt]: "subscription" };
export type VerifiedInvoice = { readonly [receipt]: "invoice" };
export type VerifiedEvent = { readonly [receipt]: "event" };
export type CanonicalSubscriptionIdentity = {
  subscriptionReference: string;
  customerReference: string;
  merchantReference: string;
  offerReference: string;
  priceReference: string;
  itemReference: string;
  environment: BillingEnvironment;
};
export type PlanTarget = {
  subscriptionReference: string;
  offerReference: string;
  productReference: string;
  priceReference: string;
  expectedQuantity: number;
  timing: BillingChangeTiming;
};
/** Core-owned serialization boundary. Values are opaque SQL arguments, never
 * advisory observations. The SQL vocabulary and proof validation stay unchanged. */
export interface ReconciliationPort {
  verifyEvent(raw: Uint8Array, headers: Headers): Promise<VerifiedEvent>;
  deliveryArguments(
    event: VerifiedEvent,
    merchantReference: string,
  ): Promise<Record<string, unknown>>;
  eventSubscription(event: VerifiedEvent): Promise<VerifiedSubscription | null>;
  snapshotArguments(snapshot: VerifiedSubscription | null): {
    p_snapshot: unknown;
  };
  paidAdjustments(reference: string): Promise<VerifiedInvoice[]>;
  invoiceArguments(invoice: VerifiedInvoice): { p_invoice: unknown };
}
export interface SubscriptionEvidencePort {
  retrieve(reference: string): Promise<VerifiedSubscription>;
  withItem(
    snapshot: VerifiedSubscription,
    validate?: boolean,
  ): Promise<VerifiedSubscription>;
}
export interface PlanPolicyPort {
  canChange: boolean;
  assertEligible(snapshot: VerifiedSubscription): void;
  assertCancelable(
    snapshot: VerifiedSubscription,
    identity: CanonicalSubscriptionIdentity,
  ): void;
  change(target: PlanTarget): Promise<VerifiedSubscription>;
  assertResult(
    snapshot: VerifiedSubscription,
    previous: VerifiedSubscription,
    target: PlanTarget,
  ): void;
}
export interface SeatPolicyPort {
  canChange: boolean;
  assertCancelable(
    snapshot: VerifiedSubscription,
    identity: CanonicalSubscriptionIdentity,
  ): void;
  change(
    previous: VerifiedSubscription,
    quantity: number,
    timing: BillingChangeTiming,
  ): Promise<void>;
  assertResult(
    snapshot: VerifiedSubscription,
    previous: VerifiedSubscription,
    quantity: number,
  ): void;
}
export type BillingCommercialPorts = {
  reconciliation: ReconciliationPort;
  subscriptions: SubscriptionEvidencePort;
  plans?: PlanPolicyPort;
  seats?: SeatPolicyPort;
};
