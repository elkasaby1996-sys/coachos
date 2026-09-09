# PR-AUTH-GATE-01 — Parallel auth gate

Status: the default four-worker release gate passed twice consecutively.
The full unit suite remains red with 13 failures reproduced exactly on the base;
this is an auth-gate pass, not a claim that every repository check is green.

## Scope and provenance

The auth stabilization is on `codex/auth-gate-01`, separate from the commercial
catalogue change. PR-PRICE-02 has not been started.

- Base: `fd7a0f376c300e2d788660cbb7d01d3451a071d0`.
- PR-PRICE-01: `cc02ca3a1900362d87a71ddf1e840779f2624bb9`.
- Node `22.20.0`, npm `11.12.0`, Playwright `1.59.1`, Chromium `147.0.7727.15`.
- Both detached comparison worktrees have clean installs, identical lockfiles
  and identical local environment files. `environment.json` records their hashes.
- Each run resets local Supabase, then runs `npm run verify:release` with four
  workers. Worktrees run sequentially. Port 4173 must be free before and after
  each run; Playwright starts and stops its own Vite process.

Sanitized logs, reports, traces, screenshots, videos and diagnostic attachments
are retained under the task attachment directory:
`C:/Users/ahmed/.codex/attachments/83c19a46-f3a9-487d-bc2b-a6d26ab04ff5/auth-gate`.
Each run has its own directory. `run.py` records the command and duration, archives
artifacts, and redacts credentials, JWTs, authorization headers and cookies,
including nested trace ZIPs and the HTML report's embedded data.

## Originally reported failures

