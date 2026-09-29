# Paddle seat resource freshness

CODEX-63 confirms `PADDLE_SEAT_FRESHNESS_CLOCK_DOMAIN_MISMATCH` from repository
source and the local database at migration 180. Initial Paddle ingress writes
the webhook envelope occurrence into `billing_subscriptions_v2.provider_updated_at`.
The historical initial proof even selects its subscription observation by that
equality. A GET returns the subscription resource's revision. The former may be
later than the latter without any stale resource snapshot.

The field also receives resource revisions from later lifecycle, plan and seat
reconciliation. Its meaning depends on the writer; it is not a resource-only
watermark. CODEX-62's separately authorized live diagnostic is prior evidence,
not a provider call repeated by this implementation.

## Timestamp audit

The repository search covered `providerUpdatedAt`, `provider_updated_at`,
`updatedAt`, `occurredAt`, `d.updated_at`, `billing_paddle_timestamp_v1` and
`paddle_seat_quantity_context_v1`. The relevant readers/writers classify as follows.

| Domain               | Producers and consumers                                                                                                           | Meaning and treatment                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A: event occurrence  | Paddle `observeEvent`, ingress, event proofs/deliveries, initial purchase proof selection, webhook replay ordering                | Envelope `occurred_at`; initial shadow `provider_updated_at`. Unchanged.                                                     |
| B: resource revision | Paddle observation lifecycle projection, GET/preview response readers, lifecycle/plan/seat facts and their shadow/evidence guards | Subscription `data.updated_at`; later shadow writes can use this domain. Unchanged except the new seat preflight comparison. |
| C: local processing  | `updated_at`, `recorded_at`, `verified_at`, `last_reconciled_at`, UI model `updatedAt`, operation completion/failure timestamps   | Local persistence/processing timestamps. Not freshness authority.                                                            |
| D: billing period    | `currentBillingPeriod`, `billingPeriod`, `periodStart`, `periodEnd`, `nextBilledAt`, scheduled effective time                     | Bounds remain exact and authoritative. Never used to invent a resource revision.                                             |
| E: request time      | `provider_requested_at`, `requested_at`, plan/seat request facts                                                                  | Local operation dispatch boundary. Existing settlement freshness/correlation checks unchanged.                               |

Ingress implementations in the webhook, identity-supersession, automatic-initial
and lifecycle migrations assign `observed := occurredAt`. Linked subscriptions
then change through paired reconciliation. Lifecycle and plan facts compare
resource revisions against the existing shadow watermark and request bounds;
their reconcilers write resource revisions back. Seat settlement has analogous
checks. Initial-period supersession examines both retained clocks. These existing
ordering/proof rules are deliberately not repurposed by a GET preflight fix.

The Lemon Squeezy adapter and generic resource-proof contracts use provider
resource revisions (B); generic event-proof `occurredAt` is A. Checkout resource
timestamps are B. Application/UI `updatedAt` aliases of local `updated_at` are C.
Fixtures mirror these domains; synthetic fixtures often make A and B equal, which
explains why the earlier seat test did not expose the mismatch.

## Derived contract

`billing_paddle_seat_resource_updated_at_v1` is a private helper called by the
existing service-only seat context. It derives the maximum genuine `updatedAt`
from retained subscription observations for the same provider subscription and
current authenticated customer. Every observation must retain authenticated
delivery and its immutable digest. The helper then makes three distinctions:

1. Applied subscription evidence supplies a comparable resource `updatedAt`.
   Only these actual resource revisions contribute to the maximum watermark.
2. Pending, manual-review, failed, unverifiable, newer, equal-time conflicting,
   malformed or otherwise ambiguous observations block seat eligibility.
