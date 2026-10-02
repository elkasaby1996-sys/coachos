# Lemon Squeezy retirement disposition (PAY-03B)

The destination is Paddle-only active servicing with retained LS history. PAY-03A
could not establish whether staging has unresolved LS obligations. PAY-03B adds a
database inspection contract; it does **not** retire any runtime, disable ingress,
transfer accounts, cancel subscriptions, rebill customers or mutate providers.

## Contract and authority

`public.inspect_lemon_squeezy_retirement_disposition_v1(p_as_of timestamptz)` reads
both `test` and `live` legacy ledgers in one statement snapshot. The caller must
supply the actual finite inspection instant. Null or infinity blocks. The same
snapshot and instant give the same result; passing a future date is not acceptable
inspection evidence. No environment/account filter can hide obligations.

Migration `20261001224659_lemon_squeezy_retirement_disposition.sql` is migration 185. It creates only this function, its comment and its grants. Migrations 1–184,
existing records, history guards and runtime functions remain unchanged.

The SQL function is `STABLE`, `SECURITY DEFINER`, with fixed `search_path=pg_catalog`
and fully qualified relation references. It contains only SELECTs, calls no mutation
helper, expires no leases and takes no servicing locks. EXECUTE is revoked from
PUBLIC, anon and authenticated; only service_role is explicitly granted EXECUTE
(the database owner retains administrative authority). Private table permissions
are unchanged. No browser or Edge endpoint is added.

The report contains exactly these fields:

```json
{
  "contract": "lemon-squeezy-retirement-disposition-v1",
  "schemaVersion": 1,
  "safeToRetire": true,
  "outcomes": ["SAFE_TO_RETIRE"],
  "blockers": {
    "subscriptions": 0,
    "paymentObligations": 0,
    "checkouts": 0,
    "planOperations": 0,
    "seatOperations": 0,
    "webhookWork": 0,
    "ambiguousDispatches": 0,
    "manualReview": 0,
    "canonicalConflicts": 0,
    "unknownStates": 0
  }
}
```

Every positive category produces its corresponding outcome, in the order below.
`SAFE_TO_RETIRE` appears alone only when all counts are zero. Counts overlap:
one subscription can require servicing, have debt and need manual review. Within
payment/dispatch/review categories, counts are evidence rows across ledgers, not
distinct customers or distinct debts. Never sum counts into a customer total.
No emails, record/provider identifiers, URLs, hashes, payloads or secrets appear.

| Count               | Outcome                                | Blocking rule                                                                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| subscriptions       | BLOCKED_BY_ACTIVE_SUBSCRIPTION         | Every provider subscription without the terminal closure proof below                                                                                                                                                                                                                      |
| paymentObligations  | BLOCKED_BY_PAYMENT_OBLIGATION          | Provider `past_due`/`unpaid`; canonical `past_due`/`grace`/`restricted`; operations `awaiting_payment` or retained PAYMENT_FAILED without payment confirmation; unresolved failed/pending invoice evidence                                                                                |
| checkouts           | BLOCKED_BY_CHECKOUT                    | Every attempt without the terminal proof below, including `creating`, `ready`, `ambiguous`, unknown state and every locally expired attempt                                                                                                                                               |
| planOperations      | BLOCKED_BY_PLAN_OPERATION              | All states except `completed`, `canceled`, `failed`; retained AMBIGUOUS error blocks even a terminal label                                                                                                                                                                                |
| seatOperations      | BLOCKED_BY_SEAT_OPERATION              | Same exact operation rule                                                                                                                                                                                                                                                                 |
| webhookWork         | BLOCKED_BY_WEBHOOK_RECONCILIATION      | Every delivery without the durable drain proof below                                                                                                                                                                                                                                      |
| ambiguousDispatches | BLOCKED_BY_AMBIGUOUS_PROVIDER_DISPATCH | Checkout `creating`/`ambiguous`, explicit creation ambiguity, unproven `failed`, or `expired` without verified creation evidence; operation `provider_pending`/`cancel_pending`/`ambiguous`, retained AMBIGUOUS error, or dispatched `requested`/`manual_review`                          |
| manualReview        | BLOCKED_BY_MANUAL_REVIEW               | Subscription reconciliation `manual_review`, operation `manual_review` or MANUAL_REVIEW error, ignored delivery without the safe drain proof                                                                                                                                              |
| canonicalConflicts  | BLOCKED_BY_CANONICAL_CONFLICT          | LS origin/link remains nonterminal or future cancellation; a linked canonical is also owned by Paddle or has the wrong origin; billing_provider canonical has no origin                                                                                                                   |
| unknownStates       | BLOCKED_BY_UNKNOWN_STATE               | Unexpected status/provider/environment, missing subscription linkage/origin, inconsistent reconciliation errors, unproven completed checkout, missing/unrecognized canonical origin, unresolved terminal webhook error/milestone or unexpected invoice status; invalid inspection instant |

