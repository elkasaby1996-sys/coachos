# BILLING-ADAPTER-01: provider-neutral billing boundary

This records the ADAPTER-01 implementation. The follow-up [BILLING-ADAPTER-02](billing-commercial-ports.md) adds verified reconciliation, portal orchestration and provider policy ports; its current design supersedes the deferred-port limitations below.

## Investigation and dependency map (before implementation)

The existing billing path is:

```text
Browser billing panels / hooks
  -> checkout-api / portal-api / plan-change-api / seat-quantity-api
  -> existing billing Edge Function names (11 entrypoints)
  -> billing-handlers / billing-portal / billing-plan-change / billing-seat-quantity
       -> billing-runtime (authentication, RPCs, provider/environment configuration)
       -> lemon-squeezy (HTTP requests, parsers, signature verification, webhook allowlist)
            <-> billing-seat-item (first-item parsing and quantity proof)
       -> owner/service RPCs
            -> canonical accounts, subscriptions, plans, capacity, operation ledgers
            -> provider mappings, webhook delivery history, reconciliation
```

All seven existing billing shared modules were inspected. All eleven entrypoints use the shared runtime; checkout and webhook names explicitly identify Lemon Squeezy. Browser checkout contracts restrict URLs to Lemon Squeezy and invoke the existing named function. Portal contracts expose only safe links and canonical summaries. Plan and seat contracts expose RepSync-owned operation states. Panels contain provider-specific disclosures and payment-method restrictions; telemetry redacts hosted payment URLs. Those are deliberate compatibility boundaries, not candidates for cosmetic renaming.

The SQL boundary is defined by `20260911010000_lemon_squeezy_billing_foundation.sql`, `20260911020000_billing_customer_portal.sql`, `20260911030000_controlled_plan_changes.sql`, `20260912020000_additional_coach_seats.sql`, and the later checkout expiry precision fix. Provider-specific identifiers, immutable mappings, normalized delivery payloads and fingerprints are durable history. Plan/seat SQL verifies subscription and item identities and payment evidence before changing entitlements. It remains authoritative and unchanged.

| Ownership                 | Concepts                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RepSync commercial core   | Billing accounts; Launch/Growth/Scale keys; monthly/annual cadence; approved mappings; included/additional coach seats; checkout attempts; plan/seat operations; access modes; entitlements; capacity; reconciliation and immutable history                          |
| Generic provider boundary | Provider/environment identity; opaque customer/subscription/transaction/price references; subscription observations; transaction observations; normalized event envelope; explicit optional capabilities                                                             |
| Lemon Squeezy adapter     | Numeric upstream IDs; store/product/variant/price relationships; JSON:API payloads and HTTP paths; HMAC headers; test_mode; first subscription item; quantity/proration flags; PayPal restrictions; URL validation; provider event names; sanitized legacy SQL proof |

## Implementation constraints

No migration, history rewrite, provider contact, secret change, deployment, pricing/UI change, or new provider integration is part of this task. Compatibility DTOs remain separate from neutral models. Existing provider parsers and HTTP requests remain the reference implementation; the adapter delegates to them. Current handlers continue to send the exact legacy proof to the existing SQL reconciliation routines. Neutral observations do not grant access or capacity and are not substitutes for verified payment proof.

Plan and cadence may be supplied only by an approved, matching server-side mapping; neither is guessed from IDs or subscription timestamps. Missing provider observations remain absent. Subscription quantity means billed item units, not included coach seats or an entitlement limit. Unknown events remain explicitly provider-specific; unsupported refund webhook events gain no new canonical meaning. Duplicate identity must preserve the existing environment/event/raw-body fingerprint.

## Introduced architecture

```text
New server consumers -> BillingAdapter (billing-provider.ts)
                         optional capability-specific ports
                       -> adaptLemonSqueezyProvider
                       -> existing createLemonSqueezyProvider

billing-runtime -> createLemonSqueezyBillingBoundary
                    adapter       -> neutral observations for new consumers
                    compatibility -> existing handlers -> unchanged SQL proof/RPCs

Browser checkout API/contracts -> BrowserBillingProvider
                               -> fixed Lemon Squeezy browser adapter
                               -> unchanged endpoint and checkout URL allowlist
```

`billing-provider.ts` imports no SDK, browser code, provider parser or database DTO. References are opaque strings: the neutral helper does not trim, case-fold or numerically convert them. Identity is explicitly scoped by provider and `test`/`live` environment (`test` is the existing sandbox designation). Merchant/product/offer/price references and observations are optional when another provider cannot supply them. The reference adapter continues enforcing Lemon Squeezy's numeric wire-ID constraints inside its existing parser.

