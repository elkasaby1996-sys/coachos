# Lemon Squeezy retirement disposition (PAY-03B)

Architecture B is an LS-rooted retained-state classifier. It answers: at this
statement snapshot and inspection instant, does any surviving Lemon Squeezy
obligation lack native proven closure, or does relevant ownership/cross-ledger
ambiguity prevent that conclusion?

Paddle financial correctness is outside this authority. Paddle evidence never
settles LS debt, checkout admission, subscription lifecycle, webhook work,
plan/seat mutation, or canonical terminality. Separate Paddle certification may
remain a rollout prerequisite. This function does not authorize runtime retirement.

## Contract and security

`public.inspect_lemon_squeezy_retirement_disposition_v1(p_as_of timestamptz)` reads
both test and live LS history in one statement snapshot. Supply the actual finite
UTC inspection instant; null or infinity blocks. Future dates must not be used to
age away obligations. This is inspection of the currently retained snapshot,
not reconstruction of an earlier database. Equal snapshot and cutoff are deterministic.

The undeployed migration `20261001224659_lemon_squeezy_retirement_disposition.sql`
is migration 185 and is rewritten in place. Migrations 1–184 remain immutable;
there is no migration 186. Contrary shared-deployment evidence requires stopping
before further edits. Migration 185 adds only the function, comment, and grants.
It changes no existing row, runtime writer, trigger, constraint, ACL, or RLS policy.

The function is SQL `STABLE`, `SECURITY DEFINER`, with fixed
`search_path=pg_catalog` and fully qualified relations. Its body consists of
SELECTs. It calls no servicing/guard helper, expires no checkout, takes no
servicing lock, and reads no runtime flags. EXECUTE is revoked from PUBLIC, anon,
and authenticated; service_role receives the only explicit grant. The database
owner retains administrative access. No browser or Edge endpoint is added.

Exactly five fields and ten blocker categories remain:

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

Positive counts produce their existing outcomes in the category order above.
`SAFE_TO_RETIRE` appears alone only when every count is zero and inventory
coverage is complete. Counts overlap and are deduplicated by category plus row
or scoped resource identity. They are not customer totals or amounts owed.
The report contains no identifiers, emails, URLs, hashes, payloads, or secrets.

`unknownStates` means unknown/corrupt retained state **relevant to LS retirement**:
LS evidence/reference failure, unresolved shared attribution, relevant cross-ledger
ambiguity, or coverage failure. It does not mean arbitrary corruption anywhere
in billing. Invalid terminal subscriptions, completed checkouts without native
resulting-subscription closure, and unresolved origin-only canonicals remain unknown.

## Inventory and attribution

The pipeline is discovery → total facts → integrity → capability → LS resource
authority → native succession/disposition → contributions → coverage → report.

Every physical row in these ten native tables enters inventory before any provider,
environment, status, time, or relationship filter:

- `billing_provider_customers`
- `billing_provider_variant_mappings`
- `billing_quantity_price_contracts`
- `billing_provider_subscriptions`
- `billing_checkout_attempts`
- `billing_plan_change_operations`
- `billing_plan_change_events`
- `billing_seat_quantity_operations`
- `billing_seat_quantity_events`
- `billing_provider_webhook_deliveries`

Every `billing_canonical_origins` row enters attribution independently.
`lemonsqueezy.v1` is an LS anchor; unsupported attribution is unresolved.
Canonical discovery unions native subscription/operation references, origins,
and provider-sourced canonical/event references. Successor traversal starts from
LS anchors and discovers edges in both directions before validating account,
status, origin, or target existence. Physical v2 links establish structural
routing or relevant conflict facts; pure v2 canonicals do not seed successor
traversal. Missing LS-relevant targets fail the retained referring row.

Shared subscription events are discovered independently through canonical
parents, typed LS operation/checkout metadata, and unresolved provider semantics.
A subscription event on an LS account also survives lost parent/source attribution.
An inner join to a parent never determines whether that event exists.
Required LS account/commercial references enter integrity assessment without
recursively importing other billing history through account or plan identity.

A shared provider canonical routes outside LS through all of:

1. Compatible same-account `billing.v2` origin and valid provenance times.
2. No surviving LS anchor, including native operation or semantic references.
3. A direct same-account physical `billing_subscriptions_v2` canonical link, **or**
   a same-account `billing_operations_v2.source_account_subscription_id` witness
   backed by its actual same-account v2 subscription and matching identity scope.

The historical v2 plan writer preserves this operation-source witness when moving
the subscription link. A `billing.v2` label or successor path alone is insufficient.
Missing structural provenance remains unknown; routing is not payment certification.
Shared events with positive v2 parent and typed-reference attribution are excluded
from LS audit authority. Physical Paddle-only operation audits are not LS roots.

The inspector does not read Paddle payment applications, financial evidence,
subscription items, catalogue evidence, operation audits, authenticated receipts,
or webhook observations/deliveries. Independent corruption in those tables leaves
the retirement report identical when attribution/conflict facts are unchanged,
including on an account with fully terminal LS history.

## Native closure and servicing

Valid customers, draft/active/retired mappings, price contracts, and historical
commercial records may remain. Their presence alone is not servicing work;
malformed scope or required historical contracts remain unknown.

A subscription closes only through valid LS identity/account/store/environment,
customer/mapping/history, quantity, finite revision/reconciliation evidence,
processed error-free reconciliation, and:

- Provider `expired`, or `cancelled` with cancellation flag true.
- Finite provider end at/before cutoff, after provider creation.
- Linked same-account paid LS-origin canonical in `expired`/`canceled` state.
- Matching canonical/provider end and finite passed terminal milestone.
- No unresolved successor, opposite-ledger canonical ownership, or newer LS
  lifecycle contradiction.

Canonical period start must precede end when present. A null start is accepted
only through the installed completed-plan successor lineage that legitimately
writes it. It is not a blanket exemption for missing period evidence.
Independent checkout, mutation, invoice, webhook, ambiguity, and review obligations
still receive their own blockers even when the subscription is terminal.

A superseded LS canonical needs a finite, acyclic, same-account LS-origin chain.
Every hop must retain the completed LS plan operation with its source/target
plans/mappings, persistent provider subscription, and required audit/milestones.
The endpoint must have complete native LS terminal proof. Cross-provider
succession cannot discharge LS, even when Paddle ownership is fully valid.

Checkout states are exactly `creating`, `ready`, `completed`, `failed`, `ambiguous`,
`expired`. Completion requires the exact resulting same-account/environment LS
subscription **and its independent native terminal closure**. No-dispatch failure
requires the installed definitive creation-failure/mapping-mismatch contract and
absence of a provider checkout ID. Local expiry never proves provider closure:
a delayed purchase can still be reconciled. Epoch-second expiry equivalence
classifies retained creation evidence only; it does not close checkout admission.
Terminal checkout timestamps, result references, and hosted URL state must match
the installed state constraints. Every retained completion reference must resolve
to the same-account/provider/environment subscription, including on a failed row.
No-dispatch failure cannot retain a completion result or completion milestone.

Plan/seat operation states are exactly `requested`, `provider_pending`,
`awaiting_payment`, `scheduled`, `cancel_pending`, `completed`, `canceled`,
`failed`, `ambiguous`, `manual_review`. Terminal labels need writer-required
relationships, classification, audit, and finite milestones. Invalid terminal
operations contribute both operation and unknown blockers. Retained ambiguity,
manual review, and unconfirmed payment failure cannot be erased by a terminal label.

Every plan/seat audit row independently requires its actual operation and scoped
provider ancestry, recognized vocabulary, finite occurrence time, and compatible
terminal transition. Plans retain requested/current-state audit and provider-applied
audit when required. Applied or completed immediate operations require the
awaiting-payment witness; period-end paths require the scheduled witness. Seat
operations always retain their provider-pending admission audit. Canceled plan
and seat paths require scheduled and cancellation-request audits as well as the
terminal audit. Canceled seats also retain a finite `cancel_requested_at` at or
before the cutoff; historical cancellation does not require a newly retained
provider snapshot or revision. Completed period-end operations must be due at
the inspection cutoff. Future effective dates remain valid on open or canceled
history. Direct provider-pending failure does not require application evidence.
Deleting mandatory admission, intermediate, or terminal audit evidence blocks work.

