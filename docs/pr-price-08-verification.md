# PR-PRICE-08 implementation and verification

## 1. Verdict

Implemented and locally verified, ready for review. Changes remain uncommitted on the feature branch. No live billing or live access-enforcement claim is made. No remote Supabase or Lemon Squeezy operation, deployment, commit or push was performed.

## 2. Base and branch

Base: merged PR #193 (PR-PRICE-07), `cce228bcc16723f304ba2ed8e354bab10be2def8`. Branch: `feat/pr-price-08-access-mode-enforcement`. The user confirmed predecessor review outside GitHub; predecessor CI passed. The working tree was clean before implementation. Diverged local main was preserved; this branch was created without tracking from fetched origin/main.

## 3. Access and mutation audit

The pre-edit audit covered canonical subscription/entitlement, capacity and plan-change foundations; owner/workspace/client/public routes; direct table writes and RPCs; delivery templates, assignments, workout/nutrition/habit/check-in/progress records; messaging; client/team/invite/package lifecycle; business/profile/public acquisition; storage; security/privacy recovery; and startup imports. The matrix and implementation inventory were presented before edits. Mandatory ui-ux-pro-max design-system and UX lookups ran before UI work; implementation retained the existing visual system and semantic warning styles.

The [literal write inventory](commercial-access-write-inventory.json) and its contract test connect application writes to guarded tables or explicit personal-notification exceptions. Static ancestry resolution covers nested writes and both source/destination scopes. Existing RPC authorization, RLS and column privileges remain authoritative. Trusted service/admin paths are deliberately distinct from authenticated browser requests.

## 4. File-by-file changes

