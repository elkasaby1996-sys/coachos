# PR-PRICE-10 verification

Implemented and locally verified; ready for review as uncommitted working-tree changes. Both final release checks passed consecutively on unchanged implementation/test code. The full unit suite retains exactly the inherited failure set; it is not fully green. No public commercial launch, live billing or deployment is claimed.

Base: merged origin/main `780263a`, including PR-PRICE-01–09. Branch: `feat/pr-price-10-public-commercial-catalogue`. The user confirmed predecessor review; PR-PRICE-09 was committed, pushed and merged before this branch began. Initial working tree was clean. AGENTS.md was read; required ui-ux-pro-max design-system lookup ran before UI edits. Its comparison/accessibility guidance was applied while preserving the requested existing visual system and locked annual savings.

## Baseline

Merged main: 255 files, 246 passing and 9 failing; 1,771 tests, 1,758 passing and 13 failing; no unit skips. Exact identities are captured in `%TEMP%/pr-price-10-baseline.log` and compared to the final run. The inherited failures concern anatomical selector source assertions, client continuity/delivery/check-in/baseline copy contracts, notification copy and workspace header wiring. They do not become claimed passing evidence.

## Scope and evidence

See [the complete audit](commercial-readiness-audit.md), [v2 contract and rollback](public-pricing-catalogue-v2.md) and [claim inventory](public-pricing-claims.md). Exactly two native features are published, 15 remain IMPLEMENTED/internal, and 46 remain DRAFT/internal. All 63 keys and 139 total plan mappings remain intact. Additional seats and all provider-dependent sale claims remain hidden.

One migration adds the safe v2 projection and two readiness promotions. V1's function/schema are unchanged; its dynamic feature arrays now include the approved rows. No authentication, capacity, access enforcement, subscription or billing operation implementation changes are introduced.

## Iteration record

- First targeted run: 29 assertions passed. First build passed.
- First SQL run exposed two historical expectations that all enabled feature arrays were empty. Updated these expectations to retain the non-saleable exclusion contract with the reviewed publications. All 1,036 SQL assertions then passed in 15 files.
- Initial browser discovery exposed Node's JSON-module import-attribute requirement. Replaced the generated JSON payload with a generated TypeScript literal; no second feature list was authored. The focused 28-browser suite then passed.
- First full unit run retained the exact 13 baseline failure identities; 1,768 passed. Further audit/claim/strict-schema assertions are included in the final run below.

- The first final release attempt stopped in TypeScript: an indexed locked-plan lookup could be undefined under strict checking. Added a fail-closed guard and restarted the final release pair; that failed attempt is not counted.

- Screenshot review prompted a minimal comparison heading/scroll-hint refinement and a real keyboard-horizontal-scroll assertion. A pre-refinement full release passed 124 tests with 10 inherited skips; it is not part of the final pair.
- The next full release had 123 passes, 10 inherited skips and one Billing Portal fixture teardown failure: request counters advanced before `route.fetch/fulfill` completed. The existing test now waits for its established RPC-quiescence helper after manual refresh before teardown. All assertions, timeouts, worker/retry settings and runtime billing behavior are preserved.

## File-by-file changes