Every selected shared **subscription event** needs an existing non-null same-account
canonical parent. Validate event/source vocabulary, historical statuses, typed
metadata, and finite occurrence time. Created-plan metadata must match the parent;
LS supersession metadata must name the explaining completed LS operation;
paid-conversion metadata must name its completed LS checkout/resulting subscription.
Historical `to_status` need not equal today's status. Legitimate nullable metadata
such as `previousKind` remains compatible. Identical Paddle event names alone do
not establish LS provenance.

## Chronology closure — 2026-10-03

The exact 13 saved chronology probes are all **A — real inspector defects**.
Each changes one side of a timestamp pair retained by the installed writer.
All initially returned `SAFE_TO_RETIRE` with zero unknown blockers; each now
blocks with unknown-state evidence. There are no B, C, or D cases among these
13: none is a valid paired history, a duplicate of the R1 event-presence rule,
or unrelated Paddle corruption. Original reviewer evidence remains intact.

Writer references in the table use P and S plus exact line numbers:

- **P:** [controlled plan writer](</C:/Users/G a m e r s/OneDrive/Documents/Projects/COACHos/coachos/supabase/migrations/20260911030000_controlled_plan_changes.sql:94>).
  Operation `requested_at` defaults to `now()` at line 25; audit time defaults
  to `now()` at line 50. Admission uses `clock_timestamp()` at 181–182.
  The trigger at 97–99 inserts the status/application audit. Initial application
  preserves `coalesce(provider_applied_at,now())` at 219. Paid completion assigns
  both payment and completion from `now()` at 235.
- **S:** [additional-seat writer](</C:/Users/G a m e r s/OneDrive/Documents/Projects/COACHos/coachos/supabase/migrations/20260912020000_additional_coach_seats.sql:114>).
  The matching defaults are at 67 and 86; admission uses `clock_timestamp()` at
  199–203. Audit insertion is at 116. Application captures `now()` at 245;
  paid completion captures payment/completion together at 250.

P-operation/P-audit mean `billing_plan_change_operations` and
`billing_plan_change_events`; their probe control is a completed growth-to-scale
upgrade. S-operation/S-audit mean `billing_seat_quantity_operations` and
`billing_seat_quantity_events`; their control is a completed increase from zero
to one additional seat. In the result column, `SAFE(0) → BLOCK(n)` gives the
actual before/after result and exact `unknownStates` count. Every expected
result is BLOCK with a positive unknown count.

