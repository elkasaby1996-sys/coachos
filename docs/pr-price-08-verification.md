# PR-PRICE-08 implementation and verification

> Sections 1–23 preserve the original pre-correction report and preliminary failures. The release pair recorded there predates the review corrections. Section 24 records the correction verification and supersedes the earlier release pair.

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

## 24. Review correction verification (2026-09-12)

Starting head: `d8661377f8de169db47db397324232f3ef31e37f`; base: `cce228bcc16723f304ba2ed8e354bab10be2def8`; branch: `feat/pr-price-08-access-mode-enforcement`. Starting working tree was clean. The correction is limited to PR-PRICE-08; PR-PRICE-09 was not started.

### Reproductions and corrections

Permanent tests were written before the implementation correction. The completed original-code probe ran 102 assertions with 29 failures: expiry/boundary, active-staff supersession, duplicate identity and subject/count agreement; compatibility/lifecycle interaction and historical conversation access; and coached/branding DELETE enforcement. [Exact failing probes](evidence/pr-price-08-correction-probes-before.txt) preserve the evidence. An earlier fixture draft used an invalid compatibility enum (`inactive`); it was corrected to the actual enum member `completed` before the complete reproduction. That draft is not counted as a valid lifecycle reproduction.

The migration now shares `account_capacity_pending_seat_invites(owner, at)` between capacity and remediation. The predicate matches the latest PR-PRICE-04 implementation of the PR-PRICE-03 capacity contract: workspace currently owned by owner; status pending; expires_at strictly greater than computation time; accepted_at and accepted_by_user_id both null; trimmed email nonempty with @ after position 1. Revoked status is excluded; no invented revoked_at column exists. Identity resolution uses normalized auth email and minimum user UUID text, otherwise the canonical hashed email key. Active staff roles are owner/admin/coach/assistant_coach/viewer/pt_owner/pt_coach/pt, plus the billing owner, across all currently owned workspaces. Their normalized email supersedes pending invites. Capacity still groups by dimension/subject_key with bool_and(pending). Remediation picks one deterministic invite UUID per subject. All duplicate records remain intact and require explicit revocation; refresh can show the next representative.

The complete branch diff and repository status reads were searched. The new materializer read of c.status was the access-decision dependency; status in the reducing-transition changed-field allowlist only permits the existing compatibility mirror to accompany a lifecycle transition. Other status reads concern subscriptions, memberships, packages, leads and check-ins. Existing historical status reads outside corrected conversation authorization were not broadly refactored.

`get_client_coaching_access` now intersects current relationship and known nonterminal lifecycle with canonical commercial mode. Invited/onboarding/active/paused can interact in full or existing_delivery_only; completed/churned/unknown/null and removed/transferred_out cannot. Conversation discovery enumerates only authenticated linked clients, returning existing history in all states while materializing only when the resolver allows messaging. The existing can_access_conversation domain helper is redefined in the same migration to permit linked-client history without compatibility status. Messaging mutation guards consult the canonical resolver so readable history does not grant writes. Staff role checks, workspace matching, client privacy and separate lead conversations remain intact. The unique conversation constraint and ON CONFLICT handle concurrent retries without duplicates.

### Assurance gates

Storage SQL tests execute real INSERT/UPDATE/DELETE for baseline photos, unsubmitted check-in photos, workspace branding and personal medical documents across full/grace/restricted/expired. Ordinary coached file DELETE now has a restrictive commercial policy. There is no storage-remediation bypass. Client medical self-service remains available; foreign client uploads remain denied. Branding uses business_configuration_write; its older policy grants no UPDATE, which remains denied even in full mode. Existing remediation RPC assertions remain in the original commercial SQL suite.

