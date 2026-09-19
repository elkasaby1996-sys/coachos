# PADDLE-CORE-01: sandbox catalogue transport

This lane introduces an opt-in server-only catalogue capability. It does not
register Paddle with the active payment provider, expose an HTTP endpoint, or
change database migrations, publication, sales, reconciliation, checkout,
webhooks, Lemon Squeezy, or the verified payment receipt boundary.

## Configuration contract

`createPaddleSandboxCatalogue()` reads the server's Deno environment/secrets or
Node environment. Trusted server composition and tests may inject an environment
reader and a fetch implementation; neither is browser/request-controlled.

| Server variable                         | Contract                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `PADDLE_ENVIRONMENT`                    | Required; exactly `sandbox`. Observations advertise the neutral environment `test`.          |
| `PADDLE_SANDBOX_API_KEY`                | Required; current Paddle sandbox API-key format. Grant only `product.read` and `price.read`. |
| `PADDLE_API_KEY`, `PADDLE_LIVE_API_KEY` | Must be unset/empty to avoid ambiguous or mixed credentials.                                 |
| `PADDLE_API_BASE_URL`                   | Must be unset/empty. Origin is fixed to Paddle sandbox.                                      |

Missing settings, live/legacy/client tokens, mixed settings, and secret-reader
failures produce a static `configuration` error before HTTP. Browser execution
is rejected before secrets are read. There is no environment selector, public
environment variable, or serializable credential-bearing config object.
Credentials stay in a private closure and are sent only as authorization to the
fixed sandbox origin. Do not log the injected transport's request arguments.

## Capability and observation contract

Import `createPaddleSandboxCatalogue` and `PaddleCatalogueCapability` from
`supabase/functions/_shared/paddle-catalogue/index.ts` in trusted server code.

| Method                       | Result                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `listProducts()`             | Complete bounded standard catalogue product observations, active and archived |
| `retrieveProduct(reference)` | One product observation; returned reference must match exactly                |
| `listPrices()`               | Complete bounded standard catalogue price observations, active and archived   |
| `retrievePrice(reference)`   | One price observation; returned reference must match exactly                  |

All four operations use GET. There is no generic request or mutation method.
Names, descriptions, custom data, images, and unknown response fields are dropped.
No commercial identity is inferred from descriptive fields or reference prefixes.
References are bounded opaque strings, preserved without trimming or case changes,
and encoded as single path components when retrieving.

The DTO definitions live in `contract.ts`:

- Product: exact reference, `active | archived` status, tax category.
- Price: exact price/product references, status, base currency and amount, nullable
  billing cycle, nullable trial, minimum/maximum quantity, tax mode, and whether
  geographic price overrides exist.
- Money: uppercase three-letter currency representation and a nonnegative integer
  minor-unit string (up to 35 digits). No floating-point conversion. Currency
  support, expected currency, and storage-range eligibility belong to verification.
- Cycle: `day | week | month | year`, positive safe-integer frequency. Monthly and
  annual are observations of month/year with frequency 1, not assigned offers.
- Trial: cycle, payment-method requirement, nullable trial money, override presence.
  Optional trial money/override fields follow the provider's absent/free defaults;
  missing mandatory trial facts fail closed.

Unknown fields are discarded; malformed required fields or unknown statuses and
recurrence units fail the operation. `archived` is the provider's inactive status;
an undocumented literal `inactive` is rejected. Tax fields are retained because
they affect price verification. Geographic overrides are explicitly flagged,
not treated as covered by base money; future verification must reject these until
it explicitly supports them. Observations are neither database DTOs nor proofs.

## Pagination, resource bounds, and errors

Lists explicitly request both statuses, 200 records per page, at most 100 pages
(20,000 observations per resource). Only a validated same-origin, same-resource
next link's opaque cursor is extracted; the request URL and filters are rebuilt.
Duplicate records, repeated cursors, empty continuation pages, invalid envelopes,
and page exhaustion fail without returning a partial list. No provider URL is
followed directly, and redirects are disabled.

Each attempt has a 10-second deadline covering headers and streamed body, with
abort/cancellation, and a 1 MiB decoded-byte response bound. Both Content-Length
and actual streamed bytes are checked. Each page/retrieval has at most three
attempts. Only 429/502/503/504 are retried, with a one-second default delay or a
valid Retry-After of up to five seconds. Longer/invalid cooldowns return the error
without an early retry. Other statuses, network failures, malformed bodies, and
timeouts are not retried. Every list/retrieval also has a 60-second total network
budget across all pages, attempts, and retry delays.
Lists are observations over time, not an atomic provider snapshot.

`PaddleCatalogueError` exposes only a static code and optional numeric status:
`configuration`, `invalid_reference`, `malformed_response`, `unauthorized`,
`forbidden`, `not_found`, `rate_limited`, `provider_unavailable`, `http_error`,
`network`, `timeout`, `response_too_large`, or `pagination_limit`.
Provider bodies, exception causes, request URLs, credentials, and headers are
never attached to errors or logged by this module.

## Verification and optional sandbox read

Run the mocked tests with:

```powershell
npx vitest run tests/unit/paddle-catalogue.test.ts tests/unit/network-boundary.test.ts
```

The shared unit setup prohibits ambient fetch, TCP (including HTTP clients), and
UDP. Tests inject synthetic responses and generate nonfunctional key material in
memory. The suite covers normalization, omission of unknown fields, money,
recurrence, trials, archived records, pagination, malformed input, reference
handling, status failures, retries, timeouts, response bounds, redaction, server
configuration, and the GET-only surface.

Verification: 93 focused tests pass; strict standalone TypeScript checking and
targeted ESLint/Prettier checks pass. The full suite has one pre-existing
`MIGRATION_CONTENT_DRIFT` failure in staging certification: committed main has
165 migrations while its frozen manifest approves 162. The three newly merged
billing migrations are absent from that manifest; none of the approved hashes
changed. This lane does not alter migrations or repair that unrelated manifest.

Optional sandbox read was skipped: the current process did not have the required
sandbox configuration. No real Paddle request was performed.

## PADDLE-CATALOGUE-01 dependency and conflict assessment

This branch starts at merged main `3e27627` and imports nothing from the unmerged
PADDLE-CATALOGUE-01 branch. Its four new server files and new test/doc files are
isolated. The only shared existing file edited is `tests/unit/setup.ts` for network
denial; that file is the likely textual conflict point if PC1 also changes test
setup. No matching PC1 remote branch was advertised during inspection, so an
actual two-branch merge was not verified.

After PC1 merges, a separate trusted server integration must consume
`PaddleCatalogueCapability`, compare retrieved product/price observations against
explicit operator-selected canonical RepSync identity and expected commercial
facts, and pass only verified results through PC1's publication workflow. That
bridge must validate environment, exact product-price association, active status,
money/storage bounds, recurrence, trial, quantity, tax policy, and unsupported
override flags; refresh observations before publication rather than assuming a
list is an atomic snapshot. The final PC1 verifier/publication signatures are an
integration dependency, not assumed or implemented here. The transport must
remain unaware of database RPCs, and no observation can be substituted for an
existing verified payment receipt. Publication and sales activation remain
separate explicitly authorized work.

API semantics checked against Paddle's official
[authentication](https://developer.paddle.com/api-reference/about/authentication/),
[products](https://developer.paddle.com/api-reference/products/list-products/),
[prices](https://developer.paddle.com/api-reference/prices/list-prices/), and
[pagination](https://developer.paddle.com/api-reference/about/pagination/) references.
