# Commercial catalogue foundation (PR-PRICE-01)

## Ownership and boundaries

The commercial catalogue is owned by reviewed database migrations. Runtime users, account owners, and the service role cannot directly read or write its tables. The public RPC is the only runtime read surface. Commercial plan mappings describe intended contracts; they do not grant permissions or enforce entitlements. Existing workspace role and assigned-client access checks remain independent.

The frontend v1 snapshot is a reviewed projection of the migration's public prices and capacities. It contains integer USD minor units and is frozen, including nested capacities. It is used by existing pricing cards without a Supabase request. Database and TypeScript mapping parity is checked in unit tests; pgTAP verifies the applied schema and seeds.

## Locked v1 contracts

| Plan   | Monthly USD minor | Annual USD minor | Client capacity | Included coaches | Maximum coaches | Active workspaces | Published packages | Sort | Popular |
| ------ | ----------------: | ---------------: | --------------: | ---------------: | --------------: | ----------------: | ------------------ | ---: | ------- |
| Launch |              1900 |            19000 |              10 |                1 |               2 |                 1 | 3                  |   10 | No      |
| Growth |              5900 |            59000 |              50 |                2 |               5 |                 3 | NULL (unlimited)   |   20 | Yes     |
| Scale  |             11900 |           119000 |             100 |                5 |              10 |                 5 | NULL (unlimited)   |   30 | No      |

All three are version 1, active and public. Annual prices equal ten monthly prices. USD prices display as $19/$190, $59/$590, and $119/$1,190. Client capacity includes onboarding and paused coaching relationships under the locked policy; this PR performs no counting or enforcement. Additional seats are commercially priced at $12 monthly / $120 annually, but no add-on product or billing model is implemented.

Studio is deferred and has no canonical key, seed, or active card. `custom` is reserved for non-public negotiated contracts; no custom plan is seeded. The unused `src/pages/public/marketing-home.html` is an old unimported design reference, not the routed marketing implementation, and remains outside this data correction.

## Plan-version lifecycle and immutability

Create a draft, edit its contract and feature mappings, then activate it. Seed insertion follows this exact sequence with all protection triggers enabled. Mapping edits lock both old and new parent plan rows, serializing edits against activation and preventing moves out of an active contract.

An active version cannot change prices, capacities, identity, sort order, effective date, or other contract fields. The sole state transition is retirement, with `is_public=false`, `is_most_popular=false`, and `retired_at` populated. Retired versions cannot be edited or reactivated. Plans and feature rows cannot be deleted. Future changes require a new version, retirement of the old version, then activation of its successor in a reviewed transaction. Unique partial indexes enforce one active version per key, one public popular plan, and distinct public sort positions.

This preserves the meaning of a version for future billing references and audit history. Nothing backfills existing accounts into these plans.

## Feature-readiness lifecycle and audit

Readiness vocabulary: `DRAFT`, `IMPLEMENTED`, `E2E_PROVEN`, `PRODUCTION_HARDENED`, `COMMERCIALLY_SALEABLE`, `RETIRED`. Visibility is independently `internal`, `beta`, or `public`. A mapping alone is never evidence of readiness. Promotion requires review: a working path for IMPLEMENTED, specific passing end-to-end evidence for E2E_PROVEN, explicit release hardening for PRODUCTION_HARDENED, and explicit commercial-release evidence for COMMERCIALLY_SALEABLE. Withdrawn capabilities may be retired without deleting their keys.

Initial static repository audit: **16 IMPLEMENTED, 47 DRAFT; all 63 internal**. No E2E, production-hardening, or commercial-release classification is asserted. Existing marketing text was excluded as evidence. IMPLEMENTED means a concrete working code path was inspected, not that the feature is commercially approved. Catalogue SQL tests do not promote unrelated product features to E2E_PROVEN.

Every non-DRAFT classification and its inspected evidence:

| Feature                             | Repository evidence                                                                                                           | Working path                                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `core.client_management`            | [src/features/pt-hub/lib/pt-hub.ts](../src/features/pt-hub/lib/pt-hub.ts)                                                     | fetchPtHubClientSummaries and usePtHubClientsPage read canonical client records.                         |
| `core.client_onboarding`            | [src/features/client-onboarding/lib/client-onboarding-api.ts](../src/features/client-onboarding/lib/client-onboarding-api.ts) | saveClientOnboardingDraft persists onboarding sections; submitClientOnboarding calls the submission RPC. |
| `core.exercise_library`             | [src/lib/exercise-queries.ts](../src/lib/exercise-queries.ts)                                                                 | exerciseLibraryFullQueryOptions loads exercises by owner.                                                |
| `core.nutrition_delivery`           | [src/lib/nutrition.ts](../src/lib/nutrition.ts)                                                                               | useAssignedNutritionByDate and useAssignedNutritionMeals load assigned plans and meals.                  |
| `core.messaging`                    | [src/lib/messages.ts](../src/lib/messages.ts)                                                                                 | sendConversationMessage validates and sends through send_conversation_message.                           |
| `acquisition.public_profile`        | [src/features/pt-hub/lib/pt-hub.ts](../src/features/pt-hub/lib/pt-hub.ts)                                                     | usePtHubProfile and publication state expose the persisted coach profile.                                |
| `acquisition.lead_pipeline`         | [src/features/pt-hub/lib/pt-hub.ts](../src/features/pt-hub/lib/pt-hub.ts)                                                     | usePtHubLeads reads lead states and notes.                                                               |
| `acquisition.lead_chat`             | [src/features/lead-chat/lib/lead-chat.ts](../src/features/lead-chat/lib/lead-chat.ts)                                         | useLeadConversationThread reads messages; sendLeadChatMessage uses lead_chat_send_message.               |
| `acquisition.lead_source_reporting` | [src/features/pt-hub/lib/business-analytics.ts](../src/features/pt-hub/lib/business-analytics.ts)                             | buildAcquisitionAnalytics aggregates source cohorts from useAnalyticsLeads in use-business-analytics.ts. |
| `acquisition.conversion_reporting`  | [src/features/pt-hub/lib/business-analytics.ts](../src/features/pt-hub/lib/business-analytics.ts)                             | buildAcquisitionAnalytics calculates converted cohorts, trends, and rates from persisted leads.          |
| `acquisition.package_reporting`     | [src/features/pt-hub/lib/business-analytics.ts](../src/features/pt-hub/lib/business-analytics.ts)                             | buildAcquisitionAnalytics groups conversions by package ID and label snapshot.                           |
| `workspace.basic_identity`          | [src/features/workspace-branding/use-workspace-branding.ts](../src/features/workspace-branding/use-workspace-branding.ts)     | useWorkspaceBranding reads persisted workspace identity through BRANDING_SELECT.                         |
| `workspace.multiple_workspaces`     | [src/features/pt-hub/lib/pt-hub.ts](../src/features/pt-hub/lib/pt-hub.ts)                                                     | usePtHubWorkspaces enumerates owned and shared workspace membership.                                     |
| `team.assigned_client_access`       | [src/features/workspace-team/access.ts](../src/features/workspace-team/access.ts)                                             | canAccessClient and getAccessibleClientScope check active membership and client assignments.             |
| `team.standard_roles`               | [src/features/workspace-team/contracts.ts](../src/features/workspace-team/contracts.ts)                                       | ROLE_PERMISSIONS is consumed by access.ts permission and membership checks.                              |
| `analytics.basic_dashboard`         | [src/features/pt-hub/lib/pt-hub.ts](../src/features/pt-hub/lib/pt-hub.ts)                                                     | usePtHubOverview and usePtHubAnalytics build summaries from clients and workspaces.                      |

DRAFT is a conservative classification where this bounded audit did not establish a complete implementation path for the exact commercial capability. It does not assert that the repository has no related code. In particular, workout persistence, branding, wearable adapters, notifications and support have related modules/migrations, but their broader commercial promises remain unverified here. Billing/payment/revenue placeholders are not implementations. Advanced automation, integration, custom team control and support-service promises need dedicated evidence before promotion.

The complete initial audit disposition (including all DRAFT features):

