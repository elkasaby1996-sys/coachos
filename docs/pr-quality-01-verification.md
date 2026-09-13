# PR-QUALITY-01 verification

**Local commercial certification gates are green. Phase B remains unauthorized and staging billing is not certified.** The complete unit suite has 1,855 passes, zero failures and zero skips. Two consecutive unmodified `npm run verify:release` commands exited 0 with four workers, zero retries and the same ten existing browser skips.

## Base, branch and evidence

Work began after PR #197 (PR-PRICE-11 Phase A) was reviewed, merged and green in GitHub CI/CodeQL. The base is `1b95cb34835dd0021f4af8d739998cb4478e55f2`; branch: `fix/pr-quality-01-commercial-certification-gates`. The clean Phase A parent comparison used `7692f4fbc8a47a3f5a9e04a5328c3d716511ffc7` with its own installed dependencies.

Final implementation/test commit: `553eab0c5ca46a3b3e0e143cc349b3b2b07b714c`. Both release runs began and ended on that commit with a clean tracked tree. The subsequent documentation commit changes only documentation; the source objects below bind the tested implementation and tests independently of that documentation commit.

- [Exact unit triage](evidence/pr-quality-01-unit-triage.json): file, suite, full original name, assertion message, source, history and decision before editing.
- [Historical browser triage](evidence/pr-quality-01-browser-triage.json): every original occurrence and its evidence, with new diagnoses kept separate.
- [Observed browser comparison](evidence/pr-quality-01-browser-comparison.json): every completed parent/candidate/release run, including red results and diagnostic reruns.
- [Final gate evidence](evidence/pr-quality-01-final-gates.json): command exits, unit-report hash, frozen objects, release pair and harness results.

Full raw reporters, traces, screenshots, request timelines and container logs remain private under ignored `output/staging-commercial/quality-01/<run-label>`. They are debugging artifacts, not staging certification evidence. Original PR-PRICE-11 evidence JSON and red logs were preserved. Existing root browser reports were archived before the default release command could replace them. Generated diagnostic JavaScript and the preserved Vite cache were archived/relocated under the already-ignored dependency cache; lint rules were not changed.

## Exact unit failures and corrections

Baseline: 257 files, 1,855 tests, 1,842 passed, 13 failed, zero skipped, exit 1. Each failure was opened alongside its asserted production source and the deliberate replacement in merged PR #180 (`ba87500028ba82a4c83872ebd259992d6a506be0`). Supporting approved product evidence includes [portal review F05, F10 and F16](reviews/client-portal-2026-09-08/implementation.md). All 13 are STALE_TEST_CONTRACT; this classification was recorded before editing, not inferred merely because the assertions failed.

| ID  | Original full test name                                                                                                | Classification      |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------- |
| U01 | controlled anatomical selector source contract emits only MuscleKey values from map and list, and null from Clear      | STALE_TEST_CONTRACT |
| U02 | controlled anatomical selector source contract uses selector-local theme tokens without a selected glow                | STALE_TEST_CONTRACT |
| U03 | coach check-in assignment summary contract renders a current check-in assignment summary in the coach delivery context | STALE_TEST_CONTRACT |
| U04 | coach check-in assignment summary contract gates the edit CTA to existing delivery-write permission                    | STALE_TEST_CONTRACT |
| U05 | client continuity beta contract removed-only clients get a safe no-active-workspace home state                         | STALE_TEST_CONTRACT |
| U06 | client detail assignment card polish surfaces snapshot copy near workout, program, and nutrition assignment controls   | STALE_TEST_CONTRACT |
| U07 | client detail assignment card polish uses cadence settings language for check-in assignment cards                      | STALE_TEST_CONTRACT |
| U08 | client portal tag minimization uses client-facing copy for missing workout, nutrition, and check-in assignments        | STALE_TEST_CONTRACT |
| U09 | client portal tag minimization keeps today's actions ahead of the weekly calendar and daily log                        | STALE_TEST_CONTRACT |
| U10 | final badge and status regression keeps client-facing task statuses and no-assignment copy visible                     | STALE_TEST_CONTRACT |
| U11 | delivery-backed notification center contract keeps the PT notifications page concise                                   | STALE_TEST_CONTRACT |
| U12 | PT performance marker baseline wiring makes the client baseline page use the active marker library directly            | STALE_TEST_CONTRACT |
| U13 | workspace header pill wiring uses the unified full-height rail and compact utility dock across PT routes               | STALE_TEST_CONTRACT |

