# Paddle checkout certification fixtures

PADDLE_WEBHOOK_STAGING_INGRESS_CERTIFIED: webhook staging ingress certification
completed successfully; all certification fixtures are closed (operator-confirmed
input to this implementation, not a new remote inspection).

PADDLE-CERT-FIXTURE-02 retires the temporary create/close RPCs and fixture-only
certification gate through the forward migration
`20260922094541_paddle_certification_fixture_authority_retirement.sql`.
These RPCs are unavailable after that migration is deployed. The implementation
itself does not deploy or mutate staging/production. Historical fixture records,
checkout references, timestamps, RLS, private ACLs and history triggers remain.
Sales and reconciliation remain disabled. Provider activation is a separate milestone.

## Historical design - PADDLE-CERT-FIXTURE-01 only

The following original contracts explain why the temporary authority existed.
They describe the pre-retirement schema only and are **not operational instructions
or available RPC contracts after retirement**.

## Existing dedicated QA identity

The caller supplies an existing owner UUID. The billing account must already exist, and the owner must be a personal PT or workspace owner. An administrator must have independently designated that dedicated staging QA identity using trusted `auth.users.raw_app_meta_data`:

```json
{
  "repsync_paddle_certification": {
    "environment": "staging",
    "enabled": true
  }
}
```

This is an administrator-owned authorization marker, not editable `raw_user_meta_data`, email matching, or a caller-supplied assertion. No user/account provisioning or designation RPC is included. A remote runner must use an explicitly identified dedicated QA owner and report `CERTIFICATION_ACTOR_MISSING` when none is available. Never select an arbitrary real user or copy a local test fixture into staging. Local SQL tests reuse the repository's disposable synthetic owner helpers; runtime functions never insert into `auth.users`, profiles or billing accounts.

Deployment must independently verify the configured staging project and exclude production. SQL additionally requires entitlement environment `test`, both Paddle flags false, and the trusted staging-QA designation. A live database or production-designated/ordinary user is rejected. This is not a mechanism for changing an environment's classification.

## RPC contracts

`create_paddle_checkout_certification_fixture_v1(p_owner uuid, p_plan text, p_cadence text, p_seats integer, p_run uuid)` accepts only canonical certification intent. It has no environment, URL, catalogue reference, mapping ID, legal version or transaction-reference parameters.

It locks policy and account through the existing guard, validates QA ownership, invokes cross-ledger checkout/operation guards, validates all eight active Paddle/test mappings, and rechecks base/seat catalogue provenance. It delegates actual admission to private `billing_v2_admit_checkout`, which preserves subscription checks and ordinary checkout conflict/expiry rules. No direct checkout insertion is implemented.

The run UUID is the operation UUID. The function inserts the same normal snapshot, including verified product/price/evidence provenance and the current `2026-09-18` legal constants. Those constants are certification observations, not a record of commercial customer consent. It constructs the exact base/optional-seat item array and invokes `mark_paddle_checkout_ready_v1`. Only SQL generates `repsync-cert-<run UUID>`; no provider transaction is created.

The result contains `runId`, `checkoutId`, the synthetic `transactionReference`, `plan`, `cadence`, and `additionalCoachSeats`. Catalogue product/price references are not returned. This is a trusted service result, never a browser response.

`close_paddle_checkout_certification_fixture_v1(p_run uuid)` requires the audit marker, matching checkout/run/transaction identity, normal snapshot, test environment and disabled flags. It expires only a ready marked checkout, stamps `expired_at`, records the static close code and stamps `closed_at`. Repeated closure is idempotent. A missing marker, changed identity, ambiguous/creating state or unexpected terminal state fails closed. Prefix matching alone never confers cleanup authority. Closure remains possible if an administrator subsequently removes the owner's QA designation because the immutable marker proves the prior authorized creation; environment and flag gates still apply.

## History and restart behavior

`billing_paddle_checkout_certification_fixtures` has a unique run UUID, unique checkout FK, creation timestamp and nullable closure timestamp. It stores no catalogue references. RLS is enabled; public, anon, authenticated and service-role direct DML are revoked. Existing history triggers prohibit delete/truncate and identity edits. Only the narrow definer RPCs are executable by service role, with fixed search paths; the shared gate helper has no public/service execute grant.

Creation, normal snapshot insertion, readiness and marker recording commit atomically. An exact retry returns the same marked ready fixture after factual/provenance validation. An unmarked operation cannot gain a marker; changed intent or owner fails closed. A closed run cannot be resurrected: use a new run UUID after successful closure.

