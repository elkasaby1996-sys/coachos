# PR-PRICE-03 verification record

Base: `84a905db4934fd7209273e78b408c2c49e9b2485`, merged PR-PRICE-02 on fetched `origin/main`. Branch: `feat/pr-price-03-account-capacity`. Initial working tree was clean. No remote Supabase commands.

## Merged-main baseline

`npm run test:unit`: 1,340 passed, 13 failed, 1,353 total; 228 files passed, 9 failed. No tests skipped. Exact failures captured before implementation:

- tests/unit/anatomical-muscle-selector.test.ts > controlled anatomical selector source contract > emits only MuscleKey values from map and list, and null from Clear
- tests/unit/anatomical-muscle-selector.test.ts > controlled anatomical selector source contract > uses selector-local theme tokens without a selected glow
- tests/unit/checkin-assignment-summary-contract.test.ts > coach check-in assignment summary contract > renders a current check-in assignment summary in the coach delivery context
- tests/unit/checkin-assignment-summary-contract.test.ts > coach check-in assignment summary contract > gates the edit CTA to existing delivery-write permission
- tests/unit/client-continuity-contract.test.ts > client continuity beta contract > removed-only clients get a safe no-active-workspace home state
- tests/unit/client-detail-assignment-card-polish.test.ts > client detail assignment card polish > surfaces snapshot copy near workout, program, and nutrition assignment controls
- tests/unit/client-detail-assignment-card-polish.test.ts > client detail assignment card polish > uses cadence settings language for check-in assignment cards
- tests/unit/client-portal-tag-minimization.test.ts > client portal tag minimization > uses client-facing copy for missing workout, nutrition, and check-in assignments
- tests/unit/client-portal-tag-minimization.test.ts > client portal tag minimization > keeps today's actions ahead of the weekly calendar and daily log
- tests/unit/final-badge-status-regression.test.ts > final badge and status regression > keeps client-facing task statuses and no-assignment copy visible
- tests/unit/notification-center-contract.test.ts > delivery-backed notification center contract > keeps the PT notifications page concise
- tests/unit/pt-client-baseline-marker-assignment-wiring.test.ts > PT performance marker baseline wiring > makes the client baseline page use the active marker library directly
- tests/unit/workspace-header-pill-wiring.test.ts > workspace header pill wiring > uses the unified full-height rail and compact utility dock across PT routes

## Final verification

Verdict: implemented and locally verified. Both release commands passed consecutively. The final full unit failure set is byte-for-byte identical by test identity to the captured merged-main baseline. No new skips or configuration retries were introduced. The release suite retains 10 pre-existing conditional skips; those scenarios are not claimed as tested. All runtime changes remain on the requested local branch; no remote Supabase operation, push, or deployment was performed.

Additional final checks: `git status --short` reviewed, `git diff --check` passed; mobile capacity layout inspected at 375 px. Both login entry files are explicitly included in the final auth-isolation tests. Auth/module/route implementations and Playwright configuration remain untouched.

