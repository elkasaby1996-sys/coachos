# Additional coach-seat billing

PR-PRICE-09 implements additional seats on the existing subscription's first Subscription Item. It does not provision provider products, deploy functions, change a remote Store or enable live billing.

## Commercial contract

`commercial_addon_versions` contains immutable `coach_seat` version 1: USD 1,200 minor monthly and 12,000 minor annually. One active version per key is allowed. Active versions may retire; retired versions cannot reactivate. Base plans and their included/max seats are unchanged.

| Plan   | Included | Maximum | Maximum add-ons | Maximum provider quantity | Monthly base | Annual base |
| ------ | -------: | ------: | --------------: | ------------------------: | -----------: | ----------: |
| Launch |        1 |       2 |               1 |                         2 |          $19 |        $190 |
| Growth |        2 |       5 |               3 |                         4 |          $59 |        $590 |
| Scale  |        5 |      10 |               5 |                         6 |         $119 |      $1,190 |

Initial Checkout remains quantity 1. Provider quantity means **one base unit plus approved additional seats**, not total staff identities. Growth with one purchased additional seat has provider quantity 2, three effective seats, and a $71 monthly recurring list total.

## Graduated Price contracts

`billing_quantity_price_contracts` binds exactly one immutable normalized Price contract and its SHA-256 to a Variant mapping and add-on version. The first tier ends at unit 1 and charges the exact base cadence price. The second ends at `inf` and charges the exact cadence add-on price. Both tiers have zero fixed fees and no decimal usage price. Category is subscription; scheme is graduated; package size and renewal count are 1. Usage aggregation, setup fee and trial are absent. Price/Variant IDs and month/year interval must match the mapping exactly.

An active mapping without an active quantity contract can sell only a base subscription. New seat operations require active contracts; historical linked obligations can reconcile through retired contracts. The migration creates no provider mapping or quantity contract: tests create deterministic fixtures.

Provider references: [Subscription Item update](https://docs.lemonsqueezy.com/api/subscription-items/update-subscription-item), [Price object](https://docs.lemonsqueezy.com/api/prices/the-price-object), [Subscription Item object](https://docs.lemonsqueezy.com/api/subscription-items/the-subscription-item-object).

## Capacity authority

`billing_provider_subscriptions.quantity` stores the provider snapshot. `approved_additional_coach_seats` is the entitlement authority. Stable quantity equals `1 + approved_additional_coach_seats`. A pending operation can explain a temporary source/target mismatch. Unapproved drift preserves approved seats and enters manual review; it never triggers an automatic provider correction.

Paid seat capacity is `min(plan maximum, included + approved)`. Trial, complimentary and custom rules retain their existing behavior. Existing over-limit members and invitations remain intact. The canonical capacity resolver counts distinct active identities, pending invitations and reservations. Reservation admission applies a scheduled reduction's lower ceiling immediately under the same account lock used to begin the reduction. Current entitlement remains through the effective date; a verified scheduled reduction resolves its target dynamically when due, then reconciliation persists it.

## Durable operations

The private seat operation records account/subscription identity, mapping/contract, operation UUID, direction/timing, source/target add-ons, provider quantities and limits, preflight counts, proration mode, actor, timestamps, safe errors and normalized snapshot hash. An append-only operation event table records transitions because existing subscription events describe subscription lifecycle changes.

One nonterminal seat operation is allowed per provider subscription. Seat and plan operations cannot overlap. Reusing an operation UUID with the same target never dispatches twice; changing its target conflicts. Identity fields are immutable and terminal operations cannot reactivate.

Increase: `provider_pending → awaiting_payment → completed`. The Item PATCH uses `invoice_immediately=true`, `disable_prorations=false`. Neither PATCH nor GET expands capacity. Completion requires an updated paid invoice created after dispatch, matching environment/Store/customer/subscription, and a freshly retrieved Item matching the exact Item ID, Price ID and target quantity. Failed payment retains source approval; verified recovery can complete once. Ambiguous requests retain the operation and must be refreshed rather than blindly retried.

Reduction: locked committed-seat preflight, then `provider_pending → scheduled → completed`. PATCH uses `invoice_immediately=false`, `disable_prorations=true`. A target that cannot fit actual + pending + reserved is rejected before provider mutation. Provider renewal-date drift enters review. No member or invitation is changed.

Cancellation: only future scheduled reductions enter `cancel_pending`. The source quantity is restored with proration disabled, then retrieved and verified before `canceled`. Ambiguity retains `cancel_pending` and the lower growth ceiling.

## Plan changes and Billing

Approved add-ons carry to a compatible target plan. The target's maximum add-ons must fit; purchased seats require an active target quantity contract. Target recurring totals use the target cadence's add-on amount. Reconciliation validates target Variant, Price, Item and retained quantity; a provider quantity reset enters manual review without changing local add-ons.

Billing contains the owner-only Coach seats section, current/target recurring list totals, usage, included/purchased seats, effective/max limits, preview, confirmation, pending payment, scheduled reduction, cancellation, manual review and Refresh. Provider-calculated proration/tax are not represented as an exact local charge. Team invitations never purchase seats. Portal quantity controls must remain disabled; PayPal and unknown processors are ineligible.

## Migration and rollback

One forward migration: `20260912020000_additional_coach_seats.sql`. It adds private tables and replaces affected capacity, plan and reconciliation functions without editing historical migrations. Rollback requires application revert and a reviewed compensating migration that preserves provider, subscription, operation, event and domain history. Do not drop paid-seat history or silently erase purchased entitlements.

Refunds, coupons, invoice-list UI, client payments, usage/metered billing and live deployment are deferred. See the [security boundary](lemon-squeezy-coach-seat-security.md), [test runbook](lemon-squeezy-coach-seat-test-runbook.md) and [verification evidence](pr-price-09-verification.md).
