# PR-PRICE-02 verification record

Base: `ba76df5e4cc0bb601821841ca18a67ba83060d7e` (fetched current origin/main). Branch: `feat/pr-price-02-account-entitlements`. Initial worktree was clean.

## Captured baseline unit failures

Before implementation, `npm run test:unit -- --reporter=json --outputFile=C:/Users/ahmed/.codex/attachments/pr-price-02-unit-baseline.json` completed with **1,300 passed, 13 failed, 1,313 total**. Exact failure identities:

- `anatomical-muscle-selector.test.ts` — controlled anatomical selector source contract emits only MuscleKey values from map and list, and null from Clear
- `anatomical-muscle-selector.test.ts` — controlled anatomical selector source contract uses selector-local theme tokens without a selected glow
- `checkin-assignment-summary-contract.test.ts` — coach check-in assignment summary contract renders a current check-in assignment summary in the coach delivery context
- `checkin-assignment-summary-contract.test.ts` — coach check-in assignment summary contract gates the edit CTA to existing delivery-write permission
- `client-continuity-contract.test.ts` — client continuity beta contract removed-only clients get a safe no-active-workspace home state
- `client-detail-assignment-card-polish.test.ts` — client detail assignment card polish surfaces snapshot copy near workout, program, and nutrition assignment controls
- `client-detail-assignment-card-polish.test.ts` — client detail assignment card polish uses cadence settings language for check-in assignment cards
- `client-portal-tag-minimization.test.ts` — client portal tag minimization uses client-facing copy for missing workout, nutrition, and check-in assignments
- `client-portal-tag-minimization.test.ts` — client portal tag minimization keeps today's actions ahead of the weekly calendar and daily log
- `final-badge-status-regression.test.ts` — final badge and status regression keeps client-facing task statuses and no-assignment copy visible
- `notification-center-contract.test.ts` — delivery-backed notification center contract keeps the PT notifications page concise
- `pt-client-baseline-marker-assignment-wiring.test.ts` — PT performance marker baseline wiring makes the client baseline page use the active marker library directly
- `workspace-header-pill-wiring.test.ts` — workspace header pill wiring uses the unified full-height rail and compact utility dock across PT routes

No baseline failure was changed or skipped. Final JSON output will be compared by file and full test name.

## Final results

**PASS for the bounded PR-PRICE-02 scope.** The final two release runs passed consecutively on the same application/test code. The full unit suite retains the exact thirteen captured baseline failures; no new failures and no unit skips were introduced.

| Command actually run                                                                                                                                                       | Final result                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `git fetch origin`, `git switch main`, `git pull --ff-only origin main`, branch creation                                                                                   | Passed; base and branch above                                                   |
| `git status --short`, `git diff --check`                                                                                                                                   | Initial tree clean; final changes limited to the files below; diff check passed |
| `python .codex/skills/ui-ux-pro-max/scripts/search.py "RepSync PT Hub billing settings subscription status accessible existing minimal tokens" --design-system -p RepSync` | Passed before UI edits; accessibility/error-state domain lookup also passed     |
| `npm run supabase:start`                                                                                                                                                   | Passed, local only                                                              |
| `npm run supabase:db:reset`                                                                                                                                                | Passed with final migration                                                     |
| `npm run supabase:db:lint`                                                                                                                                                 | Passed; empty error result                                                      |
| `npm run supabase:db:test`                                                                                                                                                 | 225 assertions passed across 7 files, including 102 new entitlement assertions  |
| Targeted unit command below                                                                                                                                                | 84 passed across 9 files                                                        |
| `npm run lint`                                                                                                                                                             | Passed, zero errors and 3 existing warnings                                     |
| `npm run format`                                                                                                                                                           | Passed                                                                          |
| `npm run build`                                                                                                                                                            | Passed                                                                          |
| `npm run test:unit -- --reporter=json --outputFile=C:/Users/ahmed/.codex/attachments/pr-price-02-unit-final.json`                                                          | 1,340 passed, 13 failed, 1,353 total, zero skipped                              |
| `npm run test:e2e -- tests/e2e/account-entitlements.spec.ts --workers=4 --retries=0`                                                                                       | 3 passed; final focused run used 3 active workers under the 4-worker limit      |
| `npm run test:e2e -- tests/e2e/auth-onboarding.smoke.spec.ts tests/e2e/auth-guards.smoke.spec.ts --workers=4 --retries=0`                                                  | 6 passed                                                                        |
| Original auth pair command below                                                                                                                                           | 4 passed using 4 workers, zero retries                                          |
| `npm run verify:release` — run 2                                                                                                                                           | Passed: 52 passed, 10 existing skips, 0 failed; browser phase 2.6 minutes       |
| `npm run verify:release` — run 3, immediately following run 2                                                                                                              | Passed: 52 passed, 10 existing skips, 0 failed; browser phase 2.6 minutes       |

The final targeted unit command was:

```text
npm run test:unit -- tests/unit/account-entitlements-contract.test.ts tests/unit/account-entitlements-auth-isolation.test.ts tests/unit/account-entitlements-sql-contract.test.ts tests/unit/pt-hub-billing-entitlements-contract.test.ts tests/unit/trial-plan.test.ts tests/unit/commercial-catalogue-contract.test.ts tests/unit/commercial-catalogue-sql-contract.test.ts tests/unit/commercial-catalogue-marketing-contract.test.ts tests/unit/auth-callback.test.ts
```

The exact originally reported auth tests were located in `docs/pr-auth-gate-01.md` and run after the new browser coverage:

```text
npm run test:e2e -- tests/e2e/auth-onboarding.smoke.spec.ts tests/e2e/auth-resilience.spec.ts --grep "PT with workspace can sign in and reach PT Hub|client session can recover after local session loss" --repeat-each=2 --workers=4 --retries=0
```

Repeating each test twice exercised four actual workers. This did not change suite retries or timeout settings.

### Baseline comparison

The comparison uses each failed assertion's file and full name. Baseline: 1,300 passed / 13 failed. Final: 1,340 passed / 13 failed. `sameFailureSet=true`, `newFailures=[]`, `missingBaselineFailures=[]`. All 40 new unit tests pass. The nine existing failing files and all thirteen exact names remain listed above.

### Intermediate failures and corrections

- The first pgTAP run passed 55 assertions before an invalid new fixture enum (`client` in workspace_members). The fixture now uses the existing clients relationship table. Subsequent runs passed 222, then 225 assertions after additional timestamp/mode checks.
- The first TypeScript-only check found the new Billing display using unsupported String.replaceAll; changed to equivalent global-regex replacement. Production builds passed afterward.
- A new source-copy assertion initially failed on JSX line wrapping. It now normalizes whitespace while retaining the exact copy assertion; targeted runs passed afterward.
- An initial lint run caught an empty destructured test fixture. The concurrency test now uses Playwright's request fixture for the actual simultaneous requests. Final lint has only the three pre-existing warnings.
- One local Supabase lint invocation collided with another CLI process on Windows telemetry.json rename (EPERM). Running it on its own passed; no database error was reported.
- The first focused browser attempt ended during existing server-readiness setup with execution-context destruction while source was being edited. Later browser runs used a stable worktree.
- A focused complimentary fixture initially duplicated the owner membership already inserted by sync_workspace_owner_membership. Removed the redundant fixture insert; all three focused tests passed, including a subsequent parallel run.
- Release run 1 failed with 49 passed / 10 existing skips / 3 failed: the two new UI tests asserted readiness before workspace/entitlement requests completed, and the existing bootstrap-recovery test timed out after a retried membership request took about 13.6 seconds. The new tests now wait for actual RPC responses and the existing page-readiness marker. No existing assertion, auth code, retry policy, global timeout, worker count, or auth isolation behavior was changed. The existing recovery test and both new UI tests passed in both consecutive final release runs.

## File-by-file change list