| File                                                                        | Change                                                                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260913010000_public_commercial_catalogue_v2.sql`     | Two native readiness/visibility/label promotions; safe v2 RPC; explicit grants.                               |
| `src/features/commercial-catalogue/catalogue-v2.ts`                         | Strict locked-plan/trial/public-key validation, deep freeze and canonical grouping.                           |
| `src/features/commercial-catalogue/public-catalogue-v2.generated.ts`        | Single database-generated public data literal.                                                                |
| `src/features/commercial-catalogue/public-catalogue-snapshot.ts`            | Validate and recursively freeze that literal for offline rendering.                                           |
| `src/features/commercial-catalogue/catalogue-api.ts`                        | Explicit v2 API with safe failures; preserve v1 API.                                                          |
| `scripts/public-catalogue-snapshot.mjs`                                     | Local anonymous generation and exact TypeScript/RPC parity check.                                             |
| `src/pages/public/pricing-comparison.tsx`                                   | Capacity/domain comparison and conditional future seat presentation.                                          |
| `src/pages/public/marketing-content.tsx`                                    | Canonical cards/comparison, maximum seats, narrowed copy and corrected trial wording.                         |
| `src/pages/public/public-site-shell.tsx`                                    | Visible evaluation-preview context outside approved pricing inclusions.                                       |
| `src/styles/marketing-home.css`                                             | Minimal responsive comparison and preview-notice styles.                                                      |
| `src/lib/marketing-public.ts`                                               | Beta availability labels, exact FAQ trial and narrower feature/migration claims.                              |
| `src/lib/product-page-content.ts`                                           | Narrow actual routed product hero/SEO/OpenGraph to previews.                                                  |
| `src/pages/public/coaches.tsx`                                              | Identify directory metadata as beta.                                                                          |
| `src/pages/public/pt-signup.tsx`                                            | Exact trial capacities alongside selected paid-plan intent.                                                   |
| `src/pages/pt-hub/settings/tabs/billing.tsx`                                | Conditional provider-portal description only.                                                                 |
| `supabase/tests/public_catalogue_v2.sql`                                    | 17 new publication/privacy/compatibility/retirement assertions.                                               |
| `supabase/tests/commercial_catalogue.sql`                                   | Preserve legacy filter fixtures and update dynamic publication expectations.                                  |
| `supabase/tests/account_entitlements.sql`                                   | Update two expected enabled arrays; preserve non-saleable exclusion assertions.                               |
| `tests/unit/public-catalogue-v2.test.ts`                                    | 13 schema/audit/API/grouping/component/isolation tests, including drift cases.                                |
| `tests/unit/commercial-catalogue-marketing-contract.test.ts`                | Point card derivation contract at v2.                                                                         |
| `tests/e2e/commercial-catalogue-v2.spec.ts`                                 | Exact local parity, offline responsive pricing, and real client filter/lifecycle persistence.                 |
| `docs/commercial-readiness-audit.md` and `.json`                            | All 63 evidence/disposition records.                                                                          |
| `docs/public-pricing-catalogue-v2.md`                                       | Compatibility, generation, privacy, display and rollback contract.                                            |
| `docs/public-pricing-claims.md`                                             | Routed marketing cleanup inventory and publication boundaries.                                                |
| `docs/commercial-catalogue.md`, `docs/account-subscription-entitlements.md` | Narrow forward links without rewriting historical evidence.                                                   |
| `docs/pr-price-10-verification.md`                                          | Baseline, iterations, exact results and scope limitations.                                                    |
| `tests/e2e/billing-portal.spec.ts`                                          | Await existing read-quiescence helper before teardown after manual refresh; preserve assertions and settings. |

## Final results

| Check                                                             | Exact result                                                                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Local Supabase start/reset                                        | Passed; one forward PR-PRICE-10 migration applied locally.                                                                       |
| Local database lint                                               | Passed, error level.                                                                                                             |
| Local SQL suite                                                   | 15 files, 1,036 assertions passed.                                                                                               |
| Targeted catalogue/marketing/client-list/lifecycle unit contracts | 8 files, 71 passed. Final component recheck: 13 passed.                                                                          |
| Full unit suite                                                   | 256 files: 247 passed, 9 failed. 1,784 tests: 1,771 passed, 13 failed, zero skipped. Exact failure identities equal merged main. |
| Lint                                                              | Passed; zero errors, same three inherited warnings.                                                                              |
| Formatting/build                                                  | Passed in both final release runs.                                                                                               |
| Public browser checks                                             | 28 passed; expanded public/auth selection 37 passed. Final mobile keyboard-scroll/lifecycle/parity selection: 3 passed.          |
| Original auth stress                                              | 18 passed; four workers, zero retries, repeat each twice.                                                                        |
| Portal teardown regression                                        | Four repeated cases passed with four workers and zero retries after draining pending reads.                                      |
| Final release A                                                   | Exit 0; lint, format, build; 124 browser passes, 10 inherited skips, zero failures; browser phase 2.7 minutes.                   |
| Final release B                                                   | Exit 0; lint, format, build; 124 browser passes, same 10 inherited skips, zero failures; browser phase 3.2 minutes.              |
| Frozen pair                                                       | All 1,055 implementation/test/tooling/audit-fixture SHA-256 hashes identical before, between and after.                          |
| Anonymous RPC/snapshot parity                                     | Exact deep equality passed again after both release runs.                                                                        |
| Final diff                                                        | No historical migration edits; diff whitespace check passed.                                                                     |

No retries, worker-count reductions, timeout increases or new skips were introduced. A formatting-only attempt following the portal cleanup stopped at Prettier; normalization was applied before the final pair. Earlier attempts are recorded above and do not count as final passes. Only this verification Markdown was finalized after the final pair, followed by formatting/diff checks.

Logs and manifests remain outside the repository under `%TEMP%/pr-price-10-*.log` and `pr-price-10-frozen-{before,between,after}.json`. Pricing screenshots were inspected at desktop and 375px; the final table has explicit inclusion text, a visible horizontal-scroll hint and verified keyboard scrolling.

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

## Provider and deployment boundary

There is no real-provider evidence in this PR. No remote Supabase or Lemon Squeezy operation, provider mapping, purchase, Store change, migration push, function deployment, secret update or deployment was performed. Feature-key enforcement, live billing, coupons, refunds, invoice-list UI, client payments, usage billing and AI credits remain outside scope. Local fixture success does not establish production readiness or public launch completion.