| File                                      | Exact test title                                                            | Blocked step                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tests/e2e/auth-onboarding.smoke.spec.ts` | Smoke: auth and onboarding > PT with workspace can sign in and reach PT Hub | Login helper waits for the form on `/login`, then reloads and fails.      |
| `tests/e2e/auth-resilience.spec.ts`       | Auth resilience > client session can recover after local session loss       | Bootstrap marker or return navigation to `/app/home` never becomes ready. |

## Evidence and mechanism

The reported auth pair is classified **BASELINE_FLAKE**: both tests failed in
every full run on both commits, with the same login/bootstrap signatures.

The focused comparison used the two auth tests plus the product chapter test,
each repeated three times with four workers. Base finished 6 passed / 3 failed;
pricing finished 5 passed / 4 failed. On each commit the auth subset had exactly
3 passes and 3 failures (two PT repetitions and one resilience repetition failed
at bootstrap). The extra pricing failure was the product readiness assertion.

| Commit  | Run | Passed | Existing skips | Failed | Gate duration |
| ------- | --- | -----: | -------------: | -----: | ------------: |
| Base    | 1   |     44 |             10 |      2 |      289.94 s |
| Base    | 2   |     43 |             10 |      3 |      243.98 s |
| Base    | 3   |     43 |             10 |      3 |      256.40 s |
| Pricing | 1   |     43 |             10 |      4 |      294.03 s |
| Pricing | 2   |     45 |             10 |      2 |      231.08 s |
| Pricing | 3   |     43 |             10 |      4 |      263.77 s |

All six commands were `npm run verify:release`, exited 1, and ran four workers
without retries. Lint, formatting and build passed in each run. Base contains 56
browser tests; pricing contains 57 because it adds a commercial-copy test.

Additional failures were recorded explicitly:

- The incomplete-profile PT test failed in base runs 2–3 and pricing runs 1 and
  3, with the same bootstrap/login signatures.
- Pricing run 1's product-page chapter-count assertion timed out after five
  seconds. Its failure snapshot already contained the expected navigation.
  The assertion that failed is unchanged; pricing only changed a later trial
  label assertion. All three subsequent focused baseline repetitions passed.
- Pricing run 3's unauthenticated guard test reached `/login`, then timed out
  after five seconds waiting for the sign-in button. This unchanged test passed
  in the three full baseline runs.

The two isolated visibility/count failures above are tracked separately from the
confirmed baseline auth pair; the matrix alone does not establish their
attribution. Their assertions and unrelated product behavior remain unchanged.

The diagnostic pricing stress run repeated the two tests three times with four
workers: one passed and five failed. A seed failed with PostgreSQL `23505` on the
shared client primary key. Other failures ended on `/login` or `/`, with a valid
session but unresolved bootstrap. The served trial-plan module matched the
pricing commit. There were no uncaught page errors or persistent redirect loops
in the captured diagnostics; several navigations were initiated by the helper's
retry/reload loop.

The first baseline release run reproduced both original signatures: PT login form
not ready and resilience waiting for `bootstrap-resolved`. Its browser trace
contains a workspace lookup timeout after three seconds, followed by successful
responses that arrive too late to update the bootstrap state. The second baseline
run also reproduced the shared client-ID collision.

Three interacting defects are supported by the evidence:

1. Auth files share four mutable users and fixed workspace/client/invite IDs.
   Each seed resets all four users and deletes/recreates their records. Separate
   Playwright contexts isolate cookies and localStorage, but not these database
   mutations. Parallel seeds can collide or mutate another test's account.
2. Appearance loading calls `auth.getUser()` on startup and auth changes. In the
   installed Supabase client, this holds the auth lock across a network request;
   bootstrap's authenticated database fetch awaits `auth.getSession()` behind
   that lock. Baseline traces show user validation and workspace responses
   exceeding the three-second lookup deadline under parallel load. Appearance
   is optional and does not need this separate identity validation request.
3. The login helper polls for ten seconds and retries navigation after a
   five-second sign-in wait. Traces show these reloads interrupting ongoing auth
   work. After a bootstrap error, login/root routes can show loading or marketing
   indefinitely instead of exposing recovery.

Resource pressure amplifies the timing defects: the diagnostic run recorded
about 252 MiB of free physical memory on an 8 GiB machine. This is not evidence
for serializing tests. After fixing isolation/readiness and the redundant user
fetch, a focused check passed 15 of 16 cases. The remaining case received a
successful membership response after 5.3 seconds, without a `getUser()` request,
but the three-second lookup cutoff had already rejected it. Only this per-query
bootstrap deadline was raised to ten seconds. Global test deadlines and all
existing readiness/destination assertions remain unchanged. A later focused
run exposed an auth-server 504: the server log confirms a ten-second processing
deadline exceeded while finding the user. Existing worker-owned users now reuse
their credentials instead of rehashing four passwords on every reseed. The next
focused run passed all 16 cases with four workers.

Longer stress still exposed cold Vite route-module waterfalls: successful module
requests took 7–8 seconds each while four browsers, password authentication and
database work competed for resources. A WebGL performance-caveat fallback alone did not resolve the failures.
It is retained alongside the startup fixes: a direct browser check confirmed
that this host rejects the software context when the flag is enabled. The retained fix adds
an owned-server startup preflight: it awaits the actual login form and imports
the initial PT/client destination modules and public product module in a
disposable unauthenticated context before launching the four test workers.
The browser stores no session state and does not mount protected pages.
This addresses dev-server compilation readiness; it does not extend any test
assertion deadline. Vite documents the underlying
[transform waterfall behavior](https://vite.dev/guide/performance.html#warm-up-frequently-used-files).

The next check reproduced two auth HTTP 504 responses at about eleven seconds.
Startup setup now provisions the four parallel slots' credentials before browser
work begins, avoiding password-hash creation competing with sign-in. Each run
has a fresh UUID namespace; every slot has distinct users and database keys.
Playwright replacement workers reuse their non-overlapping slot and reseed its
records. Normal test setup still resets mutable scenario state per test, while
existing credentials are reused unchanged.

An instrumented rerun passed all 16 focused cases. Its 26 database-activity
samples found no lock blockers or lock waits, while host CPU reached 100%.
The unrelated open-wearables stack included restarting backend services. With
the user's explicit approval, its three active containers were stopped for
final verification, with their prior states recorded for restoration. The
six-run attribution matrix above was completed before this environment change;
none of those results are substituted with results from the quieter host.
`resource-observation.json` and `database-waits.jsonl` retain the measurements.

PT background rendering now requests `failIfMajorPerformanceCaveat: true`,
using its existing ambient fallback on constrained graphics devices. The
full-screen shader previously continued drawing during subsequent concurrent
sign-ins; retaining the fallback addresses this additional resource load.
No test-specific browser detection or reduced-motion override is used.

## Changes

| File                                        | Change and purpose                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/utils/auth-fixtures.ts`          | Generates all mutable fixture identities from a worker namespace.                                                                             |
| `tests/e2e/utils/auth-seeds.ts`             | Uses a fresh run namespace and distinct parallel slots; removes the shared-create retry sleep and password rehashing on reseeds.              |
| `tests/e2e/utils/test-helpers.ts`           | Uses locator readiness and explicit session/bootstrap assertions; removes reload loops and early success returns from sign-in.                |
| `tests/unit/auth-smoke-fixtures.test.ts`    | Checks stable reseeds, disjoint mutable keys across workers/runs, and valid UUID/email shapes.                                                |
| `src/components/common/theme-provider.tsx`  | Uses the auth event's user ID for the optional RLS-protected appearance query, avoiding redundant `getUser()` calls.                          |
| `src/lib/auth.tsx`                          | Converts unexpected bootstrap rejection into an explicit error state and gives each authenticated lookup a measured ten-second deadline.      |
| `src/components/common/bootstrap-gate.tsx`  | Shows an accessible error and user-triggered retry when bootstrap fails.                                                                      |
| `src/routes/app.tsx`                        | Applies error recovery to login/root routes and shows loading while an authenticated root awaits bootstrap.                                   |
| `tests/e2e/auth-bootstrap-recovery.spec.ts` | Injects bootstrap and appearance failures and verifies recovery/independence with real local auth.                                            |
| `playwright.config.ts`                      | Fixes four workers and zero retries, rejects server reuse, requires the exact port, and makes the release smoke command own its local server. |
| `tests/e2e/utils/server-readiness.ts`       | Provisions slot credentials before browser work, awaits login readiness and initial route-module compilation, then closes its browser.        |