The [service audit](commercial-access-security.md#trusted-service-role-inventory) inventories every Edge Function and shared service RPC path. No user-facing service-role mutation targets PR-PRICE-08 guarded coached-domain tables; billing recovery/reconciliation, independent wearable health records, platform marketing and read-only exercise search are documented separately. Direct service writes are added to the JSON inventory. The new unit gate rejects unreviewed tables or an independent table becoming guarded. No provider endpoint was invoked.

[Marketplace fixture](evidence/pr-price-08-correction-marketplace.sql) and [raw local EXPLAIN ANALYZE/BUFFERS plans](evidence/pr-price-08-correction-marketplace.txt): 2,500 auth users, PT profiles, billing accounts, subscriptions, workspaces, public profiles and settings; 10% unpublished, 20% marketplace-hidden, every seventh private, every fourth subscription restricted. ANALYZE ran on relevant tables. Discovery returned 1,286 rows in **707.444 ms**. Expanded query: bitmap scan of existing pt_hub_profiles_marketplace_idx, commercial predicate on 2,000 candidate profiles (1,500 pass), hash join with 2,143 listed settings, then quicksort (270 kB), **671.447 ms**, 22,600 shared buffer hits. The opaque RPC Function Scan had 23,141 hits. Direct slug lookup returned one row in **3.969 ms**, 113 hits. SQL security-definer boundaries hide nested plans, so the equivalent inner SELECT was separately explained.

The resolver is per candidate profile, not set-based; this is a real scaling cost. Existing indexing is used and no missing-index bottleneck was demonstrated. No speculative index or alternate commercial truth was added. A future larger marketplace/latency target should measure pagination and filtering before considering a batch canonical resolver. This bounded local result is not a production latency guarantee. The fixture rolled back all rows; statistics-only ANALYZE effects were subsequently removed by the final clean reset. Two preliminary fixture drafts failed on an invalid visibility value and PowerShell dollar-quote handling; the checked-in fixture uses the verified schema and completed successfully.

### Correction files

- Existing PR-PRICE-08 migration: canonical pending invite helper/reuse, lifecycle-aware interaction resolver, status-independent conversation history authorization and materialization, message guard and restrictive storage DELETE.
- New `supabase/tests/commercial_access_corrections.sql`: 125 transactional assertions covering invitation edges and capacity agreement, nine lifecycle/relationship states, history/privacy, actual message RPCs, independent leads and storage operations.
- `tests/e2e/commercial-access.spec.ts`: remediation duplicate/expiry/revocation workflow and eight lifecycle disagreement scenarios, each with eight concurrent materialization requests, historical message reads and actual send outcomes.
- `tests/unit/commercial-access.test.ts`: service mutation inventory and authenticated scope regression checks.
- `src/features/commercial-access/commercial-access-boundary.tsx`: retain the same recovery-page wrapper before and after access resolution, preserving portal return state.
- `tests/e2e/billing-portal.spec.ts`: deliberately hold the real commercial response until the portal return marker is consumed, then verify polling and recovery survive resolution; existing assertions remain.
- `playwright.config.ts`: validated optional local worker limit, retaining the default of four and zero retries.
- Commercial modes/security/write inventory and this report: corrected contracts, complete service audit and evidence, without removing preliminary failures.
- `docs/evidence/pr-price-08-correction-*`: reproducible query fixture and original failing probes/plan evidence.

### Verification execution notes

The first post-correction browser attempt had fixture failures when privileged history inserts omitted the actor required by enforce_message_insert_limits. The fixture now supplies an explicit transaction-local owner identity. That attempt also overlapped schema-locking SQL probes and produced bootstrap/timing failures. Subsequent verification runs SQL and browsers sequentially. A lint attempt after pgTAP installation reported extension-internal missing temporary relations and legacy catalogue references; final lint is run immediately after clean reset, before pgTAP installation. The original preliminary PR-PRICE-08 failure and release evidence above is preserved.

The full SQL run overlapped a TypeScript/Vite build and hit five cascading assertions in the existing billing-plan-change retired-mapping fixture. That fixture uses transaction_timestamp + 1 second for provider evidence while operations use clock_timestamp; under CPU pressure later operations can postdate that synthetic evidence. Running the unchanged 931-assertion SQL suite alone passed. No billing logic, plan-change tests or clock policy was changed.

On the 8 GB local machine, browser runs reached roughly 250 MB free physical memory. All eight new lifecycle/concurrency scenarios passed; failures were older UI assertions that ran while commercial RPCs or routes were still loading. New fixture-heavy cases are grouped into one worker (four workers remain configured; each lifecycle test still sends eight simultaneous independent RPCs). Owner navigation and remediation loading now await the actual RPC response before assertions, rather than treating document-load completion as access readiness. Assertions and zero retries are preserved. These exploratory failures remain in the local correction logs; they are not counted as release passes.

The first complete release attempt at four workers was stopped after bootstrap/loading timeouts in pre-existing capacity and billing tests. It is retained as `pr-price-08-correction-release-exploratory-failed.log` and is not part of the final pair. Studio and analytics containers were temporarily stopped to reduce local memory pressure. A subsequent attempt used `REPSYNC_E2E_WORKERS=2` through a validated opt-in Playwright setting; the default remains four. The original auth gate was independently run at four workers and zero retries (18 passed). No assertion, test or skip condition was removed. Commercial cases run sequentially within the pool to avoid simultaneous fresh credential creation; their independent eight-request materialization races remain concurrent. `playwright.config.ts` is included in the final freeze manifest.

The first two-worker complete run exposed the required concurrent retry regression: an invited client received `23505` on `conversations_client_id_key` even though ON CONFLICT named conversations_workspace_client_key. PostgreSQL retains both unique constraints. The corrected client and coach materializers now use untargeted ON CONFLICT DO NOTHING, letting both existing unique indexes arbitrate the insert without dropping constraints or changing data. The permanent eight-request browser probe caught this race; [captured failure](evidence/pr-price-08-correction-concurrency-before.txt) is retained. That run ended with 110 passes, 10 inherited skips and 3 failures (the race and two existing portal timing cases) and is not part of the final release pair. Database and browser verification were repeated after this correction.

The two portal failures also reproduced at one worker (25 passes, two failures), disproving the earlier resource-only explanation for those cases. The new commercial boundary initially rendered recovery children directly, then added a fieldset when access resolved. That remounted the billing page after its portal-return query marker was consumed, losing polling/refresh state. The boundary now preserves its wrapper during access loading. Existing portal tests explicitly delay the real commercial response until after the return marker is consumed and assert recovery survives; no billing provider, plan-change or polling policy was modified. The mandatory UI/UX skill design-system and React state lookup were run before this interaction correction. Existing visual styling and accessible control semantics are retained.

The polling harness initially reused `waitForLoadState("networkidle")` after virtual-clock advances, although that document load state had already been reached. A final interval tick could still dispatch an authenticated RPC after the count snapshot. The fixture now tracks actual RPC request/finished/failed events and requires 500 ms of network quiescence using the Node clock. It also finishes initial reads before navigation. The original exact no-more-polls count and manual-refresh assertions remain intact. Intermediate route-cancellation and late-read failures are retained in local exploratory logs; they are not release passes.

### Final correction results and verdict

**The corrections are locally verified.** The two consecutive corrected release runs below supersede the pre-correction pair in section 19. Earlier preliminary failures, fixture errors and unsuccessful release attempts remain documented above. No new failure or skip remains relative to the starting branch baseline.

| Required check                                                                                 | Final correction result                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Local Supabase start and clean reset                                                           | Passed; only local project used                                                                              |
| Database lint after final clean reset                                                          | Zero findings                                                                                                |
| Full SQL suite                                                                                 | 931 assertions across 13 files passed, including 125 new correction assertions                               |
| Focused commercial/lifecycle/conversation/capacity/storage/service unit and component coverage | 476 tests across 35 files passed; commercial subset 108 tests, including nine rendered component tests       |
| Focused commercial browser coverage                                                            | All 17 passed; repeated in both final release runs                                                           |
| Portal browser coverage                                                                        | All 10 passed with delayed commercial resolution and actual RPC quiescence checks                            |
| Fresh invited-client materialization race stress                                               | Five passes, eight simultaneous independent HTTP requests per pass, no duplicate or unique-constraint errors |
| Full-unit branch baseline                                                                      | 1,710 passed, 13 failed, zero skipped                                                                        |
| Full-unit final frozen correction                                                              | 1,712 passed, the exact same 13 failed identities, zero skipped                                              |
| Original auth coverage plus bootstrap/resilience stress                                        | 18 passed, four workers, zero retries, each test repeated twice, after the final implementation change       |
| Lint                                                                                           | Zero errors; the same three inherited warnings                                                               |
| Formatting                                                                                     | Passed                                                                                                       |
| TypeScript/Vite production build                                                               | Passed                                                                                                       |
| Final `npm run verify:release` A                                                               | Exit 0; 113 passed, ten exact inherited skips, zero failures; browser duration 8.4 minutes                   |
| Final `npm run verify:release` B                                                               | Exit 0; 113 passed, ten exact inherited skips, zero failures; browser duration 8.4 minutes                   |
| Final release browser settings                                                                 | One worker via `REPSYNC_E2E_WORKERS=1`, zero retries; default configuration remains four workers             |
| Frozen implementation/test code                                                                | All 981 files identical before, between and after the pair                                                   |
| Git whitespace check                                                                           | Passed                                                                                                       |

The complete sorted compact-JSON file-manifest SHA-256 is `ab76f4465dcefa08b785e3ed4a6a4a587ee29f59e3979937662cbeadda5b254f`. Only evidence documentation was finalized after the pair. [Machine-readable final verification](evidence/pr-price-08-correction-final-verification.json) records both results, the freeze digest and all ten exact browser skip identities. These identities match section 19 exactly. [Exact full-unit comparison](evidence/pr-price-08-correction-unit-comparison.json) records every inherited failure identity; no failure or skip was added, removed or renamed to obtain the comparison.

The final local logs are under `%TEMP%/pr-price-08-correction-`: `reset-concurrency.log`, `db-lint-concurrency.log`, `db-concurrency.log`, `focused-unit.log`, `browser-stable-boundary.log` (17 commercial passes plus the preserved intermediate portal harness failure), `portal-final.log`, `race-stress.log`, `auth-final.log`, `unit-final-frozen.json`, `unit-final-frozen.log`, `release-a.log`, `release-b.log`, and `hashes-before.json` / `hashes-between.json` / `hashes-after.json`. The two final release logs independently repeat all corrected commercial and portal cases together on the frozen code.

Only `20260912010000_commercial_access_enforcement.sql` was changed among migrations. No second correction migration or historical migration edit was made. No prices, capacities, plan versions, trial policy, provider mappings, plan-change behavior, access modes, action-class vocabulary, publication preferences or existing domain history were rewritten. The portal correction preserves recovery component state; it does not alter provider or billing policy.

No remote Supabase operation, Lemon Squeezy operation, real provider call, deployment, push or pull-request creation was performed. PR-PRICE-09 was not started. The correction is committed locally as the commit containing this report; the final task response supplies its immutable commit ID.

Remaining limits are the explicitly inherited 13 unit failures and ten browser skips, the measured per-profile marketplace resolver scaling cost, and unproven remote/provider/deployment behavior. The one-worker full release pair establishes deterministic local coverage, while the separate four-worker auth run and concurrent HTTP materialization probes exercise the required concurrency. It does not establish arbitrary whole-suite parallel-load performance on this 8 GB machine.

**PR readiness:** safe to open for normal review. The requested local correction gates are satisfied and support merging PR-PRICE-08 subject to normal repository review/CI and acceptance of the documented inherited baseline. This is not a claim that live billing, live enforcement or live provider integration is enabled.

Local `supabase_studio_coachos` and `supabase_analytics_coachos` were restored after verification; Docker confirmed both running. Other local project services remained available throughout.