The exact superseding source and narrow replacement for every row are recorded in the triage ledger and file table below. Two obsolete test titles were renamed to describe their current contracts; the original identities remain in the ledger. Permission, snapshot, no-glow, ordering, membership and status assertions remain concrete. No production UI needed correction, so no UI implementation or design-system change was made.

Immediately after those nine unit-file corrections: 1,855 passed, zero failed/skipped, 257 files (23.01 seconds). The final frozen-candidate complete report also passed and was accepted by the existing Phase A unit validator.

## Exact historical browser failure set

The old runs contain 42 failing occurrences across these 26 exact titles. Their original evidence supports 6 FIXTURE_DEFECT occurrences and leaves 36 UNKNOWN. A later observed HTTP 504, delayed RPC or cache failure is not retroactive proof of an earlier timeout's cause. The per-occurrence locator/assertion and source run are retained in the historical ledger.

| ID  | Original full test name                                                                      | Original occurrence classifications |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| B01 | trial hosted checkout waits for verified confirmation                                        | 1 UNKNOWN                           |
| B02 | complimentary hosted checkout waits for verified confirmation                                | 1 UNKNOWN                           |
| B03 | unavailable provider retains selected plan and cadence                                       | 1 UNKNOWN, 1 FIXTURE_DEFECT         |
| B04 | return query is not payment proof                                                            | 1 UNKNOWN                           |
| B05 | double activation dispatches one Checkout request                                            | 1 FIXTURE_DEFECT                    |
| B06 | second tab reports an existing open Checkout                                                 | 1 FIXTURE_DEFECT, 1 UNKNOWN         |
| B07 | Growth purchase waits for payment, then reduction and cancellation retain the correct limits | 2 UNKNOWN                           |
| B08 | failed payment preserves seats and recovery completes the same purchase                      | 2 UNKNOWN                           |
| B09 | maximum seat purchase blocks an incompatible plan and committed-seat reduction               | 1 UNKNOWN                           |
| B10 | pending team commitments block reduction before provider mutation                            | 3 UNKNOWN                           |
| B11 | compatible plan upgrade retains purchased seats                                              | 3 UNKNOWN                           |
| B12 | renewal invoice is not upgrade payment proof                                                 | 2 UNKNOWN                           |
| B13 | Scale downgrade blocks commitments then schedules after remediation                          | 3 UNKNOWN                           |
| B14 | monthly to annual shows full annual amount                                                   | 1 UNKNOWN                           |
| B15 | higher tier and annual to monthly is unsupported                                             | 1 UNKNOWN                           |
| B16 | forged provider identifiers are rejected at browser boundary                                 | 1 UNKNOWN                           |
| B17 | canonical cancellation, resume and recovery update without new checkout                      | 3 FIXTURE_DEFECT                    |
| B18 | complimentary overage preserves access and unlimited packages                                | 1 UNKNOWN                           |
| B19 | Launch upgrade waits for verified updated invoice                                            | 2 UNKNOWN                           |
| B20 | portal return polls only within its bound and offers manual refresh                          | 2 UNKNOWN                           |
| B21 | grace preserves existing delivery and blocks business edits                                  | 1 UNKNOWN                           |
| B22 | read only permits browsing and denies direct mutation without data loss                      | 1 UNKNOWN                           |
| B23 | client list and lifecycle save persist through reload                                        | 2 UNKNOWN                           |
| B24 | unauthorized provider mapping remains manual review                                          | 1 UNKNOWN                           |
| B25 | failed payment preserves Launch and recovery completes                                       | 1 UNKNOWN                           |
| B26 | annual to monthly schedules and shows full monthly list price                                | 1 UNKNOWN                           |

Across the newly observed executed failures, classifications are 2 TEST_ISOLATION_DEFECT, 39 FIXTURE_DEFECT, 8 ENVIRONMENTAL_FLAKE, 4 UNKNOWN. These counts exclude setup failures that executed zero tests. No PRODUCT_REGRESSION was established. Four parent total-test-deadline occurrences remain UNKNOWN; they were not hidden, weakened or attributed to memory.

The evidence supports the following corrections:

