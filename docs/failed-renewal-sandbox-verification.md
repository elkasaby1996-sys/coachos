# Genuine failed-renewal recovery: staging verification

**Status: unverified — blocked before a genuine renewal failure.** Rechecked on
November 12, 2026, starting from clean `Ahmed-billing` HEAD `e351372`. The existing
payment-method update and close/refresh/retry passes remain valid. They do not
certify collection of an outstanding renewal obligation.

## Existing fixture and current evidence

Use the isolated owner created by reviewed fixture run `43202595104`, not the
original owner with the scheduled seat reduction. Locate its private login using
the existing fixture handoff; do not recreate the account, rerun setup, or copy
credentials into reports. The trusted Auth app-metadata marker is
`repsync_sandbox_fixture: payment-method-v1`. The retained subscription is the
fixture's single current Paddle/test subscription.

- App: `https://repsync-staging.netlify.app`.
- Supabase: `dgogugyuyfourdttvwuy`.
- Growth monthly, automatic collection, zero additional seats; canonical and
  retained provider statuses are active and reconciliation is processed.
- Paid period: `2026-11-12T10:52:51.618914Z` through
  `2026-12-12T10:52:51.618914Z`.
- **Next renewal: `2026-12-12T10:52:51.618914Z` (UTC)**, equivalent to
  `2026-12-12T13:52:51.618914+03:00` in Asia/Riyadh.
- The latest processed signed subscription observation has that same
  `nextBilledAt` and period; there is no scheduled provider change.
- Six retained events are processed: one subscription-created, two
  subscription-updated, and three transaction-completed events. No retained
  payment-failed, transaction-past-due or subscription-past-due event exists.
- There is one initial-purchase financial application, no renewal application,
  two completed payment-method preparations, no open preparation and no
  unresolved seat/plan operation.
- An actual authenticated call as this fixture to
  `get_my_billing_payment_method_state_v1()` returned
  `{"status":"active","available":true,"maySettleExistingBalance":false}`.
  This is eligibility for an active update, not a failed-payment recovery state.

The date above is independently consistent between canonical records and the
latest processed provider observation. No new direct merchant API retrieval is
claimed in this inspection.

## Supported Paddle controls and the exact blocker

Current official documentation was checked rather than treating the previous
blocked result as conclusive:

| Documented control                                                                                                   | Meaning for this fixture                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Sandbox test cards](https://developer.paddle.com/sdks/sandbox/)                                                     | Paddle lists `4000 0027 6000 3184` for an initial success followed by subsequent decline. It needs a subsequent charge; entering it does not itself create a failed renewal.                                                                                                                                                        |
| [Change billing date](https://developer.paddle.com/build/subscriptions/change-billing-dates/)                        | Paddle supports moving `next_billed_at`, including with `do_not_bill`. Its documented example also changes the current period end. This is a real billing-anchor change, not a test clock. A new date must be [at least 30 minutes ahead](https://developer.paddle.com/errors/subscriptions/subscription_next_billed_at_too_soon/). |
| [Pause and resume](https://developer.paddle.com/api-reference/subscriptions/resume-subscription/)                    | Starting a new period on resume charges immediately and resets the period start. Continuing the existing paid period makes no immediate charge. Neither supplies an unchanged-boundary renewal now.                                                                                                                                 |
| [One-time subscription charges](https://developer.paddle.com/changelog/2023/subscription-charge-transaction-origin/) | Their origin is `subscription_charge`; immediate item changes use `subscription_update`. These are not the required renewal obligation.                                                                                                                                                                                             |
| [Webhook simulator](https://developer.paddle.com/webhooks/simulator/test-webhooks/)                                  | It can simulate failed/recovered renewal events without real transactions. Those events are excluded from genuine recovery certification.                                                                                                                                                                                           |

No documented sandbox clock-advance or immediate-renewal control preserving the
existing paid-period boundary was found in the official material reviewed.
Paddle Retain's full Payment Recovery product is also unavailable in sandbox;
that limitation alone does not prevent testing RepSync's own recovery checkout
once a real sandbox renewal debt exists.

The integration blocker is precise:

1. `billing_paddle_lifecycle_facts_v1` requires a Growth monthly provider period
   to span one month. A non-advancing period must equal the stored paid period;
   an advancing period must start at the stored paid-period end. Active
   `nextBilledAt` must equal that provider period end. A shortened/reanchored
   period therefore fails `PADDLE_LIFECYCLE_PERIOD`. Paused status is separately
   unsupported by this lifecycle authority.
2. `billing_paddle_recovery_candidate_v1` accepts only a uniquely evidenced,
   unconsumed recurring obligation whose service period starts at canonical
   `current_period_ends_at` and ends one cadence later. A renewal accelerated
   into November would fail that boundary check even if Paddle recorded a real
   decline.

These predicates were confirmed in the deployed function definitions as well
as the committed migrations. Changing only the fixture's Paddle date would
create provider/application disagreement and prevent the required server
recovery state. Removing predicates or rewriting canonical dates to make the
test pass would weaken payment authority. No such change was made. Supporting
reviewed billing-anchor changes end to end is additional product work, not a
test-only exception.

## Concrete renewal-time procedure

1. Before the unchanged renewal, recheck the fixture identity, original-owner
   preservation fingerprint, current provider date, runtime gates, and absence
   of conflicting operations or dispatched/ambiguous preparations. Keep pilot
   scope on the existing isolated owner. Do not rerun historical fixture setup
   or the already-applied exact SQL patch job.
2. Allow preparation time before the provider's 30-minute subscription-change
   window; for example, start before **09:30 UTC on December 12**. Through the
   fixture's application payment-method action, attempt the documented
   initial-success/subsequent-decline test card. Confirm Paddle accepted and
   selected it for the subscription, using scoped provider reads or the merchant
   dashboard if necessary. Confirm the zero-value method-change completion is
   processed and its preparation is completed. That step alone is not failure
   evidence. No failure card was installed during the November 12 inspection.
3. At `2026-12-12T10:52:51.618914Z`, observe the actual recurring transaction and
   subscription in Paddle. Require a failed collection attempt, a real positive
   outstanding balance, `subscription_recurring` origin, and retained
   authenticated `transaction.payment_failed`, `transaction.past_due` and
   `subscription.past_due` evidence as delivered. Require the corresponding
   RepSync processing results. Do not advance solely on a timer or simulated
   payload; if Paddle does not actually fail, recovery remains unverified.
4. The expected debt service period is December 12, 2026 through January 12,
   2027 at **10:52:51.618914 UTC** at both boundaries. Require a unique supported
   obligation, canonical past-due status, and fresh owner RPC state permitting
   settlement of the existing balance. Preserve the retained invoice's real
   amounts, taxes and identity. Check access/entitlements against policy rather
   than assuming every past-due account must lose access.
5. Complete recovery using the application's payment-method action and an
   official successful sandbox card. Paddle's [payment-method transaction
   endpoint](https://developer.paddle.com/api-reference/subscriptions/get-subscription-update-payment-method-transaction/)
   returns the existing past-due transaction for a past-due subscription. Require
   RepSync to bind that exact obligation; do not create another subscription or
   charge. The dedicated sandbox capability must have transaction read/write
   and adjustment visibility; missing explicit adjustment data must still fail
   closed. Use existing reviewed deployment/configuration workflows if a fix or
   capability change is required, retaining `supabase-staging` review.
6. Require authenticated processed completion and restoration events, the exact
   completed preparation, one new renewal application for that transaction, zero
   outstanding balance, active canonical/provider status, the correctly advanced
   paid period, and fresh access/entitlements matching the plan. Compare provider
   captured amounts/attempts with the ledger and verify there was no second
   successful collection. Replays or explicit retry must reuse/refuse the
   retained attempt, never redispatch an ambiguous request.
7. Recheck original account/subscription/payment/evidence/operation hashes and
   its scheduled reduction. Record provider/server evidence and actual outcomes
   in this file and the session journal before marking recovery passed.

Until those observations exist, genuine renewal failure, outstanding-balance
collection, restored status/access and duplicate-collection protection remain
**unverified in hosted sandbox**, even though local regression coverage exists.

## Changes made by this inspection

No provider date, payment method, subscription, financial application, canonical
status, webhook, mapping, runtime setting or guard was changed. The only account
session used was a normal login to the isolated fixture for the owned state RPC.
The original account's complete retained fingerprint still matches its prior
reviewed baseline. Documentation is committed only to `Ahmed-billing`; there is
no staging deployment or environment-approval bypass for this read-only result.
