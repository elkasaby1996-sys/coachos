# BILLING-DB-01 — Private provider-v2 persistence foundation

Implemented on `codex/billing-db-01-provider-v2-private-persistence`, based on the reviewed [compatibility design](billing-database-compatibility-design.md) and [dependency inventory](billing-database-dependency-inventory.md). This is dormant storage, not Paddle integration or payment authorization.

## Migration and surfaces

One forward migration: [`20260919092348_billing_provider_v2_private_foundation.sql`](../supabase/migrations/20260919092348_billing_provider_v2_private_foundation.sql). It creates the following surfaces without altering an existing table, function, migration, grant, receipt, or replay algorithm. No Lemon Squeezy rows are copied or backfilled.

| Table                             | Structural contract                                                                                                                                                                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing_runtime_policy`          | Singleton `id=1`; initial entitlement environment `test`; both Paddle flags `false`; no secrets.                                                                                                                                                    |
| `billing_price_mappings`          | Plan/add-on identity; canonical version FK; scoped opaque product/price references; exact canonical USD amount and recurrence; draft/active/retired lifecycle; catalogue evidence required for publication.                                         |
| `billing_customers_v2`            | Unique account/provider/environment and provider/environment/customer reference; immutable account association; no store or duplicated PII.                                                                                                         |
| `billing_subscriptions_v2`        | Unique scoped subscription reference; scoped customer/account FK; opaque provider status; scoped evidence; canonical linkage and approved seats explicitly disabled.                                                                                |
| `billing_subscription_items_v2`   | Explicit `base_plan`/`coach_seat` roles; base quantity one; positive seat quantity; no seat row means zero; scoped mapping/evidence/subscription FKs; one cadence per item set.                                                                     |
| `billing_checkouts_v2`            | Account/operation idempotency; one open checkout per account; owner FK/check; canonical plan and seat ceiling; matching mapping cadence/environment; terminal timestamp and expiry/lease structure.                                                 |
| `billing_operations_v2`           | Shared plan-change/seat ledger; account/operation idempotency; one nonterminal operation per subscription across both kinds; scoped source/target mappings; same-account canonical source; explicit direction/timing and versioned preflight shape. |
| `billing_operation_events_v2`     | Append-only events; unique operation/event type.                                                                                                                                                                                                    |
| `billing_webhook_events_v2`       | Unique provider/environment/event reference; immutable first digest and opaque event identity; only processing fields mutable. Events may precede subscription linkage.                                                                             |
| `billing_evidence_v2`             | Append-only bounded structural JSON; explicit source/kind/schema/validator/replay identity; scoped subscription/event links; normalized digest and identity checks.                                                                                 |
| `billing_payment_applications_v2` | Append-only structural ledger; one scoped transaction per application; one application per checkout/operation; matching account/subscription/transaction evidence. No writer or payment validator is exposed.                                       |

All provider-bearing v2 tables admit only `paddle` and environments `test | live`. Operation events inherit scope through their operation FK. Runtime policy has an environment but no provider identity.

`billing_v2_ref` is a case-sensitive text domain with a 512-byte bound and a non-whitespace requirement. It preserves leading/trailing spaces, punctuation, case, and nonnumeric references. Required columns add `NOT NULL`; optional upstream references remain absent. `billing_v2_sha256` requires lowercase 64-character hexadecimal digests. Neither domain introduces numeric, UUID, variant, store, item-order, or event-name assumptions.

Every new FK has an index with matching leading columns. Composite FKs bind provider/environment, account, cadence and identity kind where applicable. Mapping price uniqueness covers retired and draft rows as well as active rows; a partial unique index permits only one active mapping per canonical key/cadence/scope.

Six invoker trigger functions are added, all with fixed `search_path=pg_catalog,public`:

- `billing_v2_protect_history`: immutable identity fields, append-only records, terminal rows and truncation protection.
- `billing_v2_validate_evidence`: structural digest, linked identity and webhook delivery fingerprint checks.
- `billing_v2_protect_mapping`: canonical amount/identity, publication evidence, retirement and immutable history.
- `billing_v2_validate_item_set`: deferred base-role, cadence, mapping lifecycle and subscription evidence consistency.
- `billing_v2_validate_intent`: owner, mapping publication, canonical seat ceiling and pure canonical plan-change classification.
- `billing_v2_validate_payment_application`: matching evidence/intent/subscription structure only.

There are 28 triggers: 11 statement-level truncation guards, 10 immutable-history guards, mapping/evidence guards, two deferred item-set guards, two intent guards, and one payment-structure guard. No trigger creates canonical access or mutates v1. The existing pure `classify_billing_plan_change` function is reused without modification.

Three private, read-only `UNION ALL` views use `security_invoker=true`:

- `billing_mapping_catalogue_v2`: legacy base prices, separate legacy graduated seat contracts, and v2 plan/add-on prices. Legacy seat contracts have `quantity_price_contract_id`, their canonical add-on version, and **no fabricated standalone price reference**.
- `billing_subscription_catalogue_v2`: original internal/external identity, scope, canonical linkage, approved seats and observation state.
- `billing_open_operations_v2`: open legacy plan/seat operations and v2 operations. Unrecorded historical plan-operation seat counts remain NULL.

Mapping/subscription identity includes `(storage_contract,id)`. Mapping discriminants are `lemonsqueezy.v1`, `lemonsqueezy.quantity-contract.v1`, and `billing.v2`. Operation identity is `(storage_contract,operation_kind,id)` because legacy plan and seat ledgers have independent UUID namespaces. Never join these projections by a bare UUID.

## Access and exact capability state

All 11 tables have RLS enabled and no client policies. Direct privileges on tables/views/domains are revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`; default function EXECUTE is explicitly revoked from those roles. There are no new `SECURITY DEFINER` functions, application RPCs, role grants, or application call sites. Migration owners/database administrators can insert structurally valid fixtures; application roles cannot read or write these surfaces.

