# Paddle plan changes — local implementation

`PADDLE-PLAN-CHANGE-01` supports existing active paid Sandbox subscriptions on
Launch, Growth, and Scale, with unchanged monthly or annual cadence and no added
seats. No purchase, cancellation action, refund, or production activation is added.
The migration preserves rollout flags.

## Transport and browser contract

The existing preview/apply endpoints accept only `operationId`, `targetPlanKey`,
and `targetCadence`. Authentication selects the owner; private database context
selects the subscription, customer, source mapping, and target mapping. Refresh
reads the durable operation without provider IO. Paddle cancellation through the
plan-change endpoint is unavailable.

The server transport uses the fixed Sandbox origin and an injected fetch port:

- `GET /subscriptions/{subscription}` validates the current source and period.
- `PATCH /subscriptions/{subscription}/preview` validates an advisory preview.
- `PATCH /subscriptions/{subscription}` replaces the single base item, quantity 1.

Upgrades use `prorated_immediately`; downgrades use `do_not_bill`. Both use
`on_payment_failure=prevent_change`. Existing custom data is preserved and the
operation UUID is added for authenticated webhook correlation. The provider item
changes immediately for a downgrade, while RepSync retains the source plan until
the paid-period boundary. This does not use a provider cancellation schedule.

IO has a 30-second bound, 1 MiB response bound, fixed origin, rejected redirects,
and no retries. Invalid mutation responses and connection loss are ambiguous.
Provider references, response bodies, custom data, keys, and evidence stay server
side. The browser receives the existing sanitized preview/state contracts with
an optional `provider: "paddle"` discriminator.

## Existing operation and canonical authority

The existing `billing_operations_v2` ledger owns `plan_change` operations. It gains
only immutable source-period bounds. Admission commits `provider_pending` before
the PATCH. The existing account/operation locks and unique open-operation guard
exclude other plan and seat operations. An exact retry returns the original
operation without another GET or PATCH; a changed intent with the same UUID fails.

The existing statuses are reused:

- `provider_pending` → `awaiting_payment` → `completed` for upgrades.
- `provider_pending` → `scheduled` → `completed` for downgrades.
- Definite rejection → `failed`; uncertain dispatch → `ambiguous`.
- Mapping, item, period, payment, or conflicting proof drift → `manual_review`.

Ambiguous operations may converge through verified webhooks but cannot resend.
There is no automatic provider compensation, which could introduce refunds or
additional mutations. Failed proof transactions roll back local evidence, payment,
and canonical writes together; manual review preserves the source authority.

An upgrade requires a newer authenticated target subscription observation paired
with the exact operation's completed subscription-update transaction. Identity,
single item, catalogue mapping, cadence, period, currency, captured amount, zero
balance, and transaction uniqueness are checked. Positive immediate charges must
be fully captured. Missing, zero-value, unsupported, or contradictory settlement
proof does not grant the target plan.

Completion uses existing canonical supersession: retain the source row as
`superseded`, insert its successor, and relink the same provider shadow. Initial
items/evidence remain historical; completed operations identify the current
approved mapping. Canonical entitlement and capacity readers resolve verified
scheduled downgrades only at their effective boundary. Admission and persistence
reuse existing capacity preflight and reservations; no earlier Paddle capacity
ceiling is introduced.

A new-period event first completes the verified schedule using the old paid
period, then passes through existing renewal reconciliation. The plan change alone
cannot extend paid dates. Verified cancellation may still degrade/expire the
source when the provider item matches the exact pending target; it cannot approve
that target. Unrecognized item/seat drift remains manual review.

## Verification boundaries

SQL tests exercise real retained-observation ingestion and dispatch with synthetic
identities. The annual fixture seeds a historical annual subscription locally;
annual purchase creation is outside scope. Its setup temporarily disables user
triggers within the rolled-back fixture transaction; all tested operations run
with production guards restored. Transport tests inject fetch and make no network
requests. Concurrency tests reuse the real lock-barrier harness in the fixed
disposable local database.

Provider calls: **0**. Staging and production writes: **0**. Local proof is not
Sandbox end-to-end certification. Deployment is outside this task.

Provider contract references: [preview](https://developer.paddle.com/api-reference/subscriptions/preview-subscription-update/)
and [update](https://developer.paddle.com/api-reference/subscriptions/update-subscription/).

## Local verification result

One authoritative sequential regression pass was run on 2026-09-24:

- Database: **2,371 assertions / 29 suites passed**, including **71** new plan-change assertions and existing Lemon Squeezy/lifecycle coverage.
- Full units: **3,182 passed / 1 manifest-hash failure** across 289 files. The new migration hash used CRLF bytes instead of the validator's normalized LF bytes. After correcting only that hash, all **72** tests in the affected manifest suite passed. The full unit suite was not repeated.
- Build, lint, Edge TypeScript, database lint, and manifest validation passed.
- Sequential concurrency: **29 cases, 0 deadlocks** (8 plan-change, 11 automatic initial reconciliation, 10 lifecycle).
- Monthly and annual paid upgrades pass; exact retry never redispatches. Ambiguous response recovery requires verified proof. Failed/uncaptured settlement retains the source.
- Monthly and annual downgrades schedule. Pre-boundary Scale access/capacity remains; the monthly boundary supersedes once and separately verifies renewal payment. Stale and duplicate events cannot restore an old plan.
- Conflicting plans/seats, cancellation conflict, capacity reservations, private grants, and source/item drift are covered.
- Changed-file leakage scan: zero provider-reference, credential-value, or JWT matches. All provider transport uses injected mocks.

Verification made no deployment, provider call, or staging/production write.
