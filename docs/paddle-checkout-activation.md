# Dormant Paddle checkout runtime

`PADDLE-CHECKOUT-ACTIVATION-01` composes the existing checkout orchestrator and
Sandbox transport behind `billing-create-paddle-checkout`. No migrations, remote
configuration, deployments, provider requests, or sales/reconciliation activation
are part of this implementation.

## Audited path and minimum delta

The browser previously selected `lemonSqueezyBrowserProvider` unconditionally.
`BillingCheckoutPanel` calls `useBillingCheckout` → `createBillingCheckout` →
`billing-create-lemon-squeezy-checkout` → `handleBillingCheckout` with
`billingDependencies`. That path and its default request/response contracts remain
intact. Existing LS portal, plan-change, seat and webhook flows remain intact.

Explicit Paddle selection uses the same panel/mutation hook with a separate closed
request/response schema and explicit terms/refund acknowledgement. It calls the
new Edge Function → `handlePaddleCheckout` → existing
`createPaddleCheckoutOrchestrator` → existing
`createPaddleSandboxCheckoutTransport`. The Edge Function reuses trusted
authentication and the service RPC adapter from `billing-runtime.ts`, whose Paddle-scoped
error translator preserves reviewed admission codes and classifies underlying
catalogue/cross-ledger failures without changing Lemon Squeezy error handling.
The handler supplies no payment, entitlement, or reconciliation ports. The
orchestrator's persistence/admission logic and transport HTTP/destination policies
are unchanged; only checkout credential selection changes in the transport.

## Trusted server configuration

