# Dormant Paddle checkout orchestration

`createPaddleCheckoutOrchestrator` is a server-only composition factory. It reuses
`BillingDependencies.authenticate`, the existing billing-account owner relation,
DB-02 policy/account lock order, and the injected PREP checkout transport. It is
not installed in `billing-runtime.ts`, exposed by an Edge Function, or selected
by the billing UI. Existing pricing selection, sessions, billing pages and Lemon
Squeezy loading/error behavior remain the active flow.

The closed intent contains only `planKey`, `cadence`, `additionalCoachSeats`, and
`legal` (`termsAccepted`, `refundAcknowledged`, `termsVersion`, `refundVersion`).
Both acknowledgements must be true and use `legalSiteConfig.version`. A browser
cannot supply an actor, account, environment, mapping, provider reference, URL,
operation or attempt. The trusted authenticator resolves the actor; the server
creates an operation UUID. A future HTTP adapter must retain that separation and
serialize a validated destination only at the final authenticated boundary.

## Persistence and admission

Migration `20260920084219_paddle_checkout_orchestration.sql` adds an immutable,
RLS-protected checkout snapshot and four service-only entry points:

- `begin_paddle_checkout_v1`: gates test environment and sales, authorizes the
  owner, uses existing cross-ledger guards, validates complete published catalogue
  provenance, locks the current plan/mappings, and persists `creating` before HTTP.
- `mark_paddle_checkout_ready_v1`: accepts only creating attempts and matching
  correlation, USD, item facts and draft/ready provider status. Stores the exact
  transaction reference, never the destination.
- `mark_paddle_checkout_ambiguous_v1`: records only the static ambiguous code.
- `mark_paddle_checkout_failed_v1`: reserved for known pre-dispatch/nonmutation
  failure. It cannot change an ambiguous or ready attempt into failed.

The snapshot links immutable catalogue evidence and captures provider item facts,
legal versions/effective date and server acknowledgement time. Actor and immutable
canonical mapping/version/cadence/seat facts remain in `billing_checkouts_v2`.
There is no generic mutation writer and no payment or entitlement port.

Base quantity is always one. Seat quantity is purchased extras, bounded by the
current plan's `max_coach_seats - included_coach_seats` and the catalogue quantity
contract. Current limits are Launch 1, Growth 3, Scale 5. Mapping IDs and provider
references are resolved only from the verified test ledger, never private files.

## Retry and lifecycle

The first admitted request alone receives `dispatch=true`. A matching existing
creating/ready attempt returns state with no second POST and no cached URL;
different intent conflicts. Same-operation replay also returns state only.
Ambiguous attempts block creation. An additive trigger prevents legacy expiry
housekeeping from releasing an uncertain orchestration attempt. No recovery by
custom data, automatic POST retry, or payment/completion reconciliation exists.

Transport errors that may follow dispatch, response drift, and ready-persistence
uncertainty fail closed. If the ready commit succeeded but its response was lost,
the fallback cannot downgrade ready; the caller receives recovery-required.
Returned destination capabilities retain the PREP nonserialization behavior.

`paddle_sales_enabled=false` rejects admission before intent creation or transport
construction. This migration never changes policy. Local fixtures temporarily
inject enabled policy solely inside isolated test databases.

## Verification

- Unit: `tests/unit/paddle-checkout-orchestration.test.ts` and existing transport,
  catalogue, proof and staging certification suites.
- SQL: `supabase/tests/paddle_checkout_orchestration.sql`, existing cross-ledger,
  proof, publication, entitlement and capacity suites, all rolled back.
- Real sessions: `python scripts/test-paddle-checkout-concurrency.py`, restricted
  to `supabase_db_repsync_checkout01`. Requires a clean reconstruction; synthetic
  race fixtures commit, so reset that disposable local database afterward.
- The frozen staging manifest includes the new migration; it is not authorization
  to apply it remotely. No remote migration, provider switch or real transaction
  is part of this implementation.