- Successful sign-in responses took 15.012 and 18.238 seconds while the fixture had already started its 15-second rendered-session window. The helper now requires the successful token response first; real HTTP failures still fail.
- Checkout navigation/return, plan previews, seat actions, client summary reload and coaching-access reload asserted before their own canonical reads completed. Examples include 6.6–11.8 second plan previews, a 5.364 second client summary, a 9.522 second seat refresh and a 29.431 second seat apply. Exact commercial assertions remain intact.
- Portal and checkout test bodies changed fixture summaries or ended while routed reads were still active. Held commercial-access requests now release during failed teardown; route errors are not swallowed. Transport is drained between mutable summary transitions and before teardown where observed.
- The portal cutoff test recorded a request-count baseline before the final clock-dispatched refresh had emitted its requests. Unchanged-code timer diagnostics alone and in the recorded selection show the interval firing before the cutoff callback during the 31-second advance, then clearing with no further timer firing during the following 60 seconds. The fixture explicitly awaits that refresh's provider-summary, entitlement and capacity responses. The exact no-further-reads equality remains. Instrumented passing runs were diagnostic evidence, not release qualification.
- Actual local Auth HTTP 504s coincided with Docker DNS/database-host lookup and request deadline errors. These seven observed occurrences are ENVIRONMENTAL_FLAKE. No retry or suppression was added. Memory readings remain context only; no memory causation was established.
- Vite's default all-HTML scan discovered retained redacted browser reports and failed before any candidate browser test ran. Selecting the app's index.html isolates application dependency discovery from evidence artifacts.
- One profile navigation loaded React through multiple Vite cache generations and failed in Radix Tabs. Both installed React/React DOM packages were 18.3.1. The old cache was preserved, and unchanged code passed all 17 commercial-access tests from a cold cache with the same config/lockfile hashes. This is TEST_ISOLATION_DEFECT. The cold scan contained every prior dependency plus six previously missing entries.
- A later pricing failure had unchanged Vite cache hashes but an unfinished lazy pricing module at the exact plan-count assertion. Pricing now joins the existing owned-server module warm-up before the four workers start.
- The first attempted final pair was not accepted: A passed 124 tests, but B failed three while retaining 121 passes and the same ten skips. Payment refresh awaited only its action while the entitlement refetch took 7.653 seconds; scheduled-plan cancellation returned after 6.170 seconds; lifecycle save's subsequent summary took 7.910 seconds. Each exceeded the prematurely started five-second UI assertion window. Plan actions now await their full canonical refetch set; lifecycle save awaits its summary before the unchanged dialog assertion. Both old release reports remain in the comparison; the final pair starts over after these corrections.
- The source audit also completed the existing seat-action correction: its panel awaits entitlement and capacity invalidations before clearing busy, so the fixture now awaits those responses and RPC drain before the original enabled assertion. This audit closure is recorded separately and is not counted as a new observed failing occurrence.
- The second attempted final pair was also rejected: A passed 124 tests, but B failed the exact /coaches heading assertion (123 passed, ten existing skips). Its cold lazy module returned after 4.540 seconds and the final snapshot contained the expected heading, with no console/page errors. The heading renders independently of the successful directory query. Startup warm-up now covers the 14 actual public smoke routes, retaining every exact heading, overflow and catalogue assertion. Both reports remain preserved; qualification starts again on the corrected frozen code.
- The third attempt stopped at A (122 passed, two failed, ten existing skips). Chromium failed checkout return's theme-provider module with ERR_NO_BUFFER_SPACE; the document could not bootstrap or dispatch its checkout RPC. This is an environmental browser failure, with no memory attribution or checkout code change. Separately, the initial client-directory assertion began 1.668 seconds before its page RPC, which took 2.300 seconds and then required a 1.172-second route-key read. The fixture now awaits the page RPC and its identity-matched workspace/client hydration before the unchanged exact row assertion. The report remains red and B was not run.
- The fourth attempt stopped at A (122 passed, two failed, ten existing skips). The synthetic habit-chart fixture took 3.912 seconds to load its entry module and then loaded chart/dialog/style dependencies while its five-second dialog assertion was already running. It now signals completion of the awaited dynamic import before that assertion starts. Separately, commercial-access fixture trigger DDL caused a PostgREST schema-cache reload at 14:32:33 UTC; the reload's timezone query timed out at 14:32:45.980, and another worker's portal requests received PGRST002/503 until 14:32:48. This is TEST_ISOLATION_DEFECT. The seed now inserts through normal constraints/triggers, then sets only its isolated row's legacy compatibility status with transaction-local replication role, restoring origin before commit. The exact stored tuple is asserted; all subsequent browser access and mutation checks use ordinary application sessions. No shared trigger metadata is modified, and the reload timeout is not attributed to memory.

