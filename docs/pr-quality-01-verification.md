# PR-QUALITY-01 verification

Work in progress. Phase B remains unauthorized. No remote Supabase command, Lemon Squeezy request, or deployment is permitted.

Base: `1b95cb34835dd0021f4af8d739998cb4478e55f2`, merged PR #197. Branch: `fix/pr-quality-01-commercial-certification-gates`. GitHub checks for the merged Phase A commit passed before this work began.

## Unit baseline and decisions before editing

`npm run test:unit -- --reporter=default --reporter=json --outputFile=output/staging-commercial/quality-01/unit-baseline.json`: exit 1, 1,855 tests, 1,842 passed, 13 failed, zero skipped. The full private reporter retains assertion payloads and stacks. The exact identities, assertion messages, source paths and per-failure decisions are in [unit triage](evidence/pr-quality-01-unit-triage.json).

All 13 failures are classified STALE_TEST_CONTRACT after comparing their tests, current routed components and the explicit removals/replacements in merged PR #180 (`ba87500028ba82a4c83872ebd259992d6a506be0`). This is not inferred from failing assertions alone. Supporting product evidence includes [portal implementation F05, F10, F16](reviews/client-portal-2026-09-08/implementation.md), the exact PR #180 diff, and the retained concrete source contracts. Each replacement will assert the current exact behavior without changing production.

## Browser baseline

Controlled reproduction is in progress. Prior red evidence in PR-PRICE-11 remains intact. [Browser triage](evidence/pr-quality-01-browser-triage.json) retains every exact historical failure occurrence and distinguishes its original evidence from a newly observed occurrence. An old authentication-marker timeout without network evidence remains UNKNOWN; a new HTTP 504 does not retroactively establish its cause. Memory is context only.

The clean Phase A parent (`7692f4fbc8a47a3f5a9e04a5328c3d716511ffc7`) has completed these identical four-worker, zero-retry selections, each after a local database reset:

| Selection                            | Passed | Failed | Skipped |
| ------------------------------------ | -----: | -----: | ------: |
| account-capacity                     |      4 |      0 |       0 |
| billing-checkout                     |      3 |      4 |       0 |
| billing-coach-seats                  |      1 |      7 |       0 |
| billing-plan-change                  |     11 |      1 |       0 |
| billing-portal                       |      9 |      1 |       0 |
| commercial-access                    |     17 |      0 |       0 |
| commercial-catalogue-v2              |      3 |      0 |       0 |
| Recorded five-file billing selection |     27 |     13 |       0 |

Parent observations establish specific fixture defects: initial checkout assertions precede canonical checkout readiness; successful plan previews take 6.6–11.8 seconds while their UI assertions start immediately after clicks; lifecycle reload asserts before the successful client summary response (5.364 seconds); portal quiescence conflates transport completion (capacity response 7.416 seconds) with a five-second assertion budget; a failed assertion leaves deliberately held access requests blocking teardown. A successful password-token response taking 18.238 seconds also outlives the fixture's prematurely started 15-second rendered-session window.

Separately, local authentication returned HTTP 504. The corresponding auth-container logs include database-host lookup timeouts from Docker DNS and request context deadlines. These observed service failures are ENVIRONMENTAL_FLAKE; the candidate still requires a successful real sign-in response and does not suppress them. No controlled memory experiment has established memory causation.

Invalid attempts are retained separately: an initial parent checkout used a node_modules junction rejected by Vite's asset allow-list, and three later launches had an incorrectly escaped Windows observer preload path and never started tests. They are excluded from comparison. The valid parent has its own `npm ci` installation and uses the same observer as the candidate.

## Unit correction result

After the nine test-file corrections, the full suite passed: 257 files, 1,855 tests, zero failed, zero skipped (23.01 seconds). No production file changed. Each obsolete assertion was replaced with the current exact contract; additional assertions bind the check-in permission to its actual save button, the muscle reset to its owning toolbar/default filter, and the separate next-action section to its position before the agenda.

The existing `requireGreenUnits` validator accepted this complete reporter result locally. The apply entry point was not called, and the validator made no remote request. Final frozen-candidate revalidation is still pending.

## Isolation/readiness audit in progress

- `seedEntitlementCoach` combines run ID, parallel slot, test scope and UUID before deriving each commercial identity. `authSmokeFixtures` isolates run/parallel slot and reseeds replacement workers. Fixed fake provider IDs in checkout are used only by in-memory fake dependencies; plan/seat fixture mappings use deterministic shared insert-on-conflict catalogue data while subscription/operation/workspace records have unique identities.
- Entitlement, capacity, commercial-access and billing query keys include their user and applicable workspace/client scope.
- Playwright owns a strict-port Vite process with `reuseExistingServer: false`; its global setup pre-seeds per-worker auth identities and warms initial routes. Each comparison begins after a local database reset; no other database or browser test runs concurrently.
- Plan/seat and portal suites already drain routed callbacks at teardown. Checkout has asynchronous routed callbacks without that teardown guard. Several actions still begin UI assertion budgets immediately after clicking; these are investigation candidates, not yet attributed failures.
- An identical external diagnostic observer is used on both clean source revisions. It records routes, request completion times, worker/parallel slot, hashed login fixture namespace, console/page errors, and final auth/bootstrap signals. Database/auth container logs and memory measurements remain private under the ignored evidence directory. The observer does not route, mutate, retry or change assertion timing policies.
