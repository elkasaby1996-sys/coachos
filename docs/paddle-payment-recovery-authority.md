# Paddle payment recovery authority — R2A1

This local substrate derives a private `OutstandingBillingObligation` from
authenticated, append-only observations. It creates no mutable debt table and
does not call a provider. `billing_payment_applications_v2` remains the only
accepted financial-consumption ledger. R2A2 (payment-method transport and
ownership recheck) and the browser integration are still pending. Remote
deployment and certification require separate authorization.

## Evidence and authority

The closed webhook vocabulary adds `transaction.past_due`,
`transaction.payment_failed`, `transaction.updated`, `transaction.paid`,
`transaction.canceled`, `subscription.past_due`, `adjustment.created`, and
`adjustment.updated`. Existing `transaction.completed` and subscription update
paths remain supported. Delivered event names are retained verbatim.

Recurring transactions with financial details retain canonical decimal strings
for subtotal, tax, discount, total, credit, credit to balance, grand total,
remaining balance, payment attempt amounts, and captured amount. Values must be
nonnegative integers bounded by the exact compatibility range
`9007199254740991`. Arithmetic is checked with BigInt in TypeScript and numeric
in PostgreSQL. The existing `paymentTotals` projection is produced for recurring
transactions even without an operation marker. Plan/seat proration parsing is
unchanged.

Event occurrence and resource revision remain separate. Exact resource ordering
uses the existing nanosecond timestamp helper. All observations for the same
transaction are checked before choosing its latest state. A different identity,
commercial purpose, period, currency, or total cannot be hidden by a newer
revision. Equal resource revisions with different financial states fail closed.
Item and payment arrays compare as deterministic multisets, retaining duplicates.
Authenticated cancellation and adjustment observations invalidate automatic
recovery; they never create financial authority or implement refund accounting.

## Private resolver

`resolve_billing_outstanding_obligation_v1(canonical_subscription)` is service
only. Its helpers are not executable by application roles. The resolver verifies
the unique current paid billing.v2 canonical subscription, current Paddle/test
shadow/customer linkage, current applied subscription evidence, and absence of
conflicting current legacy authority or open commercial operations. Account and
existing Paddle ingress locks serialize the authority boundary.

Exactly one unconsumed explicit past-due recurring transaction is required.
Two transactions return `ambiguous`; none cannot be invented from a subscription
status or catalogue price. Every candidate needs signed delivery/proof provenance,
an authenticated matching past-due subscription observation, an exact renewal
period, and complete financial and commercial items. It must be automatic,
fully unpaid, positive, USD, without discount/credit/refund/adjustment or partial
capture. Balance must equal the validated payable total.

The existing **final seat-aware lifecycle helpers** validate the current base
mapping and approved add-on quantity. The single canonical
`billing_subscription_items_v2` base row is not the provider item set. A provider
renewal can contain base plus coach-seat add-on items. Their subtotal must match
the retained financial subtotal; supported tax is included in the exact payable
amount. Recovery does not buy seats, change approval, or change capacity.

The resolver returns either `{ available: true, obligation }` or a reference-free
unavailable reason. Internal settlement candidates are not exposed by the public
service RPC when unavailable. `authorityRevision` hashes the canonical/shadow/
customer snapshots, mapping records, and sorted retained evidence identities and
digests. This revision changes when relevant authority changes; it is not payment
proof and must not be exposed to the browser.

## Recovery and ordering

`transaction.paid` is settlement pending and blocks another recovery collection.
An active subscription observation for the same period also withholds collection
authority while matching financial settlement is pending. Neither can grant
financial recovery alone.

A completed recovery transaction must match the exact retained obligation,
customer, subscription, currency, period, and complete item multiset. It needs
zero balance and one fully captured supported payment, with any other attempts
failed. The final lifecycle proof and renewal payment trigger revalidate the
obligation before atomically creating proof, `application_kind='renewal'`, and
canonical recovery. Existing transaction uniqueness is unchanged. There is no
`payment_method_recovery` application kind. Conflicting reuse is not treated as
success.

Completed-before-active waits; active-before-completed grants nothing. Their
matching complement produces one renewal. Duplicate applied evidence is reused.
Late failed evidence cannot reopen an already consumed renewal transaction.
An unresolved retained past-due transaction blocks status-only recovery, including
same-period active updates. Normal lifecycle behavior without retained debt keeps
its existing authority contract.

Transactions with origin `subscription_payment_method_change` are retained and
acknowledged as nonfinancial. They cannot create an application, advance a period,
change a plan, or approve capacity. Cancellation and explicit supersession do not
silently remove collectible history: without a reviewed replacement proof,
automatic recovery stays unavailable. V1 does not implement partial-payment,
refund, credit, or replacement-obligation accounting.

## Preservation, privacy, and verification

Migration population/backfill is zero. Migrations 1–181 and historical evidence
are unchanged. Sparse historical financial observations remain insufficient;
missing facts are never inferred. A transaction with unresolved incomplete or
contradictory history stays unavailable rather than borrowing facts from another
transaction. Future providers can supply the same private generic obligation
contract through their own authenticated evidence/resolver implementation.

No provider portal, URL, continuation, API credential, or provider request is
introduced. Private references and amounts remain in existing private evidence
structures and service-only contexts; public responses and rejection logs contain
only fixed statuses/codes. Synthetic test references have no provider authority.

Local verification uses only `repsync_reconciliation01`, including the obligation
and recovery SQL suites, existing lifecycle/plan/seat regressions, and the recovery
concurrency harness. `coachos` application data is not a verification target.
The harness uses real PostgreSQL lock barriers, exercises both seat quantities
and both arrival orders, and requires a disposable reset after committed fixtures.
Plan changes with approved seats remain unsupported; this implementation does
not broaden any plan-change or seat-purchase authority.
