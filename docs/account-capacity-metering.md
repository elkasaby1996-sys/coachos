# Account capacity metering (PR-PRICE-03)

PR-PRICE-04 admission is documented in [atomic capacity enforcement](account-capacity-enforcement.md).

Capacity is descriptive account-level usage. No product mutation invokes reservation or evaluation functions, and no capacity state changes product access, disables controls, deletes data, suspends members, archives clients, or unpublishes packages. Existing complimentary beta accounts may exceed every finite limit.

## Boundary and canonical sources

The boundary is the billing account's immutable `owner_user_id` and every workspace **currently** owned by that user. Ownership transfers change derived usage immediately. There are no persisted counters, materialized snapshots, mirrored invitation rows, or duplicate commercial domain records.

| Dimension            | Actual usage                                                                                                                          | Exclusions / identity                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `counted_clients`    | `clients` joined to owned `workspaces`; `coalesce(relationship_status,'active')='active'`; lifecycle invited/onboarding/active/paused | Completed/churned, removed/transferred_out, unrelated ownership excluded. Linked identity `user:<uuid>` deduplicates across workspaces. Unlinked identity `client:<uuid>` remains distinct even with shared name/email. Unknown/null lifecycle counts conservatively and sets a quality diagnostic. Risk flags and delivery history have no effect. |
| `coach_seats`        | One owner plus distinct active human `workspace_members.user_id` across owned workspaces                                              | Owner membership cannot count twice. Current roles owner/admin/coach/assistant_coach/viewer and legacy pt_owner/pt_coach/pt count; client roles, suspended and removed rows do not. Assignments and role changes among staff roles do not change quantity.                                                                                          |
| `active_workspaces`  | All `workspaces` rows with matching `owner_user_id`                                                                                   | There is no canonical archive/status/delete lifecycle column. Current archive/ownership-transfer UI is unavailable; administrative ownership changes are reflected automatically. Memberships do not affect quantity.                                                                                                                               |
| `published_packages` | Owner's `pt_packages`, `status='active' AND is_public=true`                                                                           | The actual canonical ownership column is **`pt_user_id`**, not the proposed `user_id`. Draft/private/archived/other-owner and assignment/history rows do not count. Account scope is independent of workspace.                                                                                                                                      |

Latest relationship semantics come from the July archive, transfer, onboarding-continuity and archived-reinvite migrations; there is no canonical `relationship_end_reason`. Production currently requires client `user_id` and `lifecycle_state`; conservative fallbacks protect legacy/future malformed data. Tests relax these constraints only inside a rolled-back transaction. UI copy says “current clients”; it does not relabel paused, invited, onboarding, or unknown records as active clients.

## Actual, pending, reserved and committed

`committed = actual + pending + reserved`. All responses use one `transaction_timestamp()` and four dimensions in the locked order above.

Durable pending coach invitations come from **`workspace_member_invites`**, the real table behind workspace-team APIs. Require stored status pending, future `expires_at`, null acceptance fields, and an identifiable nonblank email. Deduplicate normalized email/linked user across owned workspaces. An existing active staff identity (including owner) supersedes pending invitations. Timestamp expiry wins even when stored status has not reconciled. Accepted/revoked rows do not count.

The client `invites` table contains role/code/token/expiry/max_uses/uses/used_at but **no target email, linked client/person identity, or revocation field**. Even single-use links cannot prove an identifiable prospective person. They are excluded from pending. Live unused single-use client links surface a quality diagnostic explaining that limitation; reusable links are excluded without manufacturing pending people. Public application forms and unconverted leads do not count. Client pending can become nonzero only after a separately reviewed durable identifiable-invitation contract exists.

Reservations count only when stored status is active and `expires_at > computedAt`. Canonical subject matching excludes reservations already represented by actual or pending domain subjects. Repeated active reservations for the same canonical subject contribute the maximum held quantity, not a sum. Clients normalize linked `client:<uuid>` and `user:<uuid>` to the same identity. Email subjects are lowercase/trimmed SHA-256 values (`email:<64 hex characters>`), never raw email in reservation/event storage. Registered email identities resolve to user IDs. Unlinked client rows are never deduplicated by email.

## Limits and states