`lemon-squeezy-adapter.ts` delegates transport, checkout parsing, subscription parsing, plan changes, quantity updates, invoice retrieval and HMAC verification to the existing implementation. Return values are explicit field projections, never object spreads of provider payloads. The neutral adapter does not expose credentials, raw responses, URLs embedded in subscription payloads, customer PII, or the compatibility object. Checkout's intentional hosted URL and customer-input fields remain limited to the checkout capability. Compatibility DTOs contain the existing sanitized reconciliation proof; the raw HTTP payload still dies in the provider parser. New webhook handling exposes an envelope and optional allowlisted transaction observation, not the raw webhook or its legacy payload dictionary.

The runtime constructs both ports without making an HTTP request. Existing handlers keep the same compatibility provider, request order, SQL arguments, errors, signatures, fingerprints, leases, replays, and authorization checks. No handler has been switched to applying neutral observations as reconciliation proof. This is a staged boundary introduction, not a claim that the existing database can already accept another provider.

The browser's provider selection is fixed in `providers/active-provider.ts`. It cannot be switched by a query parameter, checkout payload, or environment variable. Existing schemas still validate the same endpoint response and URL trust policy. No checkout UI or pricing changes are involved.

## Capabilities and unavailable observations

| Capability                | Neutral adapter behavior                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout                  | Delegates the current attempt/mapping, redirect and verified customer input; keeps preview, quantity, trial, discount and expiry semantics                                |
| Subscription retrieval    | Returns safe observations; optional approved mapping resolver supplies plan/cadence only after provider, environment and full price-identity match                        |
| Plan change               | Present only if the legacy adapter implements variant changes; timing controls the identical existing proration flags, not RepSync access timing                          |
| Quantity change           | Present only if the legacy adapter implements item quantity updates; returns billed item units without computing coach entitlements                                       |
| Transaction retrieval     | Existing latest-page reconciliation proof only (`reconciliation_window`), not a complete financial ledger; no new requests or pagination                                  |
| Webhook verification      | Present only with a configured secret; identical HMAC verification and normalizer; bounded bytes; no signature or raw body returned                                       |
| Customer portal           | Not exposed as a new neutral capability yet. Existing portal handler remains available through compatibility, preserving owner/linkage rechecks and opaque signed queries |
| Subscription cancellation | Not exposed: no direct existing API operation. Canceling a scheduled plan/seat operation is a different core operation and remains unchanged                              |

Provider absence is meaningful. The existing subscription parser retains no current-period-start observation; creation time is not substituted for it. Period end follows the existing snapshot convention (`ends_at` for canceled/expired status, otherwise `renews_at`). Cancellation records the provider's requested flag and supplied effective date; the core still decides whether cancellation is pending or terminal. Active status is not proof of payment. Only observed `past_due`/`unpaid` payment states are exposed.

Existing invoice retrieval discards transaction IDs, amounts and currency. The neutral transaction contract has optional fields for these concepts, but this adapter does not invent or newly collect them. Verified invoice webhooks do supply a resource ID, so that becomes the transaction reference. Creation/update timestamps are retained with their actual meaning; neither is relabeled as payment occurrence time. Lemon Squeezy supplies no event ID or distinct occurrence timestamp in the existing retained proof, so those envelope fields remain absent.

## Event taxonomy and replay

| Existing event                   | Neutral event                                                 |
| -------------------------------- | ------------------------------------------------------------- |
| `subscription_created`           | `subscription_created`                                        |
| `subscription_updated`           | `subscription_updated`                                        |
| `subscription_cancelled`         | `subscription_canceled`                                       |
| `subscription_payment_success`   | `transaction_paid`                                            |
| `subscription_payment_recovered` | `transaction_paid`                                            |
| `subscription_payment_failed`    | `transaction_failed`                                          |
| Every other event                | Explicit `provider_specific` branch, with no canonical `type` |

Existing resumed/expired/paused/unpaused/plan-changed events remain supported by legacy reconciliation. They are not collapsed into a less precise neutral event. Unknown/refund events acquire no new reconciliation meaning. A normalized event name alone is never payment authorization: the existing invoice status, billing reason, identity and operation checks still apply in SQL.

Replay identity remains `sha256(environment + "\n" + originalEventName + "\n" + sha256(rawBytes))`, scoped with provider/environment just as the existing unique key is. Whitespace changes in the original body still change the fingerprint. Normalization does not reserialize the body or deduplicate distinct source event names into one canonical type.

