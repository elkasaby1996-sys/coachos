# Coach-seat test runbook

## Deterministic local checks

Normal tests use injected provider objects and transport; no provider credentials or Lemon Squeezy network request is required. SQL fixtures are transaction-scoped and roll back. Browser fixtures create independent owner/subscription/operation identities per worker and use only local Supabase. The shared deterministic mapping catalogue is immutable.

Run local database tests before browser fixtures populate the database:

```powershell
npm run supabase:start
npm run supabase:db:reset
npm run supabase:db:lint
npm run supabase:db:test
npx vitest run tests/unit/billing-seat-quantity.test.ts tests/unit/billing-seat-quantity-panel.test.ts tests/unit/billing-provider.test.ts tests/unit/billing-plan-change.test.ts
npx playwright test tests/e2e/billing-coach-seats.spec.ts tests/e2e/billing-plan-change.spec.ts --workers=4 --retries=0
```

Do not run database resets or transaction fixtures concurrently with browser tests against the same local database. Deno-check all affected Billing function entry points, then run lint, format, build and the full unit suite. Compare failure identities to merged main. Run the original auth stress at four workers and zero retries, then run `npm run verify:release` twice on unchanged implementation/test code.

SQL coverage includes six graduated contracts, immutable catalogue, environment and permission boundaries, paid included capacity, preview totals, operation idempotence/conflicts, payment proof, duplicate/stale invoices, recovery, reduction growth ceiling, cancellation ambiguity, capacity blockers, plan carry/maximums, quantity reset, atomic rollback and historical retirement. Existing suites preserve trial/complimentary/custom, invitations, domain enforcement and auth boundaries. Unit tests cover exact Item PATCH flags, malformed responses, timeouts, rate limits, safe errors, browser input and presentation. Browser tests exercise the real handlers and local database with deterministic provider transitions.

## Separate real test-mode proof

No real-provider proof is supplied by deterministic tests. Before any production readiness claim, a separately authorized test Store exercise must verify:

1. Six real graduated Prices, exact two-tier amounts, zero fixed fees, package size 1, correct interval, no usage aggregation/setup fee/trial; record normalized contracts and hashes privately.
2. Initial Checkout quantity 1; exact first Item/Price linkage; test/live separation.
3. Increase PATCH flags and target quantity; updated invoice/payment proof; capacity unchanged before payment and expanded after the signed webhook is reconciled.
4. Failed payment and recovery on the same operation; duplicate and stale events; provider timeouts without blind retries.
5. Fitting reduction with proration disabled, lower admission ceiling, unchanged existing team, actual renewal and due reconciliation.
6. Cancellation restoration, ambiguous cancellation, compatible plan/cadence changes retaining quantity, and manual review for unexpected resets.
7. Portal/Store quantity controls disabled, PayPal limitation, no provider IDs or signed URLs in frontend/log evidence.

Do not perform these remote steps under this PR's local-only authorization. Deployment and live Store configuration require separate approval. Refunds, coupons, invoice-list UI, client payments and usage billing remain deferred.

See [PR-PRICE-11 staging certification preparation](staging-commercial-certification.md) for the separately authorized staging plan/apply boundary.
