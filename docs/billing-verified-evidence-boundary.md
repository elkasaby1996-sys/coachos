# BILLING-PROOF-01 — Verified receipt-to-database evidence boundary

Based on merged BILLING-DB-02 (`bfec8d8`), branch `codex/billing-proof-01-verified-evidence-boundary`. This introduces a dormant server composition boundary and private evidence persistence. It does not integrate Paddle, authenticate any real Paddle response, or enable payment application or access.

## Architecture and trust

```text
future reviewed provider verifier (not implemented or composed)
  -> sanitized, closed facts
  -> strict schema + instance/provider/environment checks
  -> frozen receipt token, payload held in a private WeakMap
  -> core serializer checks the same instance and destination scope
  -> one of three service-only SQL evidence writers
  -> closed SQL validation + stored identity re-read + replay conflict check
  -> append-only retention ledger, payment_authority = false
```

[`billing-verified-receipts-v2.ts`](../supabase/functions/_shared/billing-verified-receipts-v2.ts) defines `VerifiedEventV2`, `VerifiedSubscriptionV2` and `VerifiedTransactionV2`. Tokens carry no provider facts, raw body, signature, secret or credential. JSON serialization throws; structured cloning fails; copies, forged brands, parsed JSON and receipts from another instance fail WeakMap lookup. The factory captures provider/environment at construction and checks verifier outputs, requested resource references, receipt kind and serializer destination scope. Returned SQL arguments are copies; mutating them cannot change retained receipt evidence.

The factory returns verification/retrieval and serialization methods, never a mint/seal/fromJSON method. Its `AuthenticatedEvidenceVerifierV2` dependency is **trusted server composition**, not caller-supplied input or a dependency accepted through an HTTP request. No default verifier, Paddle HTTP implementation, Paddle HMAC implementation, provider route or production composition is included. Only tests compose synthetic verifiers. A future reviewed adapter must authenticate transport/merchant/environment before returning facts. Schema validity is not authentication.

This boundary cannot defend against arbitrary malicious server code replacing its trusted verifier, or a holder of database service credentials submitting their own SQL arguments. Those are explicitly inside the trusted computing boundary. SQL cannot reconstruct in-memory receipt provenance or authenticate a provider signature from sanitized JSON. Restricted RPC grants, independent stored-identity checks and the unconditional payment-authority hard stop are therefore separate requirements, not substitutes for the future transport verifier.