After a clean migration, only the policy singleton is populated. The ten other tables are empty. There are no real or synthetic provider mappings in the migration. Synthetic references exist only inside rolled-back tests or the explicitly isolated historical-proof fixture.

The policy starts with `entitlement_environment='test'`, `paddle_sales_enabled=false`, and `paddle_reconciliation_enabled=false`. Changing these flags alone does not create a Paddle API, admission path, reconciliation function, or entitlement writer. No existing v1 function reads this policy yet.

Checkout states and payment-application rows establish persistence constraints only. A reference can satisfy the foundation's `ready` shape but cannot authorize a checkout. A transaction-shaped evidence row can satisfy ledger FKs but does not prove settlement. No application caller can insert either. There is no source of Paddle payment authority in this PR.

## Deliberate foundation limits

These constraints preserve a safe dormant foundation while BILLING-DB-02 and later verified adapters remain absent:

1. `account_subscription_id` exists with the reviewed same-account FK, but `billing_v2_canonical_link_disabled` requires NULL. `billing_v2_seat_approval_disabled` requires approved additional seats to remain zero. Removing these guards requires cross-ledger ownership/environment/link-exclusivity checks and a narrowly authorized verified writer first.
2. Subscription item rows are immutable at this stage. Replacing current observations will require a later reconciler that validates the whole item set atomically. Structural `processed` observation state requires a base item and matching subscription evidence, and confers no canonical authority.
3. Evidence uses `billing-foundation-v1` / `structure-only-v1`, expressly **not** `paddle.v1`. It allows only the reviewed top-level structural fields and bounded `identity` strings, plus a kind-specific `catalogue` or `observation` object. Observation contents are not payment validation. A future validator must introduce a distinct accepted schema/version; it must never upgrade these existing rows into payment proof.
4. The normalized hash is SHA-256 of PostgreSQL `jsonb::text`. Webhook transport replay validates SHA-256 of the canonical JSONB array `[event_ref, notification_ref_or_null, raw_digest]`. API/catalogue replay keys have structural shape and scope uniqueness only; complete deterministic API effect/revision serialization and semantic replay handling belong to the verified writer. Existing LS fingerprint code and stored bytes remain unchanged.
5. Cross-ledger checkout/operation admission, canonical environment guards, account locking across v1/v2, provider payment validation, capacity preflight semantics and provider mutation policy are deferred. No legacy table/RPC change was necessary for this foundation. These omissions prevent enabling sales/reconciliation; they do not weaken legacy authority.
6. Active mapping evidence verifies internal structural agreement with the canonical catalogue. It does not attest that a remote Paddle price exists. Real publication requires a later authenticated catalogue verifier and explicit rollout approval.

There is no destructive down migration. Recovery is to retain private dormant storage and keep flags off. Any correction should be a forward migration; never delete evidence/history to compensate for a failed integration.

## Historical before/after proof

