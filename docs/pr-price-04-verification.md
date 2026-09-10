# PR-PRICE-04 verification

## Verdict and base

Implementation is on `feat/pr-price-04-atomic-capacity-enforcement`, based on merged-main `b424451` after fetching and fast-forwarding main. PR-PRICE-02 and PR-PRICE-03 are present. No remote Supabase operation, commit, push, checkout/payment integration, or automatic remediation was performed.

Implemented and locally verified: the final two release checks passed consecutively on unchanged implementation/test code, with four workers and zero retries. The full unit suite retains the exact pre-existing failure set; it is not green.

## Commands and evidence

All commands ran locally with the existing four-worker, zero-retry browser configuration (a one-test focused selection naturally used only one worker). No timeout, retry, worker-count, auth readiness, or global provider change was made.

| Command                                                                     | Actual result                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin`, `git switch main`, `git pull --ff-only origin main`     | Passed; clean base b424451                                                                                                      |
| Baseline `npm run test:unit`                                                | 1,394 passed; 13 failed; 1,407 total; 232 passing files, 9 failing files; zero skipped                                          |
| `npm run supabase:start`                                                    | Passed, local services running                                                                                                  |
| `npm run supabase:db:reset`                                                 | Passed, all migrations including the single new migration applied                                                               |
| `npm run supabase:db:lint`                                                  | Passed                                                                                                                          |
| `npm run supabase:db:test` immediately after reset                          | Passed: 399 assertions in 9 files, including 74 new enforcement assertions                                                      |
| Focused mutation, notice, SQL-contract, auth-isolation unit/component tests | Passed: 49 tests in 4 files                                                                                                     |
| Final `npm run test:unit`                                                   | 1,433 passed; same 13 failed; 1,446 total; 235 passing files, same 9 failing files; zero skipped                                |
| Focused browser suite                                                       | All 18 focused cases passed within each final full release run; earlier focused runs and fixture corrections are recorded below |
| Original auth pair, four workers and zero retries                           | Passed twice each: 4 executions in 47.9 seconds                                                                                 |
| Final `npm run lint`, `npm run format`, `npm run build`                     | Passed in both final release runs; lint has zero errors and three inherited warnings                                            |
| `npm run verify:release` first final run                                    | Passed (exit 0): 67 browser tests passed, 10 inherited skips, zero failures; browser phase 3.3 minutes                          |
| `npm run verify:release` second consecutive final run                       | Passed (exit 0): 67 browser tests passed, same 10 inherited skips, zero failures; browser phase 3.1 minutes                     |
| `git diff --check` and `git status --short`                                 | Passed/read after implementation; expected 35 changed/new files, one new migration, no historical migration edits               |

The original auth command was:

```powershell
npm run test:e2e -- tests/e2e/auth-onboarding.smoke.spec.ts tests/e2e/auth-resilience.spec.ts --grep "PT with workspace can sign in and reach PT Hub|client session can recover after local session loss" --repeat-each=2 --workers=4 --retries=0
```

The full unit logs were compared by exact file/suite/test identity, not just counts: the 13-item sets are equal. This adds 39 passing tests without introducing a failure or skip.

## Exact inherited unit failures

- `tests/unit/anatomical-muscle-selector.test.ts > controlled anatomical selector source contract > emits only MuscleKey values from map and list, and null from Clear`
- `tests/unit/anatomical-muscle-selector.test.ts > controlled anatomical selector source contract > uses selector-local theme tokens without a selected glow`
- `tests/unit/checkin-assignment-summary-contract.test.ts > coach check-in assignment summary contract > renders a current check-in assignment summary in the coach delivery context`
- `tests/unit/checkin-assignment-summary-contract.test.ts > coach check-in assignment summary contract > gates the edit CTA to existing delivery-write permission`
- `tests/unit/client-continuity-contract.test.ts > client continuity beta contract > removed-only clients get a safe no-active-workspace home state`
- `tests/unit/client-detail-assignment-card-polish.test.ts > client detail assignment card polish > surfaces snapshot copy near workout, program, and nutrition assignment controls`
- `tests/unit/client-detail-assignment-card-polish.test.ts > client detail assignment card polish > uses cadence settings language for check-in assignment cards`
- `tests/unit/client-portal-tag-minimization.test.ts > client portal tag minimization > uses client-facing copy for missing workout, nutrition, and check-in assignments`
- `tests/unit/client-portal-tag-minimization.test.ts > client portal tag minimization > keeps today's actions ahead of the weekly calendar and daily log`
- `tests/unit/final-badge-status-regression.test.ts > final badge and status regression > keeps client-facing task statuses and no-assignment copy visible`
- `tests/unit/notification-center-contract.test.ts > delivery-backed notification center contract > keeps the PT notifications page concise`
- `tests/unit/pt-client-baseline-marker-assignment-wiring.test.ts > PT performance marker baseline wiring > makes the client baseline page use the active marker library directly`
- `tests/unit/workspace-header-pill-wiring.test.ts > workspace header pill wiring > uses the unified full-height rail and compact utility dock across PT routes`

