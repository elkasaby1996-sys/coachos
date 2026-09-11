# PR-PRICE-05 verification

## Verdict and base

The original commit-ready verdict below was withdrawn after three reconciliation defects were reproduced during review. See the correction record immediately below for the current verification status. Original execution evidence is preserved as historical evidence, not release evidence for the correction.

Original verdict: implemented and locally verified. Both original release checks passed consecutively on unchanged implementation/test code. Originally presented for code review as working-tree changes. The inherited full-unit failure set was unchanged. No real-provider purchase proof was claimed.

## Reconciliation review correction — 2026-09-11

Branch: `feat/pr-price-05-lemon-squeezy-billing`; correction base: `350ea0b` (PR-PRICE-05 implementation), whose parent is `61f067e` (merged PR-PRICE-04). Actual Git history differs from the correction request's uncommitted premise: PR-PRICE-05 was committed and merged through PR #189 at `e77374f`. The user explicitly requested editing `20260911010000_lemon_squeezy_billing_foundation.sql` in place and adding no second migration. This correction follows that instruction on the named branch. It has not committed, pushed, or rewritten Git history. No remote migration state was queried or changed; the user reports that this migration has never been remotely applied.

### Original failed-probe evidence

All probes used synthetic local database fixtures inside a rolled-back transaction:

- P1 retired mapping: `retired_mapping_expiration=ignored`, `retired_mapping_local_status=active`.
- P1 delayed cancelled creation: `delayed_cancelled_creation=ignored`, `delayed_creation_paid_rows=0`.
- P2 review recovery: `restored_snapshot_outcome=processed`, `restored_snapshot_review_status=manual_review`.

Tests were added before changing implementation. The first permanent regression run failed 36 of 133 billing assertions; all original 74 billing assertions passed. Exact failed assertions: `83-85, 89, 95-102, 104-120, 124, 126-128, 130-132`. The complete suite contained 532 assertions in 10 files. The original red log is retained at `%TEMP%/pr-price-05-correction-red.log`. Additional boundary assertions brought the final billing plan to 137 assertions.

### File-by-file correction and guarantees

- `supabase/migrations/20260911010000_lemon_squeezy_billing_foundation.sql`: Sale attempt insertion requires an active mapping under a shared lock. Linked reconciliation resolves only its immutable stored mapping, allowing active/retired. Delayed creation locks the account, re-reads/locks its attempt, checks signed linkage and accepts retirement only when the attempt predates or equals retirement. Product/Variant/Price/Store/environment/customer checks remain. Initial linkage projects active, paused, past_due, unpaid, cancelled or expired current state, including cancellation flags and terminal timestamps. Provider state and dates are retained accurately. Trials and malformed states fail closed. Deferred rows are superseded atomically before the conversion audit event; injected event failure rolls everything back. Successful current-provider validation always clears resolved review health independently of business state. Subscription locks and uniqueness preserve one paid linkage; stale/equal-timestamp guards remain.
- `supabase/tests/lemon_squeezy_billing.sql`: Retains all original 74 assertions and adds 63 permanent assertions (137 total). Covers identical-snapshot review/error/timestamp recovery without local-row/event mutation; invalid and stale snapshots retaining review; cancellation-before-creation deferral; late injected rollback of all conversion effects; delayed cancelled linkage, trial terminalization, period end, Checkout completion, deferred resolution, duplicate fingerprints/distinct deliveries, one conversion event and one paid row; terminal creation and later event resolution; paused/past_due/unpaid state projection; unsupported/malformed states; linked cancellation/expiration on retired mappings; sale rejection; exact historical ready-attempt mapping; missing and post-retirement attempt rejection; and direct sale admission rejection after retirement. Fixtures are transaction-scoped and roll back.
- `tests/unit/billing-provider.test.ts`: Adds six fake-provider handler cases proving a stale active creation body forwards each freshly retrieved supported state to SQL. These prove the existing adapter/handler already accept the required states; no Edge Function implementation change is needed.
- `docs/lemon-squeezy-billing-provider.md`: Documents the separate sale/historical/delayed mapping semantics, current-state linkage, cancellation through `ends_at`, deferred supersession, atomicity and independent review recovery.
- `docs/pr-price-05-verification.md`: Preserves the original verdict and failing probes, records corrections and fresh verification.

No UI, authentication startup, provider client, status vocabulary, plan price/capacity, trial policy, historical migration, or remote Store configuration changed. No migration was added. Rollback before any remote application is application/file revert and a clean local database reset. If this migration has already been applied elsewhere, changing this file does not upgrade that database; deployment would require separately reviewed forward migration handling. No deployment is authorized here.