## Exact legacy states and terminal history

Provider statuses are `active`, `paused`, `past_due`, `unpaid`, `cancelled`,
`expired`. Reconciliation is `processed` or `manual_review`. Subscription closure
requires provider `cancelled` or `expired`, reconciliation `processed` with no
error, a linked same-account paid billing-provider canonical `canceled` or
`expired`, and `lemonsqueezy.v1` origin. Both provider terminal states require an
actual finite `provider_ends_at <= inspection instant`, equal to the canonical
period end and later than its start. The canonical expiry/cancellation milestone
must also be finite and passed. `cancelled` needs `provider_cancelled=true`.
A canonical period-end cancellation also needs a known ended period.
Thus active/paused/debt, future cancellation, missing linkage and inconsistent
provider/canonical combinations block regardless of age. Historical superseded
canonical rows can remain unlinked because a plan change retains old authority.

Canonical states accepted by this contract are `trialing`, `trial_recovery`,
`active`, `past_due`, `grace`, `restricted`, `canceled`, `expired`, `superseded`.
Nonterminal LS canonical authority blocks even if a provider end date passed.
Valid Paddle-owned canonicals are not LS obligations. Historical `billing.v2`
origins resolve recursively through same-account, same-origin paid canonical
successors under the existing append-only supersession contract. Each superseded
hop needs its retained finite, passed milestone. The chain must end at a current,
processed Paddle shadow with verified-provider customer ownership, retained
evidence, matching canonical state/period facts and consistent shadow lineage.
A visited-ID path stops cycles. Missing, cross-account or cyclic successors,
conflicting shadows and unresolved current authority block as unknown; superseded
rows are not ignored. Unrelated manual/trial access is not LS history.

Checkout statuses are `creating`, `ready`, `completed`, `failed`, `ambiguous`,
`expired`. A `completed` attempt must resolve its exact subscription, environment
and account; that subscription is independently inspected. A `failed` attempt
needs no provider checkout ID and explicit `BILLING_CHECKOUT_CREATION_FAILED` or
`BILLING_VARIANT_MAPPING_MISMATCH`. Every `expired` attempt blocks checkout
retirement: the retained schema has no provider closure proof. The existing
reconciler can admit a delayed purchase created within the original checkout
window, even after local expiry. Age, expected expiry and absence of a later
webhook never prove closure. Verified creation evidence only distinguishes a
known provider checkout from ambiguous dispatch; it does not settle the attempt.
Where expiry evidence is compared, the exact final legacy rule is
`floor(extract(epoch from provider_expires_at)) = floor(extract(epoch from expected_expires_at))`.
Different fractions in the same second are equivalent; preceding/following
seconds are not. A known expired checkout has a checkout blocker without a false
ambiguous-dispatch blocker. Missing/mismatched creation evidence also blocks
dispatch; explicit retained ambiguity always blocks.

Both operation tables accept exactly `requested`, `provider_pending`,
`awaiting_payment`, `scheduled`, `cancel_pending`, `completed`, `canceled`, `failed`,
`ambiguous`, `manual_review`. Completed/canceled/failed history alone does not
block; retained ambiguity, manual-review or unconfirmed payment-failure evidence
still does. Even an overdue `scheduled` operation remains servicing work.
Creation leases block while creating and after expiry until explicit disposition;
no timestamp comparison proves whether dispatch happened.