| Feature                                  | Readiness   | Intended plans        |
| ---------------------------------------- | ----------- | --------------------- |
| `core.client_management`                 | IMPLEMENTED | Launch, Growth, Scale |
| `core.client_onboarding`                 | IMPLEMENTED | Launch, Growth, Scale |
| `core.workout_delivery`                  | DRAFT       | Launch, Growth, Scale |
| `core.program_delivery`                  | DRAFT       | Launch, Growth, Scale |
| `core.exercise_library`                  | IMPLEMENTED | Launch, Growth, Scale |
| `core.custom_exercises`                  | DRAFT       | Launch, Growth, Scale |
| `core.nutrition_delivery`                | IMPLEMENTED | Launch, Growth, Scale |
| `core.habit_tracking`                    | DRAFT       | Launch, Growth, Scale |
| `core.checkins`                          | DRAFT       | Launch, Growth, Scale |
| `core.messaging`                         | IMPLEMENTED | Launch, Growth, Scale |
| `core.progress_tracking`                 | DRAFT       | Launch, Growth, Scale |
| `core.lifecycle_management`              | DRAFT       | Launch, Growth, Scale |
| `core.risk_indicators`                   | DRAFT       | Launch, Growth, Scale |
| `core.data_export`                       | DRAFT       | Launch, Growth, Scale |
| `acquisition.public_profile`             | IMPLEMENTED | Launch, Growth, Scale |
| `acquisition.marketplace_eligibility`    | DRAFT       | Launch, Growth, Scale |
| `acquisition.public_application`         | DRAFT       | Launch, Growth, Scale |
| `acquisition.lead_pipeline`              | IMPLEMENTED | Launch, Growth, Scale |
| `acquisition.lead_chat`                  | IMPLEMENTED | Launch, Growth, Scale |
| `acquisition.lead_source_reporting`      | IMPLEMENTED | Growth, Scale         |
| `acquisition.conversion_reporting`       | IMPLEMENTED | Growth, Scale         |
| `acquisition.package_reporting`          | IMPLEMENTED | Growth, Scale         |
| `acquisition.team_lead_routing`          | DRAFT       | Scale                 |
| `workspace.basic_identity`               | IMPLEMENTED | Launch, Growth, Scale |
| `workspace.custom_logo`                  | DRAFT       | Growth, Scale         |
| `workspace.custom_accent`                | DRAFT       | Growth, Scale         |
| `workspace.custom_welcome_content`       | DRAFT       | Growth, Scale         |
| `workspace.custom_invite_identity`       | DRAFT       | Growth, Scale         |
| `workspace.multiple_workspaces`          | IMPLEMENTED | Growth, Scale         |
| `workspace.cross_workspace_admin`        | DRAFT       | Scale                 |
| `team.assigned_client_access`            | IMPLEMENTED | Launch, Growth, Scale |
| `team.additional_seats`                  | DRAFT       | Launch, Growth, Scale |
| `team.standard_roles`                    | IMPLEMENTED | Growth, Scale         |
| `team.custom_permissions`                | DRAFT       | Scale                 |
| `team.audit_history`                     | DRAFT       | Scale                 |
| `team.workload_reporting`                | DRAFT       | Scale                 |
| `team.cross_workspace_access`            | DRAFT       | Scale                 |
| `analytics.basic_dashboard`              | IMPLEMENTED | Launch, Growth, Scale |
| `analytics.client_progress`              | DRAFT       | Launch, Growth, Scale |
| `analytics.advanced_filters`             | DRAFT       | Growth, Scale         |
| `analytics.saved_segments`               | DRAFT       | Growth, Scale         |
| `analytics.retention`                    | DRAFT       | Growth, Scale         |
| `analytics.multi_workspace`              | DRAFT       | Scale                 |
| `analytics.team_performance`             | DRAFT       | Scale                 |
| `analytics.scheduled_reports`            | DRAFT       | Scale                 |
| `automation.transactional_notifications` | DRAFT       | Launch, Growth, Scale |
| `automation.standard_templates`          | DRAFT       | Growth, Scale         |
| `automation.conditional_rules`           | DRAFT       | Scale                 |
| `automation.multi_step`                  | DRAFT       | Scale                 |
| `automation.cross_workspace`             | DRAFT       | Scale                 |
| `automation.execution_history`           | DRAFT       | Growth, Scale         |
| `integration.wearables`                  | DRAFT       | Launch, Growth, Scale |
| `integration.calendar`                   | DRAFT       | Growth, Scale         |
| `integration.meeting_provider`           | DRAFT       | Growth, Scale         |
| `integration.zapier_make`                | DRAFT       | Scale                 |
| `integration.api`                        | DRAFT       | Scale                 |
| `integration.webhooks`                   | DRAFT       | Scale                 |
| `commercial.published_packages`          | DRAFT       | Launch, Growth, Scale |
| `commercial.client_payments`             | DRAFT       | Launch, Growth, Scale |
| `commercial.revenue_reporting`           | DRAFT       | Growth, Scale         |
| `support.standard`                       | DRAFT       | Launch, Growth, Scale |
| `support.priority`                       | DRAFT       | Growth, Scale         |
| `support.migration_assistance`           | DRAFT       | Scale                 |

## Plan-feature mapping

The table above is the complete contract mapping: 29 universal features, 18 additional Growth/Scale features, and 16 Scale-only features. Launch has 29 mappings, Growth 47, Scale 63. All core keys are universal, and Growth is a subset of Scale. Each mapping has an object-valued JSON configuration, initially `{}`. These mappings are immutable after activation, regardless of feature readiness.

