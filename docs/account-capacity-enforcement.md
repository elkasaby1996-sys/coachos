# Atomic account capacity enforcement (PR-PRICE-04)

PR-PRICE-04 makes the [PR-PRICE-03 account model](account-capacity-metering.md) authoritative for capacity-increasing domain writes. It retains every existing record, including complimentary beta overage. It never archives clients, suspends members, unpublishes packages, or removes workspaces automatically.

## Admission rule and access

Only a positive account-level delta requires admission. Full access permits growth within the applicable immutable contract. Onboarding permits an eligible first-workspace trial bootstrap; other positive mutations are denied. Existing-delivery-only, read-only, and none deny growth. Zero and negative transitions remain subject to ordinary authentication, permissions, validation, and domain constraints, but are never denied by capacity. Feature mappings and enabled feature keys are not mutation permission.

## Current mutation audit

| Dimension   | Positive entry points                                                                                                                                                                                                                                | Zero or reducing transitions                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspaces  | `create_workspace(text)`, new-workspace `pt_hub_approve_lead`, administrative ownership insert/transfer                                                                                                                                              | Same owner/name/settings edits; supported administrative removal; source side of ownership transfer                                                                                                                  |
| Clients     | Both `accept_invite` overloads; authorized `reactivate_removed_client_relationship`; `pt_update_client_lifecycle` from terminal to counted; target side of `pt_transfer_client_relationship`; lead conversion; guarded internal client insert/update | Generic `create_invite`; duplicate linked identity in another owned workspace; invited/onboarding/active/paused changes; risk/details; completed/churned; archive/removal; normally same-owner transfer              |
| Coach seats | New unique valid `create_workspace_team_invite`; unique inactive member activation; new account staff identities introduced by workspace ownership transfer                                                                                          | Owner counted once; duplicate account pending identity; already-active account staff added elsewhere; valid pending acceptance; role/assignment changes among staff; suspension/removal/revocation; timestamp expiry |
| Packages    | `create_my_pt_package` immediately active/public; `update_my_pt_package` publication or republication                                                                                                                                                | Draft/private creation, published edits, unpublish/archive, guarded deletion and reorder                                                                                                                             |

Canonical clients use current active relationships, count invited/onboarding/active/paused, and conservatively count unknown lifecycles. Linked identities deduplicate by user UUID; unlinked rows use their canonical client UUID. Package ownership is `pt_user_id`; publication means active and public. No quantity or delta is accepted from the frontend.

The audit also found and closed the legacy `/join` path that inserted a client and consumed the invite in separate requests. It now calls the existing acceptance RPC. Optional goal details are saved after acceptance using the existing safe detail privilege. Package archive and reorder were additional direct writes; they now use the update RPC.

## Transaction boundary

The forward migration installs `zz_capacity_admission` BEFORE triggers and `zz_capacity_consumption` AFTER triggers on clients, workspaces, workspace members, team invitations, and packages. The BEFORE guard runs after existing normalizers. It derives subjects from proposed rows, locks their billing accounts, rechecks canonical usage, and invokes the shared `admit_account_capacity_subject` helper only for growth. Unchanged subject sets return without admission; reductions take no reservation. This protects internal SQL writers as well as the redefined RPCs.

`lock_capacity_owners` resolves account IDs and locks them in ascending UUID order, retaining locks through commit. Client transfers authorize both source and target, lock both accounts before locking transfer rows, and recheck source state. Workspace ownership changes also admit any previously uncounted clients, members, and pending invitations carried into the target account. The former owner's membership remains subject to existing membership rules and can itself be a target seat commitment.

Reservations reuse the original table, status machine, private ACLs, and five-minute maximum TTL. Synchronous admissions use 30 seconds. Each fresh hold has a generated operation UUID, actor, canonical subject, and immutable `admission_transaction_id`. A nested operation can reuse a hold only when its account, dimension, subject, active/unexpired status, actor, source, and current transaction ID match. Runtime callers cannot read/create reservations or supply transaction context. There is no GUC/header/local-storage admission bypass.

The AFTER trigger consumes only this transaction's private domain holds whose canonical domain result now exists. Consumption also checks wall-clock expiry. A domain constraint failure rolls back reservation and event creation. Consumption failure rolls back the domain mutation. Account locks remain held even when a hold has already been consumed. No successful synchronous mutation leaves an active domain hold. Client identity and converted-lead retries reuse their existing domain results; a new workspace/package submit remains a new operation under the existing API contract.

## First workspace and lead conversion

`create_workspace` authenticates a canonical PT and validates its input before insertion. The guard resolves the account, locks it, and invokes the existing lifetime-trial helper before workspace admission. Trial/account, reservation, workspace, owner membership, profile initialization, and events commit or roll back together. The existing AFTER workspace trial trigger remains idempotent. Ownership transfer invokes the same trial helper with `workspace_transfer`.

New-workspace lead conversion generates the target workspace UUID, provisions an eligible trial, locks the account, and reserves both positive workspace/client requirements before inserting either domain result. A counted applicant requires no second client commitment. The existing-workspace path reaches the same client invariant guard. Capacity failures are rethrown through the operational exception handler; new-workspace conversion failures roll back the entire operation. They cannot silently return `approved_pending_workspace` after capacity denial. Existing transfer confirmation, lead linkage, chat/history, and client continuity helpers remain in place.

