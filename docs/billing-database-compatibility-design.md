# BILLING-ADAPTER-03 — provider/database compatibility and historical proof contracts

Design only, 2026-09-19; repository baseline `4718508`. **Recommendation: CONDITIONAL GO for an additive schema implementation after the gates below. Not a GO for Paddle integration or release.**

No migration file, application code, provider API integration, database write, deployment, remote inspection or staging/production modification is part of this change. The validation SQL below is a proposed read-only proof plan, not executed results.

## 1. Decision and scope

Keep existing Lemon Squeezy tables, identifiers, protected history, proof shapes and v1 reconciliation semantics. Add a small parallel persistence contract for provider-neutral price/item/evidence identities, initially admitting only `paddle`. Expose shared server-only reads over the two contracts. Both write into the existing canonical account subscriptions and entitlement model through independently validated reconciliation paths.

This is the minimum **safe semantic change**, not the fewest ALTER statements. Merely widening provider CHECKs would still require Paddle to invent a store, variant, order item, first subscription item, graduated quantity contract and LS payment event. Making all those columns nullable would weaken existing history guards and still leave LS assumptions in RPCs. Rebuilding existing tables behind renamed views would disrupt rowtypes, grants, triggers and historical foreign keys. Parallel tables avoid those changes; a combined v2 operation table avoids duplicating the new plan and seat ledgers.

The database boundary will have two supported storage contracts:

| Contract                                   | Provider       | Write authority                                                                                        | Reads                                                    |
| ------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `lemonsqueezy.v1`                          | `lemonsqueezy` | Existing legacy RPCs and receipt serializer, unchanged proof predicates                                | Existing readers plus explicit compatibility projections |
| `billing.v2` / proof validator `paddle.v1` | `paddle`       | New versioned receipt serializer, service orchestration RPCs and provider-specific SQL proof validator | New readers plus compatibility projections               |

New tables use `provider text CHECK(provider='paddle')` for this rollout. Their identities/relationships are provider-neutral; the narrow admission allowlist deliberately prevents a second writable representation of LS history. A future provider needs its own reviewed validator and allowlist change. A free-form provider string is not authorization.

Existing records are not reclassified as Paddle. Live LS subscriptions can continue legitimate reconciliation in their existing tables. “Immutable history” means preserving immutable identifiers, protected versions, completed operations, event history and original evidence; it does not mean freezing allowed current-state lifecycle updates.

## 2. Complete inventory and coupling map

The [dependency inventory](billing-database-dependency-inventory.md) is part of this deliverable. It enumerates fields, all relevant PKs/UNIQUEs/FKs/CHECKs, trigger rules, provider/store/product/variant/price/item assumptions, current RPC definitions, proof structures, replay hashes, privileges and TypeScript consumers. Every field group is classified using the five requested categories.

The critical path is:

```text
approved canonical plan/add-on version + cadence
  -> provider/environment-scoped mapping
  -> owned, durable checkout/change intent
  -> adapter-verified event/subscription/transaction/item receipts
  -> core serializer (versioned, provider-bound proof)
  -> SQL provider-specific evidence validator
  -> canonical ownership, mapping, timing, replay and capacity checks
  -> account_subscriptions + approved seat state + append-only audit
  -> existing entitlements, capacity reservations and access policy
```

Key findings that drive the proposal:

- Existing seat pricing is **one LS graduated price**, with provider quantity `1 + additionalSeats`; there is no legacy add-on price to translate into a standalone Paddle price.
- Provider status, event names, first-item proof, invoice reason and store identity participate in SQL authority. Generic observations alone cannot replace them.
- Current provider/environment UNIQUE keys are useful, but several lookups and advisory locks assume there is only one provider.
- `account_subscriptions` and its one-current-subscription constraint have **no environment dimension**. Provider-level scoping alone does not isolate test money from live entitlements.
- Existing webhook evidence is protected by revoked table grants, but has no immutable-evidence trigger. New evidence needs an explicit append-only guard.
- Existing invoice API proof omits transaction IDs, amounts and currency. A historical “paid transaction ledger” cannot be reconstructed from those snapshots.

## 3. Proposed schema contract

The following is a concrete logical schema specification, not migration DDL. Names are proposed and reserved by this document only. All new FKs use ON UPDATE RESTRICT / ON DELETE RESTRICT unless noted. All new tables are private to trusted SQL: RLS enabled, no direct PUBLIC/anon/authenticated/service_role grants, explicit narrow RPC grants. No automatic Data API table exposure. UUID PKs default to `gen_random_uuid()`; creation timestamps default to transaction time. Required means NOT NULL; `?` means nullable.

### Shared identity, checks and lifecycle rules

- Scope `S = (provider, environment)`, with admitted provider `paddle` and environment exactly `test | live`. References are `text COLLATE "C"`, nonempty/non-whitespace, bounded to 512 UTF-8 bytes as a defensive application contract. Reject invalid/oversized input; **never trim, case-fold, parse numerically, cast to UUID, infer prefix meaning, or synthesize references**. Validate this bound against future fixtures before integration. Optional references are NULL when absent.
- IDs supplied to mapping/subscription/operation RPCs must be joined through composite scope/owner FKs, not UUID alone. UUID unpredictability is not access control.
- Hashes are 64 lowercase hex characters plus an explicit algorithm/version tag. Hash mismatch is an error/review condition, never an overwrite of retained proof.
- Published mapping content is immutable. Allow `draft -> active -> retired`; draft content can change, active may only retire, retired cannot change/delete. “Inactive” means draft or retired; no second ambiguous `is_active` flag. Used mappings cannot be deleted, even drafts; preferably prohibit all deletes.
- Financial intent/evidence identity is immutable. Operations/checkouts may update an explicit lifecycle whitelist; terminal rows cannot be reopened. Event and proof records cannot update/delete, except the inbox processing fields specified below.
- One configured merchant account per provider/environment is assumed. Deployment credential/endpoint binding establishes merchant scope. There is no fake merchant/store column. Supporting multiple Paddle accounts in one environment requires a future `provider_account_key` dimension on **every** key, FK, lock and receipt; block such configuration now.

### A. `billing_runtime_policy`

One row: `id smallint PK CHECK(id=1)`, required `entitlement_environment text CHECK IN ('test','live')`, `paddle_sales_enabled boolean DEFAULT false`, `paddle_reconciliation_enabled boolean DEFAULT false`, `updated_at timestamptz`. Policy is migration/operator owned, never caller writable. Neither provider credentials nor merchant secrets are stored here.

New admission and reconciliation must match the configured entitlement environment. Opposite-environment verified events may be retained as isolated inbox evidence, but cannot acquire canonical subscription links, mutate account state or approve seats. A DB intended to exercise both environment paths in tests must switch policy only in separate rolled-back fixtures with no active obligations. Do not change policy on an operating billing database to move accounts between environments. Production uses live; local/staging uses test. Before enabling production, inventory any pre-existing test-linked accounts and resolve them explicitly; no automatic conversion or history rewrite.