| ID / exact saved case                                                      | Resource    | Mutation                                                          | Class / writer invariant                                              | Writer evidence | Actual before → after |
| -------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | --------------- | --------------------- |
| CH01 / `pre_request_billing_plan_change_operations_provider_applied_at`    | P-operation | `provider_applied_at = provider_requested_at - 1 day`             | A / application audit = provider_applied_at                           | P219/99         | SAFE(0) → BLOCK(4)    |
| CH02 / `pre_request_billing_plan_change_operations_payment_confirmed_at`   | P-operation | `payment_confirmed_at = provider_requested_at - 1 day`            | A / payment_confirmed_at = completed_at                               | P235            | SAFE(0) → BLOCK(2)    |
| CH03 / `pre_request_billing_plan_change_operations_completed_at`           | P-operation | `completed_at = provider_requested_at - 1 day`                    | A / completion audit = completed_at; paid completion timestamps agree | P235/97         | SAFE(0) → BLOCK(3)    |
| CH04 / `pre_request_billing_seat_quantity_operations_provider_applied_at`  | S-operation | `provider_applied_at = provider_requested_at - 1 day`             | A / application audit = provider_applied_at                           | S245/116        | SAFE(0) → BLOCK(3)    |
| CH05 / `pre_request_billing_seat_quantity_operations_payment_confirmed_at` | S-operation | `payment_confirmed_at = provider_requested_at - 1 day`            | A / payment_confirmed_at = completed_at                               | S250            | SAFE(0) → BLOCK(2)    |
| CH06 / `pre_request_billing_seat_quantity_operations_completed_at`         | S-operation | `completed_at = provider_requested_at - 1 day`                    | A / completion audit = completed_at; paid completion timestamps agree | S250/116        | SAFE(0) → BLOCK(3)    |
| CH07 / `audit_before_request_billing.plan_change_requested`                | P-audit     | `billing.plan_change_requested: occurred_at = 1900-01-01Z`        | A / occurred_at = requested_at                                        | P25/50/97       | SAFE(0) → BLOCK(3)    |
| CH08 / `audit_before_request_billing.plan_change_awaiting_payment`         | P-audit     | `billing.plan_change_awaiting_payment: occurred_at = 1900-01-01Z` | A / occurred_at = provider_applied_at                                 | P219/50/99      | SAFE(0) → BLOCK(3)    |
| CH09 / `audit_before_request_billing.plan_change_provider_applied`         | P-audit     | `billing.plan_change_provider_applied: occurred_at = 1900-01-01Z` | A / occurred_at = provider_applied_at                                 | P219/50/99      | SAFE(0) → BLOCK(3)    |
| CH10 / `audit_before_request_billing.plan_change_completed`                | P-audit     | `billing.plan_change_completed: occurred_at = 1900-01-01Z`        | A / occurred_at = completed_at                                        | P235/50/97      | SAFE(0) → BLOCK(3)    |
| CH11 / `audit_before_request_billing.seat_provider_pending`                | S-audit     | `billing.seat_provider_pending: occurred_at = 1900-01-01Z`        | A / occurred_at = requested_at                                        | S67/86/116      | SAFE(0) → BLOCK(3)    |
| CH12 / `audit_before_request_billing.seat_awaiting_payment`                | S-audit     | `billing.seat_awaiting_payment: occurred_at = 1900-01-01Z`        | A / occurred_at = provider_applied_at                                 | S245/86/116     | SAFE(0) → BLOCK(3)    |
| CH13 / `audit_before_request_billing.seat_completed`                       | S-audit     | `billing.seat_completed: occurred_at = 1900-01-01Z`               | A / occurred_at = completed_at                                        | S250/86/116     | SAFE(0) → BLOCK(3)    |

The gate checks these exact pairs in both operation authority and independent
retained audit integrity. It preserves the first application timestamp and its
first audit across repeated application. It retains existing nullable milestone,
period-end, cancellation, finite-time, cutoff, and provider-revision contracts.

**Historical clock compatibility:** `now()` is a transaction timestamp;
`provider_requested_at` uses the wall clock. Application/payment/completion and
audit may legitimately precede dispatch when begin and finish share a transaction.
A transaction begun before admission can also apply after admission commits,
recording a timestamp before the operation's `requested_at`. Two real local
sessions produced both plan and seat controls with that ordering; both passed.
The permanent tests preserve both patterns. No generic lower bound against
`requested_at` or `provider_requested_at`, and no global phase ordering, was added.
A field that disagrees with its own audit, or payment that disagrees with its
same-action completion, remains malformed regardless of that allowed ordering.

There are 28 new permanent assertions: six milestone clock-compatibility checks,
seven audit clock-compatibility checks, all 13 exact defect mutations, and two
coherent earlier-application transaction controls. The focused original probes
pass 13/13 with safe baselines; the complete 378-case reviewer matrix now matches
all expectations. No unexplained chronology case remains.

## Quantity and lifecycle schemas

The installed steady-state arithmetic is:

`provider quantity = 1 + approved_additional_coach_seats`

The base is one provider unit, not the plan's included coach-seat entitlement.
Nonzero approved additions require retained native completed approval history.
The operation's target additions must not exceed the historical source plan's
`max_coach_seats - included_coach_seats` bound. Capped effective-limit arithmetic
cannot authorize a larger target. This uses the operation's historical plan,
preserving valid approval history across later plan changes.
There is no plan-change arithmetic exception.

An observed target quantity can be explained by exactly one valid open LS seat
operation with the same account/subscription/historical mapping/price contract,
source/target arithmetic, current source approval, retained item identity and
applied snapshot/revision/audit evidence, and installed direction/timing/proration.
It still blocks retirement. Unexplained drift, including terminal drift, is unknown.
Paddle quantities cannot resolve it.