## Verification iterations

The initial full smoke run had 60 passing tests, 3 failures, and the 10 already-existing skips. The failures were obsolete PR-PRICE-02/03 expectations that a second trial workspace succeeds; tests now assert admission denial while preserving their metering, trial uniqueness, privacy, and other original assertions. The historical beta-overage fixture is explicitly constructed with connection-local administrative trigger suppression inside its fixture transaction. Runtime callers cannot set replication role.

An expanded focused browser run had 12 passes and 4 bootstrap timeouts. Traces showed successful membership responses arriving after the unchanged 10-second deadline. The next run had 14 passes and 2 new-test failures: an ambiguous alert locator and an assertion before the invite response. The tests now select the specific capacity alert and await the mutation response. No timeout increase, retry, test skip, or auth-code change was used. Additional lifecycle and pending-seat tests initially exposed test-only label/access-mode/token fixture mistakes; these were corrected against the existing UI/database contracts. The expanded run then passed 17 cases with only the invalid-token fixture remaining.

Database tests must run against the clean reset before browser data is added. Existing PR-PRICE-03 assertions count global history rows; running that suite after browser fixtures gives unrelated extra-history failures. The complete suite passed immediately after reset with all original checks retained. Existing historical-overage SQL fixtures disable only the new triggers within their rolled-back test transactions. Other old multi-workspace fixtures use the existing Scale complimentary plan to represent their intended domain setup.

The first complete release attempt passed lint (three inherited warnings), formatting and build, then had 66 browser passes, 10 inherited skips and one new-test timing failure in 6.3 minutes. The team-capacity alert eventually showed the expected private text, but the test asserted before the mutation response finished. It now awaits that response and verifies HTTP 400 before asserting the alert; all existing timeouts remain unchanged. This failed attempt does not count toward the required consecutive passes.

Two subsequent full release attempts failed for local runtime reasons: one had 59 passes, 8 failures and 10 existing skips after PostgreSQL exited/recovered (server process exit code 2 at 10:24:55 UTC; accepting connections again at 10:25:32). The next had 63 passes, 4 Auth-timeout failures and the same 10 skips. Traces showed HTTP 504 from Auth while connecting to PostgreSQL; Windows had about 150 MB of free physical RAM. No container OOM kill was recorded. For final verification, only this project's optional Studio, Analytics and Vector containers were temporarily stopped to free memory. Database, Auth, REST, gateway, pg-meta, realtime, storage and mail services remained available. These three containers were restored after verification; no configuration file or test setting was changed. With explicit user authorization, the running open-wearables frontend, backend and svix containers were also temporarily stopped and then restored. All six received successful Docker start requests with their original configuration. Studio, Analytics and the open-wearables frontend were running on readback. Vector restarted because its configured Docker logging endpoint at host.docker.internal:2375 refused connections. The open-wearables backend and Svix restarted because their existing database host could not resolve; identical errors are present in their logs before the pause (10:00 UTC). Their configuration was not altered, and no Docker TCP listener was enabled. The final passing runs used this reduced background load; this is a local resource limitation, not a production-load guarantee.