Additive guard triggers on legacy checkout/operation admission and entitlement-affecting reconciliation writes must enforce the same environment boundary, using legacy linkage. Their rollout default must match the already-authorized environment. Legacy paid canonical writes made before the provider link is inserted need a guarded RPC entry check on `reconcile_billing_provider_subscription`; a trigger that looks only for an existing provider row is insufficient. This narrow guard is an eventual v1 wrapper/body change; its proof predicates and serializer remain unchanged. New flags do not disable ongoing LS reconciliation.

### B. `billing_price_mappings`

Required: `id uuid`, `provider text`, `environment text`, `identity_kind text` (`plan | addon`), `canonical_key text`, `cadence text` (`monthly | annual`), `provider_price_ref text`, `currency_code text` (`USD` initially), `unit_amount_minor bigint > 0`, `recurrence_unit text` (`month | year`), `recurrence_count integer = 1`, `quantity_model text = 'separate_recurring_item'`, `status text` (`draft | active | retired`), `created_at`, `updated_at`.

Nullable: `plan_version_id uuid`, `addon_version_id uuid`, `provider_product_ref text`, `verified_at`, `retired_at`, `verification_sha256 text`, `verification_evidence_id uuid`.

Keys/checks:

- PK `id`; UNIQUE `(provider,environment,provider_price_ref)` **across all statuses**, preventing a retired price from being reassigned to a different commercial identity.
- UNIQUE `(id,provider,environment,cadence,identity_kind)` for scoped FKs.
- Exactly one canonical version FK: plan requires `plan_version_id` and NULL add-on; add-on requires `addon_version_id` and NULL plan. Plan key `launch/growth/scale`; add-on key `coach-seat`. A publication trigger validates key against canonical version (`coach-seat -> coach_seat` explicitly), currency, amount for cadence, no provider trial and verified recurrence. `custom` is not self-serve.
- Partial UNIQUE `(provider,environment,canonical_key,cadence) WHERE status='active'`. Unlike legacy version-based uniqueness, this explicitly prevents two active sale mappings for two versions of the same canonical key. Concurrent replacement retires old then activates new in one locked transaction.
- Monthly iff recurrence month; annual iff year; active requires verified_at/hash/evidence; retired iff retired_at nonnull. Add the scoped verification-evidence FK after H exists. Publication validates that the referenced catalogue proof matches the exact price, canonical version, amount, currency, cadence and verification digest. Active publication requires an active canonical version; historical references accept active/retired versions. Product ref is optional identity evidence, not a global one-product constraint.
- Draft verification can store only allowlisted catalogue facts with a versioned digest in approval evidence; no raw provider document or secret. Canonical price/version equality is necessary but not proof the provider catalogue was verified. Activation is restricted to the reviewed server/operator publication path.

Exactly eight active mappings per enabled environment are required for complete Paddle launch: six plan/cadence pairs and two coach-seat/cadence pairs. No real provider refs are seeded by this design or copied from LS.

### C. `billing_customers_v2`

Required: `id uuid`, `billing_account_id uuid FK billing_accounts`, `provider`, `environment`, `provider_customer_ref`, `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`.

PK `id`; UNIQUE `(provider,environment,provider_customer_ref)`; UNIQUE `(billing_account_id,provider,environment)`; UNIQUE `(id,billing_account_id,provider,environment)` for child FK. Only last_seen/updated can change. No email, signed URL or LS store. Reassignment to another account is forbidden.

### D. `billing_subscriptions_v2`

Required: `id uuid`, `billing_account_id uuid FK billing_accounts`, `customer_id uuid`, `provider`, `environment`, `provider_subscription_ref`, `reconciliation_status` (`pending | processed | manual_review`), `approved_additional_coach_seats integer >= 0 DEFAULT 0`, `created_at`, `updated_at`.

Nullable until sufficient proof: `account_subscription_id uuid`, `provider_status text`, `provider_created_at`, `provider_updated_at`, `current_period_started_at`, `current_period_ends_at`, `scheduled_cancel_at`, `latest_evidence_id uuid`, `latest_snapshot_sha256 text`, `last_reconciled_at`, `reconciliation_error_code text`.

PK `id`; UNIQUE `(provider,environment,provider_subscription_ref)`; UNIQUE nullable `account_subscription_id`; UNIQUE `(id,billing_account_id,provider,environment)`; composite FK `(customer_id,billing_account_id,provider,environment)` to customers; composite FK `(billing_account_id,account_subscription_id)` to canonical subscriptions. Latest evidence must match same subscription/scope via deferred FK/constraint trigger, added after evidence table creation.

Provider status is opaque evidence, not an entitlement enum. Timestamp absence remains absence. Nullable period bounds, when both present, must be ordered. Only reconciler may link canonical paid state after complete proof. A constraint trigger under the account lock rejects an account_subscription_id already linked from legacy storage and validates paid kind, owner, plan evidence and enabled environment. Repointing to a new canonical subscription requires the approved supersession operation; identity/provider/customer refs never change.

### E. `billing_subscription_items_v2`

Required: `id uuid`, `subscription_id uuid`, `billing_account_id uuid`, `provider`, `environment`, `item_role text` (`base_plan | coach_seat`), `mapping_id uuid`, `cadence`, `mapping_kind`, `quantity integer > 0`, `evidence_id uuid`, `created_at`, `updated_at`. Optional `provider_item_ref text` and observed item timestamps.

PK `id`; UNIQUE `(subscription_id,item_role)`; partial UNIQUE `(subscription_id,provider_item_ref) WHERE provider_item_ref IS NOT NULL`; scoped subscription FK to D and mapping FK `(mapping_id,provider,environment,cadence,mapping_kind)` to B. CHECK base_plan implies plan and quantity=1; coach_seat implies addon and quantity>0. No global first-item position and no required external item ID. A transaction-level validator requires exactly one base item for a reconciled subscription, at most one seat item, matching base/seat cadence, approved price refs and no unexplained extra recurring items.

Zero additional seats means no current seat item. These are current observations: updates/replacement/removal are allowed **only** by reconciler with append-only prior and new evidence retained in H. Never reinterpret observed quantity as approved seats. A pending paid change may make observed items differ from canonical approved state; it must match the durable operation. Stable price+role matching is sufficient if a provider supplies no independent subscription-item reference. Ambiguous duplicate prices/items require review, not array-index selection.

### F. `billing_checkouts_v2`

Required: `id uuid`, `billing_account_id uuid`, `created_by_user_id uuid FK auth.users`, `operation_id uuid`, `provider`, `environment`, `plan_version_id uuid FK commercial_plan_versions`, `cadence`, `base_mapping_id uuid`, `base_mapping_kind text='plan'`, `requested_additional_seats integer>=0 DEFAULT 0`, `status` (`creating | ready | completed | failed | ambiguous | expired`), `expected_expires_at`, `creation_lease_expires_at`, `created_at`, `updated_at`.

