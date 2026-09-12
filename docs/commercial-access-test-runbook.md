# Commercial access verification runbook

Use a local Supabase stack only. Never use remote migrations, functions, secrets, Store settings, real subscriptions or real payments for these tests. Browser fixtures enforce a loopback API host and use worker-isolated identities.

Capture `git status --short` and the merged-main `npm run test:unit` baseline with JSON output before implementation. Compare exact failing file/full-test identities after implementation, not just totals. No added failure or skip is acceptable.

Run local setup and database checks sequentially:

```powershell
npm run supabase:start
npm run supabase:db:reset
npm run supabase:db:lint
npm run supabase:db:test
```

Do not run SQL tests concurrently with browser fixtures. Some inherited SQL assertions count all capacity events, so run them against a clean reset before browser seeding. New access tests scope their actors and roll back their fixtures.

Run focused contracts/components and real local database browser tests:

```powershell
npx vitest run tests/unit/commercial-access.test.ts tests/unit/commercial-access-components.test.ts
npm run test:e2e -- tests/e2e/commercial-access.spec.ts --workers=4 --retries=0
```

Verify owner full/grace/read-only/expired behavior, workspace-owner isolation, direct mutation denials, client historical and independent access, prospect-safe rejection with no lead, preserved publication preference, and restored access. Test original role denial separately from commercial denial. Exercise explicit reducing operations and nested delivery/storage write paths. Use UI screenshots for mobile recovery/read-only layout checks.

Run lint, format, build, full units, relevant Billing regressions and the original auth pair with four workers and zero retries. Deno-check any changed Edge Functions; none are required solely for SQL policy changes. Then run `npm run verify:release` twice consecutively on unchanged implementation/test code. Record file hashes around the pair, exact totals and inherited skips. Finalize only evidence documentation after the pair.

Deterministic status changes and provider fixtures prove local policy behavior, not real payment recovery or live enforcement. Real Lemon Squeezy test-mode card subscriptions, invoices and signed recovery webhooks require separate explicit authorization and PR-PRICE-05/06/07 provider proof. Deployment, remote mappings and production configuration remain separate. Do not claim live billing or live access enforcement from local fixtures.
