# Controlled subscription plan changes

PR-PRICE-07 adds owner-controlled card subscription changes. It does not enable live billing. Product/Variant/Price mappings must already be verified; this migration creates none. Existing plan prices and capacities remain unchanged.

## Classification and prices

The server orders Launch < Growth < Scale. Higher tier with unchanged cadence, or monthly to annual at the same/higher tier, is immediate. A lower tier at either cadence, or annual to monthly at the same/lower tier, is period-end. Higher tier plus annual to monthly is unsupported. Same plan/cadence is a no-op.

| Plan   | Monthly USD | Annual USD | Clients | Included/max seats | Workspaces | Packages  |
| ------ | ----------: | ---------: | ------: | ------------------ | ---------: | --------- |
| Launch |          19 |        190 |      10 | 1/2                |          1 | 3         |
| Growth |          59 |        590 |      50 | 2/5                |          3 | Unlimited |
| Scale  |         119 |       1190 |     100 | 5/10               |          5 | Unlimited |

Immediate PATCH uses `invoice_immediately=true, disable_prorations=false`. Period-end PATCH uses the opposite flags. The two flags are never both true. Preview shows full list prices, cadence and timing. Lemon Squeezy determines proration, tax and credits; the preview is not an exact charge quote. These behaviors follow the [Subscription API](https://docs.lemonsqueezy.com/api/subscriptions/update-subscription).

## Eligibility and processor

Preview/apply require a canonical billing owner, linked paid subscription, active provider/local status, processed reconciliation, no cancellation, no other open operation and exact approved source and active target mappings. Retired source mappings remain valid historical obligations. Unknown processors fail closed. Provider `stripe` normalizes to the card family; `paypal` is explicitly unsupported. This is not a direct Stripe integration. No PayPal portal switching URL is retrieved or returned.

## Operations and payment proof

The private operation records source/target identity, classification, immutable effective date, capacity preflight and dispatch/reconciliation timestamps. A unique account operation ID prevents redispatch; one nonterminal operation is allowed per provider subscription. State transitions emit append-only, deduplicated commercial events.

The apply transaction admits `provider_pending` before PATCH. A verified target becomes `awaiting_payment` for immediate changes or `scheduled` for period-end changes. Definitive rejection becomes `failed`; uncertain transport or response becomes `ambiguous`. Cancellation uses `cancel_pending`, retaining that state and the ceiling on uncertainty. Terminal states are `completed`, `canceled`, and `failed`; terminal operations cannot reactivate. Manual review preserves the safer ceiling.

An immediate provider target alone cannot expand access. Completion requires a paid invoice with `billing_reason=updated`, matching subscription, customer, Store and environment, created/updated no earlier than dispatch. Signed payment-success/recovered delivery or a fresh server invoice retrieval supplies that evidence. Other invoice reasons, failures and stale invoices cannot complete the upgrade. The invoice fields follow the [invoice schema](https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object). Failed payment preserves the source plan and reconciles past-due/grace status; later qualifying payment completes the same operation.

API reconciliation feeds normalized evidence into the existing durable inbox with a separate hash namespace. It is not labeled as real signed-webhook proof in test evidence. The adapter's bounded recent-invoice retrieval inspects up to 100 invoices; an older unmatched obligation remains pending for operational review rather than inferring payment.

## Downgrades and capacity

Final preflight locks the same billing account as canonical capacity admission. Actual, pending and unexpired reserved commitments count across clients, staff, workspaces and published packages. Unreconciled data quality and finite target overage block apply. Blockers include totals, excess and management links. The application never removes clients, staff, invites, workspaces or packages to make a downgrade fit.

From `provider_pending` onward, a period-end operation applies the lower finite current/target limit to positive capacity admission. Existing, zero-delta and reducing domain operations retain the established PR-PRICE-04 behavior. Current display/entitlements remain on the source before the effective date. Included-seat capacity metadata is bounded by the admission ceiling. Failure removes the ceiling; ambiguity and manual review retain it.

At the effective date, the canonical entitlement resolver dynamically resolves the verified scheduled target, including its feature catalogue and capacity contract. Persistence can follow through webhook or manual reconciliation. Past-due/grace/expired status is preserved. Cancellation wins over renewal into the target; elapsed paid cancellation resolves to expired without requiring a punctual webhook.

Canceling a future scheduled operation requests the original Variant with prorations disabled. Source mapping is retrieved and validated before marking canceled and removing the target ceiling. An ambiguous cancellation never restores growth capacity merely because the browser returned.

The provider documents that cadence changes can affect billing dates. If a pre-effective-date target response moves the renewal away from the captured source date, reconciliation enters manual review and retains the target ceiling. It never silently promises that the original period-end schedule still holds. Actual cadence/date behavior requires the separate test-mode proof described in the runbook.

## Immutable history and UI

Tier completion atomically supersedes the source local row, inserts a target paid row, links the source to its successor, relinks the provider subscription and completes the operation. `plan_version_id` is never rewritten. Cadence-only completion retains the local row and updates the exact approved mapping. Superseded rows grant no access and are excluded from current subscription reads.

Billing retains Checkout, Customer Portal, payment recovery, entitlement display and capacity meters. The new owner section provides preview, annual totals, confirmation, blockers, waiting/scheduled/ambiguous states, cancel and manual refresh. Browser parameters never establish payment truth. Final apply rechecks provider state and capacity; preview does not disable unrelated domain controls.

See [security](lemon-squeezy-plan-change-security.md), [test runbook](lemon-squeezy-plan-change-test-runbook.md), and [verification](pr-price-07-verification.md). Seats, quantity billing, refunds, coupons, client payments, general feature enforcement and deployment remain deferred.

See [commercial access modes](commercial-access-modes.md) for PR-PRICE-08 access enforcement and recovery.