Optional: `seat_mapping_id uuid`, `seat_mapping_kind text='addon'`, `provider_checkout_ref text`, `provider_transaction_ref text`, `provider_expires_at`, `completed_subscription_id uuid`, `error_code`, `completed_at`, `failed_at`, `expired_at`. No stored signed portal URL. Checkout transport/URL policy remains a separately reviewed capability; its absence cannot be papered over with a fake checkout ref.

PK; UNIQUE `(billing_account_id,operation_id)`; UNIQUE `(provider,environment,provider_checkout_ref)` and `(provider,environment,provider_transaction_ref)` when nonnull; composite mapping FKs to B with same scope/cadence; scoped completed-subscription FK to D including account. Trigger checks base plan_version_id, active mappings at admission, correct seat role, owner and canonical ceiling. Seat mapping is required iff requested seats>0; at zero, both seat mapping fields NULL. Expiry and lease bounds mirror current intent protection. Lifecycle timestamps equivalent to matching terminal status; completed iff linked subscription and timestamp present. Ready requires verified checkout/transaction capability evidence, not a provider-specific URL regex or assumed provider expiry field. Expected admission expiry remains mandatory even if upstream expiry is absent; the eventual adapter must prove the accepted checkout window before enablement.

Initial rollout supports zero-seat checkout for parity; positive-seat intent is schema-valid only behind a separately proven capability. Do not enable it merely because the table can represent it.

### G. `billing_operations_v2` and `billing_operation_events_v2`

One ledger for `operation_kind = plan_change | seat_quantity`; checkout remains a separate admission record.

Required operation fields: `id uuid`, `operation_id uuid`, `billing_account_id uuid`, `subscription_id uuid`, `provider`, `environment`, `source_account_subscription_id uuid`, `operation_kind`, `source_base_mapping_id uuid`, `target_base_mapping_id uuid`, `source_cadence`, `target_cadence`, `source_additional_seats integer>=0`, `target_additional_seats integer>=0`, `effective_timing` (`immediate | period_end`), `status` (same ten legacy operation states), `preflight_snapshot jsonb`, `requested_at`, `created_by_user_id uuid`, `created_at`, `updated_at`.

Optional: `source_seat_mapping_id uuid`, `target_seat_mapping_id uuid`, `change_kind text`, `provider_requested_at`, `provider_applied_at`, `payment_confirmed_at`, `effective_at`, `cancel_requested_at`, `completed_at`, `canceled_at`, `failed_at`, `ambiguous_at`, `last_evidence_id uuid`, `error_code text`. Add constant plan/addon kind columns for scoped FKs as in F; source/target seat kind columns are NULL iff corresponding mapping is NULL.

PK; UNIQUE `(billing_account_id,operation_id)`; partial UNIQUE `(subscription_id) WHERE status NOT IN ('completed','canceled','failed')` serializes **both** plan and seat operations. Scoped subscription FK, same-account canonical source FK, creator FK and four scoped mapping FKs using respective cadence. Preflight has an exact versioned object shape, not arbitrary provider payload. Append-only event table: `id uuid PK`, `operation_id uuid FK`, `event_type text`, `occurred_at`; UNIQUE `(operation_id,event_type)` for one-time transitions/errors, matching legacy audit semantics.

Insert/state-transition guard validates owner, exact canonical source and observed provider identity under lock, mapping publication, canonical ceiling, direction, payment/effect timestamps and capacity preflight. Terminal timestamp/completion/application/payment checks mirror legacy authority. For plan changes, source/target canonical pair differs; classify with existing direction policy, preserve the approved additional-seat count, reject an open seat change, and require sufficient target seat capacity plus an approved target add-on price when seats exist. A cadence change must change the base and seat prices together to the target cadence; partial application goes to review. For seat changes, base/cadence must be identical, source/target seats differ, increase immediate and reduction at period end. Target seat mapping required iff target seats>0; source seat mapping required iff source seats>0. No `source_quantity=1+seats`, `card`, `variant`, `store` or provider proration enum. A future provider policy translates canonical timing to its wire mutation behavior and proves the result.

### H. `billing_webhook_events_v2` and `billing_evidence_v2`

`billing_webhook_events_v2` is a logical inbox, not a claim that an event equals a single transport attempt. Required: `id uuid PK`, `provider`, `environment`, `provider_event_ref text`, `provider_event_name text`, `resource_type text`, `resource_ref text`, `occurred_at timestamptz`, `first_payload_sha256 text`, `processing_status` (`received | processed | ignored | deferred | failed | manual_review`), `attempt_count integer>=0`, `received_at`. Optional `subscription_ref`, `customer_ref`, `processed_at`, `last_attempt_at`, `last_error_code`. UNIQUE `(provider,environment,provider_event_ref)`; event identity and original digest are immutable. Only processing whitelist changes. External refs have no subscription FK so delivery-before-link is valid. Unsupported event names remain opaque, recorded and ignored.

`billing_evidence_v2`: required `id uuid PK`, `provider`, `environment`, `source_kind` (`webhook | api_reconciliation | catalogue_verification`), `proof_kind` (`event | subscription | transaction | catalogue`), `proof_schema text`, `validator_version text`, `replay_algorithm text`, `replay_key text`, `normalized_sha256 text`, `proof jsonb`, `verified_at`, `created_at`. Optional `event_id uuid`, `subscription_id uuid`, `provider_notification_ref text`, `raw_payload_sha256 text`, `provider_transaction_ref text`, `provider_created_at`, `provider_updated_at`.

Composite event/subscription FKs must match provider/environment; parents expose UNIQUE `(id,provider,environment)`. UNIQUE `(provider,environment,source_kind,proof_kind,replay_algorithm,replay_key)` deduplicates identical retained evidence, including API retrieval. Proof must pass the exact discriminated schema and SQL type/required-key validator; JSON object CHECK alone is insufficient. All fields append-only. Canonical normalization/hash computation is versioned; use SQL JSONB hashing for this new contract consistently, not a claim of byte equivalence to source JSON. Raw webhook hash is separately retained.

CHECK/validator rules require webhook evidence to have event_id and raw_payload_sha256, catalogue evidence to have proof_kind=catalogue and no subscription/event link, and API evidence to have no fabricated raw-body hash or webhook event identity. Catalogue evidence is created before mapping activation. Transaction proof requires a transaction ref; subscription/transaction grant evidence requires a scoped subscription link. Deferred webhook event evidence may remain unlinked. Back-references from item, subscription and operation rows must match the referenced proof's subscription as well as provider/environment; a same-scope proof for a different subscriber is insufficient.

Paddle webhook replay uses logical **event reference**, scoped by S. Notification reference and raw digest describe deliveries; a new notification of the same event does not reapply it. The append-only `event` evidence rows retain distinct notification/body hashes using a canonical JSON array of `[event_ref, notification_ref or null, raw_payload_sha256]` as the hash input (`delivery-evidence-v1`). Identical retries may reuse evidence and increment attempt_count. If the same event ref has a differing raw body, compare normalized event identity/data excluding transport notification fields. Semantically conflicting evidence goes to manual review; legitimate new notification metadata is retained without duplicate entitlement application.