## Parent/candidate and release runs

Every matrix selection used a fresh local reset, loopback Supabase, the same worker-isolated fixture scheme, an owned strict-port Vite process, four configured workers and zero retries. No reset, test or build activity overlapped. The normal external observer was identical across parent and candidate; the two `observed-clock` runs added timer diagnostics and are explicitly separated. Candidate fixes progressed through the recorded commits; a green later result never replaces a retained red result.

| Run label                                     | Commit  | Passed | Failed | Skipped | Exit |
| --------------------------------------------- | ------- | ------ | ------ | ------- | ---- |
| candidate-observed-account-capacity           | 6e125ca | 0      | 0      | 0       | 1    |
| candidate-observed-clock-billing-portal       | 92dd6d9 | 10     | 0      | 0       | 0    |
| candidate-observed-clock-billing-selection    | 92dd6d9 | 40     | 0      | 0       | 0    |
| candidate-observed-cold-commercial-access     | 1e09860 | 17     | 0      | 0       | 0    |
| candidate-observed-r10-billing-selection      | 553eab0 | 40     | 0      | 0       | 0    |
| candidate-observed-r10-commercial-access      | 553eab0 | 17     | 0      | 0       | 0    |
| candidate-observed-r10-habit-metric-trend     | 553eab0 | 3      | 0      | 0       | 0    |
| candidate-observed-r2-account-capacity        | 1e09860 | 4      | 0      | 0       | 0    |
| candidate-observed-r2-billing-checkout        | 1e09860 | 7      | 0      | 0       | 0    |
| candidate-observed-r2-billing-coach-seats     | 1e09860 | 8      | 0      | 0       | 0    |
| candidate-observed-r2-billing-plan-change     | 1e09860 | 12     | 0      | 0       | 0    |
| candidate-observed-r2-billing-portal          | 1e09860 | 10     | 0      | 0       | 0    |
| candidate-observed-r2-billing-selection       | 1e09860 | 40     | 0      | 0       | 0    |
| candidate-observed-r2-commercial-access       | 1e09860 | 16     | 1      | 0       | 1    |
| candidate-observed-r2-commercial-catalogue-v2 | 1e09860 | 3      | 0      | 0       | 0    |
| candidate-observed-r2-smoke                   | 1e09860 | 121    | 3      | 10      | 1    |
| candidate-observed-r3-billing-plan-change     | 07e807c | 12     | 0      | 0       | 0    |
| candidate-observed-r3-billing-portal          | 07e807c | 10     | 0      | 0       | 0    |
| candidate-observed-r3-billing-selection       | 07e807c | 38     | 2      | 0       | 1    |
| candidate-observed-r3-commercial-access       | 07e807c | 17     | 0      | 0       | 0    |
| candidate-observed-r4-billing-checkout        | 92dd6d9 | 7      | 0      | 0       | 0    |
| candidate-observed-r4-billing-portal          | 92dd6d9 | 10     | 0      | 0       | 0    |
| candidate-observed-r4-billing-selection       | 92dd6d9 | 39     | 1      | 0       | 1    |
| candidate-observed-r4-commercial-catalogue-v2 | 92dd6d9 | 3      | 0      | 0       | 0    |
| candidate-observed-r5-billing-portal          | 126d5b7 | 10     | 0      | 0       | 0    |
| candidate-observed-r5-billing-selection       | 126d5b7 | 40     | 0      | 0       | 0    |
| candidate-observed-r6-billing-coach-seats     | ea395aa | 8      | 0      | 0       | 0    |
| candidate-observed-r6-billing-plan-change     | ea395aa | 12     | 0      | 0       | 0    |
| candidate-observed-r6-billing-selection       | ea395aa | 40     | 0      | 0       | 0    |
| candidate-observed-r6-commercial-catalogue-v2 | ea395aa | 3      | 0      | 0       | 0    |
| candidate-observed-r7-billing-coach-seats     | 016030a | 8      | 0      | 0       | 0    |
| candidate-observed-r7-billing-selection       | 016030a | 40     | 0      | 0       | 0    |
| candidate-observed-r8-billing-selection       | ed2f7bd | 40     | 0      | 0       | 0    |
| candidate-observed-r8-public-marketing        | ed2f7bd | 25     | 0      | 0       | 0    |
| candidate-observed-r9-billing-checkout        | 3ecd939 | 7      | 0      | 0       | 0    |
| candidate-observed-r9-billing-selection       | 3ecd939 | 40     | 0      | 0       | 0    |
| candidate-observed-r9-commercial-catalogue-v2 | 3ecd939 | 3      | 0      | 0       | 0    |
| parent-observed-account-capacity              | 7692f4f | 4      | 0      | 0       | 0    |
| parent-observed-billing-checkout              | 7692f4f | 3      | 4      | 0       | 1    |
| parent-observed-billing-coach-seats           | 7692f4f | 1      | 7      | 0       | 1    |
| parent-observed-billing-plan-change           | 7692f4f | 11     | 1      | 0       | 1    |
| parent-observed-billing-portal                | 7692f4f | 9      | 1      | 0       | 1    |
| parent-observed-billing-selection             | 7692f4f | 27     | 13     | 0       | 1    |
| parent-observed-commercial-access             | 7692f4f | 17     | 0      | 0       | 0    |
| parent-observed-commercial-catalogue-v2       | 7692f4f | 3      | 0      | 0       | 0    |
| parent-observed-smoke                         | 7692f4f | 112    | 12     | 10      | 1    |
| release-final-a                               | 126d5b7 | 124    | 0      | 10      | 0    |
| release-final-b                               | 126d5b7 | 121    | 3      | 10      | 1    |
| release-final-r2-a                            | 016030a | 124    | 0      | 10      | 0    |
| release-final-r2-b                            | 016030a | 123    | 1      | 10      | 1    |
| release-final-r3-a                            | ed2f7bd | 122    | 2      | 10      | 1    |
| release-final-r4-a                            | 3ecd939 | 122    | 2      | 10      | 1    |
| release-final-r5-a                            | 553eab0 | 124    | 0      | 10      | 0    |
| release-final-r5-b                            | 553eab0 | 124    | 0      | 10      | 0    |

