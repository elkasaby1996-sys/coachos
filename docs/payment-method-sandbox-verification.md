# Isolated sandbox payment-method verification

Use `Ahmed-billing`, staging app `https://repsync-staging.netlify.app`, and
Supabase project `dgogugyuyfourdttvwuy`. Preserve the original owner's account,
subscription, evidence, payments and scheduled reduction. The separate test owner
starts with an ordinary trial workspace and purchases through real sandbox
checkout; no billing authority or provider events are seeded.

## Reviewed fixture preparation

The existing **Paddle Staging Readiness** workflow has an explicit
`prepare_payment_method_test` dispatch mode. Supply the protected original owner
as `pilot_user_id`, a fresh UUID-v4 as `fixture_user_id`, an RSA-4096 **public** key
as `fixture_public_key`, and the full reviewed branch commit as
`confirm_commit_sha`. Keep the private key outside Git. The job retains the
existing `supabase-staging` required review and shared staging concurrency group.
Push events only validate this mode; they do not prepare an account.

The runner checks the exact repository, branch, commit, sandbox project and
original account, then rejects an existing fixture UID/email. It reuses the
namespaced auth-fixture identity generator, generates a random password and
encrypts the login to the supplied public key. It uses the existing Supabase
server auth capability only in memory, creates one confirmed synthetic user
without sending a confirmation email, and uses that new user's authenticated
profile/`create_workspace` APIs. It does not impersonate the original owner or
write authentication rows through SQL.

The existing pilot runner pauses the previous checkout scope and enables the new
owner's pilot, after its existing backend/catalogue/initial-purchase checks.
Original Auth, billing-account, canonical/provider subscription, checkout,
operation, preparation, payment, evidence and event rows are hash-checked before
and after the handoff. Existing paid-subscription reconciliation remains enabled;
the old owner's billing history and reduction are not changed. The new owner
alone can start new checkout. No migrations, function deployment, mapping
publication, provider payment or webhook replay occurs during setup.

The one-day artifact contains a sanitized report and `credentials.enc`, never a
plaintext password, service key or session. Decrypt only outside the repository.
A failed/uncertain create or pilot write stops without automatic retries, cleanup
or account deletion. Inspect the partial report before deciding how to resume.
Do not rerun preparation after the fixture account exists.

## Evidence for the requested scenarios

1. Purchase Growth monthly with zero extra seats, then require processed signed
   Paddle events and the unique initial payment application before testing.
2. Close the first payment-method checkout. After an explicit refresh and fresh
   positive eligibility, reopen the same current ready preparation. Confirm that
   its transaction reference is reused and there is no second creation dispatch.
3. Complete an update with a valid sandbox card. Require the retained signed
   `transaction.completed` for the exact prepared transaction, a `completed`
   preparation and unchanged financial applications. A zero-value update must not
   create renewal or seat-payment authority. A browser event is not proof.
4. Exercise a genuine failed recurring payment and recovery only through
   supported Paddle mechanisms. Require the matching debt evidence, processed
   restoration event and unique authenticated renewal application. A refreshed
   UI or a checkout-close event does not establish recovery.

Paddle's [sandbox documentation](https://developer.paddle.com/sdks/sandbox.md)
lists valid no-3DS card `4242 4242 4242 4242`, declined card
`4000 0000 0000 0002`, and **initial success, subsequent decline** card
`4000 0027 6000 3184`. Use only official test cards and a future expiry. Paddle
Retain's full payment-recovery product is unavailable in sandbox; its frontend
simulations do not prove recovery of an actual subscription.

Moving a billing date requires a date at least
[30 minutes ahead](https://developer.paddle.com/errors/subscriptions/subscription_next_billed_at_too_soon.md).
RepSync's lifecycle authority also validates real paid-period boundaries. Do not
truncate a paid period, invent an invoice, inject simulated signed receipts, or
rewrite canonical state merely to manufacture an immediate renewal test. Record
this scenario as blocked if a supported real recurring failure cannot be reached.

Record actual outcomes, commit/deployment, retained preparation/event identities
privately, provider/server confirmation and original-account preservation in the
session journal. Distinguish local mocked regressions from hosted sandbox passes.

## Observed hosted results on November 12, 2026

The approved fixture setup run `43202595104` created the isolated owner and
changed only the checkout pilot scope; its original-account fingerprint matched
before/after. Real staging checkout purchased Growth monthly with zero extra
seats. Processed subscription-created and transaction-completed events confirm
the unique initial payment; the next boundary is December 12 at 10:52:51 UTC.

Closing payment-method checkout, explicitly refreshing and reopening succeeded.
Both calls reused one ready preparation with identical full-row digest,
transaction reference and dispatch claim. This exercises the frontend refresh
lockout fix on the hosted app. Closure itself did not complete the preparation.

Completing reopened Paddle checkout with the official sandbox Visa debit card
showed provider success. Server confirmation exposed the zero-authorization
completion defect described in `payment-method-scheduled-reduction.md`.

After the retained required review, patch run
[43209598190](https://github.com/elkasaby1996-sys/coachos/actions/runs/43209598190)
passed on runtime commit `be8a53246e9eb1f24807ae4e862540ca2773e3f2`. Staging has
the exact 189th migration and expected function definition/ACLs. The reviewed
normal reconciliation completed that exact retained event/preparation at
12:33:07 UTC, with the initial-payment fingerprint and original account unchanged.
The original provider-success attempt is now **server-confirmed**.

A fresh hosted update then verified the deployed automatic webhook path. An
explicit billing refresh permitted checkout. Closing it, waiting for bounded
verification, explicitly refreshing and reopening reused one new preparation
and dispatch: the full preparation-row digest was identical before closure,
after closure and after retry. Both app calls returned HTTP 200, `update_only`.
Completing with the official valid `4242` test card displayed Paddle success;
its authenticated completion event was processed and its exact preparation
completed automatically at 12:44:09 UTC, with no manual replay. Both distinct
updates are completed, no preparations remain open, and the unique initial
financial payment remains unchanged. **Payment-method update and close/retry
scenarios passed in staging.** Browser close/refresh alone was never counted as
proof.

The original owner's complete retained fingerprint still matches the reviewed
setup report, including its scheduled reduction. Its scheduled-change eligibility
restriction remains intentional. Do not rerun fixture preparation or the exact
patch job; the fixture exists and the migration is applied. Keep their reports
as historical evidence.

Genuine failed-renewal recovery remains **blocked** for immediate execution. The
separate subscription is paid and has no failed recurring obligation. The
official subsequent-decline card needs an actual later charge, while accelerating
this paid period violates RepSync's lifecycle boundary contract. Neither a
declined card-verification attempt nor Paddle's frontend recovery simulation
would prove debt recovery. Keep the successful test instrument and paid records;
arrange a separately reviewed renewal-time test instead of fabricating history.
