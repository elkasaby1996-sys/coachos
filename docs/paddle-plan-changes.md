# Paddle plan changes — local implementation

`PADDLE-PLAN-CHANGE-01` supports existing active paid Sandbox subscriptions on
Launch, Growth, and Scale, with unchanged monthly or annual cadence and no added
seats. No purchase, cancellation action, refund, or production activation is added.
The migration preserves rollout flags.

## Reviewed implementation inventory (N=17)

- `config/staging-commercial-certification.json`
- `docs/paddle-plan-changes.md`
- `scripts/test-paddle-plan-change-concurrency.py`
- `src/features/billing/plan-change-contracts.ts`
- `src/features/billing/plan-change-panel.tsx`
- `supabase/functions/_shared/billing-handlers.ts`
- `supabase/functions/_shared/billing-plan-change.ts`
- `supabase/functions/_shared/billing-runtime.ts`
- `supabase/functions/_shared/paddle-plan-change.ts`
- `supabase/functions/_shared/paddle-webhook/contract.ts`
- `supabase/functions/_shared/paddle-webhook/observation.ts`
- `supabase/migrations/20260924113658_paddle_plan_changes.sql`
- `supabase/tests/fixtures/paddle_plan_change_fixture.psql`
- `supabase/tests/paddle_plan_changes.sql`
- `tests/e2e/billing-plan-change.spec.ts`
- `tests/unit/billing-plan-change-panel.test.ts`
- `tests/unit/paddle-plan-change.test.ts`

The final PR has 19 files when the two exact CI-classifier files are included.
The pre-existing local environment configuration edit is excluded.

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

## Prior implementation verification

The initial implementation regression pass on 2026-09-24 reported:

- Database: **2,371 assertions / 29 suites passed**, including **71** new plan-change assertions and existing Lemon Squeezy/lifecycle coverage.
- Full units: **3,182 passed / 1 manifest-hash failure** across 289 files. The new migration hash used CRLF bytes instead of the validator's normalized LF bytes. After correcting only that hash, all **72** tests in the affected manifest suite passed. The full unit suite was not repeated.
- Build, lint, Edge TypeScript, database lint, and manifest validation passed.
- Sequential concurrency: **29 cases, 0 deadlocks** (8 plan-change, 11 automatic initial reconciliation, 10 lifecycle).
- Monthly and annual paid upgrades pass; exact retry never redispatches. Ambiguous response recovery requires verified proof. Failed/uncaptured settlement retains the source.
- Monthly and annual downgrades schedule. Pre-boundary Scale access/capacity remains; the monthly boundary supersedes once and separately verifies renewal payment. Stale and duplicate events cannot restore an old plan.
- Conflicting plans/seats, cancellation conflict, capacity reservations, private grants, and source/item drift are covered.
- Changed-file leakage scan: zero provider-reference, credential-value, or JWT matches. All provider transport uses injected mocks.

Verification made no deployment, provider call, or staging/production write.

## Final release verification

The final local source tree was verified in one sequential missing/affected pass
on 2026-09-24, before the administrative release commits:

- Full units: **3,183 passed, zero failures, 289 files, exit 0**. This supersedes the earlier manifest-only correction evidence; the checksum assertion is unchanged.
- Browser: **16 Chromium plan-change tests passed, exit 0**, using four workers, no retries, and the existing timeouts. Four cases cover Paddle monthly/annual failed-upgrade and scheduled-downgrade projections, fixed cadence, source capacity retention, refresh without redispatch, and absence of a cancellation action. Existing owner, payment, mapping, capacity, and mobile browser regressions also passed.
- Browser execution used the disposable local API/database on loopback ports 57431/57432. Paddle UI responses were route-mocked over local seeded canonical accounts. Provider payment authority is independently covered by the SQL and transport tests, not claimed from these UI mocks. The main application database was not used.
- **2,371 DB assertions and 29 concurrency cases (zero deadlocks) are reused** from the tested implementation. All 218 SQL/fixture files match the tested local copy; relevant database, server, concurrency, and repository configuration paths are unchanged. Only pending-state copy, its UI assertions, browser coverage, documentation, and the CI classifier changed during release preparation.
- Strict application TypeScript, affected Edge TypeScript, Deno checks for all four plan-change endpoints and the Paddle webhook, build, repository lint/format, manifest validation, and diff checks passed locally.
- CI classification: **280 tests passed**. The complete 17-path inventory and 19-path inventory classify as `docs_only=false`, `configured_data_required=false`. Every single implementation omission, duplicates, unrelated additions, and near-matching paths fail closed.