3. A signed but unapplied historical `subscription.updated` can remain as audit
   history when both its event occurrence and its resource revision are strictly
   behind the accepted current subscription proof. The event clock is compared
   with that proof's authenticated event clock; when the current proof has a
   resource revision, the resource clocks are compared separately. The existing
   same-event rule also requires revision no later than occurrence. A stale
   ingress label alone never grants this exception. The observation and its
   delivery remain immutable and are not marked applied.

This matches the initial-period bootstrap's treatment of known old history
without treating every retained observation as unresolved provider knowledge.
Unknown temporal relationships continue to fail closed.

Before treating any authenticated observation as superseded, the helper checks
whether another authenticated subscription observation claims the same resource
`updatedAt` with a different resource state. The retained ingress shape is
closed. Its private comparison projection preserves status, every item fact,
period, next billing time, cancellation/pause/scheduled-change facts, identity
and operation correlation. It excludes event/delivery identity, event type and
event occurrence. Item arrays are compared as sorted collections of complete
JSONB items: array position has no billing meaning, while duplicate items and
their multiplicity remain visible. Resource timestamps are compared as UTC
instants at the full fractional precision (up to nine digits) accepted by
ingress. The parser still rejects malformed timestamps. Missing, explicit null
and a timestamp remain distinct. Neither retained observations nor their
authenticated digests are rewritten. Equal resource revisions with genuinely
conflicting projections block seat eligibility even when their event occurrence
times differ or both events precede a later accepted state. Equivalent state
with different event metadata, item order or timestamp spelling does not create
a conflict. An unverified row still blocks separately under the provenance
guard.

Only consumed historical `subscription.created` initial-purchase evidence may
omit `updatedAt`. If there is no retained comparable revision, the new mandatory
`resourceUpdatedAt` field is explicitly null. Missing fields are not equivalent
to that guarded fallback. No new column, timestamp backfill, evidence rewrite or
rollout flag is introduced.

The transport always validates GET `updated_at`. With a non-null resource
watermark it requires GET revision >= that watermark. With null it preserves all
identity, active/automatic state, cancellation, cadence, exact period, exact item,
price/currency and custom-data checks. SQL preview repeats timestamp validation
and the comparable comparison. Durable begin calls preview/context again under
the existing account lock, so an intervening unresolved event blocks dispatch.

## Exact resource revision and equal-event semantics

CODEX-70 found two remaining local defects: the older equal-event guard still
compared raw JSON, and the final freshness path lost fractional precision after
the exact resource projection had already preserved it. CODEX-71 corrects both
inside the same uncommitted migration 181 and seat transport package.

The former precision path was:

| Boundary                          | Former representation                         | Precision consequence                               |
| --------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Retained observation.updatedAt    | Original RFC3339 JSON string                  | All 1–9 fractional digits retained                  |
| Authority helper / maximum        | `billing_paddle_timestamp_v1` → `timestamptz` | Rounded to microseconds                             |
| Context JSON / TypeScript context | Serialized SQL timestamp / string             | Rounded value carried forward                       |
| Transport freshness               | `Date.parse` → Number milliseconds            | Fraction below milliseconds discarded               |
| SQL preview / begin               | Timestamp casts                               | Sub-microsecond stale snapshots could compare equal |

The final `resourceUpdatedAt` wire field remains an RFC3339 string, or explicit
null only for the reviewed historical initial fallback. SQL orders revisions
using the existing exact UTC nanosecond key converted to `numeric`, selects the
maximum exact instant, and returns that observation's original timestamp text.
It never computes lexical MAX over raw offset spellings and never serializes an
epoch-nanosecond number into JSON. Equal exact instants can retain either original
equivalent spelling without changing the authority.

The transport's `comparePaddleResourceRevisions` validates through the existing
strict `observedTimestamp` parser, separates the original fractional digits,
and uses Date only for the explicitly zoned whole second. Four-digit validated
years keep that whole-second millisecond component within the exact safe integer
range. BigInt multiplication and the original fraction padded to nine digits
produce the same integer instant as SQL. No fraction is passed through Date for
ordering, and no floating-point epoch nanoseconds are used. Existing billing
period, state, cadence, mapping and settlement checks remain intact.