## Deliberately deferred coupling and next PR

No migration is required for this TypeScript boundary. No database files or histories are changed. Existing provider constraints, store/product/variant/price columns, first-item proof, SQL event names, RPC DTOs, plan/seat handler payment-method checks, portal validation, Edge Function names, browser disclosures and payment URL redaction retain their historical meaning.

Recommended next PR: `BILLING-ADAPTER-02 — Isolate legacy reconciliation serialization and portal orchestration behind explicit ports`. Continue using the same provider, add parity tests, and move consumers one operation at a time. That should precede a separately designed provider-mapping/database compatibility change. Replacing the launch provider will need a separate reviewed plan; this PR does not enable arbitrary provider selection or relax existing SQL constraints.

## Changed files

- `supabase/functions/_shared/billing-provider.ts`: provider-neutral models and capability interfaces.
- `supabase/functions/_shared/lemon-squeezy-adapter.ts`: thin reference adapter and runtime composition factory.
- `supabase/functions/_shared/billing-runtime.ts`: constructs the neutral and compatibility ports together.
- `supabase/functions/_shared/billing-handlers.ts`: exposes the optional neutral port alongside the unchanged legacy dependency.
- `src/features/billing/providers/contract.ts`: browser capability boundary.
- `src/features/billing/providers/lemon-squeezy.ts`: existing checkout endpoint and unchanged URL policy.
- `src/features/billing/providers/active-provider.ts`: fixed compatibility selection.
- `src/features/billing/checkout-api.ts`, `src/features/billing/contracts.ts`: consume that browser boundary.
- `tests/unit/billing-adapter.test.ts`: neutral contract and compatibility parity tests; all transport mocked and ambient fetch forbidden.
- `docs/billing-provider-boundary.md`: investigation, ownership/dependency map, limitations and verification record.

## Verification

| Check                                          | Result                                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New adapter contract tests                     | 55 passed in `billing-adapter.test.ts`                                                                                                                           |
| Affected regression suites                     | 536 passed across 20 files using `npx vitest run billing account-entitlements commercial-access commercial-catalogue pt-hub-billing` (includes the 55 new tests) |
| Server boundary and test typecheck             | PASS with the strict, explicit command below; needed because the application tsconfig does not include Edge Function shared code                                 |
| Application typecheck and production build     | PASS, `npm run build` (`tsc -b && vite build`)                                                                                                                   |
| Lint                                           | PASS, 0 errors; only the same 3 existing client profile/message/workout warnings                                                                                 |
| Formatting                                     | PASS, repository-wide Prettier check                                                                                                                             |
| Whitespace                                     | PASS, `git diff --check`                                                                                                                                         |
| Database and provider implementation integrity | Existing migrations, provider HTTP/parsers, portal handler, plan/seat handlers, item parser, and package/lockfile are unchanged                                  |

```text
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck --strict --types vite/client,node supabase/functions/_shared/billing-provider.ts supabase/functions/_shared/lemon-squeezy-adapter.ts tests/unit/billing-adapter.test.ts
```

Coverage includes approved mappings for all three plans and both cadences; missing/wrong-environment/wrong-price mappings; nonnumeric opaque IDs at the neutral boundary; test/live binding; quantity semantics; cancellation and period-end observations; unknown/provider-specific events; HMAC failure and environment/store/event mismatches; unchanged byte-sensitive replay hashes; payload/credential redaction; unavailable capabilities; identical HTTP request bytes and provider error/ambiguity semantics; identical checkout/webhook handler responses and durable RPC arguments; and browser endpoint/URL-policy parity.

All provider transports in these tests are mocked. No database server, hosted Supabase instance, payment provider, or browser session was used for verification. No migrations, secret changes, remote application mutations, or deployments were performed for this task. Runtime environment and secret bindings are copied at adapter construction so later caller-option mutations cannot retarget the port. Public Supabase dependency documentation was consulted; no dependency or CLI upgrade was made.

Finalization preserves the reviewed eleven-file scope and architecture. Test credentials and provider references are synthetic fixtures; no real credentials, provider identifiers, local environment/session files, backup artifacts, or private evidence are included. Existing checkout behavior, entitlement/capacity rules, HTTP request bytes, replay fingerprints, and handler/RPC behavior remain unchanged. Neutral observations cannot directly establish payment truth.

The final commit uses `[skip ci]` because the existing PR workflow includes configured-account integration tests that write remote data. Local verification above is the finalization gate; skipped GitHub Actions must not be reported as passing CI. No workflow changes or automatic merge are part of this PR.