Invalid attempts are retained separately: the first parent experiment used a node_modules junction that violated Vite's font asset allow-list (TEST_ISOLATION_DEFECT); two parent launches failed with an incorrectly escaped Windows observer path (FIXTURE_DEFECT), and the following queued seat selection was stopped during reset before browser launch. None produced executed browser results. The valid parent used a separate `npm ci`. Candidate dependency-discovery setup failed with zero executed tests (TEST_ISOLATION_DEFECT); the next local reset failed during initial schema setup with LegacyDbSetupError (UNKNOWN). Healthy later status and OOMKilled=false do not diagnose that initialization failure.

The final recorded five-file billing selection passed all 40 tests on the frozen code with four workers and zero retries. Each of the seven original affected files also has retained standalone parent/candidate results; the table records their actual commits rather than claiming all diagnostic runs used the final commit.

The corrected habit-chart fixture passed all three standalone cases. The corrected commercial-access fixture passed all 17 cases, including its eight deliberately mismatched lifecycle/status combinations; the service log had no schema reload or schema-cache failure during those eight cases. Successful service-startup reloads are retained separately rather than being described as fixture defects. The final gate evidence includes timestamp-bounded PostgREST checks for this focused run and both releases.

## Isolation and readiness audit

| Audit                                   | Evidence and disposition                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared identity and cross-worker writes | Commercial seeds combine run, parallel slot, scope and UUID. Auth smoke identities are isolated per run/parallel slot and reseeded for replacement workers. Shared lifecycle-trigger DDL was found causing cross-worker schema reload failures; it is replaced with a row-specific transaction-local compatibility-status seed. |
| Provider fixture ordering               | Fixed provider examples exist inside in-memory fake handlers or deterministic insert-on-conflict catalogue fixtures. Subscription, operation and workspace records have isolated identities. No provider request is sent.                                                                                                       |
| Unfinished callbacks and polling        | Release held access on failure; retain unrouteAll(wait); await canonical reads and drain only where observed. Manual-refresh counters are checked before transport completion, so the final drain remains necessary.                                                                                                            |
| React Query identity/scope              | Existing entitlement, capacity, access and billing keys contain their user and applicable client/workspace scope. No cross-identity cache-key defect was established.                                                                                                                                                           |
| Document versus domain readiness        | New documents await their own checkout, provider, seat, client-summary or client-access responses rather than relying on an earlier route's markers.                                                                                                                                                                            |
| Dev-server ownership and ports          | Existing reuseExistingServer=false and strict port 4173 retained. No unowned server reused and no port-collision cause established.                                                                                                                                                                                             |
| Cold modules and generated cache        | Explicit app entry, preserved cache comparison and startup imports for all 14 public smoke routes. No optimizer/React package version was changed.                                                                                                                                                                              |
| Test/reset concurrency                  | All database resets, units, browser selections, builds and release commands ran sequentially. No reset occurred between the final two releases.                                                                                                                                                                                 |
| Worker/retry/timeout policy             | playwright.config.ts unchanged: default four workers, zero retries, existing 90-second test budget. Existing commercial-access file-level mode is unchanged. No new skip, normal-suite serialization or timeout increase.                                                                                                       |
| Memory                                  | Before/after host measurements retained where captured; never used as causal attribution.                                                                                                                                                                                                                                       |

