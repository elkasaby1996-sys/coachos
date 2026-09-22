# PADDLE-CHECKOUT-01-PREP

Branch `codex/paddle-checkout-01-prep` starts at latest fetched merged main
`55b883d`. This is a dormant provider transport, exercised only with injected
mock HTTP. There is no production composition, active provider registration,
browser route, database write, real transaction, deployment, or sales activation.
No files from unmerged PADDLE-WEBHOOK-01-PREP are imported or copied into this branch.

## Paddle transaction and checkout model

The minimal provider operations are `POST /transactions` (201) and
`GET /transactions/{transaction_id}` (200). This lane sends catalogue price IDs
and quantities with `collection_mode: automatic`. It omits customers, addresses,
manual billing, discounts, non-catalogue prices, and status changes. Paddle may
initially create a draft transaction, with checkout collecting missing details.
The returned **transaction ID** is the authoritative provider attempt reference;
there is no independent RepSync checkout-session ID invented from a URL.

There are two different destination mechanisms:

1. `transaction.checkout.url` is a payment link composed from an approved merchant
   payment page and `_ptxn=<transaction ID>`. That page needs Paddle.js. It is not
   necessarily hosted by Paddle and is not a return/success URL.
2. A fully Paddle-hosted checkout uses a dashboard-created launch URL. Append the
   documented `transaction_id` query parameter to pass the backend-created
   transaction, rather than choosing prices again in the URL. No additional API
   operation is needed here to manufacture that destination.

A default payment link must be configured in Paddle before future real usage.
No such configuration is changed here. Success/return behavior belongs to approved
Paddle.js settings or hosted-checkout configuration, not an invented transaction
API `success_url`. This transport therefore has no return/success URL input.
Paddle does not provide a checkout expiry equivalent to the merged generic
`CheckoutCapability.create` contract used elsewhere; this lane does not fabricate
`expiresAt` or register as that capability.

## Trusted configuration and transport surface

`createPaddleSandboxCheckoutTransport` takes:

- An explicitly injected `fetch` transport and trusted `readEnvironment` function.
  There is no ambient fetch fallback or production factory invocation.
- An approved HTTPS `paymentPageUrl` from trusted server configuration, with no
  query, credentials, fragment, or non-default port.
- Optional `hostedCheckoutLaunchUrl`, copied from the sandbox dashboard and
  provided by trusted server configuration, never by the browser.

The factory directly reuses **merged PADDLE-CORE-01** `sandboxAuthorization` and
`PADDLE_SANDBOX_ORIGIN`. Required environment is `PADDLE_ENVIRONMENT=sandbox` plus
the server-only sandbox API key; live/generic keys and a configurable API base URL
remain rejected. The credential stays in the existing private closure. No
credential-bearing configuration is returned, serialized, or logged.

The public capability exposes only:

- `createCheckoutTransaction(input)`
- `retrieveCheckoutTransaction({ transactionReference, expected: input })`

Both are **trusted server-composition ports**, not endpoints. A future orchestrator
must resolve and authorize facts before calling them; these TypeScript inputs are
not a substitute for that authorization and must never be populated by forwarding
browser-selected prices or destinations.

## Closed request contract and multi-item model

`PaddleCheckoutInput` contains exactly:

- `base: { priceReference, quantity: 1 }`
- Optional `seats: { priceReference, quantity }`, where quantity is the number of
  purchased additional seats, a positive bounded provider integer.
- `correlation: { operationReference, attemptReference }`, generated and supplied
  by trusted RepSync orchestration. The transport generates neither value.

References are exact opaque strings, without prefix parsing, trimming, case
folding, or plan inference. Duplicate base/seat price references are rejected.
Input snapshots are copied before asynchronous work. Unknown fields—including
plan keys, account authority, entitlement limits, environment, arbitrary custom
data, or redirect URLs—are rejected.

Wire custom data is restricted to `repsync_operation_id` and `repsync_attempt_id`.
Provider echoes must match both. The future core must verify the selected base
and add-on are recurring, have identical cadence/frequency, are published and
eligible, and obey seat policy. The transport performs none of those commercial
decisions and does not implement tier seat ceilings.

## Sanitized results

The result contains provider `paddle`, environment `test`, exact transaction
reference, observed status, approved correlation, exact price/product references
and quantities, currency, optional observed total, and provider-created/updated/
billed timestamps. Raw objects, customer data, provider custom-data additions, and
unknown fields are discarded. A total is a minor-unit integer string, never a
floating-point conversion or assertion of settlement. Timestamps preserve observed
RFC3339 spelling/precision; none is synthesized from arrival time.

Both calls validate the returned item set and quantities against the supplied
expected facts; order is irrelevant, but additions, removals, duplicates, or drift
fail closed. Retrieval also requires exact requested/returned transaction identity.
Statuses such as `paid` and `completed` remain observations: they create no verified
payment receipt, payment application, entitlement, or access grant.

`checkout` is nullable, otherwise an ephemeral nonserializable capability:
`{ kind, destination(): { url }, toJSON(): never }`. The URL stays in a closure until
explicitly requested. Do not log or persist it, including in test snapshots.

## URL security policy

Returned merchant payment links must use HTTPS and match the exact trusted payment
page origin and path, with exactly one `_ptxn` parameter matching the returned
transaction reference. No extra query parameters, fragment (including empty `#`),
credentials, backslashes, whitespace, non-default port, or oversized URL is allowed.
Paddle-owned domains cannot be misconfigured as merchant payment pages.