The exact CI exemption is limited to the complete implementation inventory above,
optionally accompanied by the two classifier files. It retains quality, local
smoke, Supabase CI, and CodeQL. No workflow or branch-protection files change.
Configured-account integration is excluded because hosted mutations are not
part of this release. Supabase deployment workflows are manual-dispatch only;
no such workflow is dispatched. The final pushed commit and PR title contain
`[skip netlify]`; a preview created by the earlier PR push remains historical.

The original implementation commit is preserved. Release verification changes
and the exact classifier change are committed separately. PR metadata records
all commit SHAs and final-head check outcomes. Provider calls and hosted mutations
during this release verification are zero; no merge or deployment is authorized.

## Temporary preview compatibility bridge

This release negotiates only the Paddle preview response. The Billing panel passes
its canonical Paddle provider context to the API helper; only its preview request
adds numeric `previewContractVersion: 2`. Apply, refresh, cancellation and
non-Paddle request bodies remain unchanged. Browser payloads gain no provider IDs.

The preview HTTP handler accepts an absent version as temporary v1, or numeric 2
as v2. Every other explicit value fails with HTTP 400 / `BILLING_INVALID_INPUT`
before routing/provider access. The version is rejected on other actions. The
helper never retries as v1 or falls back to the legacy response parser.

Both modes execute the same strict provider validation. Only after validation does
v1 omit `quote`, preserving the old strict frontend shape without any replacement
field. V2 retains the existing quoted response. Immediate paid upgrades require a
positive USD charge from Paddle `update_summary.result`; safe integer, malformed
container, identity and actual-mutation checks remain unchanged. A genuinely absent
scheduled-change quote remains optional; malformed supplied data still fails.
Preview creates no durable operation, payment application or entitlement authority.

Compatibility proof uses a frozen schema from deployed frontend commit
`0d0ce4b0f7bc66d2b3661d39beb582d78b55f9f8`, the full HTTP handler and injected
provider fetch. Browser cases exercise legacy and v2 requests against the handler,
with synthetic provider previews over local canonical accounts. These are local
compatibility checks, not Sandbox certification or captured-payment evidence.

After separate review and deployment authorization: deploy only the bridge preview
function first; verify dormant invariants; then deploy the version-requesting
frontend from the new reviewed bridge release. Commit `026e97d` alone does not
request v2. Verify both artifacts without invoking a real Paddle preview.

Rollback the frontend first and retain the bridge where possible. If the backend
must revert to v15, any remaining v2 clients receive an explicit input error and
fail closed. Retain v1 in this release; remove it only after staging certification,
production frontend migration, and evidence that legacy clients are no longer
expected. Shared handler imports do not authorize redeploying other functions.

The new exact CI exemption requires all nine paths below. Omissions, duplicates,
path aliases and unrelated additions (including the local environment file) fail
closed. Quality, local smoke, database and security gates remain active; only
configured hosted-account integration is excluded. No workflow change is included.

### Preview bridge release inventory

<!-- preview-bridge-inventory -->

```text
src/features/billing/plan-change-api.ts
src/features/billing/plan-change-panel.tsx
supabase/functions/_shared/billing-plan-change.ts
tests/unit/paddle-plan-change.test.ts
tests/unit/billing-plan-change-api.test.ts
tests/e2e/billing-plan-change.spec.ts
docs/paddle-plan-changes.md
.github/scripts/ci-change-scope.mjs
.github/scripts/ci-change-scope.test.mjs
```

<!-- /preview-bridge-inventory -->

### Bridge local verification

On 2026-09-26, the final bridge code passed **3,314 unit tests across 291 files**
with zero failures. The exact-inventory classifier passed **397 tests**.
The normal Chromium plan-change and coach-seat suites passed **24 tests** using
four workers, zero retries, and the existing timeouts. Monthly and annual Paddle
cases exercised legacy and v2 requests through the real HTTP handler with an
injected synthetic preview transport, verified quote copy, and retained unchanged
commercial counts. The unit matrix separately exercised the real transport with
injected fetch, including malformed quotes and the existing identity rules.

Browser verification used the retained disposable local Supabase database; no
migration was applied. The local stack was stopped afterward. No provider call,
staging/production write, deployment, commit, push, or PR was performed.