## Invitations and seats

Client links remain reusable, unidentified links. Creation, max uses, copying, and resend do not create client commitments. Acceptance locks and validates the invite, resolves an existing/standalone/archived relationship, and admits only a newly counted identity. Archived email claims assign the authenticated identity before reactivation, preventing temporary admission under the former user. Failed acceptance leaves uses unchanged. Transferred-out relationships still require the dedicated transfer flow. The old reactivation primitive is private; the public wrapper now requires client-edit authorization.

Team invitations normalize email and derive account scope from the workspace. Existing active staff and valid pending invitations deduplicate across owned workspaces. Acceptance inserts/reactivates the member while the pending commitment still exists, so the usual pending-to-active transition is zero even at exact capacity. Assigned-client linkage and existing invitation notifications/audit payloads are preserved.

Resending a **valid pending** invitation is zero delta. An expired commitment cannot be resurrected through resend: it returns the existing `INVITE_EXPIRED` domain error. Revoke the expired record and create a fresh invitation to request new capacity. Revocation/expiry require no reservation. No scheduled reconciliation or capacity notification delivery is added.

## Direct-write protection and package APIs

Authenticated package INSERT/UPDATE is revoked. Create/update/archive/reorder use fixed-search-path security-definer RPCs deriving the owner from `auth.uid()`. Only explicitly named package fields are written; arbitrary owner, ID, timestamps, or reservation fields are ignored. Existing state normalization, read policies, returned records, refresh behavior, and `delete_pt_package_guarded` reference protections remain.

Clients/workspaces/members lose direct INSERT and table-wide UPDATE. Explicit column grants preserve audited profile, display, settings, preference, and detail writes; capacity-bearing identity, workspace, status, relationship, lifecycle, role, and owner columns require RPCs. Team invitation INSERT/UPDATE is also revoked. Existing read access and reducing leave/delete paths remain. Administrative and other definer writes still encounter the invariant triggers. This is capacity enforcement, not a replacement for existing RLS/domain authorization.

## Errors, local UI, and privacy

Database details are JSON with a separate dimension and one exact code:

- `ACCOUNT_CAPACITY_LIMIT_REACHED`
- `ACCOUNT_CAPACITY_GROWTH_NOT_ALLOWED`
- `ACCOUNT_CAPACITY_UNAVAILABLE`
- `ACCOUNT_CAPACITY_RESERVATION_CONFLICT`
- `ACCOUNT_CAPACITY_OPERATION_EXPIRED`

No plan name, quantities, email, or account-wide details occur in mutation errors. Normal permission/invite/lifecycle/transfer errors retain their contracts. The parser accepts only exact structured codes and known dimensions.

Local form feedback invalidates capacity on denial, preserves input, and renders an accessible alert. Owners refetch their own snapshot and receive committed/limit data plus View Billing navigation. Authorized nonowners are told to ask the owner to review Billing and receive no account quantities. Cross-owner transfer disclosure is based on ownership of the **target** workspace. Clients see: “This coach is not accepting additional clients right now.” Controls submit normally and are not permanently disabled from a cached snapshot. Existing success paths invalidate capacity; package editor drafts remain intact on failure.

The feedback hook has no active query until a denial notice mounts. No capacity provider or capacity dependency was added to auth readiness, login/callback routing, root startup, ThemeProvider, or the global workspace provider. Billing remains the existing route. UI guidance came from the mandatory `ui-ux-pro-max --design-system` lookup; existing tokens/layouts/icons remain in use.

## Events and performance

Created/consumed events reuse the existing event table. Domain reservations use source `domain.admission`, canonical subject, generated operation identifier, dimension, quantity, and actor; they do not copy names, raw email, health/delivery content, auth tokens, or payment data. Denied database events followed by an SQL exception **roll back**. Local denial feedback emits sanitized Sentry message tags containing only the machine code and dimension. There is no new logging dependency.

The existing canonical subject/snapshot/reservation helpers batch email normalization to avoid repeated auth-population scans. No new index or mirrored identity table is included. See [measured mutation-query plans](account-capacity-enforcement-query-plans.md), including the larger hash fixture and limitations.

## Migration, rollback, and boundaries

One forward migration, `20260910160000_atomic_capacity_enforcement.sql`, adds the private transaction-provenance column, helpers/guards, function redefinitions, package RPCs, and narrow ACL changes. Historical migrations and existing domain/commercial rows are unchanged. No plan ceiling or trial date is changed. Only local Supabase commands were used.

Rollback requires an application revert plus a reviewed compensating forward migration restoring the affected functions/grants/guards together. Preserve commercial, reservation, and event history. Do not drop those records as rollback cleanup. Deployment and a compensating migration require separate review; no remote operation is part of this work.

Checkout, payment providers, subscriptions/seat purchasing, proration, usage billing, route paywalls, feature-key enforcement, automatic remediation, email/push capacity notifications, and scheduled jobs remain deferred. Named client invitations need a separate durable identifiable-recipient schema. General access/feature enforcement remains a separate dependency. See the [verification record](pr-price-04-verification.md) for actual commands and coverage limitations.