## File-by-file changes

| File                                                           | Change                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tests/unit/anatomical-muscle-selector.test.ts                  | U01–U02: owner Clear filters reset, shared inset surface and retained local artwork/no-glow contracts.                                                                                                                              |
| tests/unit/checkin-assignment-summary-contract.test.ts         | U03–U04: exact current summary fields and Assign template permission/save binding.                                                                                                                                                  |
| tests/unit/client-continuity-contract.test.ts                  | U05: current removed-only client copy with membership condition retained.                                                                                                                                                           |
| tests/unit/client-detail-assignment-card-polish.test.ts        | U06–U07: Workout metadata, retained snapshot guarantees, exact cadence fields and inline assignment.                                                                                                                                |
| tests/unit/client-portal-tag-minimization.test.ts              | U08–U09: distinct nutrition branches, Recorded nutrition today, Next action before agenda; remaining ordering retained.                                                                                                             |
| tests/unit/final-badge-status-regression.test.ts               | U10: exact nutrition empty state; existing status/workout/check-in assertions retained.                                                                                                                                             |
| tests/unit/notification-center-contract.test.ts                | U11: embedded notification surfaces for both audiences; PT concision assertions retained.                                                                                                                                           |
| tests/unit/pt-client-baseline-marker-assignment-wiring.test.ts | U12: exact current empty copy; active-library RPC and identity assertions retained.                                                                                                                                                 |
| tests/unit/workspace-header-pill-wiring.test.ts                | U13: exact footer-reserving rail boundary and 48px footer; dock/search assertions retained.                                                                                                                                         |
| tests/e2e/utils/test-helpers.ts                                | Await the actual successful password-token response before starting the existing rendered-session readiness check.                                                                                                                  |
| tests/e2e/billing-checkout.spec.ts                             | Canonical initial/return checkout reads, initial/final RPC drain, and routed callback teardown.                                                                                                                                     |
| tests/e2e/utils/plan-change-fixture.ts                         | Await seat previews, then plan/seat apply/refresh/cancel actions plus their state, entitlement and capacity responses and RPC drain; ready-control/modal assertions retained.                                                       |
| tests/e2e/billing-coach-seats.spec.ts                          | Use those seat action helpers for refresh, scheduled reduction and cancellation; exact capacity/payment assertions retained.                                                                                                        |
| tests/e2e/billing-plan-change.spec.ts                          | Await provider summary on manual-review reload and use the canonical cancellation helper before the exact capacity assertion.                                                                                                       |
| tests/e2e/billing-portal.spec.ts                               | Canonical navigation, release held access on failed teardown, drain between mutable summaries, and await the final clock-dispatched refresh before the unchanged cutoff count assertion.                                            |
| tests/e2e/utils/rpc-readiness.ts                               | Shared request tracker: await pending RPC transport within the existing test budget, then retain the existing 500ms quiet-state assertion.                                                                                          |
| tests/e2e/commercial-access.spec.ts                            | Await the client-specific access read on final home navigation. Replace shared trigger DDL with a normal insert and transaction-local legacy-status update; verify the stored tuple and retain all HTTP access/mutation assertions. |
| tests/e2e/habit-metric-trend.spec.ts                           | Await synthetic fixture module initialization before the unchanged dialog, chart values, pointer, keyboard and responsive assertions.                                                                                               |
| tests/e2e/commercial-catalogue-v2.spec.ts                      | Await the initial directory RPC and identity-matched route-key hydration, then pt_clients_summary after lifecycle save and reload; search, closed-dialog, UI and persisted completion assertions retained.                          |
| tests/e2e/utils/server-readiness.ts                            | Complete the existing startup module warm-up for all 14 public routes explicitly covered by smoke, before browser workers start.                                                                                                    |
| vite.config.ts                                                 | Set optimizeDeps.entries to index.html so retained diagnostic HTML cannot become application dependency input.                                                                                                                      |
| docs/evidence/pr-quality-01-unit-triage.json                   | Exact 13 original identities, assertion messages, relevant source/history and decisions recorded before edits.                                                                                                                      |
| docs/evidence/pr-quality-01-browser-triage.json                | All 42 original occurrences across 26 titles, separate new decisions, invalid setup evidence and timer observations.                                                                                                                |
| docs/evidence/pr-quality-01-browser-comparison.json            | Every completed observed run, exact failures/classifications, request timing, namespace hashes, auth/bootstrap states, console/server diagnostics, memory context and skips.                                                        |
| docs/evidence/pr-quality-01-final-gates.json                   | Frozen source objects, gate exits, complete-unit digest, consecutive releases and fail-closed harness proof.                                                                                                                        |
| docs/pr-quality-01-verification.md                             | This verification and attribution report.                                                                                                                                                                                           |
| docs/pr-price-11-verification.md                               | Narrow forward link/current local gate status only; historical red evidence remains unchanged.                                                                                                                                      |