| Variable                                    | Requirement                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PADDLE_ENVIRONMENT`                        | Exactly `sandbox`                                                                                  |
| `PADDLE_SANDBOX_CHECKOUT_API_KEY`           | Dedicated Sandbox API key; never the catalogue/administration key                                  |
| `PADDLE_CHECKOUT_ACCESS_MODE`               | Exactly `disabled`, `pilot`, or `all`; missing/unknown defaults to `disabled`                      |
| `PADDLE_CHECKOUT_PILOT_USER_ID`             | In `pilot`, exact authenticated actor ID; missing or mismatched denies                             |
| `PADDLE_SANDBOX_PAYMENT_PAGE_URL`           | Required HTTPS merchant payment page, no query/fragment/userinfo/port, under the merged URL policy |
| `PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL` | Optional approved Sandbox hosted launch URL; preferred when configured                             |

These names describe future operator configuration only. No values, pilot identity,
provider identifiers, or credentials belong in Git or Vite. The checkout credential
must be provisioned separately under separate operational authorization. The
existing `PADDLE_SANDBOX_API_KEY` remains catalogue/notification administration
authority and never satisfies checkout authorization. No key permissions are changed.

The rollout gate precedes checkout persistence and transport dispatch. `all` still
requires trusted authentication and the database's normal actor/owner checks.
The database's `paddle_sales_enabled` gate is independent: both gates must allow
checkout before POST. Deployment without rollout configuration remains disabled.

Hosted destinations accept only the two exact hosts already in the merged policy:
`sandbox-pay.paddle.io` and `sandbox.pay.paddle.io`, with the host/path matrix
below and the server-generated `transaction_id` query. Merchant payment links retain the
exact configured origin/path with only `_ptxn`. Browser defense in depth further
restricts merchant navigation to the current HTTPS application origin. An external
merchant origin is intentionally not accepted by this browser integration. A
merchant page must already host its separately reviewed payment integration; this
task does not add Paddle.js, client tokens, or a merchant payment page. Hosted
checkout is the preferred first certification path.

The exact Sandbox hosted URL matrix is:

| Host                    | Allowed path                                                |
| ----------------------- | ----------------------------------------------------------- |
| `sandbox.pay.paddle.io` | `/checkout/<opaque-reference>`                              |
| `sandbox-pay.paddle.io` | `/checkout/<opaque-reference>` or `/hsc_<opaque-reference>` |

The bare `/hsc_...` form is a narrowly allowlisted Sandbox compatibility form
only on `sandbox-pay.paddle.io`; its path must match
`^/hsc_[A-Za-z0-9_-]{1,512}$`. Existing `/checkout/` references retain their
1�512 character alphanumeric, underscore, or hyphen constraint. Trusted launch
URLs have no query or fragment; final URLs contain only the validated
`transaction_id` query parameter. Live hosts, custom subdomains, `/pay/` paths,
userinfo, non-default ports, whitespace, and backslashes remain rejected.
Merchant payment-link behavior is unchanged.

## HTTP and recovery contract

JWT verification is enabled in `supabase/config.toml` and manifest metadata. Only
POST and OPTIONS are accepted; JSON responses are no-store with existing billing
CORS conventions. POST authenticates with `auth.getUser`, checks rollout access,
bounds the body to 4096 bytes, and uses the orchestrator's closed parser:
`planKey`, `cadence`, `additionalCoachSeats`, `legal`. Legal contains exact current
terms/refund versions and two true acknowledgements. The browser supplies no
operation/account/user IDs, mappings, prices, environment, or destination URLs.

Fresh success returns only `{ status: "ready", checkoutUrl }`. The handler calls
`destination.destination()` only after ready persistence at the final authenticated
response boundary. It never serializes or persists the capability. Reused states
return HTTP 409 `PADDLE_CHECKOUT_RECOVERY_REQUIRED` with their sanitized status and
no URL. They do not fabricate a destination or trigger another provider POST.

| Condition                      | HTTP / stable code                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Missing/invalid authentication | 401 `PADDLE_CHECKOUT_FORBIDDEN`                                                                   |
| Pilot/owner denial             | 403 `PADDLE_CHECKOUT_FORBIDDEN`                                                                   |
| Rollout disabled               | 403 `PADDLE_CHECKOUT_ROLLOUT_DISABLED`                                                            |
| DB sales disabled              | 403 `PADDLE_CHECKOUT_DISABLED`                                                                    |
| Invalid intent/legal/seats     | 400 `PADDLE_CHECKOUT_INVALID`, `PADDLE_CHECKOUT_LEGAL_REQUIRED`, or `PADDLE_CHECKOUT_SEAT_POLICY` |
| Mapping failure                | 503 `PADDLE_CHECKOUT_MAPPING`                                                                     |
| Conflict                       | 409 `PADDLE_CHECKOUT_CONFLICT`                                                                    |
| Ambiguous provider mutation    | 409 `PADDLE_CHECKOUT_AMBIGUOUS`                                                                   |
| Provider not dispatched        | 503 `PADDLE_CHECKOUT_NOT_DISPATCHED`                                                              |
| Recovery required              | 409 `PADDLE_CHECKOUT_RECOVERY_REQUIRED`                                                           |
| Persistence unavailable        | 503 `PADDLE_CHECKOUT_PERSISTENCE`                                                                 |
| Configuration failure          | 503 `PADDLE_CHECKOUT_CONFIGURATION`                                                               |

All error responses declare `retryable: false`; there is no automatic retry.
The existing transport conservatively treats any error after POST invocation,
including a provider HTTP rejection, as ambiguous. Database recovery remains the
authority. The browser disables another attempt after ambiguous/recovery/conflict
or uncertain persistence outcomes, including a lost network response or unsafe
success URL. Reloading cannot bypass the DB's open-attempt protection.
Paddle URLs are redacted by the shared telemetry sanitizer. No raw errors or
payloads are logged by the new handler.

## Browser selection and deployment

`VITE_BILLING_PROVIDER=paddle` explicitly selects Paddle at build time.
`lemon_squeezy`, missing, and unknown values select the existing safe Lemon Squeezy
provider. No query-string, local-storage, or runtime-user selector exists.
No saved environment is changed. Paddle does not poll the legacy LS checkout
state RPC or interpret its return parameters as Paddle payment confirmation.
Existing canonical entitlement display remains authoritative; this task grants
no access or seats after browser navigation.

The new function is in the staging billing allowlist and JWT contracts. It adds
no globally required secret to the LS deployment manifest, because disabled
Paddle operation needs no checkout credential. A later reviewed staging rollout
must explicitly supply the configuration above and pass independent commercial
certification before any sales activation. Do not deploy or configure it as part
of this implementation.

## Local verification

Use injected HTTP for unit/runtime tests. The unit harness blocks ambient network.
`tests/unit/paddle-checkout-runtime.test.ts` exercises the real orchestrator and
transport, including exactly one POST, both admission gates, closed input,
persist-before-response, uncertainty and repeated-call protection.

Run `npm run test:e2e:paddle-checkout` against local Supabase. Its separate local
Vite server selects Paddle only for that run and intercepts checkout/provider
boundaries. The normal Playwright configuration excludes this alternate-provider
suite and continues to exercise LS; run all four `billing-*.spec.ts` files for its
checkout, portal, plan and coach-seat regressions. Neither suite uses hosted staging
accounts. DB fixtures enabling sales are transaction-scoped and roll back; full
pgTAP runs use disposable local state.

## Final verification

Branch: `codex/paddle-checkout-activation-01`.
Base: fetched `origin/main`, `115244d03c7e43f23ec82a6f9b84014a50b5f4ea`.
No commit or deployment was performed.

| Gate                                     | Result                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Full unit suite                          | 2,993 passed across 284 files; zero failures/skips                                                 |
| Full DB suite                            | 2,021 assertions across 24 files; all passed                                                       |
| Paddle browser flows                     | 4 passed; local authenticated invocation and mocked provider boundary                              |
| Lemon Squeezy billing browser regression | 37 passed in final single-worker run                                                               |
| Total final billing E2E                  | 41 passed                                                                                          |
| Strict TypeScript                        | Pass (`npx tsc --noEmit --strict`)                                                                 |
| New Edge Function Deno check             | Pass, cached dependencies only, no lockfile change                                                 |
| Application build                        | Pass; source-map upload disabled for local validation                                              |
| Repository lint                          | Pass, zero errors; three existing unrelated warnings                                               |
| Repository formatting                    | Pass                                                                                               |
| Manifest validation                      | Pass                                                                                               |
| Whitespace                               | Pass                                                                                               |
| Leakage scan                             | No private-key material, full Paddle API keys, real-looking provider IDs, or JWTs in added content |
| Browser bundle boundary                  | No checkout API key, service-role key, or pilot-setting names                                      |
| Database migrations added/modified       | 0                                                                                                  |

The first parallel LS browser run passed 35/37; two timing waits failed (rendering
and authentication). Both passed in isolation, then all 37 passed in the complete
serial run, without changes to LS tests or runtime behavior. Initial unit failures
were stale deployment-count expectations after the allowlist grew to 14 functions;
all were corrected. The local pgTAP runner needed extension search-path and UTF-8
stdin setup; the complete final suite passed. No assertions or checkout verification
rules were weakened.

The disposable proof DB used transaction-scoped pgTAP fixtures. Existing checked-in
migrations were applied locally to bring the browser DB up to the reviewed schema;
no migration was authored. Final local proof/browser DB readbacks both show sales
and reconciliation false, entitlement mode test, and zero Paddle payment
applications, canonical links, and approved seats. Browser fixtures create local
synthetic users and exercise LS fixture state; they do not represent changes to
hosted account entitlements. All staging/production state remains untouched.

Real Paddle provider calls, transactions, checkout creation, permission changes,
remote secret/rollout configuration, sales/reconciliation flag changes, and
production mutations: **0**. The initial confirmed remote state was not re-read or
mutated during this implementation. The existing generic Paddle key was not read,
changed, or broadened by the new checkout boundary.

Sanitized test logs are under `%TEMP%/paddle-activation-*`; transient Deno output
was removed. Recommendation: **READY_FOR_COMMIT**. Stop before commit.

## Exact changed files

1. `config/staging-commercial-certification.json`
2. `docs/paddle-checkout-activation.md`
3. `docs/staging-commercial-deployment-manifest.md`
4. `package.json`
5. `playwright.config.ts`
6. `playwright.paddle-checkout.config.ts`
7. `scripts/staging-commercial-contracts.mjs`
8. `src/features/billing/checkout-api.ts`
9. `src/features/billing/checkout-errors.ts`
10. `src/features/billing/checkout-panel.tsx`
11. `src/features/billing/contracts.ts`
12. `src/features/billing/providers/active-provider.ts`
13. `src/features/billing/providers/paddle.ts`
14. `src/features/billing/use-billing-checkout.ts`
15. `src/lib/redact-hosted-payment-urls.ts`
16. `src/vite-env.d.ts`
17. `supabase/config.toml`
18. `supabase/functions/_shared/billing-runtime.ts`
19. `supabase/functions/_shared/paddle-checkout-handler.ts`
20. `supabase/functions/_shared/paddle-checkout-rpc.ts`
21. `supabase/functions/_shared/paddle-checkout/config.ts`
22. `supabase/functions/_shared/paddle-checkout/index.ts`
23. `supabase/functions/billing-create-paddle-checkout/index.ts`
24. `tests/e2e/paddle-checkout.spec.ts`
25. `tests/unit/paddle-browser-provider.test.ts`
26. `tests/unit/paddle-checkout-runtime.test.ts`
27. `tests/unit/paddle-checkout.test.ts`
28. `tests/unit/staging-commercial-apply.test.ts`
29. `tests/unit/staging-commercial-certification.test.ts`