Catalogue/customer/history rows alone do not block. Mapping and quantity-contract
statuses `draft`, `active`, `retired` are recognized configuration, not customer
obligations; unexpected catalogue state still blocks as unknown.

## Webhook drain and payment evidence

Legacy processing statuses are `received`, `processed`, `ignored`, `deferred`,
`failed`. `received`, `deferred`, `failed` always block. A delivery is drained only
with `processed_at` and either:

- `processed` with no error; or
- `ignored` with no error, `BILLING_WEBHOOK_UNSUPPORTED_EVENT`, or
  `BILLING_RECONCILIATION_STALE`.

These are the current reconciler's explicit safe ignore reasons. Other ignored
errors may represent manual review even though there is no webhook `manual_review`
status; they block webhook work, review and unknown state. A terminal status
without its durable milestone or with an unexpected error is not drained.

A processed payment-failed delivery may be drained while its invoice still blocks
payment disposition. Failed/pending invoice evidence is closed only by durable
processed `subscription_payment_success`/`subscription_payment_recovered`, status
`paid`, with trusted invoice identity on **both** observations and the same
provider/environment/resource ID/subscription/customer. A newer payment for
another invoice is insufficient.

The identity predicate derives provenance from the reviewed, closed set of
admission writers, not from object-ID equality. Signed webhook ingress in
`billing-handlers.ts` verifies the event before `deliveryArguments` retains the
actual invoice resource ID. Both historical `finish_billing_plan_change` API
writers instead emit `subscription_payment_success` with `object_id` equal to the
subscription ID; API invoice normalization explicitly omits the invoice ID.
Therefore failed/recovered invoice event shapes are exclusive to signed ingress;
success observations are eligible only outside the entire overlapping API shape.
Success with `object_id = subscription_id` is insufficient even if it might
actually have been signed. The predicate additionally requires a numeric resource
identity, retained matching payload subscription/customer/store/environment,
existing scoped subscription, and the admission fingerprint. The fingerprint
binds the stored admission scope; it does not independently prove a signature.
No current snapshot hash, event timing, billing reason or API adjustment can
recover an omitted invoice identity. Ambiguous API evidence remains historical
context and cannot clear debt. This relies on the immutable reviewed writer set;
any future admission writer requires re-review of the predicate.

Invoice statuses recognized by current ingress are `pending`, `paid`, `void`,
`refunded`, `partial_refund`. Positive string-type/known-value classification
uses `IS TRUE`; missing keys, JSON null, SQL NULL extraction and unsupported
values block as unknown. Unsupported values omitted by the normalizer therefore
remain uncertain. Supported invoice observations also need a retained scoped
subscription/customer. Explicit unsupported-event ignore disposition is retained.
Void/refund evidence does not
automatically extinguish retained failed-invoice evidence. This conservative
contract does not invent a debt waiver or provider-side settlement proof.

Ambiguity is never disposed by age, newest timestamp, assumed success/failure or
deletion. Explicit disposition needs a separately reviewed contract; PAY-03B has
no write authority for it. A positive result describes retained database evidence,
not a provider audit or authorization to mutate provider objects.

## Local verification and reusable upgrade fixture

`supabase/tests/lemon_squeezy_retirement_disposition.sql` exercises the exact
states, overlap, grant denial, unknown-state injection rolled back in disposable
transactions, invoice identity matching and read-only hashes.
`supabase/tests/fixtures/lemon_squeezy_retirement_history.psql` creates only synthetic
identities/mappings/quantity contracts, realistic completed plan/seat history,
superseded canonical history, canceled/expired subscriptions, completed checkout
and processed webhooks. Existing RPCs generate operation/reconciliation
evidence; fixture-only direct transitions create ended synthetic history with
all production guards intact. The caller owns the transaction.

`python scripts/test-lemon-squeezy-retirement-disposition-migration.py` runs terminal
and blocked populations, plus simultaneous terminal test/live history, across migration 184→185 in the hardcoded disposable
`repsync_reconciliation01` project. It compares all public table and synthetic auth
user hashes, existing function bodies/ACLs, table ACL/RLS settings, constraints and
triggers. It proves terminal operations stay readable and the report counts are
exact. It accepts no remote connection parameter and reconstructs the disposable
DB afterward. The fixture is reusable for the eventual retirement migration.

