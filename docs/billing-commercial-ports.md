# BILLING-ADAPTER-02: verified reconciliation and commercial ports

Based on merged BILLING-ADAPTER-01 at `f9f427a`. This is local architecture work: no migration, SQL change, provider contact, hosted-environment mutation, deployment, new provider integration, or browser provider switch.

## Dependency delta

Before this change, webhook/plan/seat handlers consumed Lemon Squeezy snapshots, assembled `verified_item` and invoice proof, and passed those objects to RPCs. Portal orchestration consumed provider-specific fields and URLs. Plan/seat handlers enforced card/PayPal and first-item rules directly.

After this change:

```text
runtime composition (fixed Lemon Squeezy selection)
  -> existing compatibility checkout transport
  -> neutral BillingAdapter.customerPortal
       -> Lemon Squeezy portal capability -> existing provider retrieval/parser
  -> BillingCommercialPorts
       -> Lemon Squeezy compatibility bridge
            -> existing provider transport/parsers/signature verification
            -> provider-specific plan/seat policy helpers
            -> instance-bound verified receipts
            -> historical SQL argument serialization

webhook / plan / seat handlers -> explicit ports -> opaque RPC arguments -> unchanged SQL
portal handler -> canonical ownership -> prepare -> identity match
               -> canonical ownership recheck -> purpose eligibility -> destination
```

Provider-independent error, request-size and input primitives moved unchanged to `billing-common.ts`, with compatibility re-exports. Provider adapters do not import database DTOs or the reconciliation bridge. The core-side `billing-legacy-records.ts` translates historical database column names to identities for policy checks. The existing portal validator exports remain available for compatibility.

## Reconciliation port and payment truth

`ReconciliationPort` verifies an event, serializes delivery arguments, retrieves verified subscription evidence, and serializes snapshot/invoice arguments. `SubscriptionEvidencePort` retrieves evidence and supplements it with the provider's item proof. The handler never reads provider-specific snapshot/invoice fields.

The Lemon Squeezy bridge retains the original HMAC verifier, UTF-8/JSON handling, normalizer, event vocabulary, payload allowlist, provider retrievals, invoice selection, and serialization. It does not round-trip through the advisory neutral model: that model intentionally lacks historical proof fields and cannot establish payment truth.

Each bridge instance keeps proof in private `WeakMap`s keyed by frozen, opaque receipts. Receipts contain no data when serialized. A forged object, an advisory observation, a serialized/deserialized receipt, or a receipt from another instance cannot produce SQL proof. Verified raw bytes are copied before awaiting signature verification. Proof is copied on receipt issuance and serialization so callers cannot modify retained evidence.

These receipts establish provenance within the trusted server composition; they are not credentials or a substitute for SQL authorization. A provider adapter does not own the service RPC. Payment/access decisions still require the same RPCs, canonical ownership, operation/payment checks, and SQL reconciliation as before. Provider `active` or a neutral `transaction_paid` event does not grant access.

Replay remains `sha256(environment + "\n" + originalEventName + "\n" + sha256(rawBytes))`. Delivery persistence precedes subscription/item retrieval. Unsupported events still produce the existing ignored-event proof and null snapshot. Duplicate/replay decisions, failed-delivery persistence, and manual-review handling remain in the existing SQL/handler flow.

## Portal capability

The optional neutral customer-portal capability has `validateConfiguration` and `prepare`, supporting only `manage_billing` and `update_payment_method`. A provider can omit the capability or reject a purpose. Missing capabilities fail closed; handlers do not fall back to the compatibility transport.

RepSync still authenticates the user, validates the requested purpose, resolves the canonical account/subscription through its existing owner-checking RPC, compares all provider identity fields, and repeats the canonical lookup after provider retrieval. The core retains the local past-due/grace rule for updating payment details. The Lemon Squeezy capability retains its past-due/unpaid provider-status rule.

Prepared destinations are request-local closures. Signed/opaque URLs are not included in the prepared identity, logs, database arguments, test snapshots or other evidence. The closure is invoked only after the core's second ownership check. The response remains `no-store, private` with `Pragma: no-cache`. No destination is cached or persisted.

The existing Lemon Squeezy host allowlist, exact purpose path, HTTPS/authority/port/fragment checks, length and whitespace checks all remain unchanged. Provider-owned query strings remain opaque and byte-preserved; they are never interpreted as ownership or routing inputs. Validation still occurs after ownership rechecks, preserving error precedence. Provider failures remain sanitized.

## Plan and seat policy boundary

Explicit plan/seat ports encapsulate provider retrieval/mutation capabilities and assertions. Lemon Squeezy policies retain card/PayPal eligibility, first-item requirements, identity checks, cancellation eligibility, trial/proration invariants, provider timestamp checks and response drift checks. The existing item validator is reused.

The commercial core still owns plan/cadence validation, the additional-seat input ceiling, approved quantity derivation, target operation/mapping selection, durable operation lifecycle, and entitlement timing. SQL retains its existing capacity, mapping and payment-proof checks. A seat refresh still forwards drift proof to reconciliation; other seat paths still reject item drift. Mutation capability absence fails before beginning an operation, while preview and refresh retain their existing supported behavior.

## Remaining coupling and database impact

