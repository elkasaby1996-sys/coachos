# Lemon Squeezy billing foundation

PR-PRICE-05 integrates RepSync SaaS subscriptions purchased by PT account owners. It does not collect client-to-coach payments. Provider key: `lemonsqueezy`; environments: `test` and `live`. Nothing in this PR enables a live store or deploys infrastructure.

## Product and immutable mappings

One subscription Product belongs to one Store per environment. Publish six standard subscription Variants, quantity one, no setup fee, no provider trial:

| Plan   | Monthly USD minor | Annual USD minor |
| ------ | ----------------: | ---------------: |
| Launch |              1900 |            19000 |
| Growth |              5900 |            59000 |
| Scale  |             11900 |           119000 |

Monthly means one month; annual means one year. `billing_provider_variant_mappings` binds Store/Product/Variant/Price IDs to an immutable plan version and canonical amount. Active records require verification; their contracts cannot change. Retire an old mapping and publish a new Variant/mapping for a new plan version. Retired records cannot reactivate. Mapping tables start empty. Publication, price type, absence of setup fees/trials, and provider dashboard configuration require an operator's verification before activating a mapping; this PR does not automate provider configuration.

## Checkout

The browser sends only `{ planKey, cadence, operationId }`. Unknown properties are rejected. The authenticated owner RPC derives the billing account, locks it, rejects an existing current paid/custom subscription, and resolves the active mapping. Canonical PT profiles and workspace ownership establish authorization; metadata cannot grant it. A coach cannot select another account.

Attempts have `creating`, `ready`, `completed`, `failed`, `ambiguous`, and `expired` states. An account/operation is unique. The same contract replays; changed plan, cadence, or environment conflicts. A partial unique index prevents simultaneous creating/ready/ambiguous attempts per account. Two-minute creation leases prevent a crashed creator from leaving an automatically retryable operation. Expiry is recorded before contacting the provider, at transaction time plus 30 minutes, with millisecond precision for JSON interoperability. A new operation is allowed after expiry. Definitive failure permits a fresh operation; ambiguous transport/server/rate-limit outcomes block until expiry. A database error after successful provider creation is also ambiguous.

The service-only operation RPC supplies mapping details to the Edge Function. The owner-facing state RPC exposes only the internal attempt UUID, state, expiry, and safe code. Neither direct table access nor the owner begin RPC exposes a provider identifier or signed hosted URL.

The adapter uses `POST https://api.lemonsqueezy.com/v1/checkouts`, Bearer authentication and JSON:API headers. It sends Store/Variant relationships, selected `enabled_variants` only, quantity one, `embed=false`, `discount=false`, `skip_trial=true`, `subscription_preview=true`, `preview=true`, configured test mode and recorded expiry. It never sets `custom_price`. Verified owner email and current profile name are optional prefill, never purchase ownership evidence.

Receipt and success links are server-generated: `/pt-hub/settings/billing?checkout=return&attempt=<uuid>`. The server validates the configured application origin. Response validation requires the Checkout type, Store, Variant, environment, expiry, USD currency, exact subtotal, zero discount, isolated Variant and an HTTPS Lemon Squeezy hosted Checkout URL. A mismatch never returns the URL.

There is no customer precreation. No customer endpoint is called. The first verified subscription purchase establishes the customer mapping.

## Reconciliation

`billing_provider_customers`, `billing_provider_subscriptions` and `billing_provider_webhook_deliveries` retain commercial identity without customer PII or raw provider objects. Store and customer ownership, Product, Variant, Price, quantity, environment and subscription identity must match. Subscription updates cannot silently switch local plans.

Supported events are subscription creation, update, cancellation, resumption, expiration, pause/unpause, and payment success/failure/recovery. Each relevant event retrieves the current Subscription. Signed event bodies are linkage evidence, not current subscription truth. Invoice-first deliveries defer without guessing an account; a later creation resolves linkage and marks deferred rows ignored.

Only `subscription_created` can establish a subscription, and it must resolve signed custom `billing_account_id`, `checkout_attempt_id`, and `plan_version_id` against the local attempt. Initial provider state must be active with no trial. The database transaction locks the account, creates the customer/provider mappings, cancels current trial or complimentary access, inserts one paid account subscription, completes the attempt, and emits `subscription.converted_to_paid`. Early cancellation preserves immutable trial clocks; it does not fabricate an expired trial date. Any failure rolls the conversion back. Checkout creation alone never grants paid access.

| Provider state                | Local state / behavior                       |
| ----------------------------- | -------------------------------------------- |
| active                        | active, full access, cancellation flag false |
| paused                        | active, full access; provider pause retained |
| past_due                      | past_due, full access with warning           |
| unpaid                        | grace, existing delivery only                |
| cancelled, future ends_at     | active until ends_at; cancellation flag true |
| cancelled, elapsed ends_at    | expired                                      |
| expired                       | expired                                      |
| on_trial                      | unsupported; no activation, operations error |
| Variant/Price/identity change | preserve canonical access, manual review     |

Older snapshots are ignored. An equal timestamp with a different normalized snapshot requires review. Identical state is a no-op. A later old subscription cannot displace a newer current subscription. No background worker or remote webhook registration is introduced; signed provider retries and subsequent events drive reconciliation, including when the customer never returns.

## UI and scope

Billing alone loads the provider-neutral frontend module. It retains entitlements/capacity, shows full annual charges and tax/immediate-start disclosures, locks double submission, retains selection after errors, and redirects to hosted Checkout. Return parameters trigger a bounded 30-second check, never payment proof. Confirmation requires canonical paid access and the matching completed attempt. A manual refresh is available, and confirmation clears return parameters. Existing placeholder portal/payment-method/invoice controls are removed.

Deferred: Customer Portal, upgrades/downgrades, plan/cadence changes, cancellation/resume controls, proration, seats/quantity billing, invoices, refunds, coupons/discounts, client payments, Stripe/Paddle/Connect, marketplace commissions, usage/AI billing, general feature enforcement and live deployment.

## Provider references

- [Create Checkout](https://docs.lemonsqueezy.com/api/checkouts/create-checkout)
- [Checkout response and preview](https://docs.lemonsqueezy.com/api/checkouts/the-checkout-object)
- [Subscription identity, status and first subscription item](https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object)
- [Subscription invoices](https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object)
- [Webhook event types](https://docs.lemonsqueezy.com/help/webhooks/event-types)

See [security](lemon-squeezy-billing-security.md), [local runbook](lemon-squeezy-test-mode-runbook.md), and [verification](pr-price-05-verification.md).
