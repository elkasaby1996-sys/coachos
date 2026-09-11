# Account subscription and entitlements (PR-PRICE-02)

Account usage and reservation semantics are documented in [account capacity metering](account-capacity-metering.md).

## Account boundary

At launch, one billing account identifies one owner user and all workspaces they own. New commercial records and the internal entitlement resolver use `billing_account_id`. Workspace ownership is used only to locate that account. Workspace members retain independent role and assigned-client authorization; a plan never grants a role.

`billing_accounts.owner_user_id` is unique and immutable. Its auth-user FK uses ON DELETE RESTRICT, as do commercial-history FKs. Account deletion needs a future reviewed history-retention design. Ordinary runtime users cannot delete commercial history.

## Trial start and policy

An AFTER INSERT / UPDATE OF owner_user_id trigger on workspaces creates commercial access inside the workspace transaction. Existing `create_workspace(text)` inputs and return shape are unchanged. Its rate limits and membership/profile creation remain intact, including the existing `sync_workspace_owner_membership` insert/owner-change trigger. Current transfer controls are placeholders; the owner-change trigger covers future or administrative transfers without adding a transfer flow.

The trigger ignores null ownership, creates the billing account if needed, locks its row, and checks all subscription history before inserting a trial. Two concurrent inserts serialize on that account. Unique partial indexes independently enforce one current subscription and one lifetime trial. Subsequent workspaces, deleted workspaces, and ownership round trips cannot restart a trial; an account with prior commercial access never receives another introductory trial.

Trial policy v1 references the exact immutable Growth v1 plan. The database transaction timestamp starts 14 calendar days of trial followed by seven recovery days, with no card and no automatic conversion. Capacities are ten counted clients, two included/two maximum coach seats, one active workspace, and three published packages. Intended paid plan is independently Launch, Growth, or Scale, defaulting to Growth. Public catalogue prices and mappings are unchanged.

Policy versions are draft, active, or retired, with one active version. Contract fields become immutable at activation. Active versions may only retire with a retirement timestamp; retired versions cannot reactivate or be deleted. Future policy changes require a reviewed version and a corresponding trial-start contract change; this foundation deliberately resolves active v1.

## Existing beta compatibility

Before the workspace trigger is installed, the migration strictly resolves active Growth v1, Scale v1, and trial policy v1. Missing or ambiguous required contracts fail the migration transaction.

Every distinct existing non-null workspace owner gets one billing account and, if no commercial history exists, an active complimentary Scale v1 subscription with source `legacy_beta_backfill`. Multiple workspaces do not multiply subscriptions. Valid auth metadata supplies requested-plan intent, otherwise Growth is used. No trial or renewal date is fabricated. PT users without owned workspaces receive neither complimentary access nor a backfilled account.

This is internal beta compatibility, not a paid or lifetime promise. No existing workspaces, memberships, clients, assignments, packages, `pt_hub_settings`, or auth identities are changed. The private `backfill_legacy_billing_accounts()` helper exists for migration execution and transaction-scoped testing. It is not granted to any runtime role and must not be used as an ongoing signup process.

## Lifecycle and effective status

Kinds: `trial`, `paid`, `complimentary`, `custom`. Stored statuses: `trialing`, `trial_recovery`, `active`, `past_due`, `grace`, `restricted`, `canceled`, `expired`.

For clock-driven trials (`trialing` / `trial_recovery`), reads derive `trialing` before trial end, `trial_recovery` from trial end up to recovery end, and `expired` at recovery end. Boundaries are inclusive at the start of the next state. Explicit restricted, canceled, or expired states take precedence and are never resurrected by the clock. Historical plan identity, trial policy, and trial timestamps cannot be rewritten.

| Effective status           | Access mode            |
| -------------------------- | ---------------------- |
| no_subscription            | onboarding             |
| trialing, active, past_due | full                   |
| trial_recovery, grace      | existing_delivery_only |
| restricted, canceled       | read_only              |
| expired                    | none                   |

These modes describe commercial state only. **No access mode is enforced in this PR.**

`reconcile_account_subscription_state(uuid)` is service/admin-only. It locks the account and trial, persists each due transition in order, updates status timestamps and expiry, and creates one event per actual transition. A late reconciliation can record both transitions; repeating it records none. No cron is installed. Correct reads never depend on reconciliation.

## RPC contracts and permissions

All five new tables have RLS and explicit direct privilege revocation for PUBLIC, anon, authenticated, and service_role. There are no permissive owner table policies. Every new function revokes default PUBLIC execution and runtime grants before granting only the intended entry points. All functions fix their search path and use qualified relations without dynamic SQL.