Zero migrations and zero SQL/RPC signature changes. Historical provider columns, constraints, event names, store lookup, operation result fields and reconciliation proof remain provider-specific. They are now isolated by the compatibility ports and core record translator, not renamed or weakened.

The runtime and browser remain fixed to Lemon Squeezy. Checkout still uses its existing compatibility DTO/transport and URL policy. Secret names, Edge Function names, UI disclosures and telemetry redaction are unchanged. Subscription cancellation remains unavailable as a separate direct capability. The new ports do not make the current database automatically compatible with another provider.

Recommended next PR: **BILLING-ADAPTER-03 — Design provider-database compatibility and historical proof contracts**. First inventory provider constraints and identity mappings, then design a reviewed compatibility strategy that preserves immutable history, replay identity and SQL payment authority. Provider integration and any eventual migration require separate review.

## Verification

Thirteen synthetic baseline snapshots were captured from the merged ADAPTER-01 handlers before implementation, then retained unchanged. They cover all four plan actions, all four seat actions, supported/provider-specific/unknown events, and both portal purposes. They lock exact RPC arguments, call order, responses and cache headers. Portal destinations are deliberately excluded from snapshots.

Additional tests cover receipt forgery/cross-instance reuse, immutable evidence, raw-byte replay sensitivity, environment/store mismatch, duplicate handling, failure persistence, absent ports, neutral test-provider ports, portal ownership rechecks/secrecy, card/PayPal policy, first-item drift, missing mutation capabilities, and plan/seat response drift.

| Check                                               | Result                                                       |
| --------------------------------------------------- | ------------------------------------------------------------ |
| New commercial-port suite                           | 57 tests passed; 13 baseline snapshots matched               |
| Full affected billing/commercial/entitlement suites | 593 tests passed across 21 files, including the 57 new tests |
| Strict server-boundary and test typecheck           | Passed                                                       |
| Application typecheck and build                     | Passed (`npm run build`)                                     |
| Lint                                                | Passed: 0 errors, the same 3 existing client warnings        |
| Repository formatting                               | Passed                                                       |
| Whitespace                                          | Passed (`git diff --check`)                                  |

All provider transports and RPCs used in verification are mocks. Ambient network fetch is forbidden in the new suite. No live provider/database verification was performed. Tests use synthetic identities and credentials only. No commit, push, PR, or deployment is part of this implementation task.

The strict check includes the changed server modules, the ADAPTER-01 contract suite and the new commercial-port suite. Expanding strict checking to the older provider/portal/plan/seat test fixtures reports nine existing mock-typing diagnostics. A compiler comparison against the merged ADAPTER-01 sources confirms the identical nine diagnostics and no new ones; those unrelated fixtures were not rewritten. Their Vitest suites all pass.

The source audit also confirms all 22 retained declarations in `lemon-squeezy.ts`, the four extracted common primitives and both extracted portal validators are identical to the merged baseline after normalizing line endings. The SQL tree, application/browser source, item validator and package manifests/lockfile are unchanged.

## Changed files

- `supabase/functions/_shared/billing-commercial-ports.ts`: explicit receipt, serialization, evidence and policy contracts.
- `supabase/functions/_shared/billing-common.ts`: unchanged provider-independent primitives extracted from the legacy module.
- `supabase/functions/_shared/billing-legacy-records.ts`: core translation of historical identity columns.
- `supabase/functions/_shared/billing-handlers.ts`: webhook receipt/serialization orchestration; checkout unchanged.
- `supabase/functions/_shared/billing-plan-change.ts`: plan evidence/policy ports.
- `supabase/functions/_shared/billing-seat-quantity.ts`: seat evidence/policy ports.
- `supabase/functions/_shared/billing-portal.ts`: core authorization and neutral portal orchestration.
- `supabase/functions/_shared/billing-provider.ts`: two-phase neutral portal capability.
- `supabase/functions/_shared/billing-runtime.ts`: fixed explicit composition of ports and portal configuration.
- `supabase/functions/_shared/lemon-squeezy-reconciliation.ts`: verified receipt storage and exact legacy serialization bridge.
- `supabase/functions/_shared/lemon-squeezy-policy.ts`: unchanged provider-specific eligibility/result checks.
- `supabase/functions/_shared/lemon-squeezy-portal.ts`: unchanged URL validation plus request-local portal capability.
- `supabase/functions/_shared/lemon-squeezy-adapter.ts`: exposes the optional portal capability.
- `supabase/functions/_shared/lemon-squeezy.ts`: compatibility re-exports for extracted primitives; transport/parsers unchanged.
- `tests/unit/billing-commercial-ports.test.ts`: baseline parity and port/security/policy tests.
- `tests/unit/__snapshots__/billing-commercial-ports.test.ts.snap`: synthetic pre-refactor parity fixtures.
- `tests/unit/helpers/billing-test-ports.ts`: explicit fixture composition, never a production fallback.
- `tests/unit/billing-adapter.test.ts`: composition and supported-portal assertions.
- `tests/unit/billing-provider.test.ts`: explicit test composition for existing regressions.
- `tests/unit/billing-plan-change.test.ts`: explicit test composition for existing regressions.
- `tests/unit/billing-portal.test.ts`: explicit test composition for existing security regressions.
- `docs/billing-provider-boundary.md`: points to this follow-up from the historical ADAPTER-01 record.
- `docs/billing-commercial-ports.md`: this dependency delta, design and verification record.