The SQL functions use the documented [Supabase function privilege and SECURITY DEFINER controls](https://supabase.com/docs/guides/database/functions): explicit role grants/revokes and fixed search paths. The service-role database principal is trusted; a caller-supplied JWT role claim is not used to establish it.

## Closed evidence contract

[`billing-proof-v2.ts`](../supabase/functions/_shared/billing-proof-v2.ts) parses a discriminated `billing-proof-v2` envelope with validator **`paddle-contract-v1`**. That name deliberately does not claim an implemented `paddle-v1` transport/payment authority validator. The contract is exercised against synthetic normalized facts shared between TypeScript and SQL tests; these are not real Paddle wire samples or sandbox IDs.

Common required fields are `schema`, `validator`, `provider`, `environment`, `source`, `kind`, `evidenceClass`, `identity`, and exactly one kind-specific evidence object. Unknown keys, including nested keys, fail closed. Identity references remain opaque UTF-8 strings, bounded to 512 bytes, without trimming, numeric conversion or prefix inference. Nullable fields must be explicitly null rather than omitted. Timestamps are observed canonical UTC ISO strings with millisecond precision; unknown creation/period timestamps may be null. API revision timestamps are required for this version. Unsupported missing-revision cases await another reviewed contract.

| Kind         | Source/class                                    | Closed facts                                                                                                                                                                                   |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event        | `webhook` / `authenticated_provider`            | Logical event ref/name, resource type/ref, observed occurrence timestamp, scoped customer/subscription/transaction identity; required resource identity must match                             |
| Subscription | `api_reconciliation` / `authenticated_provider` | Stored customer/subscription refs, provider status, observed creation/update and optional paired period timestamps, item set                                                                   |
| Transaction  | `api_reconciliation` / `verified_transaction`   | Stored customer/subscription and transaction refs, completed status, observed origin/creation/update/completion, currency, subtotal/tax/discount/total/paid/balance, adjustment refs, item set |

Each item has exactly `priceRef`, nullable `itemRef`, nullable `productRef`, positive integer `quantity` and nonnegative integer `unitAmountMinor`. There are 1–32 items, no duplicate price/item identity, and no first-item semantics. Normalization sorts the set by price-reference UTF-8 byte order (`COLLATE "C"` in SQL). This is evidence retention, not canonical base/add-on classification or mapping approval.

The narrow transaction contract requires safe integer monetary values, item arithmetic matching subtotal, `total = subtotal + tax - discount`, positive total, full paid amount, zero balance, no adjustments and explicit observed completion time. It rejects pending/partial/refunded or otherwise unsupported facts. It never substitutes creation/update time for payment time. This validates the synthetic normalized contract; it is not proof that an actual Paddle transaction settled. Provider-specific settlement, origin, discounts, tax, adjustment and correlation semantics still require reviewed real/sanitized provider fixtures and an authenticated adapter before any access writer can be considered.

Catalogue receipts/publication are intentionally absent: this PR does not need them and must not create mappings. Existing `billing-foundation-v1` / `structure-only-v1` evidence stays unchanged in its original table and cannot pass the new schema/validator checks. An active subscription observation or `transaction.paid` event name has class `authenticated_provider`, never transaction/payment authority.

## Migration, SQL writers and privileges

One forward additive migration: [`20260919114502_billing_verified_receipt_evidence_boundary.sql`](../supabase/migrations/20260919114502_billing_verified_receipt_evidence_boundary.sql). Earlier migrations and all LS functions/tables/writes remain untouched.

It adds `billing_verified_evidence_v2`, separate from `billing_evidence_v2`. The new table stores the closed proof, scope/class/schema/validator, SQL-computed normalized digest, replay/logical/effect identities, separate raw-body digest/notification reference, observed revision, and independently resolved private subscription/account links. `recorded_at` is an audit timestamp, never a replay input or provider/payment timestamp.

The new table has RLS, no client policies, and no table grants to `PUBLIC`, `anon`, `authenticated` or `service_role`. UPDATE, DELETE and TRUNCATE are rejected by existing immutable-history triggers. CHECKs enforce scope, exact validation, normalized digest and `payment_authority=false`. Composite FKs bind subscription/account/provider/environment. Supporting indexes cover logical replay lookup and the subscription FK.

Three narrowly scoped SECURITY DEFINER RPCs are granted only to `service_role`:

- `record_verified_billing_event_v2(p_proof, p_raw_payload_sha256, p_notification_ref)`
- `record_verified_billing_subscription_v2(p_proof)`
- `record_verified_billing_transaction_v2(p_proof)`

Each dispatches to a fixed proof kind, rejects a different discriminant/schema, and uses `search_path=pg_catalog,public`. The internal recorder independently checks the original database role (`role` setting, falling back to `session_user`) against `service_role`/database administrators. The seven invoker validation/record helpers have no application EXECUTE grants. There is no exposed generic mutation/evidence JSON RPC and no direct service table DML.

No caller account/subscription UUID is accepted. SQL re-reads the provider/environment-scoped subscription and its linked customer, checks exact external references, derives account identity, acquires the DB-02 account lock and re-checks stored linkage. API subscription/transaction evidence requires an existing private subscription; these RPCs cannot create customers or subscriptions. An unknown event can be retained with null links. A retry does not retroactively rewrite an unlinked historical event.

[`billing-evidence-writer-v2.ts`](../supabase/functions/_shared/billing-evidence-writer-v2.ts) owns the three fixed RPC names and serializes only valid receipts. It has no service credential and no production call site. It sanitizes database errors and never invokes legacy reconciliation, checkout, mapping publication, payment application or entitlement writers.

## Replay and digests

All normalized/replay hashing is done by SQL using SHA-256 of PostgreSQL JSONB text, tagged `pg-jsonb-sha256-v1`. This is not JavaScript JSON hashing or a claim of raw-wire equivalence. The serializer computes webhook raw SHA-256 from a byte copy captured before awaiting verification; the verifier receives another copy, and caller header/byte mutations cannot alter the retained digest. Signatures and raw payloads are not persisted or exposed through tokens.

| Identity                   | Contract                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Event logical identity     | Scoped provider event reference (`verified-event-v1`)                                                                    |
| Delivery replay            | `verified-delivery-v1`, provider/environment/schema/validator/event ref/nullable notification ref/raw-body digest        |
| API logical revision       | `verified-api-v1`, provider/environment/proof kind/resource ref/observed provider-update timestamp                       |
| API replay                 | Above namespace plus schema/validator and normalized proof digest                                                        |
| Reserved commercial effect | `reserved-transaction-effect-v1`, provider/environment/transaction ref; correlation only, never an applied-payment claim |

Identical retries return the same evidence ID with `reused=true`. A different notification/raw digest for the same event can be retained when the **retained normalized envelope** agrees. Different normalized facts for the same event or API resource revision raise `BILLING_PROOF_REPLAY_CONFLICT`, without overwriting evidence. This event contract retains event identity metadata rather than arbitrary event business payload; it never applies embedded payment/subscription state. API retrieval is separately authenticated and validated. A newer or older actual API revision can be retained, but neither mutates current provider/canonical state here.

Per-logical-identity transaction advisory locks serialize duplicate/conflict checks and insertion. Linked evidence first takes the existing policy/account lock with no entitlement-environment effect; then it takes stored identity SHARE locks and its logical-evidence lock. Unlinked events never acquire an account after that logical lock. READ COMMITTED is required; higher isolation fails closed. Replay uniqueness additionally has a database UNIQUE constraint. No algorithm hashes `now()`, notification names are not event identities, webhook/API namespaces differ, and LS v1 fingerprint code is unchanged.

## Retained hard stops and environment behavior

- `paddle_sales_enabled=false` and `paddle_reconciliation_enabled=false`; the migration never updates runtime policy.
- `billing_v2_canonical_link_disabled` still requires NULL canonical linkage; `billing_v2_seat_approval_disabled` still requires zero approved seats. Existing immutable subscription guards are retained.
- Every new evidence row has `payment_authority=false`, regardless of evidence class.
- Existing payment-application foreign keys still target **only the old foundation ledger**. There is no FK or writer path from this new verified ledger to `billing_payment_applications_v2`; no payment-application privilege is granted.
- Opposite-environment evidence may be persisted with its own exact stored scope. The writers do not complete checkout, mutate subscriptions/canonical state, approve seats, create mappings or payment applications, or call reconciliation.
- Arbitrary JSON/forged receipts, foundation rows, active observations, paid event names and opposite-environment evidence remain insufficient to grant access.

## Verification and reproduction

New tests are [`billing-verified-evidence.test.ts`](../tests/unit/billing-verified-evidence.test.ts) and [`billing_verified_evidence.sql`](../supabase/tests/billing_verified_evidence.sql), sharing [`billing_verified_proof_fixture.psql`](../supabase/tests/fixtures/billing_verified_proof_fixture.psql). The shared fixtures are explicit synthetic contracts. Network fetch is prohibited in the unit suite.

Coverage includes forgery, JSON reconstruction, cloning/serialization, instance/provider/environment/kind mismatch, immutable raw-byte/header capture, returned-argument mutation, closed/nested schemas, required identity and timestamps, arithmetic/unsupported adjustments, item ordering, dedup/conflicting revisions, delivery-vs-event separation, raw hashes, SQL role spoofing, actual direct DML/EXECUTE denials, immutable evidence, opposite-environment retention, unchanged canonical output/policy and retained hard stops.

The manifest fixture [`billing_proof_legacy_manifest.psql`](../supabase/tests/fixtures/billing_proof_legacy_manifest.psql) extends DB-01's proof to include all DB-01/DB-02 tables and all existing public functions. [`verify-billing-proof-manifest.py`](../scripts/verify-billing-proof-manifest.py) permits only the ten new function names; all existing bodies, ACLs, rows, schema and entitlement/capacity outputs must match exactly, with the original `computedAt` exclusion only.

Use an isolated local Supabase project `repsync_billing_proof01` (PostgreSQL 17, port 55492, shadow port 55490, seeding disabled). Reconstruct through DB-02 (`20260919103248`), seed the existing synthetic LS fixture in a transaction, capture the extended manifest, apply the new migration normally with `migration up --local`, capture again and compare. Then clean-reset all migrations and run all database suites and local database lint. No linked/remote command is needed.

Strict server typechecking includes the three new shared modules and new suite, plus existing `billing-commercial-ports.test.ts` and `billing-adapter.test.ts`, using `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --strict --types vite/client,node`. The app build alone does not cover Edge Function shared modules.

Verification status on 2026-09-19:

| Check                                          | Result                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Affected billing/commercial unit suites        | PASS: 28 files, 728 tests, including the unchanged 13 ADAPTER-02 baseline scenarios               |
| New receipt/schema/writer suite                | PASS: 50 tests; rerun after the final writer change                                               |
| Strict server typecheck                        | PASS, including new modules/tests and existing adapter/commercial-port suites                     |
| Application build/typecheck                    | PASS                                                                                              |
| Lint                                           | PASS: zero errors; three existing client UI warnings                                              |
| Repository formatting                          | PASS                                                                                              |
| Git diff/new-file whitespace and Python syntax | PASS                                                                                              |
| Clean database reconstruction                  | PASS: isolated PostgreSQL 17 reconstruction from all migrations                                   |
| All DB suites/new SQL evidence tests           | PASS: 18 suites, 1,695 assertions (89 new evidence assertions)                                    |
| Database lint                                  | PASS: no errors                                                                                   |
| Populated before/after manifest proof          | PASS: zero semantic differences; 33 tables, 316 rows, 301 existing functions/ACLs and 11 accounts |

Docker initially blocked local verification. With authorization to recover it, stale runtime sockets were isolated by renaming their parent runtime directories and creating fresh directories. Docker Desktop restarted successfully (engine 29.3.1); images, volumes and database files were retained. Reconstruction, all DB suites, database lint and the populated manifest proof subsequently passed. The only database-test correction was a missing quote in the item-order retry assertion; no migration or legacy proof change was needed. Validation used no remote database fallback or provider contact.

The manifest comparison retains every pre-existing public function definition and ACL unchanged, including the LS HMAC/serialization SQL boundaries, DB-01 validators and DB-02 guards. Only the ten newly introduced function names are added. The migration does not rewrite any baseline table row or change existing table definitions, ACLs, RLS, constraints, indexes or triggers. This is synthetic local historical proof, not hosted-data inspection.

## Remaining integration gates and next PR

1. Review sanitized provider wire fixtures and define a real Paddle verifier: authenticated transport, merchant/environment binding, webhook signature/replay-window handling and independently retrieved subscription/transaction semantics. No actual Paddle HTTP/HMAC adapter exists here.
2. Review catalogue verification receipts and a narrow publication path for the eight canonical prices, including exact cadence/quantity/amount evidence. No real mappings are present.
3. Define safe private customer/subscription ownership creation from verified intent correlation. Current API evidence writers require previously stored scope and cannot create ownership.
4. Prove real settlement, payment/adjustment/refund/tax/discount semantics and commercial-effect correlation. The synthetic `paddle-contract-v1` version is not sufficient to authorize access.
5. Only afterward consider a separate verified effect writer with environment, mapping, cross-ledger, canonical ownership, payment-application and capacity proofs. Removal of hard stops requires separate explicit work and rollout approval.

Recommended next PR: **Paddle evidence fixture review and catalogue-verification contract**, with transport still absent and all access/sales/reconciliation hard stops retained. Rollback is a forward correction or revocation of the three evidence RPC grants; preserve immutable evidence and all legacy history. No destructive down migration is provided.

## PR CI scope

The CI classifier explicitly lists this uncomposed evidence-only change so the PR runs quality, local smoke and Supabase database checks without writing configured hosted accounts. Any runtime integration, legacy change or unlisted follow-up migration still requires the configured-data checks. All 11 classifier tests pass; classifier lint and formatting pass. The commit and PR use `[skip netlify]` to suppress preview deployment. No staging or production deployment workflow is dispatched.