API replay uses `api-evidence-v1` and a deterministic hash over a canonical tuple of scope, proof kind, subscription ref, operation UUID if any, provider revision/timestamp, normalized evidence and explicit effect discriminator. Scheduled reductions add the immutable operation ID + effective_at + `effect_due`, so reaching the boundary can re-evaluate the same snapshot exactly once. Never hash `now()` to manufacture uniqueness. Event IDs, raw hashes, notification IDs and API replay keys are separate concepts.

Paddle documents at-least-once, potentially out-of-order events and event-ID deduplication. This supports the separate event/transport model; provider event names and timestamps remain provider evidence rather than LS aliases. [Paddle webhook delivery documentation](https://developer.paddle.com/webhooks/about/how-webhooks-work/)

### I. `billing_payment_applications_v2`

Required: `id uuid PK`, `provider`, `environment`, `provider_transaction_ref text`, `billing_account_id uuid`, `subscription_id uuid`, `evidence_id uuid`, `application_kind` (`initial | plan_change | seat_increase`), `applied_at`. Exactly one of `checkout_id uuid` or `operation_id uuid` is required, selected by kind. All FKs are scoped to same provider/environment/account; add supporting parent composite UNIQUEs. Evidence FK/constraint trigger requires same transaction ref, scope, subscription and accepted proof kind/version.

UNIQUE `(provider,environment,provider_transaction_ref)` prevents consuming one transaction for two grants; UNIQUE nullable checkout_id and operation_id ensures one payment application per intent. This rollout permits one commercial grant per transaction. Batched multi-operation invoices would need a future line-allocation design, not relaxation of this rule. Initial checkout may cover its approved base plus seats as one intent. A payment application is inserted atomically with entitlement application and completion; never before all checks. Entire table append-only.

### J. Cross-contract constraints and compatibility helpers

No new mapping/customer/subscription fields are added to old rows. Add private, read-only `billing_mapping_catalogue_v2`, `billing_subscription_catalogue_v2`, `billing_open_operations_v2` views/helpers with explicit columns and `storage_contract` discriminant. These are UNION ALL projections over mutually exclusive provider sets. Identity is `(storage_contract,id)`, never a bare cross-table UUID. Use security-invoker views where supported and revoke all direct client/service access; audited definer RPCs may consume them. Supabase documents that views require particular care because they can otherwise bypass RLS. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

Mapping projection: legacy plan version/cadence/price become generic display identity, with `quantity_model='legacy_graduated'`; new rows expose `separate_recurring_item`. LS standalone seat price is **absent**. A separate legacy seat-contract branch returns `quantity_price_contract_id` and canonical add-on version, never a fake providerPriceRef. Subscription projection preserves each table's original UUID, scope, external ref, canonical link, approved seats and review status. Operations project immutable source/target intent and effective timing for capacity helpers.

All admissions and canonical effects acquire the same billing-account row lock. Before a new checkout in either version, reject any open checkout from either ledger and any incompatible canonical paid subscription. Before operations, reject other open operations for the account/current subscription across both storage contracts. Implement this with additive BEFORE INSERT guards on legacy and new ledgers, plus explicit RPC checks; a UNIQUE index on one table cannot enforce a cross-table invariant. Expire stale attempts in both ledgers first. Idempotency reuse across legacy/v2 must return the original matching request or fail conflict, never mint a new provider checkout; check account+operation UUID across ledgers under the account lock.

Canonical subscription link exclusivity also needs a cross-table constraint trigger and account lock. New advisory subscription locks include provider+environment+opaque ref using unambiguous canonical encoding; legacy key remains untouched. Use lock order: delivery/event row if applicable -> scoped subscription advisory lock -> account row -> operation/checkout row -> mappings in stable UUID order. All future mutation paths must follow the same order; test races against existing legacy paths before enabling concurrency.

## 4. Paddle checkout mapping contract

Trusted server configuration chooses `provider='paddle'` and environment; the browser supplies only planKey, cadence and operation ID (and seats only when that capability is enabled). SQL rechecks deployment policy. User-provided provider/ref/amount, metadata plan claims, return URL or webhook custom data cannot select the mapping.

| Input identity       | Required mapping                         | Base quantity                  | Seat quantity                  |
| -------------------- | ---------------------------------------- | ------------------------------ | ------------------------------ |
| launch / monthly     | plan launch, monthly                     | 1                              | N at coach-seat/monthly if N>0 |
| launch / annual      | plan launch, annual                      | 1                              | N at coach-seat/annual if N>0  |
| growth / monthly     | plan growth, monthly                     | 1                              | N at coach-seat/monthly if N>0 |
| growth / annual      | plan growth, annual                      | 1                              | N at coach-seat/annual if N>0  |
| scale / monthly      | plan scale, monthly                      | 1                              | N at coach-seat/monthly if N>0 |
| scale / annual       | plan scale, annual                       | 1                              | N at coach-seat/annual if N>0  |
| coach-seat / monthly | addon coach_seat active version, monthly | Not a standalone base purchase | Additional seats only          |
| coach-seat / annual  | addon coach_seat active version, annual  | Not a standalone base purchase | Additional seats only          |

Resolution transaction:

1. Authenticate owner; resolve/lock canonical billing account; apply account eligibility and cross-ledger idempotency/open-checkout checks.
2. Validate planKey/cadence; select exactly one active canonical plan version and exactly one active scoped price mapping. Zero or multiple matches fails closed; no fallback to another provider, cadence, environment or catalogue version.
3. If seats>0, validate integer canonical ceiling; resolve active coach_seat version and the same provider/environment/cadence add-on mapping. Require same currency and recurrence as base; explicit item role/key validation prevents substituting another plan price.
4. Lock mappings FOR SHARE through intent insertion. Verify publication hashes and canonical amount/version; record immutable mapping IDs, plan version, cadence, requested seats, scope, owner, expiry and operation ID.
5. Return server-only `{provider, environment, base: {mappingId, planVersionId, planKey, cadence, providerPriceRef, quantity: 1}, seatAddon?: {mappingId, addonVersionId, addonKey: 'coach-seat', cadence, providerPriceRef, quantity: N}}`. Provider price refs are exact stored strings. No store/variant/first-item fields.
6. Completion/reconciliation binds to these recorded mapping IDs, even if retired after admission. It does not re-resolve today's active price. Retirement time must not precede admission. Existing obligations use the exact historic mapping; retired means unavailable for new sale, not unreadable.

Reject mismatches with versioned, sanitized errors: mapping unavailable, scope mismatch, cadence mismatch, item-role mismatch, currency/recurrence mismatch, canonical-version mismatch, operation conflict, unapproved item drift. Never return secrets or complete proof in owner-facing errors.

## 5. Verified receipts and reconciliation authority

### Serialization contract

Keep existing `VerifiedEvent`, `VerifiedSubscription`, `VerifiedInvoice` runtime provenance guarantees. Introduce v2 serialization methods/interfaces, selected by trusted composition, rather than changing the v1 Record payload in place. Receipt tokens remain instance-bound and nonserializable; the core serializer checks the issuing instance/provider/environment before producing SQL arguments. Provider adapters do not own service RPC calls.

A proposed v2 envelope is:

```text
schema: billing-proof-v2
provider: paddle
environment: test | live
validator: paddle-v1
source: webhook | api_reconciliation
identity:
  subscriptionRef, customerRef
  eventRef? / originalEventName? / notificationRef? / occurredAt?
  transactionRef? / resourceType / resourceRef
subscriptionEvidence:
  providerStatus, providerCreatedAt?, providerUpdatedAt?
  currentPeriodStart?, currentPeriodEnd?, scheduledCancellation?
  items[]: {priceRef, itemRef?, quantity, observedAt?, productRef?}
transactionEvidence?:
  transactionRef, subscriptionRef, customerRef, providerStatus
  providerOrigin, createdAt, updatedAt, completedAt?
  currency, totals, lineItems[], paymentFacts, adjustmentFacts
correlation:
  checkoutAttemptId? | operationId? (claims revalidated against SQL intent)
proofDigests: {rawBodySha256?, normalizedSha256, algorithm}
```

This is a proposed **strict typed schema**, not an open JSON bag. The later Paddle proof implementation must enumerate nested allowed fields/types and reject extra keys, null-for-required values, nonfinite/negative quantities and conflicting identities. `completedAt` is optional unless actually available; creation/update timestamps must never be renamed to payment time. `totals`, `paymentFacts`, `adjustmentFacts` must contain only required sanitized financial facts and no PII/URLs. Unknown provider fields stay outside retained proof. Completion authority cannot rely on a caller-populated `verified=true`, advisory event taxonomy or branded TypeScript type alone.

For LS receipts, v2 identity projection can expose `providerSubscriptionRef <- subscription_id`, `providerCustomerRef <- customer_id`, `providerPriceRef <- price_id`, scoped by original provider/environment, and preserve a discriminated `legacyProof` envelope if needed for private reads. **Execute the existing v1 serializer and SQL validators for writes**, without round-tripping through the lossy neutral observation. Missing event IDs/transaction IDs/amounts remain NULL/absent. Do not persist JS receipt tokens or fabricate a new historical payment ledger. Existing v1 snapshots must remain byte/argument-equivalent in the 13 baseline tests.

### SQL validation and application

The SQL entrypoint accepts only admitted provider + proof version, validates shape and scope, and dispatches to an internal provider-specific validator. SQL cannot independently prove an upstream HMAC or API transport from JSON; the trusted receipt/service boundary establishes provenance, while restricted grants and SQL enforce ownership/payment business authority. Preserve that trust model explicitly.

For v2 application, all of the following must pass atomically:

1. Persist verified event/evidence before follow-up retrieval; failed retrieval updates retry state without losing original evidence. Invalid signatures never enter the verified inbox.
2. Validate environment policy and immutable provider/customer/subscription linkage; new subscription ownership requires a matching admitted checkout/transaction with exact owner and validity window. Custom metadata alone is not sufficient.
3. Match the entire recurring item set to the recorded mappings: exactly one base, zero/one cadence-matched seat item, correct quantities, no trial/unapproved discounts/extra items or pricing drift under the supported launch policy. Optional product refs, when retained in mapping, must also match. Array order is irrelevant.
4. Compare resource revision/timestamp against retained state. Older evidence cannot change canonical state. Equal revision with different semantic snapshot requires review. Event occurred_at orders event evidence, not necessarily latest subscription state; do not substitute arrival time or assume event and resource timestamps are interchangeable. If ordering cannot be proved, retrieve/validate current state or defer.
5. For initial activation and immediate increases/upgrades, require independently verified transaction completion, same subscription/customer/scope, exact approved checkout/operation correlation, correct transaction purpose, applicable target line prices/quantities and supported amount/currency/tax/proration settlement. Timestamp-after-request alone is insufficient correlation. Missing/ambiguous operation-to-transaction linkage means awaiting_payment/manual_review, never grant.
6. Prevent reuse with payment applications. Reductions require elapsed effective_at, approved target item state, cancellation checks and capacity safety; no new payment required for a reduction, preserving canonical policy.
7. Lock account and recheck current canonical subscription, other provider obligations, operations, mapping eligibility, seat ceiling, capacity and cancellation. Supersede canonical plan versions using the existing append-only supersession model. Seat increases change only approved seats after successful proof; observational drift never grants capacity.
8. Insert payment application, update allowed current state/intent, append operation/account events and mark inbox processed in the same transaction. Failure rolls back all grant effects; retain sanitized failed/deferred/review status. Duplicate processing cannot append a second grant.

Paddle distinguishes interim `paid` from `completed`; related fields may still be populated during processing. The proposed launch policy therefore waits for completed transaction evidence and complete linkage. This is a RepSync conservative policy, not a claim that every subscription event is payment proof. [Paddle transaction lifecycle](https://developer.paddle.com/build/transactions/create-transaction/)

The precise Paddle transaction correlation, settlement/proration and adjustment predicates are **integration gates**, not implemented by this design. Until verified against sanitized sandbox fixtures, the `paddle-v1` validator must reject grant attempts. This preserves authority rather than treating LS `billing_reason='updated'` as a portable payment rule.

### Required eventual SQL/RPC changes

| Surface                | Required work                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapping and checkout   | Add service-only `resolve_billing_checkout_mapping_v2`, `begin_billing_checkout_v2`, `get_billing_checkout_v2`, `complete_billing_checkout_v2`, `fail_billing_checkout_v2`, expiry helper; explicit provider/environment and authenticated owner propagation. Owner wrapper uses auth.uid(), not arbitrary account input.                                                         |
| Inbox and evidence     | Add `record_verified_billing_event_v2`, `record_billing_evidence_v2`, `fail_billing_event_v2`, `get_billing_reconciliation_result_v2`; validate hashes/versions and scoped identity, support deferred linking and event-ID replay.                                                                                                                                                |
| Reconciliation         | Add service-only `reconcile_billing_subscription_v2(event/evidence IDs)` and API finish entrypoint; internal `validate_paddle_proof_v1` and `apply_billing_effect_v2` remain ungranted. Re-read stored evidence/intent; do not grant from a plain observation argument.                                                                                                           |
| Plan/seat mutations    | Add v2 context/preview/begin/cancel/fail/finish RPCs over combined operations; keep unsupported capabilities unavailable. Existing LS RPCs stay routed to LS storage.                                                                                                                                                                                                             |
| Owned reads and portal | Add explicit scoped owned-subscription helper and versioned summaries, preserving canonical owner/status checks and second ownership check after provider retrieval. No persistent portal URLs.                                                                                                                                                                                   |
| Canonical consumers    | Refactor `billing_seat_effective_limit`, `billing_plan_change_capacity_limit` and the operation lookup inside `resolve_account_entitlements` to private compatibility helpers. Preserve return contracts and commercial policy. Verify transitive `resolve_account_capacity`, `reserve_account_capacity`, `evaluate_my_capacity_change`, access enforcement and public catalogue. |
| Cross-version safety   | Add admission/idempotency/link-exclusive guards to both ledger families; deployment-environment entry guard on legacy reconciliation and relevant service operation paths; retain old proof predicates. Add immutable legacy webhook-evidence guard allowing only processing fields if proven compatible.                                                                         |
| Runtime/types          | Add provider-bearing v2 identity/item/price contracts; discriminate serializer/RPC path; expand generated database types only after migration. No browser-selected provider. No LS merchant/offer fallback for Paddle.                                                                                                                                                            |

All definer functions require fixed search_path, explicit EXECUTE revocations/grants and independent ownership validation. Anonymous/authenticated roles cannot record proof or call apply helpers. Do not grant generic JSON mutation access to make tests pass.

## 6. Additive migration sequence

Each numbered stage is a future reviewed change. No stage is executed here.

1. **Preflight and baseline:** catalog the actual target schema against repository definitions; establish environment policy; capture row counts/IDs and deterministic hashes of every legacy table/protected payload and canonical output on an isolated copy. Inventory active, retired, open, failed, deferred and manual-review states. No acceptance based solely on row counts.
2. **Private schema only:** create tables, indexes, FK/constraint triggers, RLS/grants, disabled policy flags and read-only compatibility helpers. Add constraints in dependency order (evidence/subscription cycles last with deferred validation). No provider mapping refs, entitlement mutations or public provider switch. Validate constraints before any writer is enabled.
3. **Compatibility reads/backfill proof:** run the projection/backfill plan below; establish one-to-one legacy coverage and exact field/hash preservation. Add internal consumer routing behind a disabled gate; compare legacy summaries/entitlements/capacity byte-for-byte or semantically where transaction-time fields vary.
4. **Admission and environment fences:** add cross-contract guards and legacy entry checks. Keep LS payload/receipt/hash semantics unchanged. Prove owner checks, terminal immutability, legacy checkout expiry precision, retirement races and opposite-environment rejection. Inventory existing wrong-environment obligations before this step; unresolved cases block activation.
5. **Versioned proof/RPC implementation:** separate future task; create validators, operation helpers, explicit grants and typed serializers. Initially reject all unimplemented provider grant capabilities. All legacy regression suites must pass unchanged.
6. **Catalogue verification:** separately authorized setup supplies eight real, verified Paddle mappings per intended environment as drafts. Publish atomically only after provider catalogue evidence and canonical version/price/currency/cadence checks. Never auto-activate from key/name similarity.
7. **Local then staging proof:** run the matrix below on an isolated DB, then a specifically named staging project only after explicit authorization. Keep sales disabled through parity/replay proof; enable sandbox canary only with verified adapter and named approval. Live rollout is separate.

Do not run `db push`, remote migration commands, provider API setup or deployment merely because this sequence exists. Existing migrations remain historical artifacts; new implementation will use forward migrations when explicitly requested.

## 7. Backfill plan

**Recommended minimum backfill is a lossless read projection, not a copy of mutable legacy rows.** Old records already contain their correct historical data. Duplicating them into v2 would create two current-state authorities and require synchronized writes; it offers no Paddle capability. No LS rows are inserted into the native v2 tables (which reject LS).

| Existing source            | Compatibility projection                                                                              | Rules                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variant mapping            | Same `id`, provider/environment, plan_version_id, cadence, status, verification/retirement, price ref | Keep store/product/variant in legacy details; no key rewrite. Preserve retired rows.                                                                  |
| Quantity contract          | Legacy seat-pricing branch with same contract/mapping/addon IDs and exact contract digest             | No standalone seat price created; absent add-on price remains absent.                                                                                 |
| Customer/subscription      | Same source ID/external refs, scope/account/canonical link and approved seats                         | Do not derive payment or plan from current active mapping; use exact referenced mapping.                                                              |
| Checkout/operations/events | Same source ID/status/intent/terminal dates; discriminated storage contract                           | Keep source/target mapping IDs, quantities, errors and immutable event types. Pending operations remain legacy.                                       |
| Webhook deliveries         | Same event names, payload JSON, payload hash, fingerprint, statuses and timestamps                    | Source kind is `legacy_unspecified` if not provable; do not guess webhook vs API from identical-shaped rows. No event ID manufactured from object_id. |
| Payment history            | Legacy invoice/snapshot proof remains accessible through its original context                         | No amount, currency, transaction ref or payment time invented; no v2 payment-application backfill from weaker proof.                                  |

A migration implementation may generate a **temporary audit manifest** of source table+PK+row hash for validation in the isolated proof environment. Keep sensitive contents out of the repo; it is not a production billing table. Under a paused writer/snapshot-consistent copy, compare every record before and after. On a running system, use a consistent snapshot/watermark and account for authorized reconciliation writes; never compare inconsistent snapshots and label differences corruption.

Projection deployment is idempotent by definition; there are no backfill inserts to duplicate and no triggers to disable. Orphans, mismatched customer bindings, existing manual-review rows, invalid hash shapes and ambiguous historical source types are reported, not repaired silently. If future reporting needs a materialized index, design an insert-only `(storage_contract,source_id)` sidecar with exact source hashes and separate approval; it is not required here.

## 8. Validation queries (read-only, not executed)

Queries referencing proposed tables/views run only after a future migration, on local/staging proof data. Catalog queries verify actual constraint definitions rather than relying on autogenerated names. Expected result for anomaly queries is zero rows; inventory queries deliberately return rows.

```sql
-- Existing schema inventory: constraints, FKs and partial indexes.
SELECT c.conrelid::regclass AS relation, c.conname, c.contype,
       pg_get_constraintdef(c.oid) AS definition, c.convalidated
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND (t.relname LIKE 'billing_%' OR t.relname LIKE 'account_subscription%'
       OR t.relname IN ('commercial_addon_versions','commercial_plan_versions'))
ORDER BY 1,2;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename LIKE 'billing_%'
ORDER BY tablename,indexname;

-- Capture each legacy table identically before/after using the same snapshot.
-- Repeat for all legacy tables listed in the dependency inventory.
SELECT id, encode(extensions.digest(to_jsonb(m)::text,'sha256'),'hex') AS row_hash
FROM public.billing_provider_variant_mappings m ORDER BY id;

-- Existing replay algorithm is unchanged, including API-generated inner hashes.
SELECT id FROM public.billing_provider_webhook_deliveries
WHERE delivery_fingerprint IS DISTINCT FROM encode(extensions.digest(
  environment || chr(10) || event_name || chr(10) || payload_sha256,
  'sha256'),'hex');

-- Proposed view: exact coverage of legacy mapping identities and values.
SELECT m.id
FROM public.billing_provider_variant_mappings m
LEFT JOIN public.billing_mapping_catalogue_v2 v
 ON v.storage_contract='lemonsqueezy.v1' AND v.id=m.id
WHERE v.id IS NULL OR
 (v.provider,v.environment,v.plan_version_id,v.cadence,v.provider_price_ref,v.status)
 IS DISTINCT FROM
 (m.provider,m.environment,m.plan_version_id,m.cadence,m.provider_price_id,m.status);

-- Proposed mappings: eight per explicitly enabled test/live environment.
WITH required AS (
 SELECT k AS canonical_key, c AS cadence
 FROM unnest(ARRAY['launch','growth','scale','coach-seat']) AS k
 CROSS JOIN unnest(ARRAY['monthly','annual']) AS c
), scope AS (SELECT entitlement_environment AS environment
             FROM public.billing_runtime_policy WHERE id=1)
SELECT s.environment,r.canonical_key,r.cadence,count(m.id)
FROM scope s CROSS JOIN required r
LEFT JOIN public.billing_price_mappings m
 ON m.provider='paddle' AND m.environment=s.environment
 AND m.canonical_key=r.canonical_key AND m.cadence=r.cadence AND m.status='active'
GROUP BY 1,2,3 HAVING count(m.id)<>1;

SELECT provider,environment,provider_price_ref,count(*)
FROM public.billing_price_mappings GROUP BY 1,2,3 HAVING count(*)>1;

-- Proposed item-set cadence/scope integrity, independent of array order.
SELECT s.id FROM public.billing_subscriptions_v2 s
JOIN public.billing_subscription_items_v2 base
 ON base.subscription_id=s.id AND base.item_role='base_plan'
JOIN public.billing_subscription_items_v2 seat
 ON seat.subscription_id=s.id AND seat.item_role='coach_seat'
WHERE (base.provider,base.environment,base.cadence)
 IS DISTINCT FROM (seat.provider,seat.environment,seat.cadence);

-- Cross-contract canonical link and current-subscription uniqueness.
SELECT account_subscription_id,count(*)
FROM public.billing_subscription_catalogue_v2
WHERE account_subscription_id IS NOT NULL
GROUP BY 1 HAVING count(*)>1;

SELECT billing_account_id,count(*) FROM public.account_subscriptions
WHERE status IN ('trialing','trial_recovery','active','past_due','grace','restricted')
GROUP BY 1 HAVING count(*)>1;

-- Opposite environment must not link canonical v2 state.
SELECT s.id FROM public.billing_subscriptions_v2 s
CROSS JOIN public.billing_runtime_policy p
WHERE p.id=1 AND s.account_subscription_id IS NOT NULL
 AND s.environment<>p.entitlement_environment;

SELECT provider,environment,provider_event_ref,count(*)
FROM public.billing_webhook_events_v2 GROUP BY 1,2,3 HAVING count(*)>1;

SELECT provider,environment,provider_transaction_ref,count(*)
FROM public.billing_payment_applications_v2 GROUP BY 1,2,3 HAVING count(*)>1;

-- Required security inventory: RLS plus absence of direct grants.
SELECT c.relname,c.relrowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname LIKE 'billing_%' AND c.relkind='r';
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE '%billing%';
```

Additional fixture assertions must compare all legacy source-ID sets in **both directions**, compare every immutable field/payload/digest, count immutable events, verify complete base-item presence and mapping kind/version/amount agreement, and run explicit grants as anon/authenticated/service_role. A valid-looking ACL listing alone is not a permission test. Compare canonical entitlement JSON, effective capacity and access actions for identical historical fixtures; wall-clock-sensitive grace/trial/reduction fixtures require a fixed test clock/reference time.

## 9. Rollback and compensation

No destructive down migration. Before sales enablement, disable v2 flags and route readers to tested legacy paths; leave empty/partially configured new tables and all audit data intact. Draft/active bad mappings are retired through allowed transitions, not deleted or repointed; publish a new provider price/mapping if meaning changes.

After any Paddle payment/obligation exists, do **not** revert to a binary that cannot recognize it. Disable new Paddle sales/mutations, keep the v2 reader and verified event ingestion/reconciliation support, and retain all evidence and canonical paid access. Queue failed/deferred events for replay after a forward fix. If reconciliation itself is unsafe, disable v2 application while continuing verified inbox retention; do not automatically fall back to LS reconciliation.

Compensation for a wrong canonical grant requires a new reviewed operation/event referencing original evidence and the forward fix; never edit historical proof, pretend another provider collected payment, automatically refund/cancel upstream or delete a paid subscription. Provider financial compensation is a separately authorized task. Restore-from-backup is disaster recovery, not a normal rollback once new obligations exist.

## 10. Required DB and unit test matrix

These are tests to implement with the future schema/validator; no new behavior is claimed tested in this design-only change.

| Case                               | DB assertion                                                                                                                                                           | Unit/contract assertion                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| LS history retained                | Before/after full row manifests, IDs, payloads, digests, retired mappings and terminal operations identical; all existing SQL billing suites pass                      | 13 ADAPTER-02 serialization snapshots and all LS receipt/parser/policy tests unchanged           |
| Coexistence                        | LS rows readable beside eight Paddle mappings in each seeded scope; no synthetic LS add-on row; Paddle rejected by legacy CHECKs                                       | Discriminated read models/dispatch; LS receipt cannot reach Paddle RPC                           |
| Uniqueness                         | Same external string allowed across provider/environment, duplicate within same scope rejected; retired price reassignment and duplicate active canonical key rejected | Opaque nonnumeric refs, case/whitespace byte preservation; no coercion                           |
| Wrong provider/environment mapping | Composite FK/trigger rejects mapping from another scope and forged UUID/account combinations                                                                           | Resolver and serializer fail closed; no fallback                                                 |
| Wrong cadence/role                 | Annual base with monthly mapping, plan used as add-on, wrong canonical version/currency/recurrence fail                                                                | All eight resolution pairs; zero/multiple mapping results fail                                   |
| Seat cadence mismatch              | Monthly base + annual coach-seat rejected; target/source operation mismatches rejected                                                                                 | Explicit cadence add-on resolution, no first-item selection                                      |
| Mapping retirement                 | Retire during admission race serializes; new sale fails; admitted delayed completion/history succeeds on original mapping                                              | No re-resolution to new active price on refresh                                                  |
| Test/live isolation                | Opposite environment inbox allowed but zero canonical writes/payment applications; legacy entry guard also rejects opposite environment                                | Credential/endpoint/receipt environment pinned; forged payload environment ignored/rejected      |
| Duplicate webhook                  | One logical event and one effect for retries/new notification IDs; distinct scoped event IDs coexist                                                                   | Raw hash separately retained; unknown names ignored; invalid signature rejected before recording |
| Conflicting duplicate              | Same event ID with semantic payload drift goes to review, original retained; no grant                                                                                  | Transport-only metadata change differs from event data conflict                                  |
| API replay                         | Same evidence/effect idempotent; operation/effective-boundary discriminator permits one due reduction                                                                  | No timestamp-now replay key; webhook/API namespaces cannot collide                               |
| Legacy fingerprints                | Existing raw and synthetic fingerprints byte-identical; first-item hash exclusion and `:seat-due` retained                                                             | Original bytes/unknown event name differences preserve v1 hash behavior                          |
| Payment proof                      | Active/no payment, pending/interim paid, wrong customer/subscription/currency/price/quantity, unrelated renewal, stale request and absent correlation cannot grant     | Forged, JSON-roundtripped, cross-instance/cross-provider receipts rejected; clone isolation      |
| Payment reuse                      | Same transaction cannot complete two operations/checkouts; rollback before commit consumes nothing                                                                     | Different receipt shapes of same transaction do not bypass dedup                                 |
| Item identity                      | Reordered items accepted, duplicated/unmapped items rejected, missing base rejected; absent item ref allowed if unambiguous                                            | Opaque price-based role matching; no store/variant/array[0] requirement                          |
| Quantity vs entitlement            | Unapproved observed seat increase marks drift, leaves approved seats unchanged; zero add-on removes only current observation with evidence preserved                   | Base quantity 1 and seat quantity N; never 1+N for Paddle                                        |
| Operation timing                   | Upgrade/seat increase requires payment; reduction waits until boundary; cancellation and stale update races cannot complete incorrectly                                | Plan/seat capabilities absent => unavailable before operation creation                           |
| Cross-ledger concurrency           | One open checkout per account across both; duplicate operation ID cross-provider conflicts; cannot link one canonical subscription twice                               | Idempotent retry pinned to original provider/mapping                                             |
| Canonical behavior                 | Launch/Growth/Scale features, trial clock, override precedence, grace/restricted/read-only behavior and capacity limits unchanged                                      | Existing commercial-access/entitlement/capacity contract suites remain passing                   |
| Capacity races                     | Seat reduction/plan downgrade vs invitations/reservations; existing account lock prevents oversubscription; pending reduction growth limit retained                    | No client-provided limit or billed quantity used as capacity                                     |
| Permissions/history                | Direct DML denied; execute denied for proof/apply helpers to anon/authenticated; owner leakage denied; evidence/terminal rows cannot update/delete                     | No raw provider JSON/PII/signed URL leakage in responses/logs                                    |
| Failure recovery                   | Retrieval failure retains inbox; all entitlement effects roll back on error; retry converges; provider flags stop admission without losing history                     | Existing sanitized error behavior preserved                                                      |
| Migration idempotency/rollback     | Repeated projection validation identical; disable flags leaves history readable; forward compensation appends only                                                     | Application continues reading existing Paddle obligations after sales disabled                   |

Future local tests must use synthetic provider objects and a local-only database. Existing configured-account integration/E2E tasks may write remote data; do not run them indiscriminately. No new test should require credentials or real Paddle IDs in source control.

## 11. Staging proof plan

After explicit authorization naming a staging project, and only after local matrix passes:

1. Confirm staging is isolated from production and entitlement_environment=test. Capture migration version/constraints/grants and sanitized legacy manifests. Use synthetic or approved sanitized accounts; never copy PII into the repository.
2. Apply the separately reviewed additive migration with Paddle flags disabled. Prove LS history, checkout/portal/operation behavior, canonical entitlements and capacity remain intact; verify old retired mappings still reconcile.
3. Supply verified sandbox mappings for eight pairs through the publication path; independently prove wrong provider/cadence/environment rejection. No live secrets or live provider objects in this proof.
4. With a separately implemented adapter, exercise checkout linkage, completed-payment activation, seat/plan capabilities that are enabled, scheduled reductions, failed payments, cancellation, duplicate and out-of-order events, changed notification metadata, replay after retrieval failure and cross-provider concurrency.
5. Record database-only before/after entitlements, unique payment applications, immutable event evidence, permission denials and mismatch results. Keep hashes/opaque synthetic references, not raw signatures, portal URLs or customer data.
6. Disable new sales and prove existing Paddle obligations remain readable/reconcilable. Demonstrate a forward correction and replay without historical edits. Rollout review requires all blocking matrix rows passing and no unexplained manual-review rows.

Staging proof is not run by this task and does not authorize a later live rollout.

## 12. Risks, open questions and recommendation

| Issue                                                            | Decision / release gate                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed schema/data drift                                       | Repository-only inventory cannot prove hosted state. Named-environment preflight must compare current functions, grants, constraints and legacy rows before migration.                                                                        |
| Paddle transaction-to-operation correlation                      | Blocking for payment grants. Obtain verified fixtures proving initial and proration transaction linkage, target line items, settlement and operation matching. Timestamp-only matching is insufficient.                                       |
| Tax, discount, credit, zero-total and refund/adjustment behavior | Block unsupported cases initially; define exact amount/settlement and reversal policies with fixtures before enabling them. Do not weaken proof to accommodate unknown scenarios.                                                             |
| Independent item reference and update scheduling                 | Schema allows absent item ref; validate current Paddle item and scheduled-change evidence before implementing mutations. Price/role matching must remain unique.                                                                              |
| Checkout expiry semantics                                        | Need provider capability proof for admission window and delayed completion. Do not copy LS expiry-second rule onto a provider lacking the same expiry contract.                                                                               |
| Test/live canonical collision                                    | Deployment environment fence required. Existing wrong-environment paid rows require explicit disposition; no automatic rewriting. Simultaneous live/test entitlements for one account remain unsupported.                                     |
| Multiple merchant accounts per scope                             | Unsupported. New internal account dimension would require a separate design before a second account is configured.                                                                                                                            |
| Existing subscribers moving providers                            | Out of scope. Coexistence does not authorize automatic LS cancellation, Paddle rebilling or subscription transfer. Current account obligations block a second checkout.                                                                       |
| Legacy evidence mutability                                       | Grants protect application access, not privileged accidental rewrites. Add and test a field-level legacy inbox protection trigger without changing stored evidence or processing semantics.                                                   |
| Cross-table enforcement                                          | Additional guards and compatibility reads are essential; isolated UNIQUE keys do not protect canonical account state across versions. Concurrency/lock-order tests are release blockers.                                                      |
| Historical proof incompleteness                                  | Preserve available LS proof and its original authority; do not claim a complete payment ledger or stronger backfilled provenance.                                                                                                             |
| Ongoing LS servicing                                             | Keep its runtime credentials, verifier and legacy writers available for existing obligations after selecting Paddle for new sales. Provider switching must be explicit in trusted composition.                                                |
| Initial capability scope                                         | Default zero-seat checkout. Plan changes with existing added seats must preserve approved count, target ceiling and a cadence-matched add-on; enable only after multi-item proof tests. Unsupported capabilities stay explicitly unavailable. |

**CONDITIONAL GO:** the additive persistence and historical compatibility direction is sufficiently specified to proceed to a separately requested schema implementation. Before enabling any Paddle entitlement writes, require environment fencing, cross-ledger exclusion, unchanged LS regressions, strict provider proof fixtures/validator, eight verified scoped mappings and the staging evidence above. Until those gates pass, Paddle grant/checkout capabilities remain disabled.

Design verification performed here: repository migrations and latest function replacements traced; all 190 columns in the original provider/add-on/operation table declarations and the later approved-seat column covered by the inventory; constraints and v1 receipt/replay/payment code inspected; both documents' local links checked; Prettier formatting checked; public Supabase and Paddle documentation consulted. No DB/unit integration suite was run for this documentation-only change, and no migration or runtime behavior is presented as implemented.