| File                                                                   | Change                                                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/account-capacity-enforcement.md`                                 | Add only a forward link to the PR-PRICE-08 documentation.                                                                                                                   |
| `docs/account-subscription-entitlements.md`                            | Add only a forward link to the PR-PRICE-08 documentation.                                                                                                                   |
| `docs/commercial-access-modes.md`                                      | Document mode/status/action and audience behavior, recovery and deferrals.                                                                                                  |
| `docs/commercial-access-security.md`                                   | Document authorization, mutation protection, privacy, telemetry and rollback.                                                                                               |
| `docs/commercial-access-test-runbook.md`                               | Document reproducible local checks and separate provider evidence.                                                                                                          |
| `docs/commercial-access-write-inventory.json`                          | Record the audited literal direct-write files, tables and operations.                                                                                                       |
| `docs/lemon-squeezy-plan-changes.md`                                   | Add only a forward link to the PR-PRICE-08 documentation.                                                                                                                   |
| `docs/pr-price-08-verification.md`                                     | Record this final 23-topic implementation and verification report.                                                                                                          |
| `src/components/layouts/client-layout.tsx`                             | Mount the contextual coaching notice without blocking the independent client shell.                                                                                         |
| `src/components/layouts/pt-hub-layout.tsx`                             | Mount the owner commercial boundary around product content.                                                                                                                 |
| `src/components/layouts/pt-layout.tsx`                                 | Mount the selected-workspace commercial boundary.                                                                                                                           |
| `src/components/pt/pt-message-compose.tsx`                             | Check the selected relationship before sending; keep drafts on denial.                                                                                                      |
| `src/features/commercial-access/access-api.ts`                         | Lazily load Supabase, validate contracts, expose safe failures and minimal denial telemetry.                                                                                |
| `src/features/commercial-access/access-errors.ts`                      | Parse only recognized commercial codes and select audience-safe copy.                                                                                                       |
| `src/features/commercial-access/client-coaching-notice.tsx`            | Explain relationship availability without exposing coach billing state.                                                                                                     |
| `src/features/commercial-access/commercial-access-banner.tsx`          | Present owner/team recovery and limited-delivery notices.                                                                                                                   |
| `src/features/commercial-access/commercial-access-boundary.tsx`        | Select loading, retry, recovery, read-only and normal content for the current scope.                                                                                        |
| `src/features/commercial-access/commercial-remediation-panel.tsx`      | List owner commitments and confirm existing reducing RPC operations in an accessible dialog.                                                                                |
| `src/features/commercial-access/contracts.ts`                          | Define strict owner/workspace/client response schemas and the exact action vocabulary.                                                                                      |
| `src/features/commercial-access/index.ts`                              | Export the local feature entry points.                                                                                                                                      |
| `src/features/commercial-access/query-keys.ts`                         | Isolate cached access by authenticated actor and scope.                                                                                                                     |
| `src/features/commercial-access/subscription-recovery-screen.tsx`      | Keep Billing, security, privacy/export and commitments reachable.                                                                                                           |
| `src/features/commercial-access/use-commercial-access.ts`              | Provide locally mounted owner/workspace/client queries with periodic refresh and retry.                                                                                     |
| `src/features/pt-hub/lib/pt-hub.ts`                                    | Use safe public profile RPCs and normalize prospect-safe application denials.                                                                                               |
| `src/features/workspace-team/use-workspace-write-access.ts`            | Intersect existing delivery permissions with workspace commercial access.                                                                                                   |
| `src/pages/client/checkin.tsx`                                         | Gate coached submission while preserving answers and submitted history.                                                                                                     |
| `src/pages/client/habits.tsx`                                          | Gate relationship progress while preserving standalone behavior.                                                                                                            |
| `src/pages/client/messages.tsx`                                        | Gate the selected coached conversation; keep lead conversations independent.                                                                                                |
| `src/pages/client/workout-run.tsx`                                     | Gate coached start/save/finish/skip while retaining independent workout access.                                                                                             |
| `src/pages/pt-hub/settings/tabs/billing.tsx`                           | Expose explicit owner remediation during recovery.                                                                                                                          |
| `src/pages/public/coach-profile.tsx`                                   | Separate not-accepting-applications copy from retryable service failures.                                                                                                   |
| `supabase/migrations/20260912010000_commercial_access_enforcement.sql` | Add the central matrix, canonical resolver adapter, safe RPCs, static mutation guards, storage/public policies and guarded read-materialization helpers in one transaction. |
| `supabase/tests/account_capacity_enforcement.sql`                      | Update four expectations for commercial denial before capacity admission; retain every test.                                                                                |
| `supabase/tests/commercial_access.sql`                                 | Add 142 transactional SQL assertions across all modes, actual mutations, privacy, remediation, ancestry, storage and compatibility.                                         |
| `tests/e2e/commercial-access.spec.ts`                                  | Add eight local-database browser scenarios, including mobile recovery and restoration.                                                                                      |
| `tests/unit/commercial-access-components.test.ts`                      | Add nine rendered-component tests for audience-safe banners and recovery states.                                                                                            |
| `tests/unit/commercial-access.test.ts`                                 | Add 97 matrix/schema/privacy/inventory/isolation contract tests.                                                                                                            |

## 5. Migration and API contracts

One new forward migration, `20260912010000_commercial_access_enforcement.sql`, consumes `resolve_account_entitlements`; it does not introduce a second commercial truth. The matrix validates exactly 12 action names and five modes. Resolution uses transaction time. Unknown/inconsistent owner history fails closed into a distinct support recovery state.

- `get_my_commercial_access_summary()`: authenticated PT owner summary with mode, reason, effective date, exact actions, recovery action/path and computation time.
- `get_workspace_commercial_access(uuid)`: authorized workspace summary resolved against its database owner, with safe action booleans and owner Billing eligibility.
- `get_client_coaching_access(uuid)`: authorized relationship summary with service mode and historical, submission, independent-self-service and marketplace booleans; no coach billing data.
- `get_public_commercial_coach_profiles(text default null)`: safe available public profiles, preserving existing publication/listing rules.
- `is_coach_accepting_applications(uuid)`: public availability boolean only.
- `get_my_commercial_remediation()`: owner-authorized safe commitment lists for existing reducing operations.

Private matrix/resolver/assertion/scope/trigger helpers have explicit execute revocations. Frontend owner/workspace/client payloads are strictly validated with Zod. Invalid payloads and service failures show retry states rather than fabricated expiration.

## 6. Action-class matrix

All allowed actions remain subject to role/domain authorization and capacity admission. Full mode allows all 12 role-authorized classes. All five modes retain `billing_manage`, `account_security`, `data_export`, `remediation`, `client_self_service` and historical `client_coached_read`. `workspace_read` additionally requires full, existing-delivery or read-only mode. `delivery_write` and `client_coached_write` require full or existing-delivery mode. `business_configuration_write`, `acquisition_write` and `capacity_growth` require full mode, with only the existing first-workspace onboarding bootstrap exception.

The complete table and status mapping are in [commercial-access-modes.md](commercial-access-modes.md): trialing/active/past_due → full; trial_recovery/grace → existing delivery; restricted/canceled → read only; expired → none; no subscription without an owned workspace → onboarding. Superseded rows remain historical. Future paid cancellation and scheduled plan changes continue to follow the existing canonical resolver/reconciliation semantics.

## 7. Owner route behavior

Owner product content uses a local boundary: normal UI in full mode, persistent limited-delivery/recovery notices, read-only content with ordinary controls disabled, and an expired recovery shell. Billing, account/security settings, privacy/export/support and sign-out remain reachable. Integrations remain commercial business configuration. Onboarding preserves first-workspace bootstrap; an owned workspace with missing subscription history gets support recovery without a replacement trial.

## 8. Shared-workspace behavior

Workspace decisions use the selected workspace's owner, not the actor's personal account. Query keys include authenticated user and scope. An actor with an expired personal account retains role-authorized access to another owner's full workspace. Team notices use generic contact-owner guidance. Role/assigned-client permissions are intersected with commercial permissions, never replaced by them.

## 9. Existing delivery

Established relationship delivery, private templates, assignments, coach messages and client check-in/workout/habit/progress submissions remain available during grace/trial recovery. New acquisition, invitations, capacity growth, packages and business configuration are denied. Assignment changes require existing active staff and clients. Invite acceptance cannot evade acquisition restrictions merely because its identity was already counted at capacity.

## 10. Read-only and expired behavior

Read-only mode retains content while rejecting ordinary writes at the database boundary. None mode presents owner recovery rather than the normal product route. Existing historical data is preserved. Read helpers avoid creating onboarding/check-in/conversation rows when interaction is unavailable. Restoring the canonical valid local state restores normal access without rewriting publication preferences or domain history.

## 11. Client-independent access

Restrictions apply to the actual coached relationship or assignment. Clients retain coached history, independent personal nutrition/self-service, medical records, marketplace browsing, relationship removal and other available coach relationships. Standalone workouts remain usable. Contextual notices and submission guards preserve draft/input state. No client contract reveals the coach's plan, price, capacity, payment failure or provider status.

## 12. Public marketplace and applications

Available public profiles require full owner access and stored publication/listing preferences; marketplace results also require marketplace visibility. Direct public applications check commercial availability before creating a lead or consuming rate-limit state. Rejection is `PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS` with “This coach is not accepting new applications right now.” Service failures have separate retry copy. Neither loss nor restoration changes the stored publication preference.

## 13. Server enforcement and bypass protection

Static before-row guards cover parent/child delivery, business, acquisition and capacity paths, including direct table writes. Assignment ancestry determines workout-session scope before legacy normalization fills `client_id`. Source and target scopes are checked on moves. Missing scopes fail closed except nested FK cleanup after a guarded parent deletion. Restrictive storage insert/update policies intersect existing storage authorization. Commercial denial precedes capacity admission. Existing role/RLS checks still prevent full-mode unauthorized actions.

Delegated invite/relationship identity transitions retain their existing definer-RPC capability authorization and receive an audience-safe commercial check. Invite use-count updates recognize the established authenticated client relationship. Administrator/service paths remain trusted for reconciliation and maintenance; authenticated callers cannot grant themselves those roles or bypass triggers. No browser-controlled flag disables enforcement.

## 14. Remediation

Owner Billing exposes explicit confirmation for client relationship removal, staff suspension, pending-invite revocation and package archival using existing authorized RPCs. The database allowlist requires reducing-only field changes. Existing authorized transfer and workspace-closure semantics remain, including assigned-history protections. No automated deletion, archival, suspension, unpublication or capacity reduction occurs. Personal appearance/security edits remain available on legacy suspended memberships without permitting business-field changes.

## 15. Errors, privacy and telemetry

Nine exact commercial codes are recognized; unrelated permission/provider errors are not reclassified. Owner errors may include safe mode/effective-date/recovery metadata. Team, client and prospect errors omit owner billing state. UI query failures offer retry; denied submissions preserve drafts. Access API telemetry sends only safe code/domain/audience tags, without record IDs, content, payment details or raw database/provider errors. Rolled-back denials are not durable audit history. No email or push delivery was added.

## 16. Authentication isolation

No commercial provider was added to root/auth/bootstrap/theme infrastructure. Supabase access stays lazily loaded in the feature API; hooks are mounted only in relevant layouts/features and are keyed by actor/scope. The original authentication tests run with four workers and zero retries. Existing authentication behavior is retained.

## 17. Deterministic evidence

The 142 new transactional SQL assertions cover all 60 mode/action combinations, actual allowed/denied mutations, workspace ownership, client privacy/independence, remediation in multiple modes, storage, ancestry, missing-history recovery, first-workspace trial bootstrap, safe read materialization and legacy personal preferences. All fixtures roll back. Existing SQL tests remain present.

The 106 focused tests cover strict contracts, action matrix, safe errors, write inventory, import isolation and rendered banners/recovery. Eight real local-database browser scenarios cover grace delivery/business restriction, read-only direct denial without source changes, expired recovery and restoration, public availability/preference preservation, shared-workspace isolation, trial recovery, safe application rejection without a lead, and client-independent access. The recovery screen was visually inspected at 375 px and checked for no horizontal overflow.

## 18. Real-provider evidence

None added in this task. Local deterministic subscription changes and existing provider fixtures do not prove real payment recovery, webhook delivery, remote mappings or live enforcement. Real Lemon Squeezy test-mode and production proof remain separate predecessor/provider and deployment work requiring explicit authorization.

## 19. Exact verification results

| Check                                        | Result                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Local Supabase start and clean reset         | Passed; final forward migration applied locally                                      |
| Database lint                                | Zero findings                                                                        |
| Database suite                               | 806 assertions, 12 files, all passed                                                 |
| Focused unit/component suites                | 106 tests, two files, all passed                                                     |
| Full unit suite on final frozen code         | 1,710 passed, 13 exact baseline failures, zero skipped                               |
| Targeted access browser suite                | Eight passed, four workers, zero retries; all repeated in both final release suites  |
| Original authentication pair, repeated twice | Four passed, four workers, zero retries; originals also covered by final full suites |
| Token-invite browser regression              | Passed after targeted fix; repeated in final full suites                             |
| Checkout/portal/plan-change regression suite | 29 passed in dedicated run; all repeated in final full suites                        |
| Lint                                         | Zero errors; three inherited warnings                                                |
| Format                                       | Passed                                                                               |
| TypeScript and Vite production build         | Passed                                                                               |
| Release run A                                | 104 passed, ten exact inherited skips, zero failures                                 |
| Release run B                                | 104 passed, ten exact inherited skips, zero failures                                 |
| Deno checks                                  | Not applicable: no Edge Function changed                                             |
| Git whitespace check                         | Passed                                                                               |

The lint warnings concern existing profile-inputs Fast Refresh exports, client-message effect dependencies and the workout-run `workoutId` effect dependency. No new lint suppression was added.

The first exploratory full release attempt exposed the token-invite timestamp transition and failed that one browser scenario. The guard was corrected without weakening the browser test; two SQL regressions were added. A clean reset, 806 SQL assertions and the targeted invite browser test passed before the final passing pair. The earlier failed run is retained as `pr-price-08-release-initial-failed.log` and is not counted as a passing release run.

Both final `npm run verify:release` commands passed consecutively with four browser workers and zero retries. Run A browser duration: 1.7 minutes; run B: 1.6 minutes. SHA-256 hashes of all **29 changed implementation/test files** match before, between and after the pair. The sorted compact-JSON manifest digest is `143ae270b40245e8775f62e44a215983816a368a9dff0100e1eeb44f28d2ba22`. Only evidence documentation was finalized after the pair.

The ten inherited browser skip identities match the PR-PRICE-07 final release log exactly:

- `[chromium] › tests\e2e\checkin-submit-review.smoke.spec.ts:11:3 › Smoke: check-in submit and PT review › Client can submit check-in and PT can review`
- `[chromium] › tests\e2e\notifications.spec.ts:10:3 › notification attribution, alignment and delete recovery at 1602px`
- `[chromium] › tests\e2e\notifications.spec.ts:10:3 › notification attribution, alignment and delete recovery at 375px`
- `[chromium] › tests\e2e\nutrition-program-view.spec.ts:10:3 › Nutrition cards and read-only preview at 1602px`
- `[chromium] › tests\e2e\nutrition-program-view.spec.ts:10:3 › Nutrition cards and read-only preview at 375px`
- `[chromium] › tests\e2e\pt-assign-workout.smoke.spec.ts:10:3 › Smoke: PT assign workout › PT can assign workout to a client`
- `[chromium] › tests\e2e\pt-workspace-header.spec.ts:8:1 › workspace header stays within its available width in both sidebar states`
- `[chromium] › tests\e2e\workout-template-duplicate.spec.ts:9:1 › Duplicate copies the workout and prescriptions, and cleans up a failed copy`
- `[chromium] › tests\e2e\workout-template-view.spec.ts:10:3 › View opens a read-only workout dialog at 1602px`
- `[chromium] › tests\e2e\workout-template-view.spec.ts:10:3 › View opens a read-only workout dialog at 375px`

Raw local logs and JSON are under `%TEMP%/pr-price-08-*`: `reset-final.log`, `db-lint-final.log`, `db-final.log`, `focused-final.log`, `unit-final.json`, `baseline.json`, `browser-final.log`, `auth-final.log`, `invite-final.log`, `billing-browser.log`, `release-a.log`, `release-b.log`, and the before/between/after hash manifests. The mobile image is `%TEMP%/pr-price-08-access-recovery-mobile.png`.

## 20. Exact baseline comparison

Merged-main baseline: **1,604 passed, 13 failed, zero pending/skipped**. Final implementation: **1,710 passed, 13 failed, zero pending/skipped**. The failing `(file, full test name)` identities match exactly: no new or removed failure and no new skip. The increase is exactly the 106 new focused tests. Four existing capacity SQL expectations were intentionally updated for the new policy; no assertions were deleted or skipped.

| Existing failing file                                            | Exact full test name                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/anatomical-muscle-selector.test.ts`                  | controlled anatomical selector source contract emits only MuscleKey values from map and list, and null from Clear      |
| `tests/unit/anatomical-muscle-selector.test.ts`                  | controlled anatomical selector source contract uses selector-local theme tokens without a selected glow                |
| `tests/unit/checkin-assignment-summary-contract.test.ts`         | coach check-in assignment summary contract gates the edit CTA to existing delivery-write permission                    |
| `tests/unit/checkin-assignment-summary-contract.test.ts`         | coach check-in assignment summary contract renders a current check-in assignment summary in the coach delivery context |
| `tests/unit/client-continuity-contract.test.ts`                  | client continuity beta contract removed-only clients get a safe no-active-workspace home state                         |
| `tests/unit/client-detail-assignment-card-polish.test.ts`        | client detail assignment card polish surfaces snapshot copy near workout, program, and nutrition assignment controls   |
| `tests/unit/client-detail-assignment-card-polish.test.ts`        | client detail assignment card polish uses cadence settings language for check-in assignment cards                      |
| `tests/unit/client-portal-tag-minimization.test.ts`              | client portal tag minimization keeps today's actions ahead of the weekly calendar and daily log                        |
| `tests/unit/client-portal-tag-minimization.test.ts`              | client portal tag minimization uses client-facing copy for missing workout, nutrition, and check-in assignments        |
| `tests/unit/final-badge-status-regression.test.ts`               | final badge and status regression keeps client-facing task statuses and no-assignment copy visible                     |
| `tests/unit/notification-center-contract.test.ts`                | delivery-backed notification center contract keeps the PT notifications page concise                                   |
| `tests/unit/pt-client-baseline-marker-assignment-wiring.test.ts` | PT performance marker baseline wiring makes the client baseline page use the active marker library directly            |
| `tests/unit/workspace-header-pill-wiring.test.ts`                | workspace header pill wiring uses the unified full-height rail and compact utility dock across PT routes               |

## 21. Migration and rollback

The migration was applied through a clean local reset and linted/tested locally. It changes functions, guards, grants and policies; it does not rewrite subscription/provider/operation/capacity/domain history, prices, trial dates, mappings or publication preferences. Historical migrations are untouched. Rollback is an application revert plus a reviewed compensating forward migration restoring affected functions, grants, policies and guards together, preserving all history. No remote rollback or deployment was attempted.

## 22. Blockers and unproven areas

No new local verification failure or skip remains. The inherited 13 unit failures and ten browser skips remain explicitly documented in sections 19 and 20. Live provider recovery, remote deployment/mappings, production configuration and externally delivered telemetry remain unproven. Local role, SQL, contract and browser tests establish the tested behavior, not exhaustive real-device/provider coverage. Read-only control disabling is contextual UI feedback; database guards remain authoritative for already-open dialogs and direct requests. Final review, commit and publication remain pending.

## 23. Explicit deferrals

Individual feature-key gating, seats/quantity billing, refunds, coupons, invoice-list UI, client payments and live deployment are outside PR-PRICE-08. No provider checkout/portal mapping, live payment or remote configuration change is included.