The existing internal `resolve_account_entitlements` selects the contract and subscription context; capacity introduces no independent plan/status selection. Trials use immutable trial-policy capacities; complimentary/paid/custom records use their exact immutable plan version. `includedCoachSeats` is metadata; `maxCoachSeats` is the ceiling. Seat output contains included, limit, aboveIncludedBy and remaining; aboveIncludedBy is `max(committed-included,0)` (null when unavailable).

| State       | Definition                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| unavailable | No subscription contract; all limit/remaining/percentage/next-unit fields explicitly null, overBy zero. Actual usage remains visible. |
| unlimited   | Applicable contract with null ceiling; remaining/percentage null, overBy zero, wouldExceedNext false.                                 |
| available   | Finite committed usage below 80%.                                                                                                     |
| approaching | At least 80% and below 100%.                                                                                                          |
| at_limit    | Committed equals the ceiling.                                                                                                         |
| over_limit  | Committed exceeds the ceiling.                                                                                                        |

Finite remaining and overBy are clamped at zero; wouldExceedNext compares committed+1 with the ceiling. Percentage is rounded to two decimal places using PostgreSQL numeric arithmetic. A zero ceiling has explicit deterministic behavior: zero committed displays 100%/at_limit, positive committed displays 100 times committed/over_limit. This avoids division by zero. Progress bars are capped visually at 100 while exact quantities and overage remain visible. Unlimited/unavailable never receive fake bars.

## Database and reservation state machine

One atomic forward migration adds `account_capacity_reservations` and append-only `account_capacity_events`. Reservation/event account, workspace, actor and reservation references are restrictive. Positive quantities, canonical dimensions, nonblank identity/source, object metadata, lifetime `(billing_account_id,dimension,idempotency_key)` uniqueness, expiry ordering, and mutually exclusive terminal timestamps are constrained. Reservation identity is immutable; terminal rows cannot change/reactivate. Neither table permits runtime deletion. Existing `set_updated_at()` maintains timestamps safely.

Service/admin entry points:

- `reserve_account_capacity(account,dimension,quantity,idempotency_key,subject_type,subject_key,workspace_id,source,expires_at,metadata)` validates the typed subject and owned workspace; locks `billing_accounts FOR UPDATE`; replays lifetime results; recomputes usage/limits inside the lock; creates an active row or records a denial with no reservation. Source is a short machine identifier; caller metadata allows only an optional UUID `operationId`. UUID operation subjects support bulk quantities; identifiable person/workspace/package subjects require quantity one. TTL must be future and at most five minutes. No-subscription requests are denied as unavailable.
- `consume_account_capacity_reservation(id,source,metadata)` changes active to consumed; already consumed replays without an event. An expired-by-time hold cannot be consumed. Conflicting terminal states are rejected.
- `release_account_capacity_reservation(id,source,metadata)` changes active to released; already released replays without an event. Conflicting terminal states are rejected.
- `reconcile_account_capacity_reservations()` changes due active rows to expired in account/id order using the same account-before-reservation lock order. Repeated runs change nothing. No scheduler is installed.

Created/denied/consumed/released/expired events are emitted once per actual transition. Denials use an irreversible idempotency hash with a unique index, so repeat denied requests have one event and the original reason. Reservation replay returns the original grant, ID, stored status and expiry, even after terminal transition. **A replayed historical grant is not fresh admission**; PR-PRICE-04 must verify active/unexpired status and complete mutation/consume within its reviewed transaction. A changed quantity/subject/workspace under an existing successful key is rejected as an idempotency conflict.

The service functions serialize other service admission calls. They do not lock unrelated existing domain writers, because PR-PRICE-03 deliberately does not integrate them. Consume alone does not prove a domain write happened. PR-PRICE-04 must combine domain mutation and consume atomically, under the same account lock; otherwise premature consumption releases held capacity without committed domain usage.

## RPC, RLS and privacy boundaries

Both tables enable RLS, revoke all direct PUBLIC/anon/authenticated/service privileges, and have no permissive owner policies. Every new function revokes default PUBLIC/runtime execute, then grants only the intended entry points. Definers have fixed qualified search paths, no dynamic SQL, and no arbitrary account argument in owner APIs. Internal helpers are not runtime-callable. Service-only operation grants follow the existing entitlement foundation's database-role ACL model; authentication claims cannot substitute for SQL execution privilege.

