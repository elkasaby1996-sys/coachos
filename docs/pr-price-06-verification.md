# PR-PRICE-06 verification

Implemented and locally verified; ready for review as working-tree changes. Both final release gates passed consecutively on unchanged implementation/tests. No commit, push, deployment or live enablement was performed. The 13 inherited unit failures remain explicitly outside a green-unit verdict.

## Base, prerequisite and audit

Base: merged `origin/main` at `ad01667` (PR #190), including PR-PRICE-05 and its three reviewed reconciliation corrections. Those corrections were reviewed and verified in the preceding local task turns, committed, pushed and merged before this work began. Branch: `feat/pr-price-06-lemon-squeezy-portal-recovery`.

The requested local-main fast-forward failed because local main contains an unrelated divergent commit. It was preserved, and the implementation branch was created directly from fetched origin/main. The new branch started clean. No unrelated files were changed.

Merged-main unit baseline was captured before implementation in `%TEMP%/pr-price-06-baseline.json`. Baseline: 1,502 passing tests and 13 inherited failures, zero skips. The foundation includes private mappings, checkout attempts, customer/subscription links, durable fingerprints, authenticated hosted Checkout, HMAC processing, conversion, lifecycle reconciliation, Billing UI and URL redaction. Portal retrieval and summary UI were absent.

The required ui-ux-pro-max design-system lookup and UX feedback lookup ran before UI implementation. Existing page structure, fonts, teal tokens and icon rules take precedence over the skill's generic landing-page/color suggestions. The changes use existing buttons, cards and text status, loading feedback and recovery actions without decorative metrics or extra title lines.

## Implementation

See [behavior](lemon-squeezy-customer-portal.md), [security](lemon-squeezy-portal-security.md), and [Store configuration/proof requirements](lemon-squeezy-portal-test-runbook.md). One forward function migration adds no tables or columns and changes no historical migrations or domain data. Portal URLs are freshly retrieved from the existing adapter, identity checked twice, structurally validated, returned no-store and immediately navigated without mutation-data persistence. Auth/root startup remains isolated.

Product/Variant/Price changes on an existing linked subscription durably enter manual review with BILLING_UNAPPROVED_PLAN_CHANGE. Immutable Price identity fixes cadence; no renewal-date inference or plan-change authorization is introduced. Corrected cancellation/resumption/recovery preserves the paid row. Portal return refreshes canonical state, ends polling within thirty seconds and offers manual Refresh without declaring payment truth from the query string.

## Verification record

Local start and clean reset passed, and final database lint returned zero findings. The complete SQL suite passed 572 assertions in ten files, including 173 billing assertions (36 new). All 139 focused unit/provider/handler/component assertions passed across seven files (59 new). Deno 2.9.6 checked all three billing Edge Function entrypoints successfully. Lint passed with zero errors and the same three inherited warnings; formatting and build passed.

The final full unit run has 1,561 passing tests and the exact same 13 inherited failures, zero skips. Comparing file plus full suite/test name against `%TEMP%/pr-price-06-baseline.json` found zero differences. The original auth pair passed four executions with four workers, repeat-each=2 and zero retries in 14.3 seconds. The focused Billing/account-entitlement browser run passed 20 tests with zero retries in 47.9 seconds. The ten new portal cases include worker-isolated owner/member/client boundaries, recovery, return-before-reconciliation, bounded polling/manual refresh, cancellation/resume/recovery, capacity preservation, safe errors and mobile/expired UI. The mobile 375px screenshot was visually inspected and overflow-checked; final screenshot is `%TEMP%/pr-price-06-billing-mobile.png`.

Preliminary failures were corrected rather than skipped: the first portal browser run passed eight cases and failed one permission fixture, which incorrectly supplied canManageBilling=false to the owner-only entitlement schema; it now uses the canonical 403 response. A later expanded run found an expired fixture with the wrong accessMode and an in-flight route callback at teardown; fixtures now use the canonical status/access mapping and wait for route callbacks. The capacity-only unit renderer initially lacked router context because the new panel mounted for a nonowner fixture; restricting page-level mounting to canonical billing owners resolved it without weakening the existing test. Browser fixtures now keep displayed paid Scale identity consistent with their existing capacity data and compare actual capacity meter values. No production entitlement contract was weakened. No failed preliminary run qualifies as release evidence.

| Final gate                    | Result                                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Release A                     | Exit 0; lint/format/build passed; 84 browsers passed, 10 inherited skips, zero failures; browser phase 1.9 minutes          |
| Consecutive release B         | Exit 0; lint/format/build passed; 84 browsers passed, same 10 skips, zero failures; browser phase 1.9 minutes               |
| Unchanged code                | SHA-256 hashes of all 20 changed/new implementation, test and configuration files match before, between and after both runs |
| Skip identities               | Identical between A/B and the preceding PR-PRICE-05 correction's final release log; no new skips                            |
| Final portal-only browser run | 10 passed, zero retries/skips, 24.6 seconds; all ten also passed in each final release                                      |
| Final diff check              | Passed                                                                                                                      |

Only this report was finalized after the release pair; its formatting and the diff were rechecked. The mobile screenshot is synthetic UI evidence, not provider purchase/portal proof. The final release suite contains the original 74 passing browser cases plus ten portal cases.

Raw execution logs and JSON results are under `%TEMP%/pr-price-06-*`: baseline.json, unit-final.json, focused-final.log, reset-final.log, db-lint-final.log, db-test-final.log, deno.log, lint.log, format.log, build.log, auth.log, portal-browser-final.log, release-a.log, release-b.log and release-hashes-before/after.json. No real capability or provider credential is present in these fixtures. The full-unit comparison uses exact file and full suite/test names and records zero added/removed failures; all 59 added units pass. No preliminary run substitutes for the final release pair.

## File-by-file changes

- `src/features/billing/portal-contracts.ts`: exact purpose, safe response/summary schemas and recovery/return types.
- `src/features/billing/portal-errors.ts`: typed safe errors with no raw provider fallback.
- `src/features/billing/portal-api.ts`: page-local invocation and canonical summary reads.
- `src/features/billing/use-customer-portal.ts`: owner query and void-returning navigation mutation with no capability cache.
- `src/features/billing/portal-return-state.ts`: canonical state interpretation, query cleanup and polling bounds.
- `src/features/billing/customer-portal-panel.tsx`: owner actions, lifecycle/recovery messages, return polling and manual refresh.
- `src/pages/pt-hub/settings/tabs/billing.tsx`: retains entitlement/Checkout/capacity and mounts owner-only management.
- `src/lib/redact-hosted-payment-urls.ts`: nested official/custom-domain capability redaction.
- `src/lib/sentry.ts`: scrubs structured/console logs in addition to existing event/transaction/breadcrumb hooks.
- `supabase/functions/_shared/lemon-squeezy.ts`: narrow portal retrieval using the same adapter, no-store fetch and plan-change event support.
- `supabase/functions/_shared/billing-portal.ts`: strict request, authorization orchestration, identity recheck, URL validation and safe responses.
- `supabase/functions/_shared/billing-runtime.ts`: server-only allowed hosts and safe portal database errors.
- `supabase/functions/_shared/billing-handlers.ts`: config type and sanitized manual-review telemetry.
- `supabase/functions/billing-create-customer-portal-link/index.ts`: thin authenticated endpoint.
- `supabase/config.toml`: JWT gateway configuration for the endpoint.
- `supabase/migrations/20260911020000_billing_customer_portal.sql`: one forward function migration; owner/server summary/linkage RPCs, plan-change guard and obsolete expiry clearing.
- `supabase/tests/lemon_squeezy_billing.sql`: 36 additional SQL assertions; all 137 prior assertions retained.
- `tests/unit/billing-portal.test.ts`: injectable handler/adapter, URL/privacy, return and isolation tests.
- `tests/unit/billing-portal-panel.test.ts`: owner and lifecycle/recovery rendering contracts.
- `tests/e2e/billing-portal.spec.ts`: ten browser cases with a deterministic provider, safe telemetry, no trace/video and worker-isolated fixtures.
- `docs/lemon-squeezy-customer-portal.md`: scope and canonical behavior.
- `docs/lemon-squeezy-portal-security.md`: authorization, URL and telemetry controls.
- `docs/lemon-squeezy-portal-test-runbook.md`: required test/live Store configuration and separately authorized real proof.
- `docs/pr-price-06-verification.md`: audit, baseline, corrections and verification evidence.
- `docs/lemon-squeezy-billing-provider.md`: narrow forward link.
- `docs/lemon-squeezy-billing-security.md`: narrow forward link.
- `docs/lemon-squeezy-test-mode-runbook.md`: narrow forward link.

## Limits and rollback

No remote Supabase or Lemon Squeezy operation, real purchase, API key or Store configuration was used. Real test-mode portal retrieval, cancellation/resumption, payment-method update and deployed webhook proof remain unproven. Live self-service billing is not enabled. Rollback is application revert plus a reviewed compensating function migration preserving all commercial history.

Upgrades, downgrades, cadence changes, proration, seats, refunds, RepSync invoice-list API/UI, coupons, client payments, pause controls and live deployment remain deferred. The hosted provider's billing history is within scope. PR-PRICE-07 is the explicit plan-change dependency.