### Correction verification

Correction verdict: all three findings are corrected and locally verified. Ready to commit and push this correction on the named branch, under the user's stated condition that the edited migration has never been remotely applied. No commit or push was performed. PR-PRICE-06 remains unstarted.

| Check                                              | Final correction result                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Local Supabase start                               | Passed (already running)                                                                                          |
| Clean local reset                                  | Passed before red tests and after migration correction                                                            |
| Database lint                                      | Passed, zero findings                                                                                             |
| Complete SQL/pgTAP                                 | 536 assertions passed in 10 files, including 137 billing assertions                                               |
| Focused unit/provider/handler contracts            | 80 passed in 5 files                                                                                              |
| Deno                                               | Both billing Edge Function entrypoints passed using Deno 2.9.6                                                    |
| Lint                                               | Passed, zero errors; same 3 inherited warnings                                                                    |
| Format                                             | Passed after formatting this verification report                                                                  |
| Build                                              | Passed (standalone and both final releases)                                                                       |
| Full unit suite                                    | 1,502 passed, exactly 13 inherited failures, zero skipped                                                         |
| Exact baseline comparison                          | File/suite/test-name comparison against the 13 original identities below: zero differences                        |
| Original auth pair                                 | 4 passed, 4 workers, zero retries, repeat-each=2; 16.7 seconds                                                    |
| Focused Billing/account-entitlements browser suite | 10 passed, zero failures/skips, 4 workers, zero retries; 18.3 seconds                                             |
| Final release A                                    | Exit 0; lint/format/build passed, 74 browsers passed, 10 inherited skips; browser phase 1.2 minutes               |
| Consecutive final release B                        | Exit 0; lint/format/build passed, 74 browsers passed, same 10 inherited skips; browser phase 1.2 minutes          |
| Unchanged implementation/tests                     | SHA-256 hashes match before, between and after the final releases for the migration, SQL tests and provider tests |
| Diff check                                         | Passed                                                                                                            |

The first correction release attempt stopped at Prettier on this updated report. It is not counted as release evidence. The report was formatted, then final A and B ran consecutively with no intervening implementation/test edits. Only this report was finalized afterward; its formatting and the diff were rechecked. The original 74 SQL assertions and all original unit/browser tests remain; no test was removed or skipped. The six new handler tests account for the increase from 1,496 to 1,502 passing units. Browser test files are unchanged.

Execution logs and machine-readable unit output are in `%TEMP%/pr-price-05-correction-*`, including `red.log`, `green-final.log`, `focused.log`, `deno.log`, `unit.json`, `auth.log`, `browser.log`, `release-a.log` (the failed preliminary format attempt), `release-final-a.log`, and `release-final-b.log`. Final evidence uses the two `release-final-*` logs only. Hash evidence is in `release-hashes-before.json` and `release-hashes-after.json`. Commands were the requested npm scripts, `npx deno check` for both billing entrypoints, and the original auth command preserved below. All Supabase operations targeted the local database.

Real test-mode API calls, purchases, Store configuration, deployed webhook delivery and live billing remain unproven. No remote Supabase or Lemon Squeezy operation was performed. PR-PRICE-06 remains unstarted.

## Original implementation record (superseded verdict, retained evidence)

