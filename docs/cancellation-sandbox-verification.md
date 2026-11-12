# Scheduled cancellation and undo: staging verification

**Passed on November 12, 2026:** schedule cancellation at period end, retain paid
access, and undo that schedule on the same existing isolated subscription.
**Not observed:** actual cancellation/expiry at the end of a billing term, or
resuming an already paused or canceled subscription.

Runtime payload is the previously reviewed `be8a532` implementation, followed by
documentation HEAD `ad42b8b`. App: `https://repsync-staging.netlify.app`.
Supabase: `dgogugyuyfourdttvwuy`. No executable deployment was needed for this
test; the existing `supabase-staging` deployment-review requirement is unchanged.

## Baseline

Used only the existing isolated owner from fixture setup run
[43202595104](https://github.com/elkasaby1996-sys/coachos/actions/runs/43202595104).
Opened the authenticated RepSync **Invoices and subscription management** action,
which creates the owner-scoped Paddle sandbox portal session. Session URLs and
credentials were neither committed nor included in reports.

| Observation                     | Baseline                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Subscription                    | One current Paddle/test Growth monthly subscription; no scheduled change                          |
| Provider and canonical status   | Active; processed reconciliation; cancellation flag false                                         |
| Paid period                     | `2026-11-12T10:52:51.618914Z` to `2026-12-12T10:52:51.618914Z`                                    |
| Next renewal                    | `2026-12-12T10:52:51.618914Z` (UTC)                                                               |
| Provider portal payment summary | Growth quantity 1, $59.00 before tax, $5.24 sales tax, $64.24 total; no recurring extra-seat item |
| Payments                        | One initial financial payment and two zero-value method-update receipts; no renewal payment       |
| App capacity                    | Two included seats, zero extras, effective limit two; full paid access                            |

## Schedule cancellation

In the Paddle customer portal, selected **Cancel subscription** and confirmed
the dialog explicitly describing cancellation at the current period end, rather
than immediate termination. Paddle displayed a cancellation banner for
December 12, 2026 at 10:52 UTC and a **Don’t cancel** action.

Its authenticated `subscription.updated` observation has resource timestamp
`2026-11-12T19:35:12.789Z`; the server processed it automatically at
`2026-11-12T19:35:15.513411Z`, without manual replay or SQL state changes:

- Provider status stayed active and `scheduledChange` became
  `{"action":"cancel","effectiveAt":"2026-12-12T10:52:51.618914Z"}`.
- `nextBilledAt` became null, as expected for the scheduled cancellation.
- RepSync persisted `cancel_at_period_end=true` and matching
  `scheduled_cancel_at`; the paid-period bounds stayed unchanged.
- A fresh navigation/reload of RepSync billing displayed **Cancellation scheduled
  for Dec 12, 2026. Your paid access continues through that date.**
- A normal authenticated `get_my_effective_account_entitlements()` call returned
  paid/active, `accessMode=full`, the unchanged period, cancellation true and
  unchanged limits: 50 clients, two included coaches, five maximum coach seats
  and three workspaces. The effective purchased capacity remained two coaches.

## Undo the schedule

Reopened the portal through RepSync and selected **Don’t cancel**, then confirmed
**Yes, continue** in the dialog stating it removes the scheduled cancellation.
This is removal of a future change, not reinstatement of a terminal subscription.

Its authenticated `subscription.updated` observation has resource timestamp
`2026-11-12T19:37:36.095Z`; the server processed it automatically at
`2026-11-12T19:37:38.242812Z`:

- Provider `scheduledChange` is null, status is active, and `nextBilledAt` is
  restored to **`2026-12-12T10:52:51.618914Z`**.
- RepSync cancellation flag is false and scheduled-cancellation date is null.
- Canonical and provider subscription identities match the baseline exactly;
  there is still one subscription, with the same paid-period bounds.
- The portal again lists the December 12 next payment of $64.24 and the same
  payment history. No additional invoice/payment appeared during the test.
- Fresh RepSync navigation again shows an active paid Growth subscription, with
  no scheduled-cancellation message. The authenticated entitlement RPC returns
  paid/active, full access, cancellation false and the same limits as while
  scheduled.
- The unique financial payment count remains one and its whole-record digest
  remains `5e9f4150c801c93fbb8e131ec17e24a0d3d089e69f717732e97bc0965ae06084`.
  The two new events are subscription updates, not collection events.

## Scope, preservation and release implications

The original staging owner's account/subscription/billing/evidence/operation
fingerprint remains
`592ea42c4efcace8c70647238d7ba962dbf9b956178befdd4449db831e6d9aac`, including its
scheduled seat reduction. It was never signed into or changed by this test.

The hosted portal now provides a verified way to undo a scheduled cancellation.
RepSync still has no separate custom resume command, and this does not certify
pause/resume or reinstating an already canceled subscription. The older scenario
inventory's separate resume product gap must not be interpreted as proof that
the current portal lacks **Don’t cancel**.

Likewise, the full cancellation scenario's access-expiry requirement is still
unverified: this test deliberately removed the future cancellation. Do not mark
the complete [subscription certification scenarios](../config/staging-commercial-scenarios.json)
passed on this narrower evidence. The [release roadmap](billing-release-roadmap.md)
records that distinction and the remaining renewal/recovery blockers.

Official contracts: [cancel and remove a scheduled change](https://developer.paddle.com/build/subscriptions/cancel-subscriptions/)
and [subscription updates](https://developer.paddle.com/api-reference/subscriptions/update-subscription/).
