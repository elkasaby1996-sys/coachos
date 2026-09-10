# Local billing verification and optional provider proof

Normal tests need neither Lemon Squeezy credentials nor provider network access. Use the existing local Supabase stack:

```powershell
npm run supabase:start
npm run supabase:db:reset
npm run supabase:db:lint
npm run supabase:db:test
npx vitest run tests/unit/billing-provider.test.ts tests/unit/billing-contracts.test.ts tests/unit/billing-panel.test.ts
npm run test:e2e -- tests/e2e/billing-checkout.spec.ts tests/e2e/account-entitlements.spec.ts
```

SQL fixtures create synthetic mappings inside a transaction that always rolls back. They verify real RPC authorization, locks/uniqueness, conversion, rollback, replay, status mapping and privacy. Provider/handler tests inject fake fetch and RPC dependencies. Browser tests use isolated owners per worker and intercept the provider boundary; the production webhook handler verifies fixture HMAC, with a fake reconciliation result reflected in the browser's canonical response. Browser fixtures do not commit fake provider mappings. This is layered deterministic proof, not a real-provider purchase or an end-to-end deployed Edge Function purchase.

Type-check both deployable entrypoints using `npx --yes deno check supabase/functions/billing-create-lemon-squeezy-checkout/index.ts supabase/functions/billing-lemon-squeezy-webhook/index.ts`. Initial dependency/type downloads may require internet; test execution itself does not contact Lemon Squeezy.

For local Edge serving, put server-only values in gitignored `supabase/.env.local`; use a test-mode key only under separate authorization for provider testing. The current implementation defaults to unavailable when its complete configuration is absent. Do not add a fake-mode environment flag. Serve locally with `npx supabase@latest functions serve --env-file supabase/.env.local`. Do not deploy, link, push remote migrations, register webhooks or configure remote secrets as part of this PR.

## Optional real test-mode proof — not performed

Separate authorization and actual test-mode resources are required. An operator must verify a test Store, one subscription Product, the six standard published Variants and their Price IDs against the immutable catalogue; no setup fee, provider trial, quantity billing or discount. Reviewed private mappings can then be activated with verification timestamps. Use server-owned return URLs and webhook signing secrets. Test creation, purchase, delivery replay, provider-current-state retrieval and trial/complimentary conversion, retaining only sanitized evidence. Never substitute a live key or real charge. A real provider test cannot be claimed from deterministic fixtures.

## Failure recovery

- A definitive create failure allows a fresh operation. Replaying the failed operation does not call the provider again.
- A network/server/rate-limit or post-creation database failure leaves an ambiguous attempt. Wait for recorded expiry; do not create a second provider Checkout automatically.
- A failed delivery is retryable. A deferred invoice waits for creation linkage. Identity/Variant/Price mismatch requires operations review without access expansion.
- A returning browser waits up to 30 seconds, then offers manual refresh. Leaving the browser does not prevent webhook reconciliation.

No remote Supabase or live Lemon Squeezy operation is part of this runbook's normal verification. Preserve commercial history when reverting an application or preparing a compensating migration.