PAY-02's state test additionally covers current ready, stale ready after genuine
authenticated authority change, expired unclaimed and expired claimed creation
leases. These tests
change no payment runtime or settlement authority.

The permanent disposition suite promotes all six rollback probes: API invoice
collision and legitimate signed settlement; delayed purchase after expired
checkout; four missing/null/unsupported status forms; missing/future/passed and
contradictory subscription ends; production Paddle supersession plus broken,
cross-account/cyclic chains; and the three expiry precision boundaries. Real
synthetic test/live rows coexist and independently block. Positive known-state
classification covers provider/environment/status, operation domains, ingress
event/resource domains and canonical origins. Failed joins and nullable values
contribute to `unknownStates`. A dedicated case asserts all ten outcomes together
in their exact order and verifies every count is positive.

`RETIREMENT_GATE_TRUSTED` is **not self-certified**. Astra re-review is still
required. PAY-03B-FIX corrects the uncommitted migration 185 in place and does not
authorize runtime retirement.

Local correction verification on 2026-10-02:

| Proof                                                    | Result                                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Permanent disposition SQL (original coverage plus F1–F6) | 178 assertions passed                                                                                |
| PAY-02 payment-method state SQL                          | 33 assertions passed; four preparation states retained                                               |
| Full local DB suite                                      | 39 files, 4,057 assertions passed                                                                    |
| Populated 184→185 upgrade                                | Three populations passed; all table/auth-user value hashes and existing authority settings unchanged |
| Historical migration preservation                        | All 184 predecessors match HEAD; count remains 185                                                   |
| Reconciliation/concurrency regressions                   | Seven harnesses, 57 cases passed, zero deadlocks/provider calls                                      |
| PAY-02 preparation concurrency                           | Two cases passed, zero deadlocks/provider calls                                                      |
| Manifest unit contract                                   | 72 tests passed; approved latest migration/hash validated                                            |
| DB lint                                                  | Zero findings                                                                                        |
| Repository lint                                          | Zero errors; three existing warnings                                                                 |
| Prettier and `git diff --check`                          | Passed                                                                                               |

Final migration 185 SHA256:
`44ec4d966219ef2da14241a08ef5604062a4bb09de52a7acee02b7f1eddf3437`.
The disposable database was reconstructed through all 185 migrations after the
races, with zero synthetic users and both Paddle flags disabled. Existing Windows
pipe-finalizer warnings in the cross-ledger harness were nonfatal; every race
assertion passed. No runtime source, reviewed predecessor migration, remote
project, provider state or Git commit was changed.

## Separately authorized staging evidence and PAY-03C/D/E

No remote access or report collector is added here. A later task must explicitly
authorize read-only inspection of a named staging project and first verify the
reviewed migration/schema against the reviewed commit. In a read-only consistent
snapshot, an authorized service/admin caller can invoke this same function with
the actual UTC inspection instant. Retain only:

- the report's ten blocker counts, all outcomes and safe/blocked verdict;
- contract/schema version, migration count/version and applied inspection-function
  version (185 / `20261001224659` for this contract);
- actual UTC inspection timestamp and reviewed commit SHA;
- a safe environment label (`staging`) and inspection-completion classification.

Do not retain customer/provider identifiers, result row samples, webhook payloads,
signed URLs, credentials or secret values. An error, missing contract/version or
incomplete inspection is blocked; it is never equivalent to zero counts.

PAY-03C should obtain that separately authorized evidence and resolve any blockers
through explicitly reviewed disposition. PAY-03D may implement runtime retirement
only after the evidence gate and review; PAY-03E should verify preserved history,
drainage and fail-closed runtime behavior. These are dependency boundaries, not
claims that those later tasks have been run. Fresh ingress can change a safe report;
later retirement must establish a reviewed admission/drain boundary and rerun the
gate at that boundary. PAY-03 runtime retirement has **not begun**.
