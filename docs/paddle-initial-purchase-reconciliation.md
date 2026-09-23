# PADDLE-RECONCILIATION-01

## Phase A: canonical authority audit

The canonical contract is `account_subscriptions`, introduced by
`20260910120000_account_subscription_entitlements_foundation.sql`. Its partial
unique index permits one current subscription per billing account. Its history
trigger preserves subscription identity, validates immutable plan versions and
audits creation into `account_subscription_events`.

The latest Lemon Squeezy reconciler is in `20260912020000_additional_coach_seats.sql`,
with the cross-ledger preamble added by `20260919103248_billing_cross_ledger_safety_guards.sql`.
It validates LS-specific subscription/order/item/payment contracts before inserting
the canonical row. There is no reusable provider-independent paid-creation RPC:
the reusable contract is the canonical table, its constraints, history and audit
triggers. Paddle must not call the LS reconciler or manufacture LS proof.

Minimum canonical write: insert one row with the independently resolved billing
account and Growth plan version, `subscription_kind=paid`, `status=active`, and
`source=billing_provider`. The existing audit trigger records the event. Canonical
period dates remain NULL because the retained Paddle webhook observation contract
does not contain billing-period dates. Event occurrence is not a billing-period
start. The canonical table has no cadence column; cadence is retained in the
mapping, proof and base item. No trial cancellation or complimentary conversion is
needed: this narrow milestone rejects every existing current canonical obligation.

`resolve_account_entitlements` reads canonical subscriptions, plan versions,
feature definitions and overrides. `resolve_account_capacity` uses that result,
existing capacity subjects/reservations and `billing_seat_effective_limit`; for a
paid subscription with no approved extras it returns included coach seats. Neither
reader needs Paddle values or a new entitlement table. Growth definitions remain
unchanged.

The v2 foundation separates shadows, observed items, checkout intent, structural
evidence and payment applications. `billing_evidence_v2` originally accepts only
`billing-foundation-v1` / `structure-only-v1`; it is not authenticated proof.
`billing_verified_evidence_v2` retains authenticated receipt evidence with
`payment_authority=false`. `billing_paddle_event_observations` retains the exact
sanitized item facts, disposition and checkout correlation, while deliveries bind
observations to verified receipts. Checkout snapshots retain price/product and
catalogue evidence provenance; the immutable checkout retains the canonical plan
version and mapping. Reconciliation must join and independently validate all of
these facts, rather than promote an event name or provider status alone.

The existing account lock is `billing_guard_lock`: READ COMMITTED, policy FOR
SHARE, account FOR UPDATE, then ledger rows and mappings. Both LS and Paddle use
the same account row. `billing_guard_claim_canonical` reserves immutable canonical
origin ownership and rejects cross-contract links. Direct row-first guard paths
use NOWAIT. The policy environment fences entitlement-affecting writes.

## Scope and proof design

Only `initial_purchase`, Paddle/test, Growth Monthly, USD, base quantity one and
zero additional seats are supported. The service RPC accepts only a shadow UUID
and operation. All commercial facts come from retained evidence. Provider calls,
renewal, cancellation, refunds, plan changes, seat changes, proration and live
activation are outside this implementation.

## Implemented proof chain and atomic write set

Migration: `20260923151445_paddle_initial_purchase_reconciliation.sql`.
The only granted RPC is
`reconcile_paddle_initial_purchase_v1(p_subscription uuid, p_operation text default 'initial_purchase')`.
It returns only `success` and `reused`; provider references and proof payloads are
never returned to browser clients. PUBLIC, anon and authenticated cannot execute
it; service_role can. All helpers are private invokers, all new routines have a
fixed `pg_catalog,public` search path and trusted postgres owner. No table grants
are added.

The private proof builder takes the existing policy/account lock before decisions,
then locks the shadow, customer, checkout and mapping. It requires an enabled
reconciliation flag and `entitlement_environment=test`. The migration itself
does not update either flag. Sales need not be enabled to reconcile an existing
purchase. Current, verified-provider-event customer identity and current pending
subscription identity are mandatory. Certification checkouts and superseded
identities are excluded.

The admitted subscription observation is the current `subscription.created`
snapshot at the shadow's recorded provider revision. Later subscription updates
are deliberately outside this first-activation path. The subscription and
completed transaction must agree on customer, subscription, account, immutable
checkout transaction and one Growth Monthly item. Both observations must have
correlated delivery records joined to authenticated Paddle/test receipts. Receipt
event identity, resource identity, notification, raw digest and occurrence time
are checked independently. Pending/manual-review/failed authority-chain evidence
blocks reconciliation. Status, an event name or a transaction reference alone
cannot grant access.

Mapping validation checks the catalogue receipt, price, product, canonical plan
version, monthly cadence, USD amount and checkout snapshot. Exactly one active
base item of quantity one is accepted. A mapping retired after checkout admission
remains eligible; the immutable provenance must still match. No seat or extra
item is admitted. Event occurrence timestamps are never substituted for missing
billing dates.

The derived proof schema is `paddle-initial-purchase-v1`, with validator
`paddle-reconciliation-v1`. It records both verified receipt IDs, both observation
IDs and digests, checkout, account, shadow, mapping, catalogue evidence, canonical
version, cadence, currency, amount, base quantity and zero approved extras.
Two explicitly versioned evidence rows (subscription and transaction) are added
to the existing evidence ledger. Insertion independently recomputes their facts;
the original foundation schema and every original provider receipt remain intact.
Neither structural foundation evidence nor a receipt's `payment_authority=false`
is rewritten into payment authority. Authority comes from the complete validated
chain and the narrow application writer.

