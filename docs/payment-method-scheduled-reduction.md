# Payment-method updates during scheduled seat reductions

## Current behavior

RepSync pauses payment-method updates while a seat reduction is scheduled. Keep
the reduction and all payment history. The billing-management panel now displays
the scheduled date from the existing owned seat-state RPC, explains the pause,
and offers refresh or support. It does not promise that the scheduled change is
the only failing eligibility check. Missing, failed, ambiguous or review-required
seat state retains the generic unavailable message.

The payment-method RPC remains the only source of eligibility. Seat state is
explanatory; it cannot enable the button. No migration, Edge Function, billing
record, payment-provider call, grant or runtime switch changes in this release.

## Diagnosis on staging, November 12, 2026

The test subscription is active, paid Growth monthly. One additional seat is
approved, giving three total seats. A verified reduction to zero extras is
scheduled for `2026-12-10T22:23:38.061119Z`. The reduction lives in
`billing_operations_v2`; the legacy `billing_seat_quantity_operations` table is
empty for this account. Both tables have unresolved-operation checks in
`billing_payment_method_context_authority_v1`. No payment-method preparation
exists for this account.

The reduction's retained processed `paddle-seat-quantity-v1` evidence and signed
subscription observation already describe the target base-only provider items.
RepSync correctly retains the approved paid extra seat until renewal. Base and
seat mappings resolve, and the applied resource revision resolves without an
unresolved-history error. Independently, `billing_paddle_recovery_candidate_v1`
returns `operation_conflict`, while the unresolved-recovery-history predicate is
false. The public payment-method state masks these blockers as `not_available`.

This is an application contract restriction, not evidence that Paddle forbids
changing payment details during a reduction. Removing one operation predicate
would still fail recovery eligibility and would leave checkout item expectations
inconsistent with the provider's target items. Safe coexistence needs a separate
end-to-end authority change: distinguish provider target items from approved
capacity, bind the exact verified pending reduction and renewal boundary into
preparation revisions, and use that same snapshot for dispatch, continuation,
zero-value transaction validation and completion. Recovery must continue to
reject uncertain operations and unresolved obligations. That work is not included
in this frontend correction.

The existing flow resolves authority before selecting a provider, at reservation,
at the single-use dispatch claim, when recording the result, and before releasing
checkout. Revision drift invalidates stale reservations. A dispatched or
ambiguous attempt cannot be advertised as new work; a ready current preparation
is resumable. Signed transaction reconciliation supplies completion; a checkout
callback or an active subscription alone does not confirm an update-only action.

Do not call locking authority helpers inside `BEGIN READ ONLY`. The helpers use
`FOR SHARE` and account locks. Inspect definitions and stored rows first; use a
normal read-committed transaction with rollback for lock-only diagnostics. Private
invoker helpers also cannot be called directly under `service_role`; retain their
existing ACLs and use the owned/service definer entrypoints.

## Frontend retries

An idle manual refresh and a server-confirmed recovery no longer permanently
disable the action in `refreshed`. A later explicit click enters checkout before
awaiting launch, preventing a second launch from the refreshed state. A busy ref
also fences same-tick clicks.

Close/completion callbacks start bounded verification and subsequent callbacks
from that checkout are ignored. A failure callback alone does not prove closure;
the user must close checkout before refresh can permit a retry. Update-only
verification still ends pending, without claiming success. A pending attempt can
be retried only after an explicit, successful refresh returns fresh positive
payment-method eligibility. The backend then rechecks and reuses a current ready
preparation or refuses a conflicting/dispatched/ambiguous one. Cached positive
data on a failed refresh cannot unlock a pending attempt. There are no automatic
mutation retries.

## Staging deployment plan

Publish only `Ahmed-billing` through the existing `repsync-staging` Netlify Git
deployment. The frozen backend/configuration and all 188 migration hashes remain
unchanged. `scripts/staging-release-artifacts.mjs` permits one exact, hash-pinned
amendment containing only `billing-management-panel.tsx` and
`use-payment-method-update.ts`. Any content change, partial amendment, additional
protected path, symlink or untracked protected file fails verification. The
aggregate payload digest changes, so older approval evidence cannot authorize
the amended payload. Installation and upgrade plans report the amendment.

Run the existing **Paddle Staging Readiness** workflow in `inspect` mode on the
published commit with the test owner supplied privately. Its `supabase-staging`
required environment review remains intact. Do not rerun populated upgrade,
bootstrap, pilot activation or any remote migration for this frontend change.
Verify the published Netlify commit, billing explanation and server restriction,
then compare retained subscription/operation/payment/evidence hashes. The
payment-method checkout remains intentionally unavailable during the reduction;
this release cannot be reported as a successful payment-method update.

## Subsequent isolated sandbox test and bounded SQL amendment

End-to-end testing on a separate paid sandbox owner exposed a completion defect:
Paddle's signed zero-value `transaction.completed` contains one `authorized`
attempt for amount `0`. The original completion check accepted only an empty
attempt list. The provider checkout succeeded while the preparation remained
ready. This observation does not change scheduled-reduction eligibility.

Migration `20261112110032_payment_method_zero_authorization_completion.sql`
accepts empty attempts or exactly one zero-value authorized verification. It
retains receipt, customer, subscription, item, origin, currency, captured-value,
all-zero financial totals and no-payment-application checks. It marks only the
verified update-only completion event processed in the same transaction as its
preparation. Debt settlement still requires the existing authenticated unique
renewal application. No eligibility, operation, dispatch or authority guard is
removed.

This supersedes the frontend-only deployment scope above for the isolated-test
follow-up. The historical 188 migration hashes and release checkpoints remain
immutable. The exact 189th migration is registered separately in the deployment
contract and aggregate payload freeze; arbitrary SQL changes still fail closed.
The readiness workflow's `repair_payment_method_completion` mode waits for
source checks and a fresh local reset/lint/SQL/race suite, then requires the
existing `supabase-staging` review. The guarded pinned CLI pushes only that exact
pending migration from a verified disposable artifact. It verifies the prior
function's exact definition, ledger and unchanged ACLs, then reconciles only the
separate synthetic owner's exact retained signed event through the normal
service function. Original account hashes must remain unchanged. Ambiguous
writes stop without automatic retries.

Do not run historical populated upgrade/bootstrap to apply this patch. Those
plans remain bounded to the 188 baseline and cannot authorize a newer schema.
Read-only inventory reports the approved patch separately; it does not infer
hash/schema verification from migration versions alone. New installation or
upgrade plans beyond that historical baseline need their own complete plan.

The reviewed patch run `43209598190` subsequently passed on staging. The retained
attempt completed through the scoped reconciliation, and a fresh real sandbox
checkout completed automatically through the deployed webhook path. Both have
processed authenticated zero-authorization events and no financial application.
Close/explicit-refresh/reopen also passed with an unchanged preparation/dispatch.
Original account/subscription/billing/reduction hashes remain unchanged. This
verifies active, clean-subscription payment-method updates; scheduled-reduction
coexistence and genuine failed-renewal recovery are not certified by these tests.