The PT animated-background component also rejects major WebGL performance
caveats, preserving its existing fallback and normal hardware rendering.

The UI uses existing theme tokens and the shared Button. The mandatory
`ui-ux-pro-max` design-system and UX error-recovery lookups were run before this
change. Commercial catalogue files and migration behavior are unchanged.

The auth/marketing BloomField also limits its slow decorative gradient
repaints to 24 frames per second. Its elapsed-time animation, gradient colors,
motion amplitude, hidden-page behavior and reduced-motion fallback are retained.
This reduces continuous full-screen paint work during concurrent authentication.
The required UI skill's design-system and performance lookups were run first.

## Verification

All commands below were actually run locally. The final browser runs use four
workers and zero retries. Their ten skips are pre-existing credential-dependent
cases; neither originally failing auth test is skipped. No assertions were
deleted or weakened. Two temporary UI-QA screenshot calls were removed from the
new recovery test's timed path; automatic failure screenshots, traces and videos
remain enabled. Desktop/mobile recovery captures from prior runs are retained.

| Command                            | Result                                                      | Duration |
| ---------------------------------- | ----------------------------------------------------------- | -------: |
| npm run supabase:db:reset          | PASS                                                        |  73.03 s |
| Focused auth files, repeat-each=2  | 16 passed                                                   | 130.10 s |
| Original auth pair, repeat-each=10 | 20 passed                                                   | 191.93 s |
| npm run lint                       | PASS; 0 errors, 3 existing warnings                         |  30.29 s |
| npm run format                     | PASS                                                        |  21.74 s |
| npm run build                      | PASS                                                        |  66.85 s |
| npm run test:unit                  | 1300 passed / 13 failed; 224 passing / 9 failing files      |  31.55 s |
| npm run test:unit on BASE_SHA      | 1260 passed / same 13 failed; 220 passing / 9 failing files |  34.07 s |
| npm run supabase:db:lint           | PASS                                                        |   6.11 s |
| npm run supabase:db:test           | 123 passed across 6 files                                   |   8.73 s |
| npm run verify:release             | 49 passed / 10 existing skips / 0 failed                    | 250.53 s |
| npm run verify:release             | 49 passed / 10 existing skips / 0 failed                    | 245.25 s |

The first post-fix full attempt (`fixed-v12-release-1`) was not green: it had
48 passes, ten existing skips and a failure in the new bootstrap-recovery test.
Both original auth tests passed. The retry's successful membership response took
16 seconds while the test forced two screenshot readbacks. The extra captures
were removed before the final consecutive full runs; no recovery assertion or
bootstrap deadline was relaxed.

`fixed-v13-release-1` also had 48 passes, ten existing skips and one failure:
the original PT test received an auth HTTP 504 at 10.6 seconds. The subsequent
change limits BloomField's decorative repaint cadence to reduce concurrent
rendering pressure. This failed run is not counted as a pass.

Earlier investigation attempts are retained under their distinct `fixed-*`
directories, including selector correction, injected-status adjustment, cold
module loading and resource-pressure experiments. Failed attempts are not counted
as verification passes. After the final runs, `git diff --check` passed and the
credential-redaction audit checked 30,824 files/archive entries with no findings.
The exact audit result is retained in `redaction-audit.json`. Both comparison
worktrees remain clean, and port 4173 is free.

### Independently reproduced unit failures

The following exact failures occur on both the untouched base and the fixed
branch. `unit-baseline-comparison.json` records set equality with no new failures.
Their product files and tests remain unchanged.

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

## Disposition and limits

- Attribution for the original pair: **BASELINE_FLAKE**, proved by all six
  controlled full gates and the focused A/B stress. No causal pricing regression
  was found for that pair. The additional isolated product/guard readiness events
  retain the qualified attribution stated above.
- PR-PRICE-01's commercial catalogue behavior, callback changes and migrations
  were not rewritten. Auth stabilization remains on `codex/auth-gate-01`.
- The original auth release blocker is cleared by two consecutive default gate
  passes. The independently reproduced unit failures still need separate triage
  before declaring the repository fully green or giving unconditional release
  approval.
- PR-PRICE-02 can begin from the stabilized state after this auth change is
  integrated. It has not been started here. Beginning development does not waive
  the outstanding baseline unit failures.
- No remote Supabase operation ran. No broad retry, suite serialization, global
  timeout increase, arbitrary test sleep or arbitrary server reuse was added.
- Final verification used the user's approved temporary pause of three unrelated
  open-wearables containers. They are restored afterward; the pre-existing Vite
  server on port 5173 is untouched. Port 4173 is owned and released by Playwright.
- Retained evidence is sanitized by `run.py` and checked by `audit.py`.

The new source files are `auth-fixtures.ts`, `server-readiness.ts`,
`auth-smoke-fixtures.test.ts`, `auth-bootstrap-recovery.spec.ts` and this report.
The PT background's small context-creation change is in
`src/features/pt-hub/components/pt-hub-animated-background.tsx`; all other
file-by-file changes are listed above, plus the repaint budget in
`src/pages/public/bloom-field.tsx`.