## Complete release-attempt record

Logs remain in `%TEMP%/pr-price-04-release-*.log`. No failing attempt is counted as a passing run.

| Log suffix | Browser result                                             | Outcome or correction                                                                                                             |
| ---------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `1`        | 66 passed, 1 failed, 10 existing skips; 6.3m               | New team test asserted before the response; now explicitly awaits HTTP 400 and completion                                         |
| `final-a`  | 59 passed, 8 failed, 10 existing skips; 4.6m               | Local PostgreSQL exited/recovered and rejected connections                                                                        |
| `final-b`  | 63 passed, 4 failed, 10 existing skips; 4.8m               | Auth returned 504 during database connection attempts under memory pressure                                                       |
| `final-c`  | 66 passed, 1 failed, 10 existing skips; 4.2m               | Workspace selector matched transient lowercase empty-state action, not permanent `Create Space` header action; selector corrected |
| `final-d`  | 63 passed, 4 failed, 10 existing skips; 4.8m               | Startup/metadata timeouts, including an existing entitlement test; user authorized pausing open-wearables                         |
| `final-e`  | Browser phase not run                                      | Prettier caught final selector wrapping; formatted without behavioral change                                                      |
| `final-f`  | 66 passed, 1 failed, 10 existing skips; 3.7m               | Unchanged public-marketing heading assertion missed its existing five-second deadline; no test or timeout change made             |
| `final-g`  | **67 passed, zero failures, 10 existing skips; 3.3m**      | **First final passing release run, exit 0**                                                                                       |
| `final-h`  | **67 passed, zero failures, same 10 existing skips; 3.1m** | **Second consecutive passing release run, exit 0; no intervening code/test edits**                                                |

Lint, format and build passed in both final runs. The three lint warnings are inherited: fast-refresh exports in client profile inputs, effect dependencies in client messages, and a workoutId effect dependency in client workout-run. The verification document alone was finalized after the consecutive runs, then formatting and diff checks were rerun. No new assertion was skipped, no browser test was serialized, and no worker/retry/timeout setting changed.

## Coverage and limits

The database suite proves first-workspace trial admission/rollback, all four dimensions, lifecycle and relationship transitions, generic-link acceptance, pending-to-active exact-limit seats, source preservation on denied transfer, two-dimension lead atomicity, direct-write ACLs, injected domain/consumption rollback, and non-full access modes. Browser coverage exercises retained owner/team forms, client disclosure, package APIs, lead outcomes, and concurrent final-slot races. Client races use separate invite rows to test the shared account boundary.

Local EXPLAIN evidence uses 10,001 auth users and 50 email-hashed holds. Full transfer and lead RPCs measured 206.929 ms and 585.653 ms; admission probes ranged from 11.280 to 158.600 ms. These are local measurements, not production load guarantees. One hash-resolution population scan remains. No new index or mutable counter is shipped.

An unlimited-workspace contract is not exercised because the existing workspace plan ceiling is non-null. Browser coverage includes completed-client lifecycle denial and pending-seat acceptance at exact capacity; the broader transition matrix is exercised in SQL. Opposite-direction transfer concurrency is not separately load-tested. New workspace/package submissions create new operations under their existing API contracts; already-converted lead and existing-client retries remain idempotent. Expired team invitations cannot resurrect commitments by resend; revoke and create a fresh invitation.

See [enforcement design and mutation audit](account-capacity-enforcement.md) and [query-plan evidence](account-capacity-enforcement-query-plans.md). Rollback needs an application revert and reviewed compensating forward migration for functions, grants, and guards together; preserve existing commercial/reservation/event history. No remote deployment or rollback was attempted.

