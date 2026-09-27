# Paddle trial-to-paid reconciliation

CODEX-32 is local implementation only, based on
`a1474cb7c4784b4f219c97be58ebd4661ab3f89c`. No staging writes, provider calls,
webhook replay, deployment, commit, or push are part of this change.

## Cause and supported transition

The initial Paddle reconciler explicitly rejected every current canonical
obligation. Authenticated payment and subscription observations could therefore
pass the existing proof builder, but a normal RepSync trial prevented activation.
The Lemon Squeezy path demonstrates the existing canonical convention: cancel
the trial without changing its immutable clock, create a separate paid row, and
record a conversion event. Paddle continues to use only its own proof chain.

Migration `20260927195317_paddle_trial_paid_reconciliation.sql` replaces only
`reconcile_paddle_initial_purchase_v1(uuid,text)`. It introduces no helpers,
triggers, grants, data repairs, backfills, or runtime policy changes.

An eligible current row must be the account's only current canonical obligation:

- Kind `trial`, stored status `trialing` or `trial_recovery`.
- Normal trial source `first_workspace` or `workspace_transfer`.
- An active or retired immutable trial policy with matching plan and dates.
- A trial that has started and whose effective state is trialing or recovery.
  A stored `trialing` row already in its recovery window is supported; premature
  stored recovery and an effectively expired trial are rejected.
- No terminal timestamps, paid billing period, scheduled cancellation, or
  provider-origin claim on the trial.

Paid, custom, complimentary, ambiguous, and malformed current authority remains
blocked. Complimentary conversion is deliberately outside this contract. The
existing path for accounts with no current canonical obligation is unchanged.
Existing cross-provider and linked-shadow exclusions remain in place.

## Atomicity, proof, and history

The unchanged proof builder acquires the policy/account/shadow/checkout locks.
The reconciler then re-reads and locks current canonical rows under the account
lock, rejects multiplicity, and validates trial eligibility. It terminalizes the
trial as `canceled` using one transaction timestamp for `canceled_at` and
`status_changed_at`. None of the three immutable trial timestamps changes.

The existing authenticated receipts, catalogue, identity, checkout, payment,
Growth Monthly/base quantity one/zero extras, and environment validations remain
unchanged. The existing writers create one payment application, one paid
canonical, one billing.v2 origin, and one verified base item; link the current
Paddle shadow; mark it processed; and complete its original checkout.

Existing audit triggers retain the trial status transition and paid creation.
One `subscription.converted_to_paid` event on the new paid row identifies the
previous trial and checkout. Its metadata contains commercial identifiers only.
The unchanged strict processed-retry branch returns before conversion, so an
exact retry changes neither timestamps nor audit history.

All writes share the original transaction. Tests inject failures after trial
terminalization, payment, canonical insertion, origin claim, item insertion,
shadow link, checkout completion, and conversion audit insertion. Full-row
snapshots verify rollback of authority, evidence, origin, checkout, and history.
No exception is swallowed by the production reconciler.

## Local verification

Use the existing disposable project `repsync_reconciliation01` in the OS temp
directory. Copy the current migrations and tests into that project's Supabase
workdir. Never target an application database or use a remote connection URL.

- Extended `paddle_initial_purchase_reconciliation.sql` and
  `paddle_auto_initial_purchase_reconciliation.sql` cover eligible conversion,
  strict negative cases, original proof regressions, entitlements, rollback, and
  exact retry history: 194 assertions pass. The complete database suite passes
  2,986 assertions across 31 files.
- Extended `test-paddle-auto-reconciliation-concurrency.py` covers both trial
  states, both event orders, duplicate ingestion/dispatch, and both winners of
  canonical-writer and capacity-lock races: 31 cases, zero deadlocks.
  The existing seven-suite reconciliation regression runner passes another
  57 concurrency cases, also with zero deadlocks.
- `test-paddle-trial-paid-migration.py` upgrades a populated 178-migration database
  containing a processed purchase and an unresolved paid trial. All data and
  grants are preserved; only the intended function changes. The 50 existing
  advisor warnings remain unchanged; zero new findings. Its final reset leaves
  the disposable database with both Paddle flags disabled.
- Full unit suite: 3,391 assertions pass. Strict TypeScript passes. ESLint has
  zero errors and three pre-existing warnings. Database lint reports no errors.
- The manifest appends exactly one migration; all prior 178 hashes are unchanged.
  No TypeScript or Edge dependency changes require a Deno check or frontend build.

## Read-only webhook discrepancy investigation

Staging reports `billing-paddle-webhook` v18, ACTIVE, with `verify_jwt=false`.
Its returned update timestamp is `2026-09-27T18:02:17.588Z`. The available GitHub
Actions history contains no corresponding Edge deployment run.
All eight returned source files match the merged main files after CRLF/LF
normalization, including the entrypoint and complete shared dependency graph.
There is no observed source or JWT-setting drift. The version increment is
consistent with redeploying the same source; the available source/metadata
evidence does not identify the initiating operator or establish an audited reason
for that redeploy. It is not a source-drift blocker for this local SQL change.

## Next boundary

Review this local delta before any commit or deployment. Purchase #3 recovery
requires separate authorization after review and deployment, using the existing
paid purchase and retained authentic evidence. This task does not recover it,
start another checkout, or begin seat certification.