Validation ran only on a separate local Docker database, `supabase_db_repsync_billing_db01`, with a temporary Supabase project (`repsync_billing_db01`, PostgreSQL 17, port 55472). Existing local databases and hosted staging/production were untouched. Supabase CLI version: 2.117.0.

The database was rebuilt through migration `20260916100118`, then populated using [`billing_v2_legacy_seed.psql`](../supabase/tests/fixtures/billing_v2_legacy_seed.psql). The fixture reuses synthetic LS scenarios from the seat-quantity suite and includes paid subscriptions, a trial, checkout intent, retired/active mappings, graduated quantity contracts, completed/open plan and seat operations, and stored replay evidence.

[`billing_v2_legacy_manifest.psql`](../supabase/tests/fixtures/billing_v2_legacy_manifest.psql) was run before and after normal `migration up --local`. Both JSON files were **byte-identical**:

```text
SHA-256: a7404044e581e2734d14ba108d279597fccff39ba67dba623fa477f637f2357d
21 legacy/canonical tables; 304 rows
283 existing public function definitions and ACLs
11 accounts' entitlement and capacity outputs
0 differences
```

The manifest includes every row's digest, table ACL/RLS/column/constraint/index/trigger definitions, existing function bodies and ACLs, plus resolved entitlements/capacity. Only the response's top-level `computedAt` is excluded from semantic output comparison. Stored legacy payment evidence, raw payloads and replay fingerprints are included in the row digests. The fixture has six historical mappings, six quantity contracts, ten LS customer/subscription rows, two webhook-delivery rows, and both completed and open operations. This is local synthetic proof, not a claim of hosted-data inspection.

To reproduce in a disposable local project, copy repository migrations and tests into its `supabase` directory, using a distinct project ID and unused ports. Then:

1. Run `supabase db reset --local --workdir <isolated-directory> --version 20260916100118 --no-seed --yes`.
2. In that project's local database, create the `pgtap` extension if needed; execute the legacy seed inside an explicit transaction and commit. The `.psql` fixture deliberately leaves transaction ownership to its caller.
3. Capture the manifest with `psql -X -qAt -v ON_ERROR_STOP=1`.
4. Run `supabase migration up --local --workdir <isolated-directory> --yes` and capture the manifest again; compare both JSON outputs.
5. Rebuild cleanly with `supabase db reset --local --workdir <isolated-directory> --no-seed --yes`; run `supabase test db --local --workdir <isolated-directory>` and local database lint. Do not run the regression suite against the committed baseline fixture; individual pgTAP files own their rolled-back fixtures.

## Verification

[`billing_provider_v2_foundation.sql`](../supabase/tests/billing_provider_v2_foundation.sql) exercises table/PK/RLS/ACL existence, actual denied SQL for all application roles, provider/environment allowlists, opaque reference boundaries, mappings/publication/retirement, owner/scope/cadence mismatches, base/seat roles, canonical-link prohibition, operation serialization and terminal guards, inbox delivery/replay separation, evidence integrity, distinct-intent transaction uniqueness, compatibility projections, and canonical/legacy non-mutation.

Validation results on 2026-09-19:

| Check                                                            | Result                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Normal local migration on populated legacy baseline              | PASS; byte-identical historical manifest                                         |
| Clean reconstruction from all migrations                         | PASS                                                                             |
| All database suites, including existing LS and commercial suites | PASS: 16 files, 1,507 assertions; 459 in the new foundation suite                |
| Affected unit suites                                             | PASS: 27 files, 678 tests                                                        |
| Local database lint (`--level error --fail-on error`)            | PASS; no errors                                                                  |
| Build/typecheck (`npm run build`)                                | PASS                                                                             |
| ESLint (`npm run lint`)                                          | PASS; three existing warnings in client profile inputs, messages and workout run |
| Prettier and whitespace checks                                   | PASS: npm run format, git diff --check, and untracked-file whitespace checks     |

No generated database types or application interfaces changed, so no new unit/type fixture is needed. SQL contracts are tested against a real local PostgreSQL database. SQL/PSQL files have no configured Prettier parser; database lint and pgTAP validate them.

Recommended next PR: **BILLING-DB-02 — Cross-ledger admission, environment and canonical-link guards**. Implement and test shared account locking, v1/v2 operation and checkout exclusion, environment authorization, and canonical-link exclusivity without changing LS proof authority. Keep both Paddle flags disabled until provider proof validation, integration, and separately authorized staging proof are complete.