## File-by-file changes

- `docs/account-capacity-enforcement.md`: Design, entry-point audit, mutation matrix, invariants, privacy, rollout and deferred work.
- `docs/account-capacity-enforcement-query-plans.md`: Measured plans and scaling limitations.
- `docs/account-capacity-enforcement-query-plans.sql`: Reproducible local rolled-back large fixture.
- `docs/pr-price-04-verification.md`: This exact verification and baseline record.
- `docs/account-capacity-metering.md`: Narrow forward link only.
- `docs/account-capacity-query-plans.md`: Narrow forward link only.
- `src/features/account-capacity/mutation-errors.ts`: Exact structured error parser, audience copy and invalidation.
- `src/features/account-capacity/mutation-feedback.tsx`: Local feedback state and sanitized existing Sentry tags.
- `src/features/account-capacity/mutation-notice.tsx`: Accessible owner/team/client notice; owner-only snapshot and Billing link.
- `src/features/account-capacity/index.ts`: Exports mutation error helpers.
- `src/features/pt-hub/lib/pt-hub.ts`: Package write RPCs and mutation error normalization.
- `src/features/pt-hub/components/pt-hub-package-manager.tsx`: Retained editor and local owner denial notice.
- `src/features/workspace-team/invite-api.ts`: Map capacity errors without replacing domain errors.
- `src/features/workspace-team/team-settings.ts`: Map member mutation capacity errors.
- `src/components/layouts/pt-layout.tsx`: Workspace-create denial feedback.
- `src/pages/pt-hub/workspaces.tsx`: Workspace-create retained form and owner notice.
- `src/pages/pt/onboarding-workspace.tsx`: First-workspace denial feedback.
- `src/pages/pt-hub/lead-detail.tsx`: Lead approval denial notice.
- `src/pages/pt/client-detail.tsx`: Lifecycle/reactivation/transfer feedback; target-owner disclosure.
- `src/pages/public/join.tsx`: Replace direct client creation and separate consume with atomic accept RPC.
- `src/pages/public/invite.tsx`: Private client capacity denial and invalidation.
- `src/pages/public/team-invite-acceptance.tsx`: Private team capacity denial and invalidation.
- `src/pages/workspace/settings/tabs/team.tsx`: Invite/member denial notices with retained form state.
- `supabase/migrations/20260910160000_atomic_capacity_enforcement.sql`: One forward migration: private transaction provenance, batched canonical resolution, admission/consume guards, preserved domain RPCs, package RPCs and ACLs.
- `supabase/tests/account_capacity_enforcement.sql`: 74 new database assertions.
- `supabase/tests/account_capacity.sql`: Historical fixture setup and admission-aware workspace outcome; original metering checks retained.
- `supabase/tests/account_entitlements.sql`: Historical fixture isolation and reuse first trial workspace; original entitlement checks retained.
- `supabase/tests/archived_reinvite_reactivation.sql`: Existing complimentary Scale fixture for multi-workspace domain test.
- `supabase/tests/workout_template_exercise_persistence.sql`: Existing complimentary Scale fixture for multi-seat domain test.
- `tests/e2e/account-capacity-enforcement.spec.ts`: New denial/privacy, publication, lead and final-slot concurrency browser tests.
- `tests/e2e/account-capacity.spec.ts`: Admission-aware prior capacity expectations and explicit historical overage fixture.
- `tests/e2e/account-entitlements.spec.ts`: Concurrent first workspace expects one success, preserving single-trial assertions.
- `tests/unit/account-capacity-enforcement-sql.test.ts`: SQL invariant and protected-entry-point contracts.
- `tests/unit/account-capacity-mutation.test.ts`: Structured errors, privacy, invalidation and integration contracts.
- `tests/unit/account-capacity-notice.test.ts`: Rendered owner/team/client disclosure tests.
