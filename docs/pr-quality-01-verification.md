# PR-QUALITY-01 verification

Work in progress. Phase B remains unauthorized. No remote Supabase command, Lemon Squeezy request, or deployment is permitted.

Base: `1b95cb34835dd0021f4af8d739998cb4478e55f2`, merged PR #197. Branch: `fix/pr-quality-01-commercial-certification-gates`. GitHub checks for the merged Phase A commit passed before this work began.

## Unit baseline and decisions before editing

`npm run test:unit -- --reporter=default --reporter=json --outputFile=output/staging-commercial/quality-01/unit-baseline.json`: exit 1, 1,855 tests, 1,842 passed, 13 failed, zero skipped. The full private reporter retains assertion payloads and stacks. The exact identities, assertion messages, source paths and per-failure decisions are in [unit triage](evidence/pr-quality-01-unit-triage.json).

All 13 failures are classified STALE_TEST_CONTRACT after comparing their tests, current routed components and the explicit removals/replacements in merged PR #180 (`ba87500028ba82a4c83872ebd259992d6a506be0`). This is not inferred from failing assertions alone. Supporting product evidence includes [portal implementation F05, F10, F16](reviews/client-portal-2026-09-08/implementation.md), the exact PR #180 diff, and the retained concrete source contracts. Each replacement will assert the current exact behavior without changing production.

## Browser baseline

Pending controlled reproduction. Prior red evidence in PR-PRICE-11 remains intact. Historical failures have no new attribution yet. Memory is context only.

## Unit correction result

After the nine test-file corrections, the full suite passed: 257 files, 1,855 tests, zero failed, zero skipped (23.01 seconds). No production file changed. Each obsolete assertion was replaced with the current exact contract; additional assertions bind the check-in permission to its actual save button, the muscle reset to its owning toolbar/default filter, and the separate next-action section to its position before the agenda.

The existing `requireGreenUnits` validator accepted this complete reporter result locally. The apply entry point was not called, and the validator made no remote request. Final frozen-candidate revalidation is still pending.

## Isolation/readiness audit in progress

- `seedEntitlementCoach` combines run ID, parallel slot, test scope and UUID before deriving each commercial identity. `authSmokeFixtures` isolates run/parallel slot and reseeds replacement workers. Fixed fake provider IDs in checkout are used only by in-memory fake dependencies; plan/seat fixture mappings use deterministic shared insert-on-conflict catalogue data while subscription/operation/workspace records have unique identities.
- Entitlement, capacity, commercial-access and billing query keys include their user and applicable workspace/client scope.
- Playwright owns a strict-port Vite process with `reuseExistingServer: false`; its global setup pre-seeds per-worker auth identities and warms initial routes. Each comparison begins after a local database reset; no other database or browser test runs concurrently.
- Plan/seat and portal suites already drain routed callbacks at teardown. Checkout has asynchronous routed callbacks without that teardown guard. Several actions still begin UI assertion budgets immediately after clicking; these are investigation candidates, not yet attributed failures.
- An identical external diagnostic observer is used on both clean source revisions. It records routes, request completion times, worker/parallel slot, hashed login fixture namespace, console/page errors, and final auth/bootstrap signals. Database/auth container logs and memory measurements remain private under the ignored evidence directory. The observer does not route, mutate, retry or change assertion timing policies.