| File                                                                                                                                                                          | Change                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [src/features/account-entitlements/contracts.ts](../src/features/account-entitlements/contracts.ts)                                                                           | Zod schemas, typed errors, status/access unions and trial-policy parity contract.                                                 |
| [src/features/account-entitlements/account-entitlements-api.ts](../src/features/account-entitlements/account-entitlements-api.ts)                                             | Validated owner/workspace reads and requested-plan write; safe typed error mapping.                                               |
| [src/features/account-entitlements/query-keys.ts](../src/features/account-entitlements/query-keys.ts)                                                                         | User-scoped query keys and shared owner/workspace invalidation.                                                                   |
| [src/features/account-entitlements/use-account-entitlements.ts](../src/features/account-entitlements/use-account-entitlements.ts)                                             | Locally mounted React Query hooks and clock-state refresh.                                                                        |
| [src/features/account-entitlements/persist-requested-plan.ts](../src/features/account-entitlements/persist-requested-plan.ts)                                                 | Non-fatal observed persistence, retained retry intent and success-only clearing.                                                  |
| [src/features/account-entitlements/index.ts](../src/features/account-entitlements/index.ts)                                                                                   | Public module exports.                                                                                                            |
| [supabase/migrations/20260910120000_account_subscription_entitlements_foundation.sql](../supabase/migrations/20260910120000_account_subscription_entitlements_foundation.sql) | Only forward migration: five tables, lifecycle guards, audit, backfill, workspace trigger, four granted RPCs and private helpers. |
| [supabase/tests/account_entitlements.sql](../supabase/tests/account_entitlements.sql)                                                                                         | 102 transaction-scoped pgTAP assertions with real-role authorization and lifecycle fixtures.                                      |
| [src/lib/trial-plan.ts](../src/lib/trial-plan.ts)                                                                                                                             | Detect whether browser intent actually remains.                                                                                   |
| [src/lib/auth-callback.ts](../src/lib/auth-callback.ts)                                                                                                                       | Dispatch canonical intent persistence after PT profile creation; retain compatibility writes.                                     |
| [src/pages/public/auth-callback.tsx](../src/pages/public/auth-callback.tsx)                                                                                                   | Pass the existing QueryClient to provisioning for invalidation.                                                                   |
| [src/pages/public/pt-signup.tsx](../src/pages/public/pt-signup.tsx)                                                                                                           | Dispatch non-blocking canonical persistence after email signup profile creation.                                                  |
| [src/features/pt-hub/lib/pt-hub.ts](../src/features/pt-hub/lib/pt-hub.ts)                                                                                                     | Retry intent within workspace action, invalidate after creation, mark payment summary compatibility.                              |
| [src/features/pt-hub/types.ts](../src/features/pt-hub/types.ts)                                                                                                               | Document PTSubscriptionSummary as non-authoritative compatibility data.                                                           |
| [src/pages/pt/onboarding-workspace.tsx](../src/pages/pt/onboarding-workspace.tsx)                                                                                             | Supply QueryClient to workspace creation.                                                                                         |
| [src/pages/pt-hub/workspaces.tsx](../src/pages/pt-hub/workspaces.tsx)                                                                                                         | Supply QueryClient to workspace creation.                                                                                         |
| [src/components/layouts/pt-layout.tsx](../src/components/layouts/pt-layout.tsx)                                                                                               | Supply QueryClient to workspace creation.                                                                                         |
| [src/pages/pt-hub/settings/tabs/billing.tsx](../src/pages/pt-hub/settings/tabs/billing.tsx)                                                                                   | Canonical subscription status/dates/intent, accessible loading/errors, existing layout and placeholders retained.                 |
| [tests/unit/account-entitlements-contract.test.ts](../tests/unit/account-entitlements-contract.test.ts)                                                                       | Runtime payload/status/date/limit/feature validation and typed API errors.                                                        |
| [tests/unit/account-entitlements-sql-contract.test.ts](../tests/unit/account-entitlements-sql-contract.test.ts)                                                               | Migration structure, grants, immutability, indexes, seed/backfill and non-destructive scope.                                      |
| [tests/unit/account-entitlements-auth-isolation.test.ts](../tests/unit/account-entitlements-auth-isolation.test.ts)                                                           | Auth boundaries, non-fatal persistence, retry/normalization, cache invalidation and preserved newer intent.                       |
| [tests/unit/pt-hub-billing-entitlements-contract.test.ts](../tests/unit/pt-hub-billing-entitlements-contract.test.ts)                                                         | Canonical Billing source, exact copy, retained placeholders and disabled controls.                                                |
| [tests/e2e/account-entitlements.spec.ts](../tests/e2e/account-entitlements.spec.ts)                                                                                           | Three parallel cases: trial/intent UI, complimentary UI, concurrent first-workspace inserts.                                      |
| [tests/e2e/utils/account-entitlement-seeds.ts](../tests/e2e/utils/account-entitlement-seeds.ts)                                                                               | Local-only fixtures with run/worker/test identities and no shared trigger manipulation.                                           |
| [tests/e2e/utils/auth-seeds.ts](../tests/e2e/utils/auth-seeds.ts)                                                                                                             | Export the existing ensureUser and pgQuery helpers for reuse; their behavior is unchanged.                                        |
| [docs/account-subscription-entitlements.md](../docs/account-subscription-entitlements.md)                                                                                     | Architecture, schema, lifecycle, permissions, compatibility, non-goals, dependencies and rollback.                                |
| [docs/commercial-catalogue.md](../docs/commercial-catalogue.md)                                                                                                               | A link to the new foundation document; PR-PRICE-01 history retained.                                                              |
| [docs/pr-price-02-verification.md](../docs/pr-price-02-verification.md)                                                                                                       | This baseline, command, comparison and delivery record.                                                                           |

## Auth and migration scope proof

`git diff --name-only` returned no changes for AuthProvider, ThemeProvider, BootstrapGate, main.tsx, root routes, playwright.config.ts, auth-fixtures.ts, server-readiness.ts, the PR-PRICE-01 migration, or any commercial-catalogue TypeScript file. No historical migration was edited and no remote Supabase command ran.

The application and test code was unchanged between the two passing release runs. Only this delivery documentation was finalized afterward. Rollback remains an application revert plus a future reviewed compensating migration preserving commercial history. The retained baseline unit failures are the only known non-green check in the requested scope.

## Evidence locations

Machine-readable baseline, final and comparison JSON and command logs are retained under `C:/Users/ahmed/.codex/attachments/` with prefix `pr-price-02-`. The comparison is `pr-price-02-unit-comparison.json`; the consecutive successful gate logs are `pr-price-02-release-2.log` and `pr-price-02-release-3.log`. Inspected Billing screenshots are retained in `pr-price-02-evidence/trial-billing.png` and `pr-price-02-evidence/complimentary-billing.png`.

No provider/payment integration, paid-subscription creation flow, checkout, paywall, feature/capacity enforcement, or automatic conversion is claimed. PR-PRICE-03 still needs reviewed capacity definitions, aggregation/reservation concurrency and enforcement scope using the billing-account boundary.