The eight lifecycle names are `subscription_plan_changed`, `subscription_created`,
`subscription_updated`, `subscription_cancelled`, `subscription_resumed`,
`subscription_expired`, `subscription_paused`, `subscription_unpaused`.
Object type must be `subscriptions`, with object ID equal to subscription ID.
Two closed historical payload shapes are accepted:

| Shape                                         | Required keys                                                                                                     | Optional keys                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Full ingress                                  | `store_id`, `test_mode`, `subscription_id`, `customer_id`, `created_at`, `updated_at`, `product_id`, `variant_id` | `billing_account_id`, `checkout_attempt_id`, `plan_version_id` |
| Reduced API-compatible `subscription_updated` | Exactly the first six keys above                                                                                  | None                                                           |

Reject every unlisted key, including lifecycle `status`, `price_id`, and
`billing_reason`. Provider IDs are positive decimal JSON strings in the installed
safe-integer domain. Test mode is a matching boolean. Times are safely parsed,
finite zoned JSON strings, bound to delivery columns, with created ≤ updated ≤
cutoff. Optional UUIDs are non-null typed strings with valid historical relations.
Product/variant match the subscription's legitimate historical mapping lineage.
Arrays, JSON null, numbers, extra keys, and unsupported shapes block.

The retained schema cannot distinguish legitimate reduced API context from ingress
with both product/variant fields erased. Reduced context never provides positive
terminal or financial authority. Raw LS body/snapshot preimages are not retained;
validate their hash form and retained fingerprint binding without inventing signature
or preimage authentication.

## Webhook drainage and invoice authority

Preserve all existing LS invoice authority rules. Supported payment names are
`subscription_payment_success`, `subscription_payment_failed`, and
`subscription_payment_recovered`. Trusted invoice identity depends on the closed
reviewed admission writers. API success with subscription ID used as object ID is
limited context and cannot settle even a numerically colliding signed invoice.

Identity-proven observations group by exact provider/environment/store/resource/
subscription/customer scope. Provider resource revisions determine the head;
receipt, processing, row ID, and insertion order do not. Resource creation must
agree. The greatest revision needs a processed, error-free paid success/recovery
witness and compatible observations at that revision. Equal/newer contradictions,
future/malformed proof, conflicting ownership, and required witness loss block.
Invoice revisions are not compared with subscription revisions. Another invoice's
payment, API context, refund/void context, or Paddle evidence cannot waive debt.

Durable processed or explicitly permitted ignored/stale/unsupported delivery
handling is separate from invoice closure. Supported names cannot use the
unsupported-event exemption. Undrained work and unexpected errors remain blockers.

## Relevant cross-ledger conflicts and limits

Read underlying headers with the existing guard semantics; call no guard functions.
Check same-canonical opposite-ledger ownership, conflicting origins, simultaneous
current claims, checkout operation-key reuse/open checkout conflicts, operation-key
collisions/open-operation conflicts, and explicit v2 source references touching LS.
Native plan and seat operations also share the same account/operation-key
namespace: a collision blocks even when both operations are completed. Reuse of
the same key on different accounts remains valid.
Bad facts necessary to decide a relevant conflict remain unknown. A lone open
Paddle operation beside fully closed LS history is not LS servicing work.

Coverage checks total/exclusive row assessments, duplicate/missing identities,
scoped invoice authority, and contribution identities. The bounded corruption
contract covers surviving LS roots, required evidence/references, shared attribution,
and relevant conflicts. It excludes unrelated Paddle corruption, complete erasure
of every LS trace, coherent forgery of all provenance, unavailable raw preimages,
and provider activity not retained in this database.

No explicit disposition record or override is implemented. Irreducible ambiguity
remains blocked pending a separately reviewed contract binding obligations,
snapshot/cutoff, evidence, action, authority, and invalidation. An external signed
artifact cannot silently override this SQL result.

## Local verification and staging use

Permanent retirement suites are `lemon_squeezy_retirement_disposition.sql`,
`lemon_squeezy_retirement_v2.sql`, and `lemon_squeezy_retirement_ls_rooted.sql`.
They preserve LS F/R/invoice/checkout regressions, add V2R1-7/8/9 controls,
exercise structural routing/conflicts, and explicitly prove Paddle invariance
with zero LS roots and terminal LS on the same/different account. Corruption
bypass is restricted to synthetic rollback-only test subtransactions.