The transaction writes these rows together:

1. Two derived reconciliation proofs in `billing_evidence_v2`.
2. One append-only `billing_payment_applications_v2` row, kind `initial_purchase`,
   bound by existing composite foreign keys and transaction/checkout uniqueness.
3. One canonical paid active subscription and its existing automatic audit event.
4. One immutable `billing.v2` canonical-origin reservation.
5. One immutable base-plan item with verified subscription-proof linkage.
6. The shadow's canonical link, latest proof/digest, reconciliation timestamp,
   processed status and cleared error. Approved additional seats stay zero.

The existing deferred item-set validator remains enabled. The NULL-only link
constraint is replaced with a proof guard that requires the canonical row,
matching payment application and subscription proof. The history trigger permits
initial linkage, while an additional guard prevents unlinking or relinking.
New item insertion authority is limited to the initial base item; arbitrary
replacement/removal and positive-seat authority remain unavailable.

## Exclusion, retry and rollback

Every existing current canonical subscription blocks this milestone, including
trial, complimentary, paid, grace and restricted states. No LS obligation is
canceled, replaced or updated. The existing account lock, canonical unique index
and immutable cross-ledger origin guard prevent competing providers from both
winning. Row-first mutation paths retain NOWAIT rejection instead of reversing
the account lock order.

Exact retries revalidate the chain and existing canonical row, origin, payment
and single base item, then return `reused=true` without another write. Transaction
and checkout uniqueness prevent payment reuse across effects. A rollback removes
all new effects, leaving the same retained evidence available for a normal retry.
Failures raise sanitized category codes; this milestone does not persist partial
manual-review state or overwrite provider evidence.

The policy environment is locked through commit. Live shadows cannot use this
RPC. Once a test shadow has a canonical link, changing the entitlement environment
to live is blocked: policy switching is not a migration procedure.

Rollout requires a separate authorized migration deployment and a separately
reviewed operator activation. Keep reconciliation and sales disabled until then.
Disabling reconciliation stops new applications but does not revoke an already
committed canonical subscription. There is no destructive down migration or
automatic commercial rollback; any correction requires a reviewed forward change
that preserves payment/evidence history. No provider calls are part of this RPC.

## Local verification

The disposable project is `repsync_reconciliation01`, separate from the developer's
existing local database. The pgTAP suite rolls back synthetic fixtures. Concurrency
fixtures commit only in that disposable project, followed by a clean reconstruction
with both flags false. The regression runner also exercises retired certification
authority at its historical migration boundary, then restores the current schema.

Verified against base `49a4d95` on `codex/paddle-reconciliation-01`:

| Check                                 | Result                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Full database suite                   | 26 files, 2,175 assertions; includes 89 reconciliation assertions                                                      |
| Full unit suite                       | 286 files, 3,080 tests                                                                                                 |
| Concurrency                           | 57 cases across seven harnesses; zero harness deadlocks                                                                |
| New reconciliation races              | Eight cases, including actual LS linkage exclusion                                                                     |
| Populated forward migration           | Existing public-table data unchanged; legacy functions and ACLs unchanged; only the reviewed lifecycle-body relaxation |
| Advisors                              | 50 warnings identical to the pre-migration baseline; zero new findings                                                 |
| TypeScript/build                      | Strict TypeScript and production build pass                                                                            |
| Deno                                  | Both Paddle Edge Function entry points check successfully                                                              |
| ESLint                                | Zero errors; three pre-existing UI warnings                                                                            |
| Prettier/whitespace                   | Pass                                                                                                                   |
| Migration manifest                    | 173 migrations; all previous 172 hashes unchanged                                                                      |
| Leakage scan                          | Zero credential or real Paddle-reference matches in changed files                                                      |
| Provider/staging/production mutations | Zero                                                                                                                   |

Clean-schema DB lint returned zero findings. Final reconstruction confirmed zero
users, payment applications and canonical links, with both Paddle flags false.

The 57 races comprise 21 cross-ledger, six catalogue, five checkout, seven webhook,
one identity-supersession, eight reconciliation and nine historical certification
cases. A separate verification-tool collision occurred when lint ran alongside
pgTAP DDL; it caused one capacity-fixture deadlock. Sequential execution passed
without changing assertions, retries or timeouts. This was not a reconciliation
race. Run DB lint after clean reconstruction, separately from pgTAP: pgTAP's
installed extension routines also produce unrelated lint diagnostics.

The happy path resolves Growth version 1: 47 target features, two currently
commercially saleable enabled features, 50 clients, two included/effective coach
seats, canonical team maximum five, three active workspaces and unlimited published
packages. Approved paid extras remain zero. Existing capacity readers correctly
use two seats, not the commercial maximum five. No Paddle fields enter entitlement
calculation. Exact retries preserve one canonical subscription, payment application,
base item and link. Historical superseded certification identity stays unlinked.

## Exact changed files

- `supabase/migrations/20260923151445_paddle_initial_purchase_reconciliation.sql`
- `supabase/tests/paddle_initial_purchase_reconciliation.sql`
- `supabase/tests/billing_provider_v2_foundation.sql`
- `supabase/tests/billing_verified_evidence.sql`
- `supabase/tests/paddle_certification_authority_retirement.sql`
- `scripts/test-paddle-reconciliation-concurrency.py`
- `scripts/test-paddle-reconciliation-regressions.py`
- `scripts/test-paddle-reconciliation-migration.py`
- `config/staging-commercial-certification.json`
- `docs/paddle-initial-purchase-reconciliation.md`
- `docs/staging-commercial-deployment-manifest.md`