For fully hosted checkout, the two documented sandbox host spellings are allowed
by exact equality: `sandbox-pay.paddle.io` and `sandbox.pay.paddle.io`. Paddle's
2025 changelog documents the former; its current custom-subdomain guide documents
the latter. There is no DNS probe or assumption that either has been configured
for a real account. An actual dashboard launch URL is still required for future
usage. The transport adds solely `transaction_id` from the validated response.

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

Live `pay.paddle.io`, hostname suffix lookalikes, and custom Paddle subdomains are
rejected. Supporting custom domains later requires an explicitly reviewed exact
allowlist; no wildcard is implied. The provider payment link is validated even
when a separate hosted launch URL was configured. These rules do not reuse Lemon
Squeezy's URL assumptions.

## HTTP and idempotency design

One request per explicit capability call; **no automatic retries, even for GET**.
The narrow internal transport checks method/path at runtime. POST is limited to
`/transactions`; GET is limited to a single encoded transaction reference.
Redirects are disabled, request JSON is capped at 4 KiB, streamed responses at
1 MiB, and a 10-second deadline spans response headers and body. Requests abort
and response streams cancel on failure/deadline. Content type, UTF-8, JSON, and
response shape are checked. Authorization and raw provider errors never enter logs
or public errors.

Errors expose a static code, optional numeric HTTP status, and
`mutationMayHaveSucceeded`. This flag is conservatively true for any failure after
a create was dispatched, including malformed/drifting successful responses. It
is false for rejected input and GET failures. HTTP 401/403/404/409/422/429/5xx are
handled without exposing provider error text. Neither 429 nor Retry-After triggers
another create. Unknown create outcomes must block blind resubmission.

Paddle's documentation says arbitrary operations do not support client-supplied
idempotency keys. Accordingly, no unsupported Idempotency-Key header is sent and
custom-data correlation is **not** claimed to make POST idempotent. Two explicit
calls can create two transactions.

Future core binding, not implemented here:

1. Lock/lease the RepSync operation and persist its approved price/quantity snapshot
   and server-issued attempt reference before dispatch.
2. Send that same operation/attempt correlation once. Persist the resulting Paddle
   transaction reference only through future authorized orchestration.
3. If the reference is known, retrieve it with the original expected facts. If a
   timeout loses the reference, hold the operation in an ambiguous state for a
   separately designed provider lookup/operator recovery path. This prep capability
   neither lists transactions nor resolves unknown outcomes.
4. Reuse a known eligible transaction instead of creating a new one. A new attempt
   requires the core to resolve the prior attempt; the transport cannot decide it.

## Verification and scope

Tests inject mocked HTTP only and generate nonfunctional key material in memory.
Provider references are synthetic. The existing unit setup forbids ambient network.
Coverage includes one/two items, quantities, opaque references, closed inputs,
configuration, echoed correlation, drift, URL policies, status errors, no mutation
retry, deadlines, bounds, malformed responses, redaction, and absence of canonical
identity or commercial authority. No real Paddle transaction or API request occurred.

Verification results: 113 focused tests and 441 tests in the eight-file regression
selection pass. The full suite passes 2,631 tests across 276 files. Strict server
TypeScript (including unchecked-index checks), application build/typecheck,
targeted server lint, repository lint, formatting, whitespace/diff checks, and the
credential/provider-ID pattern scan pass. Repository lint retains three existing
unrelated frontend warnings.

Files added: `contract.ts`, `validation.ts`, `destination.ts`, `http.ts`, and
`index.ts` under `_shared/paddle-checkout`; `tests/unit/paddle-checkout.test.ts`;
and this document. No existing files need edits.

## Overlap and dependencies

- **PADDLE-CATALOGUE-01:** Already merged in this base. Its authority/publication
  contracts and migrations are untouched. Future orchestration must consume trusted
  published mappings; this transport cannot publish or choose them.
- **PADDLE-CORE-01:** Already merged. This lane imports its trusted configuration
  without modifying it. A future neutral shared transport package may consolidate
  bounded HTTP/error utilities after both lanes merge; no refactor or duplicate
  credential configuration is introduced here. CORE's catalogue HTTP surface stays GET-only.
- **PADDLE-WEBHOOK-01-PREP:** Unmerged and absent from this branch. There is no import,
  cherry-pick, merge, receipt dependency, or shared-file edit. Timestamp validation
  is local so the prep lane does not require that branch.

No additional prior PR must merge to compile/test this prep implementation because
CORE and CATALOGUE-01 are already in main. Before end-to-end checkout activation,
separately reviewed orchestration/operation persistence, published catalogue
resolution (including any required CATALOGUE-02 workflow), cadence/seat policy,
approved hosted/page setup, and provider selection gating must exist. Event ingestion
must wait for the webhook prep to merge plus its later ingestion integration; payment
authority additionally needs independent transaction validation and existing core
hard-stop review. None is enabled by this transport or satisfied by a checkout URL.

All seven files use new paths, so expected textual overlap is low. The only runtime
dependency shared with CORE is its already-merged config contract. Assess future
changes there semantically rather than merging unreviewed provider behavior.

## Official references

- [Create a transaction](https://developer.paddle.com/api-reference/transactions/create-transaction/)
- [Get a transaction](https://developer.paddle.com/api-reference/transactions/get-transaction/)
- [Pass a transaction to checkout](https://developer.paddle.com/build/transactions/pass-transaction-checkout/)
- [Hosted checkout parameters](https://developer.paddle.com/paddle-js/about/hosted-checkout/)
- [Hosted sandbox domain changelog](https://developer.paddle.com/changelog/2025/custom-subdomains-hosted-checkout/)
- [Current custom-subdomain guide](https://developer.paddle.com/build/checkout/custom-subdomains/)
- [SDK idempotency and retry guidance](https://developer.paddle.com/sdks/libraries/#idempotent-and-retried-requests)