The populated-upgrade script uses only the hardcoded disposable local
`repsync_reconciliation01` project. Terminal, blocked, and mixed-environment
populations cross 184→185 while comparing all retained row/value hashes,
identities/history/evidence, pre-185 functions/ACLs, RLS, constraints, and triggers.
The isolated database is reconstructed afterward. Full DB, PAY-02, eight
regression/concurrency harnesses, manifest/hash checks, lint, formatting, and
independent reviewer-probe replays complete validation.

The local implementation verification completed on 2026-10-03 against migration
185 normalized SHA-256
`2c126c7eb51f668f27f98539c5ae8fef194f987782fdbd5376818cb1d762688f`.
The manifest pins that exact hash. The installed disposable-database function
body matched the source; its security/EXECUTE contract and five-field/ten-category
report were checked independently. Migrations 1–184 matched HEAD and all 185
migrations reconstructed successfully.

| Verification                       | Result                                                 |
| ---------------------------------- | ------------------------------------------------------ |
| Retirement SQL                     | 284 + 115 + 229 = 628 assertions passed                |
| PAY-02 state SQL                   | 33 assertions passed                                   |
| Full database suite                | 41 files, 4,507 assertions passed                      |
| Populated 184→185 upgrades         | All three populations passed preservation checks       |
| Regression/concurrency harnesses   | Eight harnesses, 59 cases passed, zero deadlocks       |
| Manifest tests and validation      | 72 tests passed; validation returned `valid: true`     |
| Database lint                      | Zero findings                                          |
| Repository lint                    | Zero errors; three existing warnings                   |
| Prettier and `git diff --check`    | Passed                                                 |
| Independent rollback probe replays | 234 LS + 47 Paddle/mixed + 104 historical = 385 passed |

Permanent coverage includes 40 full-report Paddle invariance comparisons: 25
cover payment applications, evidence, operation audits, items, and catalogue
amounts with zero LS roots or terminal LS on the same/different account; 15
preserve broader unrelated Paddle erasure/corruption controls. Two further
controls isolate unrelated v2 successor traversal and incoming cross-origin LS
references. LS F1–F6, R2/R3, and V2R1-7/8/9 behavior remains covered. Of the 104
historical reviewer scripts, 101 retained their verdict expectations; only three
Paddle-only cases changed to the approved out-of-scope result. No LS expectation
was relaxed.

LS-ROOTED-R1 corrective verification retained all six saved reproducers: each
writer-shaped control remains safe and each reported mutation now blocks. The
permanent suite adds 38 assertions, including required intermediate audit,
future-dated open/canceled history, historical cancellation without a newly
retained snapshot, different-account key reuse, and the exact seat-cap boundary.
The chronology follow-up classified and fixed all 13 remaining exact mutations.
The reviewer's complete 378-case matrix now matches every expectation, including
all 12 cases supporting the six R1 findings and all 13 chronology cases. All 75
full-report Paddle financial invariance comparisons remain unchanged. The gate
validates writer timestamp pairs and does not impose general clock ordering.

All database work used the dedicated disposable `repsync_reconciliation01`
project. Final state had no fixture users, LS/v2 subscriptions, or LS deliveries,
and both Paddle runtime flags were disabled. No staging/production/provider
access or runtime retirement occurred. The working-tree implementation remains
uncommitted for independent review.

`RETIREMENT_GATE_TRUSTED` is NOT self-certified. Independent **Astra Max** review
of the exact candidate/hash remains required. Implementation verification does
not assess staging and does not begin LS runtime retirement.

A later task must explicitly authorize read-only inspection of a named staging
project. Verify the reviewed deployed schema/function first; retain only the
count-only report, contract/version, actual cutoff, reviewed commit/migration
hash, and completion classification. Missing evidence or errors are blocked.
Separate Paddle certification remains separately interpretable. Operational
retirement additionally requires a reviewed admission/drain boundary and fresh
inspection; fresh ingress can change a passing snapshot.