Application source, SQL/migrations, provider handlers, harness implementation, commercial configuration, dependencies and Playwright policy are byte-for-byte unchanged from the merged base. Prices, capacities, access modes, provider mappings and public catalogue claims were not altered to satisfy tests. The only development configuration change is Vite dependency entry selection.

## Final database, unit and harness gates

| Gate            | Command                                                                                                                                                                                                     | Exit |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| db-start        | npm run supabase:start                                                                                                                                                                                      | 0    |
| db-reset        | npm run supabase:db:reset                                                                                                                                                                                   | 0    |
| db-lint         | npm run supabase:db:lint                                                                                                                                                                                    | 0    |
| db-test         | npm run supabase:db:test                                                                                                                                                                                    | 0    |
| units           | npm run test:unit -- --reporter=default --reporter=json --outputFile=C:\Users\ahmed\OneDrive\Documents\Syslab\Projects\COACHos\coachos\output\staging-commercial\quality-01\local-gates-final-r5\units.json | 0    |
| harness         | npm run staging:commercial:test                                                                                                                                                                             | 0    |
| manifest        | npm run staging:commercial:validate                                                                                                                                                                         | 0    |
| catalogue-local | npm run staging:commercial:catalogue -- --local                                                                                                                                                             | 0    |
| lint            | npm run lint                                                                                                                                                                                                | 0    |
| format          | npm run format                                                                                                                                                                                              | 0    |
| build           | npm run build                                                                                                                                                                                               | 0    |

Local database lint passed at error level; pgTAP passed 15 files and 1,036 assertions. The full unit suite passed 257 files / 1,855 tests, zero failures and zero skips. The focused Phase A harness passed all 71 tests. Lint had zero errors and three inherited warnings; formatting and TypeScript/Vite build passed.

The manifest and exact local anonymous catalogue planners passed. The existing requireGreenUnits function accepted the actual complete final JSON reporter result (digest in final-gates evidence). The apply entry point was never called. A throwing fetch guard recorded zero fetch calls during this direct local revalidation.

The planner without confirmations remained blocked with COMMIT_REQUIRED. Confirmed placeholder input on this quality branch remained blocked with COMMIT_SOURCE_MISMATCH, preserving the source-branch restriction. The same frozen commit was checked out locally in a separate detached worktree and planned with explicitly simulated refs/heads/main input and example targets: plan validation passed, remoteExecuted=false, overall verdict still blocked. This is a planner contract exercise, not evidence that this branch has merged or is authorized. The real evidence template remains blocked with all 23 scenarios not_run.

## Two consecutive release gates on frozen code

