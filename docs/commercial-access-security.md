# Commercial access security

The central SQL action matrix consumes the established entitlement resolver. It does not reinterpret plans or consult browser intent, provider return parameters or feature keys. Resolution uses the transaction timestamp, fixed search paths and static SQL, without mutating subscription state. The migration creates no second commercial truth.

`get_my_commercial_access_summary` requires a canonical PT identity. `get_workspace_commercial_access` requires an owner or authorized active member. `get_client_coaching_access` requires the linked client or authorized staff. Workspace-owner identity comes from the database; client/assignment ancestry determines coached writes. The owner and client/workspace response schemas use strict Zod validation, exact modes/actions, UUIDs, timestamps and consistency rules. Invalid responses fail closed with a retry state.

Private resolver/assertion/row-scope/trigger functions have explicit execute revocations. Only audience-safe entry points are granted to runtime roles. Role authorization is not replaced: original RLS, column privileges, RPC checks and assigned-client restrictions still apply. A full commercial contract cannot grant a domain permission. Before a denial discloses an owner mode, the assertion checks whether the actor is that owner or an authorized workspace/client audience. Public/prospect denials carry only the stable public code.

## Mutation protection

The [direct-write inventory](commercial-access-write-inventory.json) records literal application table writes. A contract test fails if a newly discovered literal write lacks a commercial trigger or the explicit personal-notification exception. Dynamic table use in `supabase-safe.ts` is read-only; IndexedDB drafts are local personal state. Storage uses additional restrictive insert/update policies for coached photos and workspace branding. Existing storage authorization and historical read policies remain in place. Personal profile media does not itself publish a profile; publication remains guarded.

Narrow before-row guards cover delivery and template parents/children, conversations/messages/typing, clients and team mutations, workspace/business settings, packages, public profiles/leads and assignments. Ancestry is resolved with static queries, including workout sessions through their assigned workout before legacy normalization fills in `client_id`. Both old and new scopes are checked on moves. Capacity triggers remain authoritative after the commercial boundary.

Explicit reducing transitions have a field allowlist; attaching unrelated business changes does not make them remediation. Parent deletion is guarded before dependent FK cascades. A nested cascading delete with an already-removed parent can finish cleanup; top-level writes with missing scope fail closed. No unqualified delivery DELETE exemption exists. Private drafts and security/preferences remain separate from public business configuration.

Database administrator and service-role writes retain their existing trusted privileges for migrations, provider reconciliation and service-owned records. Browser runtime roles cannot set the privileged role or replication setting. Existing user-facing definer RPCs retain original authentication and authorization and execute the commercial table guards under their authenticated request role. Public application preflight is also explicit before rate-limit/lead mutation. Platform marketing lead submission is acquisition for RepSync itself, not a coach account; wearable ingestion is independent health-data service work, and exercise search is read-only.

Read helpers that previously created check-ins or conversations now avoid materialization when interaction is unavailable, while returning existing history. No access-resolution function materializes product data.

## Privacy and errors

Exact codes: `ACCOUNT_ACCESS_ACTION_NOT_ALLOWED`, `ACCOUNT_ACCESS_EXISTING_DELIVERY_ONLY`, `ACCOUNT_ACCESS_READ_ONLY`, `ACCOUNT_ACCESS_EXPIRED`, `ACCOUNT_ACCESS_ONBOARDING_ONLY`, `ACCOUNT_ACCESS_OWNER_RECOVERY_REQUIRED`, `WORKSPACE_COMMERCIAL_ACCESS_UNAVAILABLE`, `CLIENT_COACHING_INTERACTION_UNAVAILABLE`, and `PUBLIC_COACH_NOT_ACCEPTING_APPLICATIONS`.

Owner denials may include mode, effective date and recovery path/action. Team denials give generic contact-owner guidance. Client/public denials omit plan, price, capacity, billing account, payment failure and provider state. Unrelated permission/provider failures are not reclassified. UI denial paths preserve form/draft state. Access API telemetry includes only safe code, domain and audience tags; it never sends record identifiers, payment details, content or raw SQL/provider errors. Database denials that roll back are not durable audit history. No email or push delivery is added.

## Migration and rollback

One forward transaction adds functions, guards and policies. It does not update subscription history, catalogue prices/capacities, trial dates, provider mappings, publication preferences or domain rows. Historical migrations remain unchanged. Rollback requires an application revert and a reviewed compensating forward migration restoring affected functions/policies/guards together. Preserve all subscription, provider, plan-change, capacity and domain history. No remote operation is part of this implementation.