| Command                                                                                  | Actual result                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`, `git switch main`, `git pull --ff-only origin main`, branch creation | Passed; clean merged-main base verified.                                                                                                                 |
| `npm run supabase:start`                                                                 | Passed; local database already running.                                                                                                                  |
| `npm run supabase:db:reset` (final migration)                                            | Passed; all migrations applied locally.                                                                                                                  |
| `npm run supabase:db:lint`                                                               | Passed; no schema errors.                                                                                                                                |
| `npm run supabase:db:test`                                                               | Passed; 325 assertions across 8 files, including 100 capacity assertions.                                                                                |
| Targeted capacity contracts/auth-isolation/SQL/component tests                           | 57 passed across 5 files: 54 new capacity checks plus 3 existing entitlement checks.                                                                     |
| `npm run lint`                                                                           | Passed; zero errors, 3 pre-existing warnings.                                                                                                            |
| `npm run format`                                                                         | Passed.                                                                                                                                                  |
| `npm run build`                                                                          | Passed.                                                                                                                                                  |
| `npm run test:unit` (final)                                                              | 1,394 passed, 13 failed, 1,407 total; 232 files passed, 9 failed; zero skipped. Exact failure identity set equals baseline.                              |
| Focused capacity + existing entitlement browser tests, 4 workers, 0 retries              | 7 passed (50.2 seconds).                                                                                                                                 |
| Original auth pair, 4 workers, 0 retries, repeat each twice                              | 4 passed (50.9 seconds); unchanged 4-worker/0-retry settings.                                                                                            |
| `npm run verify:release` — first consecutive run                                         | Passed (exit 0): lint, format, build; 56 browser tests passed, 10 pre-existing skips, 0 failed (2.9 minutes browser phase).                              |
| `npm run verify:release` — second consecutive run                                        | Passed (exit 0), immediately after the first: lint, format, build; 56 browser tests passed, 10 pre-existing skips, 0 failed (2.9 minutes browser phase). |

Targeted unit command: `npx vitest run tests/unit/account-capacity-contract.test.ts tests/unit/account-capacity-auth-isolation.test.ts tests/unit/account-capacity-sql-contract.test.ts tests/unit/pt-hub-billing-capacity.test.ts tests/unit/pt-hub-billing-entitlements-contract.test.ts`.

Focused browser command: `npm run test:e2e -- tests/e2e/account-capacity.spec.ts tests/e2e/account-entitlements.spec.ts --workers=4 --retries=0`.

Original auth pair command: `npm run test:e2e -- tests/e2e/auth-onboarding.smoke.spec.ts tests/e2e/auth-resilience.spec.ts --grep "PT with workspace can sign in and reach PT Hub|client session can recover after local session loss" --repeat-each=2 --workers=4 --retries=0`.

## Iteration failures and their resolution

- First capacity pgTAP fixture inserts omitted existing required pause/churn reasons, then a fixture edit produced mismatched VALUES lengths. Fixture setup was corrected; no production lifecycle constraints were changed. Unknown/null fallback testing disables the existing normalizer only inside the rolled-back test transaction.
- Component testing caught that SettingsHelperCallout returns null; the new capacity error now renders explicit text. The test initially used `.test.tsx`, outside this repository's Vitest include, and was moved to `.test.ts` with `React.createElement`; all eight component tests are now actually executed.
- Initial ESLint flagged an empty Playwright fixture destructure; it was corrected without disabling a rule.
- Initial complete snapshot plan took 16.9 seconds due to unnecessary email hashing; corrected subject-prefix dispatch reduced it to 307 ms. See the query-plan artifact.
- Initial focused browser runs had two five-second render assertions race response completion (trial capacity and failure-isolation entitlement display). New tests now explicitly await their relevant RPC responses before asserting UI. No sleeps, timeout increases, worker changes or retries were added.
- First full unit run had one new failure in the PR-PRICE-02 source contract forbidding capacity meters. PR-PRICE-03 necessarily changes that expectation: the test now requires the capacity hook and meter component, retains every payment/placeholder/disabled-control assertion and commerce ban, and asserts capacity never disables a control. No unrelated baseline assertions were changed.
- One original auth-pair run had 3 passes and one existing `auth-session-ready` 15-second timeout while the full unit suite was concurrently running. The unchanged pair was rerun after build/unit work completed; final outcome is recorded above. No auth, isolation, timing, or Playwright configuration was modified.

## File-by-file changes

| File                                                                            | Change                                                                                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260910140000_account_capacity_metering_reservations.sql` | One atomic migration: private tables, constraints, derived subjects/snapshots, owner RPCs, service admission/transitions/reconciliation, grants. |
| `supabase/tests/account_capacity.sql`                                           | 100 transaction-rolled-back pgTAP assertions for canonical counts, limits, identities, reservations, role ACLs and beta compatibility.           |
| `src/features/account-capacity/contracts.ts`                                    | Strict Zod snapshot/dimension/evaluation schemas, state arithmetic, typed safe errors.                                                           |
| `src/features/account-capacity/account-capacity-api.ts`                         | Validated owner snapshot and informational evaluation RPC clients.                                                                               |
| `src/features/account-capacity/query-keys.ts`                                   | User-scoped keys and non-fatal invalidation.                                                                                                     |
| `src/features/account-capacity/use-account-capacity.ts`                         | Billing-mounted query with focus/mount/minute refresh.                                                                                           |
| `src/features/account-capacity/formatters.ts`                                   | Exact quantities and semantic current-client/state labels.                                                                                       |
| `src/features/account-capacity/capacity-meters.tsx`                             | Four accessible meters, finite bars, unlimited/unavailable/quality and beta overage copy.                                                        |
| `src/features/account-capacity/index.ts`                                        | Public frontend module exports.                                                                                                                  |
| `src/pages/pt-hub/settings/tabs/billing.tsx`                                    | Local capacity query and section; explicit error/retry text alongside existing entitlements.                                                     |
| `src/features/pt-hub/lib/pt-hub.ts`                                             | Invalidate capacity after successful workspace creation.                                                                                         |
| `src/features/pt-hub/components/pt-hub-package-manager.tsx`                     | Invalidate at existing successful package mutation refresh boundary.                                                                             |
| `src/components/pt/invite-client-dialog.tsx`                                    | Invalidate after invitation-link creation (including quality diagnostic).                                                                        |
| `src/pages/public/invite.tsx`                                                   | Invalidate after successful client acceptance/reactivation.                                                                                      |
| `src/pages/pt/client-detail.tsx`                                                | Invalidate after lifecycle, archive, transfer and existing relationship refresh boundaries.                                                      |
| `src/pages/pt-hub/lead-detail.tsx`                                              | Invalidate after successful lead approval/conversion.                                                                                            |
| `src/pages/workspace/settings/tabs/team.tsx`                                    | Invalidate at existing invite/member mutation success boundaries.                                                                                |
| `src/pages/public/team-invite-acceptance.tsx`                                   | Invalidate after successful team invitation acceptance.                                                                                          |
| `tests/unit/account-capacity-fixtures.ts`                                       | Reusable finite/unlimited/unavailable/seat fixtures.                                                                                             |
| `tests/unit/account-capacity-contract.test.ts`                                  | Contract arithmetic, exact unions, malformed payloads and safe API errors.                                                                       |
| `tests/unit/account-capacity-auth-isolation.test.ts`                            | Startup import boundary, identity keys, non-fatal invalidation.                                                                                  |
| `tests/unit/account-capacity-sql-contract.test.ts`                              | Migration structure, privilege/search-path and no-enforcement contract.                                                                          |
| `tests/unit/pt-hub-billing-capacity.test.ts`                                    | Rendered component states, failure isolation, exact numeric copy and absence of commerce controls.                                               |
| `tests/unit/pt-hub-billing-entitlements-contract.test.ts`                       | Evolve obsolete no-capacity expectation into positive meter assertions while retaining canonical entitlement and disconnected-commerce checks.   |
| `tests/e2e/account-capacity.spec.ts`                                            | Four worker-isolated browser/service tests: trial, beta overage, concurrent last slot, capacity failure.                                         |
| `docs/account-capacity-metering.md`                                             | Authoritative definitions, security, no-enforcement boundary and PR-PRICE-04 requirements.                                                       |
| `docs/account-capacity-query-plans.sql`                                         | Reproducible local-only rolled-back performance fixture and EXPLAIN statements.                                                                  |
| `docs/account-capacity-query-plans.md`                                          | Actual before/after measurements, retained plans, index decisions and scaling caveat.                                                            |
| `docs/pr-price-03-verification.md`                                              | Baseline, actual command results, iteration failures and complete file inventory.                                                                |
| `docs/account-subscription-entitlements.md`                                     | Narrow link to capacity documentation only.                                                                                                      |