The exact command was `npm run verify:release` for both runs. Its unmodified lint, format, build and smoke stages all passed. No code or test edit and no database reset occurred between A and B. The normal four-worker default was used with zero retries; results were extracted from the unmodified default HTML reporter and checked against each run's start time to reject stale reports.

| Run       | Exit | Passed | Failed | Existing skips | Browser duration | Workers | Retries |
| --------- | ---- | ------ | ------ | -------------- | ---------------- | ------- | ------- |
| Release A | 0    | 124    | 0      | 10             | 9.21 min         | 4       | 0       |
| Release B | 0    | 124    | 0      | 10             | 9.69 min         | 4       | 0       |

| Path                 | Git object                               |
| -------------------- | ---------------------------------------- |
| config               | b9d21d60be8805d8efafb1ab3db8c7be8a2ad621 |
| package-lock.json    | 850f821e0578312071380bdb47667c385f153d45 |
| package.json         | 9a70849cb9806f933c1d5996663eef4acf2a0d7d |
| playwright.config.ts | 50eed61ff699681279430f973102939421c09c9e |
| scripts              | 71fa2dc977d9495795db512399eae5eb20244e5c |
| src                  | 175666a2391c78edd8ac9be7702adf2f260a5cc2 |
| supabase             | 603e71057bad5c79def07a8cfd0928846ccd252d |
| tests                | 2c3d6823c55d5bcece136d7880ffb9271793d96f |
| vite.config.ts       | 0934f93c4a77d69acb894bafcfc7dd63a4e90fff |

## Existing browser skips

Both final releases retained exactly the same ten pre-existing configured/demo-account skips as the parent and original Phase A runs. No new skip was added. These scenarios were not exercised by the local unconfigured smoke suite; the exact reasons remain visible rather than being counted as passes.

| File                                | Exact test title                                                            | Existing skip reason                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| checkin-submit-review.smoke.spec.ts | Client can submit check-in and PT can review                                | Missing env: E2E_CLIENT_EMAIL, E2E_CLIENT_PASSWORD, E2E_PT_EMAIL, E2E_PT_PASSWORD, E2E_CLIENT_ID |
| notifications.spec.ts               | notification attribution, alignment and delete recovery at 1602px           | Requires the local PT demo account                                                               |
| notifications.spec.ts               | notification attribution, alignment and delete recovery at 375px            | Requires the local PT demo account                                                               |
| nutrition-program-view.spec.ts      | Nutrition cards and read-only preview at 1602px                             | Requires the local PT demo account                                                               |
| nutrition-program-view.spec.ts      | Nutrition cards and read-only preview at 375px                              | Requires the local PT demo account                                                               |
| pt-assign-workout.smoke.spec.ts     | PT can assign workout to a client                                           | Missing env: E2E_PT_EMAIL, E2E_PT_PASSWORD, E2E_CLIENT_ID, E2E_WORKOUT_TEMPLATE_ID               |
| pt-workspace-header.spec.ts         | workspace header stays within its available width in both sidebar states    | Requires the local PT demo account                                                               |
| workout-template-duplicate.spec.ts  | Duplicate copies the workout and prescriptions, and cleans up a failed copy | Requires the local PT demo account                                                               |
| workout-template-view.spec.ts       | View opens a read-only workout dialog at 1602px                             | Requires the local PT demo account                                                               |
| workout-template-view.spec.ts       | View opens a read-only workout dialog at 375px                              | Requires the local PT demo account                                                               |

## Boundary and remaining requirements

No remote Supabase operation, Lemon Squeezy request, deployment, push, merge, secret write, webhook registration or Phase B action ran. The explicitly requested initial git fetch and read-only GitHub base/merge/check inspection did occur; this report does not claim that no remote read occurred. All database and catalogue execution targeted the local loopback services.

There are no failing final local gates. Historical UNKNOWN causes and the ten configured-data browser skips remain disclosed limitations; passing current runs do not resolve every historical attribution. This local branch still needs review/merge and its normal remote CI, which was not triggered by this task. The harness source-branch check remains closed here.

Phase B may now be submitted for **named authorization review** with the reviewed/merged commit and actual target details. It is not authorized by this work. Named staging/production deny-values, staging origin, test Store, remote migration/schema/backup/auth/secret/mapping proof and authorization for the 23 real scenarios remain separate requirements. Staging billing is not certified.