SQL preview explicitly validates the snapshot timestamp before the comparison,
including when the historical authority is null; planner short-circuiting cannot
skip malformed-input rejection. Preview and durable begin use exact numeric
revision keys. Supersession and the resource/occurrence causal bound in the new
helper use those exact keys too, while keeping the two clock domains distinct.

The equal-event guard now reuses `billing_paddle_seat_resource_state_v1`, just
like the equal-resource collision map. Different event/delivery identity, item
order and equivalent timestamp spelling no longer create false contradictions.
Real status, period, schedule, item, marker or revision differences still block.
CODEX-72 found that applied observations skipped this equal-event check. CODEX-73
checks a second exact-key map for event occurrences alongside the resource-revision
map, immediately after authenticated provenance validation and before the applied,
unresolved or superseded-history branches. Applied proofs cannot exempt a row from
either contradiction check. No successful context can return until the entire
relevant history has passed. Both maps use the same semantic resource projection;
rounding cannot equate distinct event instants. Different occurrence and revision
keys still allow legitimate historical state transitions.

The applied-status reproduction and the intervening-applied-pair regression use
real lifecycle dispatch. Additional accepted-proof pair fixtures call the production
lifecycle evidence writer before advancing the shadow, with provenance, facts and
insertion guards enabled. This permits testing contradictory or equivalent accepted
proof histories without disabling triggers or inventing proof JSON. Tests verify
the actual applied-proof counts, context/preview/begin outcomes and unchanged
retained observations. Coverage includes period, item status, schedule and operation
markers, mixed applied/unapplied histories, equivalent two-item ordering and timestamp
spellings, and older applied contradictions beneath a newer applied watermark.

Matching SQL and TypeScript golden vectors cover Z and positive/negative offsets,
date rollover, pre-epoch instants, fractional lengths 1–9, 99 ns stale, exact
current, 1 ns newer and the `.123999999` rounding boundary. Authenticated SQL
fixtures verify retained authority → context serialization → preview → begin;
mocked transport tests consume the same authority/snapshot spellings. These
permanent suites share the contract vectors rather than a live cross-runtime
fixture. No provider request is made. Tests also retain the original collision,
audit-history, missing/null, provenance and intervening-observation regressions.

The old `providerUpdatedAt` context field stays available for compatibility but
does not authorize the new transport freshness comparison. A new transport with
an old database context fails closed. A future release must apply the reviewed
forward migration before deploying the transport; this document grants neither
deployment nor certification permission.

## Safety and remaining limits

The helper still blocks old observations when provenance, both clock facts,
strict ordering, or competing-state checks cannot prove supersession. Such
accounts may need separate evidence investigation. Existing applied observations
and historical proof shapes remain unchanged.

The collision checks use in-memory revision and occurrence maps during the existing retained
observation scan. Canonical item sorting is bounded by ingress's 32-item maximum;
timestamp normalization adds a fixed number of parsed fields per observation.
The occurrence map replaces the repeated equal-event history subquery. Map copying
can still grow quadratically with history size; the historical scan and map copying remain a separate
performance hardening topic. This change adds no database index and modifies no
historical rows.

Lifecycle/plan/seat settlement still have their existing mixed-shadow and request
ordering checks. This change fixes pre-dispatch GET freshness only; passing that
gate does not certify a future PATCH or real settlement. No provider retry,
preview, capacity grant, operation-before-PATCH rule, payment correlation, or
proration/payment-failure setting changes.

Local verification covers the new SQL guard, historical initial-period proofs,
seat orchestration with mocked GETs, and existing Paddle lifecycle/plan/settlement
regressions. The prior full database suite failure on timing-sensitive legacy
fixtures remains a separate baseline issue; focused passing suites do not turn
that earlier full-suite run green.