`get_my_account_capacity_snapshot()` derives `auth.uid()` and checks canonical `pt_profiles`, following PR-PRICE-02's PT identity rule. It returns schemaVersion=1, nullable billingAccountId (PT before account creation), ownerUserId, the existing safe subscription summary, four normalized dimensions, hasAnyDataQualityIssue and computedAt. It performs no writes or account creation. A workspace membership does not authorize access to its owner's aggregate; owners can only retrieve their own boundary. Clients and anonymous users are denied.

`evaluate_my_capacity_change(dimension,quantity=1)` returns dimension, currentCommitted, proposedQuantity, projectedCommitted, limit, currentState, projectedState, allowedUnderCurrentContract (null if unavailable), reasonCode and computedAt. Reasons are capacity_available/capacity_unlimited/capacity_unavailable/capacity_would_exceed/capacity_already_over_limit. It is informational, read-only, event-free and **not concurrency-safe admission**.

Owner responses contain aggregates, never client/member/invitation identities. Events contain dimension, quantity, source, optional operation UUID, denial hash/reason and commercial foreign keys. No raw email, names, health, message, workout, nutrition, check-in, credentials, cookies or payment data are copied into events.

## Frontend, Billing and auth isolation

`src/features/account-capacity` supplies strict Zod contracts, safe typed errors, API wrappers, per-user query keys, locally mounted hook, formatters and meters. Contracts reject missing/duplicate dimensions, inconsistent arithmetic/state/nullability/seat metadata, bad UUID/timestamps and malformed unavailable context. Errors never expose backend payloads.

Only PT Hub Billing mounts the capacity hook. AuthProvider, ThemeProvider, bootstrap gate, root routes/startup, login and auth callback do not import it. Capacity fetching cannot delay auth readiness. The hook refreshes on mount/focus and every minute while mounted. Existing successful mutation boundaries invalidate capacity without awaiting failure-sensitive requests. Remote actors' changes appear on focus/mount/periodic refresh; there is no global subscription or realtime feed.

Billing keeps the entitlement card, route, settings primitives/tokens, disabled portal/payment placeholders and invoice placeholder. Capacity errors have explicit visible text and a retry button without erasing entitlements. The existing SettingsHelperCallout is intentionally a no-op, so new capacity errors use real text nodes. Four text-led meters show actual/pending/reserved values, state names, finite progress and data-quality explanations; no decorative metric icons or purchase controls are added. Complimentary overage says: “Current usage is above the standard Scale allowance. Complimentary beta access is unchanged.”

## PR-PRICE-04 integration still required

No admission primitive is currently called by product actions. Future integration must review and wire:

- `create_workspace` and future ownership transfer, using source/target account locking in a consistent order.
- Both `accept_invite` overloads, invite creation after identifiable-recipient schema design, `reactivate_removed_client_relationship`, client lifecycle activation/archive, `pt_transfer_client_relationship`, and `pt_hub_approve_lead`/lead conversion. Preserve linked identity continuity and distinguish capacity-neutral changes.
- `create_workspace_team_invite`, team invite acceptance/revocation, member activation/suspension/removal, and workspace leave behavior. Durable invitations supersede short holds; accepted active members supersede pending seats.
- Canonical `pt_packages` publish/unpublish/archive mutations, checking owner-level publication quantity and unlimited contracts.

Each integrated action needs stable operation identity, canonical subject normalization, account lock, fresh contract/usage resolution, atomic domain mutation plus consumption, release on cancellation/failure, expiry/retry handling, independent workspace role checks, and focused race tests. Product enforcement/copy decisions require that separate scope. Never make startup depend on capacity, use read-only evaluation for admission, mirror all invites as reservations, or automatically remediate beta overage.

## Migration, rollback and verification

The migration changes no historical migrations or domain rows, needs no usage backfill, and starts both new tables empty. It runs atomically. Only local Supabase commands are used. After deployment, rollback is application revert plus a reviewed compensating migration preserving reservation and event history; do not automatically drop audit/commercial data.

See [verification record](pr-price-03-verification.md) for actual command outcomes and exact baseline comparison. See [query-plan evidence](account-capacity-query-plans.md) and its rolled-back SQL fixture for performance measurements, indexes and remaining scaling concerns. Tests cover real role ACLs, domain predicates, reservation transitions, lifetime idempotency, concurrent last-slot service calls, failure isolation, beta overage and successful existing operations. Browser fixtures use run/worker/test scope and fresh UUIDs; no shared mutable identities or trigger changes cross workers.
