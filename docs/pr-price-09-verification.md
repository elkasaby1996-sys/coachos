# PR-PRICE-09 verification

## Verdict and base

The additional-seat implementation is complete locally and reviewable. Both required release runs passed consecutively on unchanged implementation/test code. Real-provider enablement is not proven and no remote deployment or provider mutation was performed. The complete unit suite retains inherited merged-main failures; it is not green.

Started from freshly fetched `origin/main`, commit `f45e54a` (PR #194 merge), on `feat/pr-price-09-additional-coach-seats`. Main contains PR-PRICE-08 commercial access enforcement plus `cd89c7f` access/remediation corrections and `92997a2` canonical Billing-state fixture correction. The starting worktree was clean. No historical migration was edited.

## Initial audit

Paid capacity previously used plan maximum seats, with included seats informational. Checkout, provider-subscription constraints, reconciliation and controlled plan changes assumed quantity 1. Capacity admission already deduplicated active identities, pending invitations and reservations under an account lock. Existing billing owner/service RPC and import-isolation boundaries were retained.

The new contract separates provider snapshot quantity from approved purchased seats. New purchases require a verified graduated Price, not an existing fixed-price mapping. Payment, reduction and cancellation use durable operations. Seat/plan operations exclude one another. The Billing UI extends the existing settings sections using the mandatory ui-ux-pro-max design-system lookup and existing repository styling.

## File-by-file changes

| File                                                               | Change                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260912020000_additional_coach_seats.sql`    | One forward migration: immutable add-ons and graduated contracts, provider quantity/approval columns, private operations/events, capacity and reservation ceilings, plan compatibility, payment/due reconciliation, grants/RLS. |
| `supabase/functions/_shared/billing-seat-item.ts`                  | Strict normalized Item parser, quantity PATCH construction and identity validation.                                                                                                                                             |
| `supabase/functions/_shared/lemon-squeezy.ts`                      | Injectable Item retrieval/update; positive quantities; safe definitive/ambiguous mutation failures. Checkout remains quantity 1.                                                                                                |
| `supabase/functions/_shared/billing-seat-quantity.ts`              | Owner-only preview/apply/cancel/refresh orchestration, strict browser body, single dispatch, safe errors and invoice refresh.                                                                                                   |
| `supabase/functions/_shared/billing-handlers.ts`                   | Webhook reconciliation includes current first Item proof.                                                                                                                                                                       |
| `supabase/functions/_shared/billing-plan-change.ts`                | Preserve approved quantity and validate current Item during plan reconciliation.                                                                                                                                                |
| `supabase/functions/_shared/billing-runtime.ts`                    | Allowlist safe seat database errors.                                                                                                                                                                                            |
| `supabase/functions/billing-preview-coach-seat-change/index.ts`    | Authenticated preview endpoint.                                                                                                                                                                                                 |
| `supabase/functions/billing-change-coach-seat-quantity/index.ts`   | Authenticated apply endpoint.                                                                                                                                                                                                   |
| `supabase/functions/billing-cancel-scheduled-seat-change/index.ts` | Authenticated cancellation endpoint.                                                                                                                                                                                            |
| `supabase/functions/billing-refresh-coach-seat-change/index.ts`    | Authenticated refresh endpoint.                                                                                                                                                                                                 |
| `supabase/config.toml`                                             | JWT verification for all four new endpoints.                                                                                                                                                                                    |
| `src/features/billing/seat-quantity-contracts.ts`                  | Strict safe response schemas and user-facing errors.                                                                                                                                                                            |
| `src/features/billing/seat-quantity-api.ts`                        | Local RPC/Edge API consumers and safe response parsing.                                                                                                                                                                         |
| `src/features/billing/seat-quantity-panel.tsx`                     | Owner-only summary, preview/confirmation, blockers, timing, payment/reduction/cancel/review states and refresh.                                                                                                                 |
| `src/pages/pt-hub/settings/tabs/billing.tsx`                       | Coach seats section and coordinated Billing query refresh.                                                                                                                                                                      |
| `src/features/account-capacity/mutation-notice.tsx`                | Owner coach-seat denials link to the Coach seats anchor; nonowner guidance remains generic.                                                                                                                                     |
| `supabase/tests/billing_seat_quantity.sql`                         | Transaction-scoped graduated fixtures and 88 additional SQL assertions.                                                                                                                                                         |
| `supabase/tests/billing_plan_changes.sql`                          | Existing blocker fixture reserves within included seats; expected target included limit reflects the new paid-seat contract. Assertions remain.                                                                                 |
| `tests/unit/billing-seat-quantity.test.ts`                         | Provider/handler/input/auth-isolation tests.                                                                                                                                                                                    |
| `tests/unit/billing-seat-quantity-panel.test.ts`                   | Pricing, annual totals, blockers, payment/reduction/cancel/review and nonowner privacy tests.                                                                                                                                   |
| `tests/unit/account-capacity-notice.test.ts`                       | Verify the new owner coach-seat anchor.                                                                                                                                                                                         |
| `tests/unit/account-capacity-mutation.test.ts`                     | Verify dimension-specific owner navigation.                                                                                                                                                                                     |
| `tests/unit/pt-hub-billing-capacity.test.ts`                       | Supply the real QueryClient context for Billing's coordinated refresh.                                                                                                                                                          |
| `tests/e2e/utils/plan-change-fixture.ts`                           | Optional deterministic graduated contracts, injected Item provider, seat endpoints and isolated team/seat fixture helpers.                                                                                                      |
| `tests/e2e/billing-coach-seats.spec.ts`                            | Eight browser scenarios covering purchases/payment/recovery, maxima, active/pending/reserved blockers, cancellation, plan carry and drift.                                                                                      |
| `docs/lemon-squeezy-coach-seat-billing.md`                         | Commercial/provider/state-machine/capacity/rollback documentation.                                                                                                                                                              |
| `docs/lemon-squeezy-coach-seat-security.md`                        | Permissions, privacy, concurrency, provider proof and auth isolation.                                                                                                                                                           |
| `docs/lemon-squeezy-coach-seat-test-runbook.md`                    | Deterministic commands and separately authorized real test-mode proof checklist.                                                                                                                                                |
| `docs/pr-price-09-verification.md`                                 | This audit, verification and limitation record.                                                                                                                                                                                 |
| `docs/lemon-squeezy-plan-changes.md`                               | Narrow forward link.                                                                                                                                                                                                            |
| `docs/lemon-squeezy-billing-provider.md`                           | Narrow forward link.                                                                                                                                                                                                            |

## Commercial and state-machine results

- Add-on catalogue: `coach_seat` v1, USD 1200 monthly / 12000 annually; one active version, immutable active values, retirement without reactivation.
- Graduated Price: exact first-unit base and later-unit add-on tiers for all six plan/cadence combinations; package size 1, no usage aggregation, trial, setup or fixed fee. Hash uses the normalized PostgreSQL JSONB text representation. Fixed mappings do not become seat capable automatically.
- Provider versus approval: quantity is the provider snapshot; approved add-ons alone grant capacity. Stable quantity is 1 + approved. Unapproved drift enters review, retains approval and never auto-corrects provider quantity.
- Effective seats: paid included + approved capped at plan maximum; trial/complimentary/custom unchanged. Existing over-limit data remains.
- Operations: private immutable identity, account-scoped idempotency key, one nonterminal seat operation per provider subscription, mutually exclusive plan/seat operations, append-only transition events.
- Increases: immediate prorated provider invoice, awaiting payment, no capacity expansion from provider target alone, exact current Item plus post-dispatch updated paid invoice required; recovery completes once.
- Reductions: locked actual + pending + reserved preflight; lower growth ceiling immediately; current approval through effective date; due target resolves dynamically and persists during reconciliation.
- Cancellation: future scheduled reductions only; source quantity PATCH with proration disabled; GET verification before restoring the original ceiling. Ambiguity retains the lower ceiling.
- Plan integration: compatible add-ons carry; excessive add-ons and unavailable target contracts block before dispatch; target cadence prices are reflected; quantity resets enter review without changing add-ons.
- Reconciliation: existing normalized durable inbox and signature/identity guards, current Item evidence, idempotent duplicates/stale evidence, atomic approval/operation completion.
- Billing: owner-only section and management links, exact recurring unit/list totals, no exact tax/proration claim, manual refresh, no Portal quantity controls or automatic invitation purchase.
- Permissions/privacy/auth: private tables deny runtime direct access, service-only transitions, owner-safe summary, no provider IDs or raw invoice data in UI, no seat imports in auth/root/bootstrap providers.

## Verification evidence

| Check                                          | Result                                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean merged-main unit baseline                | 244 files passed, 9 failed; 1712 tests passed, 13 failed; no skips.                                                                                  |
| Final unit comparison                          | 246 files passed, same 9 failed; 1758 tests passed, same 13 failed. Exact failure identity set unchanged; 46 additional passing tests, no new skips. |
| Local Supabase start/reset                     | Passed; only local database touched.                                                                                                                 |
| Local DB lint                                  | Passed, no error findings.                                                                                                                           |
| Full SQL/pgTAP                                 | 14 files, 1019 assertions passed; no skips.                                                                                                          |
| Deno checks                                    | All 11 affected Billing entry points passed.                                                                                                         |
| Lint                                           | Passed, three inherited warnings and zero errors.                                                                                                    |
| Format                                         | Passed.                                                                                                                                              |
| TypeScript/Vite build                          | Passed.                                                                                                                                              |
| Focused Billing/capacity browser               | 48 passed, four workers, zero retries.                                                                                                               |
| Original auth plus bootstrap/resilience stress | 18 passed, four workers, zero retries, two repetitions.                                                                                              |
| Release run A                                  | Passed: exit 0; lint, format, build; 121 browser tests passed, 10 inherited skips; four workers, zero retries.                                       |
| Release run B                                  | Passed consecutively: exit 0; lint, format, build; 121 browser tests passed, same 10 inherited skips; four workers, zero retries.                    |
| Whitespace                                     | `git diff --check` passed.                                                                                                                           |

The frozen implementation/test manifest covers 1032 files. Aggregate SHA-256: `78de5c48a64a0a6b4d6e6041d9803cf752f628ea3a04ccc5979ea3defe577c01`. Before/between/after manifests match exactly: zero changed implementation/test files. Documentation updates are outside that manifest. All seven files containing the ten inherited browser skips match origin/main; no new skip was introduced.

Exploratory failures were retained in local logs, not counted as passes: the first browser fixture emitted payment before apply finished and used an excessive reservation TTL; the fixture now awaits canonical awaiting-payment state and uses a valid TTL. A database run overlapped browser fixture seeding and produced global-count failures; final database verification ran on a clean local reset before browsers. Earlier source-contract/test-render failures caused by the intentional owner anchor and new QueryClient usage were corrected without removing assertions. The final unit failure set matches baseline exactly.

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

## Real-provider evidence and limitations

No real Lemon Squeezy test-mode or live evidence was collected. No API key, quantity update, charge, invoice, renewal, signed real webhook, remote migration/function deployment or Store configuration change was used. Deterministic fixture success does not establish that seat billing is live. Actual test-mode graduated Price/Item/invoice/renewal/webhook proof and separately approved live Store configuration remain prerequisites.

Deployment, refunds, coupons, invoice-list UI, client payments and usage/metered billing are deferred. The inherited unit failures remain a repository-level blocker to claiming a fully green unit suite.

Rollback is application revert plus a reviewed compensating migration preserving subscription, provider, operation, event and team/domain history. Never drop paid-seat history or erase purchased entitlements as a rollback shortcut.

## Final evidence location

Local logs and the three frozen manifests are preserved under `%TEMP%/pr-price-09/`. Files include `pr-price-09-baseline.log`, `baseline-failure-identities.txt`, `pr-price-09-unit.log`, database reset/lint/test logs, `pr-price-09-deno.log`, `pr-price-09-browser-focused.log`, `pr-price-09-auth-stress.log`, `pr-price-09-release-a.log`, `pr-price-09-release-b.log`, and `frozen-before.json` / `frozen-between.json` / `frozen-after.json`. Provider evidence is deterministic only. Changes remain uncommitted on the requested feature branch.