Branch: `feat/pr-price-05-lemon-squeezy-billing`. Base: `61f067e8f56711f33b29ed29bd23f277e5c875fb`, merged PR-PRICE-04 (#188). The user confirmed review outside GitHub. PR-PRICE-01 (#185), PR-PRICE-02 (#186), PR-PRICE-03 (#187), and PR-PRICE-04 are present.

Local `main` contained unrelated commit `1191a68` and could not fast-forward. It was preserved. The new implementation branch was based directly on fetched `origin/main`. Pre-existing untracked `.playwright-cli` logs/snapshots were preserved unchanged outside the checkout at `C:/Users/G a m e r s/AppData/Local/Temp/pr-price-05-preserved-playwright`. Two unformatted snapshots otherwise failed the repository-wide format check; no snapshot contents or ignore rules were modified. No remote Supabase operations or Lemon Squeezy resource changes occurred.

## Initial audit and implementation

The existing catalogue contains immutable Launch/Growth/Scale prices and capacities. Account subscription, entitlement and capacity RPCs already use private history and owner-level locks. Billing previously contained an entitlement card, capacity meters, and disconnected portal/payment/invoice placeholders. Edge Functions use Supabase `getUser` authentication with an extracted shared handler convention. Existing Sentry required additional hosted-URL redaction. Route conventions use `/pt-hub/settings/billing` and search parameters.

The five-table schema, attempt idempotency, locked provider request, HMAC/fingerprint processing, current subscription reconciliation, atomic conversion, UI changes and release plan were presented before implementation. The mandatory `ui-ux-pro-max --design-system` and UX domain lookup ran before UI edits. Existing typography/colors/layout take precedence over the skill's generic landing-page suggestions; loading feedback, focus and error recovery guidance was applied.

## Verification results

Baseline: 1,433 unit tests passed, 13 failed in 9 files; no skips. Exact failure names were captured from merged main before edits. The final exact file/suite/test-name comparison equals that baseline: zero new failures, zero resolved baseline failures, and zero new skips.

## Design, permissions and scope

See [provider design](lemon-squeezy-billing-provider.md) for Product/Variant/Price mapping, attempt behavior, hosted request/validation, customer/subscription linkage, atomic conversion, status reconciliation and UI. See [security](lemon-squeezy-billing-security.md) for HMAC, fingerprints/replay, authorization, privacy, safe logs and auth isolation. See [runbook](lemon-squeezy-test-mode-runbook.md) for deterministic test boundaries and separately authorized real test-mode proof.

The single migration is `20260911010000_lemon_squeezy_billing_foundation.sql`. No historical migrations, catalogue prices/capacities, or existing domain rows are rewritten. Provider mappings begin empty. Rollback is application revert plus reviewed compensating forward migration; preserve commercial history.

Real test-mode API key, resources, webhook registration and purchase: **not used**. Live billing: **not enabled**. Provider dashboard configuration/publication and deployed webhook delivery remain unproven. Browser tests intercept provider/canonical-response boundaries; SQL tests separately prove actual persistence. No real provider purchase or deployed Edge Function integration is claimed.

Explicitly deferred: portal; upgrades, downgrades, plan/cadence changes; cancellation/resume controls; seats/quantity billing; proration; refunds; invoices; coupons/discounts; client payments; Stripe/Paddle/Connect; commissions; usage/AI billing; general feature enforcement; live deployment.

## Exact merged-main unit failure identities

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

## File-by-file changes

- `docs/account-capacity-enforcement.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `docs/account-subscription-entitlements.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `docs/commercial-catalogue.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `docs/lemon-squeezy-billing-provider.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `docs/lemon-squeezy-billing-security.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `docs/lemon-squeezy-test-mode-runbook.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `docs/pr-price-05-verification.md`: Provider design, security, local runbook, verification evidence, or narrow forward link.
- `src/features/billing/checkout-api.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/checkout-errors.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/checkout-panel.tsx`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/checkout-return-state.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/contracts.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/index.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/query-keys.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/features/billing/use-billing-checkout.ts`: Provider-neutral Billing contracts, safe errors, API access, query keys, return-state or page-local UI behavior.
- `src/lib/redact-hosted-payment-urls.ts`: Redacts hosted payment capabilities from telemetry without loading provider state.
- `src/lib/sentry.ts`: Redacts hosted payment capabilities from telemetry without loading provider state.
- `src/pages/pt-hub/settings/tabs/billing.tsx`: Retains canonical entitlements/capacity, renders visible safe errors and hosts local Checkout controls.
- `supabase/config.toml`: JWT required for Checkout; HMAC-authenticated public webhook entrypoint.
- `supabase/functions/_shared/billing-handlers.ts`: Injectable authenticated Checkout and signed webhook request orchestration.
- `supabase/functions/_shared/billing-runtime.ts`: Server-only secrets, verified user/profile prefill and narrow Supabase RPC adapters.
- `supabase/functions/_shared/lemon-squeezy.ts`: Fixed-origin provider adapter, strict parsing, raw-byte signature and allowlisted webhook normalization.
- `supabase/functions/billing-create-lemon-squeezy-checkout/index.ts`: Thin Deno handler entrypoint.
- `supabase/functions/billing-lemon-squeezy-webhook/index.ts`: Thin Deno handler entrypoint.
- `supabase/migrations/20260911010000_lemon_squeezy_billing_foundation.sql`: Single atomic forward migration: private provider tables, constraints, owner/service RPCs and conversion/reconciliation.
- `supabase/tests/lemon_squeezy_billing.sql`: Transaction-scoped fake mappings and 74 pgTAP assertions against actual database functions.
- `tests/e2e/account-entitlements.spec.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.
- `tests/e2e/billing-checkout.spec.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.
- `tests/unit/billing-contracts.test.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.
- `tests/unit/billing-panel.test.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.
- `tests/unit/billing-provider.test.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.
- `tests/unit/pt-hub-billing-capacity.test.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.
- `tests/unit/pt-hub-billing-entitlements-contract.test.ts`: Deterministic provider, frontend/component, auth/privacy or browser verification; prior placeholder expectations updated.

## Final verification record

| Check                                              | Actual result                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Merged-main unit baseline                          | 1,433 passed; 13 failed; 244 files (235 passed, 9 failed); zero skipped                                                 |
| Final full unit suite                              | 1,496 passed; same 13 failed; 247 files (238 passed, 9 failed); zero skipped                                            |
| Targeted provider/handler/frontend/component suite | 74 passed across 5 files                                                                                                |
| Local Supabase start                               | Passed                                                                                                                  |
| Final local database reset                         | Passed; all migrations applied, including the single new forward migration                                              |
| Final database lint                                | Passed; zero findings                                                                                                   |
| Final SQL/pgTAP suite immediately after reset      | 473 assertions passed in 10 files, including 74 billing assertions                                                      |
| Deno type-check                                    | Both new Edge Function entrypoints passed                                                                               |
| Original auth pair                                 | 4 passed (each test repeated twice), 4 workers, zero retries; 15.8 seconds                                              |
| Focused Billing/account-entitlements browsers      | All 10 cases passed in each final release run, including 7 new Billing scenarios                                        |
| Final release A                                    | Exit 0; lint/format/build passed; 74 browsers passed, 10 inherited skips, zero failures; browser phase 1.2 minutes      |
| Consecutive final release B                        | Exit 0; lint/format/build passed; 74 browsers passed, same 10 inherited skips, zero failures; browser phase 1.1 minutes |
| Unchanged implementation/tests                     | SHA-256 hashes matched for all 26 changed/new implementation, test and configuration files across the final runs        |
| Lint                                               | Zero errors; the same three inherited warnings in client profile inputs, client messages and client workout-run         |
| Final diff check                                   | Passed                                                                                                                  |

No new failure or skip was accepted. Full-unit status is explicitly not green because of the 13 exact inherited failures listed above. The two final release commands were `npm run verify:release`, with no intervening implementation/test edits. Only this verification document was finalized afterward; formatting and diff checks were rerun.

The auth command was:

```powershell
npm run test:e2e -- tests/e2e/auth-onboarding.smoke.spec.ts tests/e2e/auth-resilience.spec.ts --grep "PT with workspace can sign in and reach PT Hub|client session can recover after local session loss" --repeat-each=2 --workers=4 --retries=0
```

### Intermediate corrections and test boundaries

- The first migration application failed on a PL/pgSQL CASE-expression parse; corrected in the new migration, then verified by clean local resets. No historical migration was edited.
- An expiration fixture initially described a period ending before its start; corrected to model an elapsed period.
- Existing tests expected disconnected payment controls and an unambiguous plan text locator; updated for the requested Checkout controls without removing tests or adding skips.
- A denied-permission browser test exposed an existing helper that did not render its error text. Billing now renders the safe entitlement error directly.
- Final review added safeguards for post-provider persistence ambiguity, terminal polling and accurate failed-delivery attempt counting, plus explicit lease/expiry SQL assertions. Preliminary passing releases were not substituted for the final unchanged pair.
- Running legacy capacity SQL tests after browser fixture population caused global-count assertions 29, 33, 45, 47 and 48 in `account_capacity.sql` to fail. The new billing SQL file passed. A clean local reset followed by lint and the complete SQL suite passed all 473 assertions before the final browser runs.
- The first format check failed only on two pre-existing untracked Playwright YAML artifacts. All four original artifacts were moved unchanged to the preserved-artifact directory above; no unrelated formatting edits were made.

Raw execution logs remain under the local temporary directory with the `pr-price-05-` prefix. No logs contain a real provider key, provider purchase or live charge. Browser boundary fixtures deliberately mock hosted Checkout and canonical response updates; actual SQL conversion/rollback/idempotency is tested separately. Deployed Edge Function-to-provider integration, real test-mode purchases, real store configuration, operations alert delivery and live billing remain unproven or deferred as described in the runbook.