## Public RPC and permissions

`get_public_commercial_catalogue()` is a no-argument, STABLE, SECURITY DEFINER SQL function with `search_path = pg_catalog, public`, fully qualified table references, and no dynamic SQL. Default PUBLIC execute is revoked; anon, authenticated, and service_role receive execute. All three tables have RLS enabled with no runtime policies, and explicit table privilege revocation for PUBLIC, anon, authenticated, and service_role. Trigger functions also revoke runtime execute.

The payload is `{ schemaVersion: 1, plans: [...] }`. Plans include key/version/name/currency/prices, capacities, popular flag and features. Plans must be active and public. Features must be mapped to that version, public, and COMMERCIALLY_SALEABLE. Feature output includes only `featureKey`, `displayName`, `marketingLabel`; internal descriptions, readiness, visibility and configuration are omitted. Plan order is sort order/key/version, feature order sort order/key. Empty arrays and JSON null unlimited limits are preserved.

Initially public feature arrays are empty. The static pricing bullets remain legacy copy; **final public feature rendering and review are a PR-PRICE-10 release dependency**. This foundation must not be interpreted as approval of those feature claims.

The typed API validates payloads with Zod, rejects unsupported public keys, invalid currency syntax, invalid integer prices/capacities and included seats above maximum, and returns `CommercialCatalogueError` codes `UNAVAILABLE` or `INVALID_PAYLOAD`. Raw provider errors are not exposed. No React Query hook or runtime pricing fetch is introduced.

## Trial versus intended paid plan

Policy is 14 calendar days, no card, Growth feature experience, with 10 counted clients, two coach seats, one active workspace and three published packages. Growth is the default intended paid plan; Launch and Scale remain valid intentions. Studio, unknown and blank values normalize to Growth. No automatic conversion occurs.

`trial-plan.ts` retains helper names, URL behavior and the existing localStorage key. `TrialPlanId` is a deprecated alias for intended paid-plan identity. Signup retains `requested_plan` metadata, always describes a Growth trial, and labels the selection as an intended paid plan. Signup and auth callback both use the 14-day constant for compatibility status text. Public navigation, CTA and FAQ trial references are corrected. No timestamps, lifecycle enforcement, entitlement activation, or account migration is added.

## PT Hub compatibility

`pt_hub_settings.subscription_plan` and `subscription_status` remain non-authoritative display/compatibility strings. They may contain old labels or signup intent, and do not establish payment, subscription, or trial state. Column comments clarify this boundary. The Billing tab, `usePtHubPayments`, default Repsync Pro/Billing placeholder values, and invoice placeholders are unchanged. No client, workspace, package, or billing-placeholder data is altered by this migration.

## Migration and rollback

The CLI generated one migration named `commercial_catalogue_foundation`. Its timestamp was moved to `20260909160000` so it follows the already-present `20260909150000` migration (the local clock generated an earlier name). No historical migration was edited. The seed effective date is fixed at 2026-09-09 16:00 UTC for repeatable local resets; it is catalogue metadata, not a trial clock.

Only local Supabase commands are authorized. There is no destructive down migration. Rollback is an application-code revert and, only if the objects have not acquired dependencies, a future reviewed compensating migration. Active contracts must be retired, never rewritten or deleted.

## Non-goals and follow-up sequence

This PR creates no account subscriptions, payment provider, checkout, payment portal, invoices, webhooks, trial timestamps, state machine, capacity calculation, reservation, paywall, upgrade/downgrade flow, seat product, client payment capability, or AI billing. Existing placeholders are preserved.

The detailed PR-PRICE-02 specification was not supplied. Proposed next step: define account-level ownership and subscription/trial state contracts, migration policy and lifecycle invariants in PR-PRICE-02 before implementing any enforcement. Subsequent separately scoped PRs should establish capacity definitions and concurrency rules, entitlement resolution, provider/checkout and webhook reconciliation, then change-plan and enforcement UX. PR-PRICE-10 must gate saleable feature promotion and replace/review legacy public feature rendering. These are future work, not delivered functionality or authorization for remote changes.

## Verification

Unit suites cover frozen values, feature mapping parity, RPC validation/errors, migration contracts, marketing snapshot usage, and trial URL/storage compatibility. Transaction-scoped `supabase/tests/commercial_catalogue.sql` verifies applied schema behavior, actual role access, lifecycle guards, public filtering, and deterministic output, then rolls back. See the PR delivery report for commands actually run and their exact results; a test file's presence alone is not a passing result.