Policy/account locks precede the run advisory lock, checkout/marker locks and normal lifecycle writes. A close that cannot yet see an uncommitted new marker fails with `PADDLE_CERTIFICATION_NOT_FOUND`; the trusted runner may reread and retry after creation commits. It must not reverse the account/run lock order. Conflicts must not trigger destructive repair. If ordinary housekeeping expires a fixture before explicit close, the close RPC fails closed for review rather than rewriting terminal history.

Checkout, snapshot, marker, webhook event, delivery, evidence and shadow rows are never deleted. Synthetic customer identities must remain stable per certification account because the existing shadow uniqueness contract permits one Paddle/test customer per account. Shadow records remain pending with null canonical subscription links and zero approved seats. A future runner must keep real catalogue references only in memory and private signed requests; use synthetic transaction/customer/subscription/event/notification identities. There is no network-capable runner in this change.

## Historical retirement requirement (superseded below)

Before any Paddle sales activation, deploy a reviewed forward migration that revokes service execution and drops both create/close fixture RPCs and the private gate helper. First close remaining ready certification fixtures through the reviewed close RPC and audit pending/exceptional cases. Preserve the marker table and all checkout/snapshot/event/delivery/evidence/shadow history. Remove any dedicated QA designation only through normal administrator identity management. Verify the RPCs are absent, no fixture is open, flags remain false, and no payment/entitlement/canonical authority was introduced. Sales activation requires its own subsequent authorization; it is not implemented here.

## Historical local verification

The pgTAP suite tests service/client permissions, QA metadata trust, environment/flag gates, catalogue and seat limits, exact snapshot provenance, idempotency/conflicts, ordinary lifecycle closure, immutable history, real ingestion correlation to a fixture and unchanged entitlement/capacity results. The concurrency script runs only against the dedicated disposable local proof container, exercises real PostgreSQL sessions/lock waits, and checks the deadlock counter. Reset that local database after concurrency fixtures commit. Neither test program accepts a remote connection override.

## Retirement deployment precondition

Stop the certification runner and drain its in-flight requests before the separately
reviewed deployment. The migration takes an exclusive history-table lock before
checking closure.
Any `closed_at IS NULL` row raises
`PADDLE_CERTIFICATION_OPEN_FIXTURE_BLOCKS_RETIREMENT` and rolls back the entire
migration. Lock timeout also blocks deployment. Do not delete, automatically close,
or rewrite unexpected evidence to bypass this check. Investigate separately.
Exact function drops use no CASCADE; dependent objects block retirement.
No SECURITY DEFINER function, replacement RPC, view, trigger, grant, payment,
entitlement, reconciliation, or sales authority is introduced.

## Separate post-deployment staging Auth operation

After a separately reviewed staging migration deployment, an authorized operator
must use the Supabase Auth Admin API for the dedicated synthetic certification QA
owner. Read its **current** `app_metadata`, remove only the top-level
`repsync_paddle_certification` key, and preserve every unrelated field. Update
through Auth Admin, then read back and verify that unrelated fields are unchanged.
Coordinate concurrent metadata edits and stop on drift; do not write a stale copy.
Verify `designated certification actors = 0` through the authorized admin inventory.
Do not directly update `auth.users`, delete the synthetic user, or delete its billing
account. The migration never edits `auth.users.raw_app_meta_data`. No staging user
identifier or private Paddle reference belongs in this runbook or repository.
This operation is documented only; it is not authorized or performed by this PR.

## Retirement verification

The current `supabase/tests/paddle_checkout_certification_fixture.sql` tests the
post-retirement history and permission contract. The new
`supabase/tests/paddle_certification_authority_retirement.sql` checks absence of
the RPCs, equivalent routine/view access, and privileges. The original 70-assertion suite
is retained under `supabase/tests/fixtures/paddle_certification_before_retirement.psql`
and runs only against the pre-retirement schema, via
`python scripts/test-paddle-cert-retirement.py`. The existing fixture concurrency
script is likewise a pre-retirement test, not a post-retirement service helper.

Use only the disposable local `repsync_checkout01` proof database, reconstructed
through `20260920221934` before this upgrade test. The script runs the historical
suite and races, tests rollback on open fixtures and an uncommitted-creation race,
then compares all public table rows, Auth metadata, entitlements/capacity, table
ACLs/RLS, policies, triggers and surviving function definitions/ACLs across the
actual retirement migration. It then tests concurrent denied RPC and DML attempts.
Reconstruct the local database at head afterward and run the full DB suite and
webhook concurrency test. These scripts accept no remote connection override.

Protected CI must pass `quality` and `smoke-e2e` before merge. Do not auto-merge.
After a separately authorized merge, report the merged PR/main state and stop for
review of the separate staging retirement deployment.
