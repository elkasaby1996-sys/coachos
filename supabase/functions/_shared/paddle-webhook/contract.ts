import type { VerifiedEventV2 } from "../billing-verified-receipts-v2.ts";

export type PaddleEventEnvelope = {
  provider: "paddle";
  environment: "test";
  /** Logical identity; never the notification reference or a serialization hash. */
  eventRef: string;
  notificationRef: string;
  eventType: string;
  /** Exact observed provider timestamp, including fractional precision/offset. */
  occurredAt: string;
  planChangeOperationId?: string;
};
export type PaddleWebhookItem = {
  priceRef: string;
  productRef: string | null;
  quantity: number;
  unitPrice: { amount: string; currency: string };
};
export type PaddleBillingPeriod = { startsAt: string; endsAt: string };
export type PaddleLifecycleObservation = {
  updatedAt?: string;
  currentBillingPeriod?: PaddleBillingPeriod | null;
  nextBilledAt?: string | null;
  canceledAt?: string | null;
  pausedAt?: string | null;
  scheduledChange?: { action: string; effectiveAt: string } | null;
};
export type PaddleSupportedEventObservation = PaddleEventEnvelope &
  (
    | {
        kind: "transaction.completed";
        transactionRef: string;
        subscriptionRef: string | null;
        customerRef: string | null;
        status: "completed";
        currency: string;
        origin?: string;
        billingPeriod?: PaddleBillingPeriod | null;
        paymentTotals?: { total: number; paid: number; balance: number };
        items: PaddleWebhookItem[];
      }
    | (PaddleLifecycleObservation & {
        kind: "subscription.created" | "subscription.updated";
        subscriptionRef: string;
        customerRef: string | null;
        status: "active" | "trialing" | "past_due" | "paused" | "canceled";
        /** Only subscription.created carries this correlation. Not settlement proof. */
        transactionCorrelationRef: string | null;
        items: (PaddleWebhookItem & {
          status: "active" | "inactive" | "trialing";
        })[];
      })
  );
export type PaddleUnsupportedEventObservation = PaddleEventEnvelope & {
  kind: "unsupported";
  reason: "event_type_not_supported";
};
export type PaddleEventObservation =
  | PaddleSupportedEventObservation
  | PaddleUnsupportedEventObservation;
/** Advisory replay facts, not SQL arguments or payment/access authority. */
export type PaddleReplayFacts = PaddleEventEnvelope & {
  rawPayloadSha256: string;
  observation: PaddleEventObservation;
};
export type PaddleWebhookResult =
  | {
      kind: "supported";
      receipt: VerifiedEventV2;
      observation: PaddleSupportedEventObservation;
    }
  | {
      kind: "unsupported";
      receipt: null;
      observation: PaddleUnsupportedEventObservation;
      replay: PaddleReplayFacts;
    };

/** Future ingress must retain raw header entries, before Fetch Headers coalesces them. */
export type PaddleWebhookRequest = {
  method: string;
  headers: readonly (readonly [string, string])[];
  rawBody: Uint8Array;
};
