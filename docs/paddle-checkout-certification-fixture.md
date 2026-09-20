# Paddle checkout certification fixtures

Temporary service-only infrastructure for staging webhook correlation. This change does not deploy to staging, designate a QA account, call Paddle, enable sales/reconciliation, or activate checkout for users.

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

## Required retirement: PADDLE-CERT-FIXTURE-02

Before any Paddle sales activation, deploy a reviewed forward migration that revokes service execution and drops both create/close fixture RPCs and the private gate helper. First close remaining ready certification fixtures through the reviewed close RPC and audit pending/exceptional cases. Preserve the marker table and all checkout/snapshot/event/delivery/evidence/shadow history. Remove any dedicated QA designation only through normal administrator identity management. Verify the RPCs are absent, no fixture is open, flags remain false, and no payment/entitlement/canonical authority was introduced. Sales activation requires its own subsequent authorization; it is not implemented here.

## Local verification

The pgTAP suite tests service/client permissions, QA metadata trust, environment/flag gates, catalogue and seat limits, exact snapshot provenance, idempotency/conflicts, ordinary lifecycle closure, immutable history, real ingestion correlation to a fixture and unchanged entitlement/capacity results. The concurrency script runs only against the dedicated disposable local proof container, exercises real PostgreSQL sessions/lock waits, and checks the deadlock counter. Reset that local database after concurrency fixtures commit. Neither test program accepts a remote connection override.