| RPC                                          | Role / authorization                         | Result                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_my_requested_paid_plan(text)`           | authenticated PT, caller from auth.uid()     | billingAccountId, requestedPaidPlanKey                                                                                                                                                      |
| `get_my_effective_account_entitlements()`    | authenticated PT, no owner/account parameter | schemaVersion 1, billingAccount, subscription, limits, targetFeatureKeys, enabledFeatureKeys, computedAt                                                                                    |
| `get_workspace_effective_entitlements(uuid)` | owner or active authorized workspace member  | schemaVersion 1, workspaceId, billingOwnerUserId, canManageBilling, effectiveStatus, accessMode, accessLabel, planKey, planVersion, planDisplayName, limits, enabledFeatureKeys, computedAt |
| `reconcile_account_subscription_state(uuid)` | service_role or database administrator       | billingAccountId, transitions                                                                                                                                                               |

The canonical PT identity is `pt_profiles`, following existing profile selection's support for canonical account rows and legacy workspace-profile fallback. Auth metadata alone never establishes a PT identity. Owner RPCs cannot select another account. Workspace access reuses `can_access_workspace`, including active status and role permissions; clients, suspended/removed members and unrelated users are denied. That existing helper can audit denied team access, so the workspace RPC remains volatile. Owner resolution and time/status helpers are stable.

Owner billing summary includes nullable account id, ownerUserId, requestedPaidPlanKey and canManageBilling=true. Subscription summary includes nullable id/kind/plan identity, stored/effective status, mode/label, trial dates, optional current period and cancelAtPeriodEnd. No subscription returns explicit null plan/limit/date fields, empty feature lists and onboarding mode; it does not fabricate Growth access. The internal resolver prefers a current subscription, otherwise the latest terminal record, with an id tie-breaker.

Workspace responses deliberately omit intended plan, subscription history/events, override reasons, owner profile content, and payment data. Only the owner canManageBilling. All arrays are sorted deterministically; computedAt is database transaction time.

## Feature readiness and overrides

Target features are all mappings for the exact plan version. Enabled features require `COMMERCIALLY_SALEABLE`; the initial catalogue therefore enables none. Trials use Growth mappings and trial-policy capacities; other kinds use their referenced plan's capacities and mappings. These lists remain descriptive even when the access mode is limited or expired.

An override is active at starts_at, before expires_at (if set), and while unrevoked. Disable wins over all mappings and enable rows, including overlapping conflicting records. Enable can add a feature outside the plan only if it is commercially saleable. DRAFT and IMPLEMENTED features cannot bypass readiness. Overrides cannot grant a contract when no subscription exists. Expired, future and revoked overrides are ignored.

Overrides are admin-maintained, immutable except for one-way revocation, and have no public/owner management RPC. Reasons are required but never copied into subscription events. Event triggers audit account creation, requested-plan changes, trial/complimentary creation, status transitions and override creation/revocation. Events are append-only; metadata includes only commercial keys/identifiers, not credentials, health, workout, nutrition or client content.

## Signup and frontend isolation

The account-entitlements module provides Zod-validated owner/workspace/requested-plan APIs, typed safe errors, centralized React Query keys and locally mounted hooks. Query keys include the authenticated user so cached results do not cross identities. Billing refetches on mount/focus and every minute while mounted to keep clock-based status current.

Email signup and callback provisioning dispatch requested-plan persistence after ensuring the PT profile. They use the existing authenticated session and do not call auth.getUser. The new write is not awaited by callback/login completion; errors are caught and reported to existing Sentry observability. Pending browser intent is cleared only after successful canonical persistence, and a newer selection made in flight survives. Absent browser intent does not overwrite previously stored metadata intent with a default.

Immediately before workspace creation, the shared `createPtWorkspace` action awaits another persistence attempt if pending intent remains. Failure is non-fatal and retains the pending value. The database still defaults safely using valid metadata or Growth. Requested-plan persistence and workspace creation invalidate the centralized owner/workspace query family. Future subscription mutation callers should use the same invalidation helper.

No entitlement provider is installed. AuthProvider, ThemeProvider, bootstrap gate, root initialization and callback destination resolution do not fetch entitlements. Authentication readiness remains independent of subscription-service availability.

## PT Hub Billing compatibility

Only the existing Billing plan/status section switches to canonical entitlements. Existing route, settings primitives/tokens, payment-method placeholder, invoice placeholder from `usePtHubPayments`, and disabled billing portal controls remain. Loading/error states have accessible status/alert semantics. Trial copy displays its actual end date and independent intended plan; recovery/expiry copy describes state without asserting enforcement. Complimentary beta copy identifies Scale v1 and does not claim paid access or a renewal. Future paid records can show an actual current period if present.

`pt_hub_settings.subscription_plan` and `subscription_status` remain compatibility/display strings, not authoritative contract, intent or lifecycle state. Their existing writers and `PTSubscriptionSummary` remain for other surfaces. No migration rewrites these strings. Billing does not read them as plan truth.

## Non-goals and next dependencies

No payment processing, provider connection, checkout, paid-subscription provisioning, portal, real invoices, upgrade dialog, automatic trial conversion, paywall, feature enforcement, capacity enforcement or usage meter is implemented.

PR-PRICE-03 can build reviewed capacity counting and reservation semantics on billing_account_id and the effective limits API; it needs its own definitions of counted clients, workspace state, seats, packages, concurrency, and enforcement scope. PR-PRICE-04 can consume the effective feature/mode contract while preserving independent workspace role checks; its concrete enforcement and UX scope still needs review. Neither future PR should reintroduce commercial fetches into auth readiness or treat mapping membership as evidence of saleable readiness.

## Migration, rollback, and verification

One forward migration, `20260910120000_account_subscription_entitlements_foundation.sql`, follows the unchanged commercial catalogue migration. All local resets are deterministic; trial start uses real transaction time rather than the migration's fixed policy effective date. No remote Supabase commands are authorized or used.

Rollback is an application revert plus a future reviewed compensating migration. Preserve billing accounts, trial eligibility, subscription history and events after deployment; do not drop the commercial history. Foreign-key restrictions intentionally require account-deletion planning.

pgTAP tests run inside BEGIN/ROLLBACK, exercising real RPC/role behavior. They emulate pre-trigger legacy rows only within their transaction. Browser fixtures use the stabilized run/worker namespace plus per-test identities; no shared trigger disabling or shared mutable identifiers is used. A concurrent browser-suite fixture submits two actual workspace insert transactions and checks one account/trial/event.

See [verification record](pr-price-02-verification.md) for the captured baseline failures and exact commands/results. Existing unrelated baseline unit failures are preserved.

See [Lemon Squeezy billing foundation](lemon-squeezy-billing-provider.md) for PR-PRICE-05 hosted Checkout and webhook reconciliation.
