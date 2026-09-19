# PADDLE-CATALOGUE-01 — Verified catalogue publication

Implemented on `codex/paddle-catalogue-01-publication` from merged main
`3e27627` (BILLING-PROOF-01, PR #221). This is dormant catalogue authority;
there is no production composition, Paddle transport, real provider mapping,
checkout, payment processing, policy enablement, or remote deployment.

## Receipt and trust boundary

`createVerifiedEvidenceBoundaryV2` now accepts an optional trusted
`retrieveCatalogue(priceReference)` verifier port. It uses the **same private
instance WeakMap, frozen null-prototype tokens, throwing serialization, captured
provider/environment scope and copied argument serialization** as PROOF-01.
`VerifiedCatalogueV1` cannot be reconstructed from JSON or used by another
boundary, provider, environment, or payment-kind serializer. Existing event,
subscription and transaction methods retain their behavior.

The port has no implementation. Tests supply synthetic verifiers. A future
reviewed adapter must independently authenticate the provider response before
returning sanitized facts. Parsing an observation does not mint a receipt.
There is no externally callable mint/import method. Tokens contain no payload,
credentials, signatures, catalogue facts or customer data.

`createCatalogueEvidenceWriterV1` accepts only such a receipt and serializes to
the fixed `record_verified_paddle_catalogue_v1` RPC. Database service credentials
and trusted server composition remain authority boundaries, exactly as in
PROOF-01: SQL cannot cryptographically authenticate a JavaScript WeakMap token.
A holder of service credentials can submit the strict RPC envelope directly.
No browser can do so. Catalogue authority still never establishes payment truth.

## Closed evidence contract

Envelope: `schema=billing-catalogue-v1`,
`validator=paddle-catalogue-contract-v1`, `kind=catalogue`,
`source=catalogue_api`, `evidenceClass=verified_catalogue`, `provider=paddle`,
explicit `environment=test|live`, opaque `verificationRef`, UTC `observedAt`,
and a closed `catalogue` object.

Catalogue fields:

| Field                               | Contract                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `productRef`, `priceRef`            | Exact opaque strings, max 512 UTF-8 bytes; no numeric/store/variant assumptions or trimming |
| `identityKind`, `canonicalKey`      | `plan` or `addon`; launch/growth/scale/coach-seat                                           |
| `canonicalVersionId`                | Explicit RepSync canonical version UUID, independently checked by SQL                       |
| `cadence`                           | monthly or annual                                                                           |
| `currency`, `unitAmountMinor`       | Three-letter currency and safe nonnegative integer minor units                              |
| `recurrenceUnit`, `recurrenceCount` | month/year and positive integer                                                             |
| `trial`                             | Explicit observed absence (`null`) or closed `{unit,count}` configuration                   |
| `productStatus`, `priceStatus`      | active/archived                                                                             |
| `quantity`                          | `null` if unavailable, otherwise closed `{minimum,maximum}`; maximum may be null            |

Unknown/missing fields, accessors, non-plain objects, invalid references,
timestamps, fractional amounts and invalid quantity ranges are rejected.
`observedAt` is a verifier observation timestamp, **not payment time**. The
future adapter must not report an unknown trial configuration as absent.
Adverse facts such as EUR or a configured trial are structurally recordable;
publication independently rejects them. TS limits proof JSON to 8 KiB; SQL
allows 16 KiB for JSONB rendering overhead.

## Migration and persistence

One forward migration:
`20260919134451_paddle_catalogue_verified_publication.sql`.
No earlier migration was edited. It inserts no catalogue or policy rows.

- New private, RLS-protected, immutable `billing_catalogue_evidence_v1` ledger.
  It reuses PROOF-01's strict SQL object/reference/timestamp/money validators
  and the foundation history triggers. It has no account, subscription,
  canonical-link, seat or payment-application identity/FK.
- New nullable `billing_price_mappings.catalogue_evidence_id`, scoped FK
  `(catalogue_evidence_id,provider,environment)`, and supporting full index.
- The active-provenance CHECK permits exactly one source: historical structural
  provenance **or** the new verified catalogue binding. It retains the
  non-null verification timestamp/digest requirement. No historical row is
  rewritten or backfilled.
- `billing_v2_protect_mapping` keeps the foundation branch and canonical
  version/amount checks intact. Its additive branch validates verified
  catalogue bindings and prevents draft price/product/canonical identity
  reassignment. Active and retired row identity remains immutable.
- Structural `billing_evidence_v2` rows remain readable and continue satisfying
  their original foundation contract, but cannot satisfy the new publication
  RPCs or completeness helper. The PROOF-01 payment-shaped ledger is unchanged.

Replay identity is the tuple
`(provider, environment, catalogue-observation-v1, verificationRef, priceRef)`.
The verifier owns the observation reference; it must reuse it for retries and
issue a new one for a genuinely new verification observation. Identical replay
returns the original evidence ID/digest; conflicting normalized facts fail.
SQL computes SHA-256 over retained `jsonb::text` (`pg-jsonb-sha256-v1`). Neither
`now()` nor `recorded_at` contributes to replay uniqueness. References use the
existing C-collated opaque domain. Catalogue replay is separate from webhook,
API reconciliation and commercial-effect identity; no LS fingerprint changes.

## Narrow publication RPCs

| RPC                                                                   | Behavior                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `record_verified_paddle_catalogue_v1(proof)`                          | Strict catalogue-only evidence retention; returns ID, SQL digest and reused flag                                              |
| `draft_paddle_catalogue_mapping_v1(evidence_id,digest)`               | Re-reads stored evidence, derives mapping facts, creates or refreshes the same compatible draft; rejects changed price claims |
| `activate_paddle_catalogue_mapping_v1(mapping_id,evidence_id,digest)` | Locks and re-reads mapping; independently checks binding/digest and all facts, then activates; exact active retry is safe     |
| `retire_paddle_catalogue_mapping_v1(mapping_id)`                      | Retires only verified sandbox mappings; retry is idempotent; retains price claim/history                                      |
| `validate_paddle_catalogue_v1(environment)`                           | Private validation/read entry point; returns true only for the complete verified sandbox set; otherwise raises                |

All five are narrowly granted SECURITY DEFINER entry points with explicit
original-database-role checks and fixed `search_path=pg_catalog,public`.
`PUBLIC`, `anon`, and `authenticated` EXECUTE is revoked. Only `service_role`
gets explicit EXECUTE; database owners remain operators. The three internal
helpers are SECURITY INVOKER with no client/service grants. There are no new
table grants or browser policies. Caller-editable JWT roles cannot authorize
these functions, even if EXECUTE were accidentally granted.

Both environments can retain evidence. **Only `test` can draft, activate or
validate completeness.** Publication scope comes from the stored evidence;
there is no caller-supplied account to trust. No function changes runtime policy.

Lock order: recording takes an advisory lock on the replay tuple. Publication
and completeness take the same exclusive catalogue publication advisory lock for test,
then mapping row locks (UUID order for completeness), then canonical version
share locks. These functions require READ COMMITTED. They never acquire account
locks or invoke account admission. The catalogue lock serializes supported
service publication operations, while existing mapping row locks continue to
coordinate retirement with DB-02 admission. Keep compound operator transactions
in this same order. A standalone completeness result is a snapshot: future
sales enablement must validate within its atomic policy/admission transaction.

## Exact publication rules and completeness

| Canonical key | Kind  | Monthly USD minor units | Annual USD minor units |
| ------------- | ----- | ----------------------: | ---------------------: |
| launch        | plan  |                    1900 |                  19000 |
| growth        | plan  |                    5900 |                  59000 |
| scale         | plan  |                   11900 |                 119000 |
| coach-seat    | addon |                    1200 |                  12000 |

Every publication checks provider/environment, exact product and price,
role/key/version, canonical version status and amounts, cadence, USD, exact
fixed contract amount, recurrence month/1 or year/1, explicit no trial, active
product/price, evidence ID, stored digest and observation timestamp. Available
quantity limits must permit quantity 1. Unknown quantity limits stay unknown.

Base plan quantity means **1**. Coach-seat quantity means **purchased additional
seats N**, never `1+N`. These roles are canonical, not inferred from provider
item order. `separate_recurring_item` stays the storage model; this PR has no
checkout quantity calculation. A future checkout must enforce any observed
provider maximum and omit an addon item when N=0.

Existing lifetime price uniqueness prevents reassigning a retired price. Existing
active `(provider,environment,key,cadence)` uniqueness plus the exact four-key,
two-cadence whitelist and eight-row count proves one mapping per required pair.
Completeness rechecks every binding and active canonical version. Missing,
duplicate, unverified, opposite-environment or retired rows cannot complete the
set. Individual activation may leave a partial catalogue; **nothing enables
sales**, even after all eight pass. Retire a bad mapping and publish a verified
replacement with a new price reference; do not delete evidence or run a
destructive down migration.

## Verification

Local-only disposable PostgreSQL 17 project `repsync_paddle_catalogue01`.
All provider references are synthetic; no provider HTTP call or remote database
command was made. The before/after manifest captures a populated PROOF-01
baseline, applies this migration and compares retained data/definitions/ACLs
and canonical outputs. The comparator permits only the exact additive mapping
column/FK/index/CHECK and the two precise mapping-function guard additions.

| Verification                                                   | Result                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean local reconstruction                                     | Passed, including the sole new forward migration                                                                                                   |
| Complete database suite                                        | 19 suites / 1,766 assertions passed, including 71 catalogue assertions                                                                             |
| Affected billing/entitlement/capacity/access and staging units | 33 files / 987 tests passed, including 26 catalogue tests, 233 staging tests and the unchanged 13 ADAPTER-02 scenarios                             |
| Catalogue real-session races                                   | 6 passed; real lock waits observed, zero deadlocks                                                                                                 |
| Existing DB-02 concurrency regression                          | 21 cases passed, zero deadlocks                                                                                                                    |
| Populated legacy manifest                                      | Zero legacy semantic differences: 34 tables, 317 rows, 310 unchanged function definitions/ACLs, 11 accounts; exact additive v2 mapping branch only |
| Strict server typecheck                                        | Passed                                                                                                                                             |
| Application build/typecheck                                    | Passed                                                                                                                                             |
| Database lint after clean reconstruction                       | No errors; empty result                                                                                                                            |
| ESLint                                                         | Zero errors; three pre-existing UI warnings                                                                                                        |
| Repository formatting                                          | Passed                                                                                                                                             |
| `git diff --check`                                             | Passed                                                                                                                                             |

Linting while pgTAP was installed initially reported pgTAP extension internals;
the clean reconstruction lint passed without application errors. Final local
inspection confirmed zero mappings/evidence seeds, zero canonical links/approved
seats, both named hard-stop constraints retained and both Paddle flags false.

Reproduction commands: `npx vitest run billing account-entitlements
account-capacity commercial-access commercial-catalogue pt-hub-billing`, the
standard build/lint/format scripts, and Supabase `db reset --local --no-seed`,
`db lint --local --level error --fail-on error`, `test db --local` against the
disposable project. `scripts/test-billing-catalogue-concurrency.py` is pinned to
that local container and must be followed by a local reset. The unchanged
DB-02 concurrency runner was imported and pointed at the same disposable local
container for its 21-case regression; no other project was modified.

Raw run logs and before/after manifests are retained locally under
`%TEMP%/repsync-paddle-catalogue01`. Finalization repeats all local gates before
the user-authorized commit, push and PR. No deployment is authorized.

The existing CI classifier now explicitly includes this dormant catalogue change
and manifest synchronization, with regression coverage (13 classifier tests).
This keeps quality, local smoke and local database checks enabled while avoiding
the configured-account checks that write hosted data. Unknown migrations,
transport integration and runtime changes still require the full checks.
The commit body and PR title include `[skip netlify]` to prevent automatic branch
and preview deployments; the requested commit subject remains unchanged.

## Frozen staging manifest synchronization

The pre-existing `MIGRATION_CONTENT_DRIFT` failure was reproduced before this
update. Merged main `3e27627` contains 165 migrations, while
`config/staging-commercial-certification.json` approved only 162. This narrow
synchronization appends the following four entries; it does not edit any SQL.
Hashes were computed from the actual files using the existing validator's
UTF-8/CRLF-to-LF normalization, not raw Windows checkout bytes.

| Added migration                                                 | SHA-256                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20260919092348_billing_provider_v2_private_foundation.sql`     | `1f5d442af8f05e3b0e444265e4245ba51c06e7f54bbae5a263ebe476f3ca9245` |
| `20260919103248_billing_cross_ledger_safety_guards.sql`         | `b50219f69a7623d77ef4861e9df23c7041df9fc808f8650e0ff8c52d7024761a` |
| `20260919114502_billing_verified_receipt_evidence_boundary.sql` | `dcf00b53a304124bf561fdedc1a769c083b30993da8aac3e4397ebc10e6d4085` |
| `20260919134451_paddle_catalogue_verified_publication.sql`      | `405d9b3c6bbf504107d4feb14675d08c57e3a858d2d4d867a87494b8eff5a2f6` |

The first three were inspected and compared against merged main:

- BILLING-DB-01 adds private provider-v2 persistence, structural evidence,
  immutable history and disabled Paddle policy defaults.
- BILLING-DB-02 adds shared admission/environment/canonical-link guards and
  canonical-origin history. Its existing reviewed guard additions are included
  unchanged; this synchronization introduces no further legacy changes.
- BILLING-PROOF-01 adds the immutable verified evidence ledger and narrow
  service-only recording functions, without granting payment authority.

The fourth is this branch's already-implemented catalogue migration. The
approved count is now **166** (derived from the array; the strict manifest schema
has no independent count field). `expectedLatestMigration` advances from
`20260916100118_billing_checkout_expiry_precision.sql` to
`20260919134451_paddle_catalogue_verified_publication.sql`. All other manifest
metadata, targets, base-commit requirements, allowlists and authorization gates
are unchanged. The deployment-manifest documentation now reflects the same
count and latest filename.

Historical preservation proof:

- Deep equality against the original manifest confirms all **162 existing
  filename/hash entries**, in their original order, are unchanged.
- All 162 historical hashes were independently recomputed and still match.
- All **165 merged migration contents** match `origin/main`, using the same
  line-ending normalization; no tracked migration diff exists.
- SHA-256 of `JSON.stringify(approved[0:162])` is identical before and after:
  `8a53009b4d3db3b25ea22038b779e8935074e6412d8f5049d51aff2804294093`.
- Local proof details are retained in
  `%TEMP%/repsync-paddle-catalogue01/manifest-sync.json`.

Validation: `npm run staging:commercial:validate` returns `{"valid":true}`;
the previously failing `npm run staging:commercial:test` passes **72 tests**.
The related apply, preflight and migration-list unit suites pass **161 tests**.
These are local validation/mocked tests, not remote staging operations.

**This is manifest synchronization only, not authorization to deploy.** No
remote project was contacted or changed, no authorization envelope was issued,
no runtime flag was changed, and no migration was applied remotely. This
additional work changes only the manifest and its documentation.

## PADDLE-CORE-01 conflict assessment and next work

Finalization fetched `origin/codex/paddle-core-01-sandbox-transport` at
`660fa8d852ae53b2eff41e3cbf0229a92a3249ef`. Its changed paths are the separate
`_shared/paddle-catalogue/` transport files, transport documentation/tests,
`tests/unit/network-boundary.test.ts` and `tests/unit/setup.ts`. They do not
overlap this branch's changed paths. In particular, CORE does not edit the
shared receipt factory or any migration. Textual conflicts are not expected;
the final handoff records the Git merge simulation result for these exact heads.

CORE's `PaddleCatalogueCapability` deliberately returns advisory product/price
observations, not receipts. No automatic authority bridge is introduced by
merging these branches. A follow-up verifier must bind the exact product/price
pair and canonical version, convert integer-string amounts safely, interpret
recurrence/trial/quantity facts, reject unsupported tax/price overrides, and
assign a stable verification observation identity before composing
`retrieveCatalogue` on this existing receipt boundary. This is the recommended
next PR, with sanitized fixtures and joint regression tests. This contract alone
does not authorize provider contact, operator publication, live publication,
sales, reconciliation or access.

Exact changed files:

1. `supabase/migrations/20260919134451_paddle_catalogue_verified_publication.sql`
2. `supabase/functions/_shared/billing-verified-receipts-v2.ts`
3. `supabase/functions/_shared/billing-catalogue-proof-v1.ts`
4. `supabase/functions/_shared/billing-catalogue-writer-v1.ts`
5. `supabase/tests/billing_catalogue_publication.sql`
6. `supabase/tests/fixtures/billing_catalogue_fixture.psql`
7. `supabase/tests/fixtures/billing_catalogue_legacy_manifest.psql`
8. `tests/unit/billing-catalogue-publication.test.ts`
9. `scripts/test-billing-catalogue-concurrency.py`
10. `scripts/verify-billing-catalogue-manifest.py`
11. `docs/paddle-catalogue-publication.md`
12. `config/staging-commercial-certification.json`
13. `docs/staging-commercial-deployment-manifest.md`
14. `.github/scripts/ci-change-scope.mjs`
15. `.github/scripts/ci-change-scope.test.mjs`
