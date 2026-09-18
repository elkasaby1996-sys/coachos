/** Core compatibility bridge, not a provider adapter. Owns the historical SQL
 * serialization. Provider transports/adapters never import this module. */
import {
  BillingError,
  normalizeWebhook,
  sha256,
  validSignature,
  type BillingProvider,
  type SubscriptionSnapshot,
} from "./lemon-squeezy.ts";
import {
  validateSubscriptionItem,
  type SubscriptionItemSnapshot,
} from "./billing-seat-item.ts";
import type { BillingEnvironment } from "./billing-provider.ts";
import type {
  BillingCommercialPorts,
  VerifiedSubscription,
  VerifiedEvent,
  VerifiedInvoice,
} from "./billing-commercial-ports.ts";
import {
  assertPlanEligible,
  assertPlanCancelable,
  assertPlanResult,
  assertSeatCancelable,
  assertSeatResult,
} from "./lemon-squeezy-policy.ts";

export function createLemonSqueezyCommercialPorts(
  provider: BillingProvider,
  options: { environment: BillingEnvironment; webhookSecret: string },
): BillingCommercialPorts {
  const { environment, webhookSecret } = options;
  type Proof = SubscriptionSnapshot & {
    verified_item?: SubscriptionItemSnapshot;
  };
  const snapshots = new WeakMap<VerifiedSubscription, Proof>();
  const invoices = new WeakMap<VerifiedInvoice, Record<string, unknown>>();
  const events = new WeakMap<
    VerifiedEvent,
    {
      name: string;
      parsed: unknown;
      raw: Uint8Array;
      normalized?: ReturnType<typeof normalizeWebhook>;
    }
  >();
  function seal<T extends object, V>(map: WeakMap<T, V>, value: V): T {
    const token = Object.freeze(Object.create(null)) as T;
    map.set(token, structuredClone(value));
    return token;
  }
  function read<T extends object, V>(map: WeakMap<T, V>, token: T): V {
    const value = map.get(token);
    if (!value) throw new BillingError("BILLING_RECONCILIATION_FAILED", 503);
    return value;
  }
  const subscription = (token: VerifiedSubscription) => read(snapshots, token);
  const subscriptions = {
    async retrieve(reference: string) {
      return seal(snapshots, await provider.retrieveSubscription(reference));
    },
    async withItem(token: VerifiedSubscription, validate = false) {
      const snapshot = subscription(token);
      if (!provider.retrieveSubscriptionItem) return token;
      const item = await provider.retrieveSubscriptionItem(
        snapshot.first_subscription_item_id,
      );
      if (validate) validateSubscriptionItem(snapshot, item);
      return seal(snapshots, { ...snapshot, verified_item: item });
    },
  };
  return {
    subscriptions,
    reconciliation: {
      async verifyEvent(raw, headers) {
        // Copy before awaiting HMAC: callers cannot change the verified byte identity.
        raw = raw.slice();
        if (raw.byteLength > 262_144)
          throw new BillingError("BILLING_INVALID_INPUT");
        if (
          !(await validSignature(
            raw,
            headers.get("x-signature"),
            webhookSecret,
          ))
        )
          throw new BillingError("BILLING_WEBHOOK_INVALID_SIGNATURE");
        const name = headers.get("x-event-name");
        if (!name || !/^[a-z_]{1,100}$/.test(name))
          throw new BillingError("BILLING_WEBHOOK_EVENT_MISMATCH");
        let parsed: unknown;
        try {
          parsed = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(raw),
          );
        } catch {
          throw new BillingError("BILLING_INVALID_INPUT");
        }
        return seal(events, { name, parsed, raw });
      },
      async deliveryArguments(token, merchantReference) {
        const event = read(events, token);
        const normalized = normalizeWebhook(
          event.parsed,
          event.name,
          environment,
          merchantReference,
        );
        const hash = await sha256(event.raw);
        const fingerprint = await sha256(
          `${environment}\n${event.name}\n${hash}`,
        );
        event.normalized = normalized;
        return {
          p_environment: environment,
          p_event_name: event.name,
          p_object_type: normalized.objectType,
          p_object_id: normalized.objectId,
          p_payload_sha256: hash,
          p_fingerprint: fingerprint,
          p_payload: structuredClone(normalized.payload),
        };
      },
      async eventSubscription(token) {
        const event = read(events, token);
        if (!event.normalized)
          throw new BillingError("BILLING_RECONCILIATION_FAILED", 503);
        return event.normalized.supported
          ? subscriptions.withItem(
              await subscriptions.retrieve(
                String(event.normalized.payload.subscription_id),
              ),
            )
          : null;
      },
      snapshotArguments(token) {
        return {
          p_snapshot:
            token === null ? null : structuredClone(subscription(token)),
        };
      },
      async paidAdjustments(reference) {
        const proofs =
          (await provider.listSubscriptionInvoices?.(reference)) ?? [];
        return proofs
          .filter(
            (proof) =>
              proof.billing_reason === "updated" && proof.status === "paid",
          )
          .map((proof) => seal(invoices, proof));
      },
      invoiceArguments(token) {
        return { p_invoice: structuredClone(read(invoices, token)) };
      },
    },
    plans: {
      canChange: !!provider.updateSubscriptionVariant,
      assertEligible: (token) => assertPlanEligible(subscription(token)),
      assertCancelable: (token, identity) =>
        assertPlanCancelable(subscription(token), identity),
      async change(target) {
        if (!provider.updateSubscriptionVariant)
          throw new BillingError("BILLING_PLAN_CHANGE_PROVIDER_FAILED", 503);
        return seal(
          snapshots,
          await provider.updateSubscriptionVariant(
            target.subscriptionReference,
            target.offerReference,
            target.timing,
          ),
        );
      },
      assertResult: (token, previous, target) =>
        assertPlanResult(
          subscription(token),
          subscription(previous),
          target,
          environment,
        ),
    },
    ...(provider.retrieveSubscriptionItem
      ? {
          seats: {
            canChange: !!provider.updateSubscriptionItemQuantity,
            assertCancelable: (
              token: VerifiedSubscription,
              identity: Parameters<typeof assertSeatCancelable>[1],
            ) => assertSeatCancelable(subscription(token), identity),
            async change(
              token: VerifiedSubscription,
              quantity: number,
              timing: "immediate" | "period_end",
            ) {
              if (!provider.updateSubscriptionItemQuantity)
                throw new BillingError(
                  "BILLING_SEAT_QUANTITY_PROVIDER_FAILED",
                  503,
                );
              const snapshot = subscription(token);
              const item = await provider.updateSubscriptionItemQuantity(
                snapshot.first_subscription_item_id,
                quantity,
                timing,
              );
              validateSubscriptionItem(snapshot, item, quantity);
            },
            assertResult: (
              token: VerifiedSubscription,
              previous: VerifiedSubscription,
              quantity: number,
            ) =>
              assertSeatResult(
                subscription(token),
                subscription(previous),
                quantity,
              ),
          },
        }
      : {}),
  };
}
