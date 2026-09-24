# Paddle output privacy policy

This policy applies only at output boundaries. Never redact provider requests,
database rows, checkout navigation, entitlement inputs or reconciliation comparisons.

## Verified incident

Purchase #2's browser accessibility snapshot was read with automatic emission
disabled, then manually regex-replaced and passed to `nodeRepl.write`. The recorded
tool call omitted a checkout prefix and matched only alphanumeric characters after
other prefixes. An underscore-separated checkout reference therefore escaped the
manual filter. Investigation inspected the call's structure without redisplaying
the historical value. The historical disclosure remains part of the record.

## Shared boundary

`src/lib/redact-billing-private-values.ts` owns the policy. The original
`redactHostedPaymentUrls` export delegates to it, retaining compatibility with all
four Sentry hooks: breadcrumbs, events, logs and transactions. The policy protects:

- Checkout, transaction, customer, subscription, notification, event, resource,
  product and price references, including bare checkout references and underscore
  suffixes under arbitrary keys or in text.
- Camel-case and underscore semantic reference/ID fields, user/account UUIDs,
  signatures, signed URLs, portal/payment capabilities and credential fields.
- Payment URLs, including the existing Lemon Squeezy and custom billing paths.
- Nested objects, arrays, object keys, Error details and JSON diagnostics.

Closed replacement labels are idempotent. The input is never mutated. Accessors
and custom serialization functions are not executed; cyclic data is bounded.
Ordinary prose, numbers, state names and public nonpayment URLs are preserved.

`scripts/billing-operator-output.mjs` provides `log`, `error`, `table`, `report`,
`serialize` and session-local `alias`. Reports are sanitized before their first
write. Aliases use per-category counters (CHECKOUT-A, TX-A, CUSTOMER-A,
SUBSCRIPTION-A, EVENT-A); mappings exist only in process memory and encode no source
bytes. Do not persist the mapping or raw snapshots for later redaction.

For browser diagnostics, call `emitBillingSnapshot(tab, emit)`. It requests
`getAXState({ emit: false })`, sanitizes the result or error, and only then invokes
the supplied display callback. Never emit raw snapshots, auto-emitting browser
captures, private screenshots, raw SQL/provider responses, or ad hoc regex output
from a certification task. This is the replacement for the historical temporary
purchase runner's manual rendering step. Historical private temporary runners are
not approved reusable certification entrypoints; do not rerun them.

The Paddle preflight/legal CLIs and staging commercial plan, catalogue, evidence,
preflight and apply CLIs use the boundary for console output and human reports.
Machine authorization input is deliberately unchanged: it is validated independently
and must not be transformed into a display artifact. The provider/remote-stage
modules have no direct display sinks. Python database migration/concurrency
harnesses operate on disposable synthetic fixtures; they are not remote purchase
certification entrypoints. No database or Deno runtime path changed.

Redaction is defense in depth, not permission to publish arbitrary data. Unknown
opaque secrets require a semantic field; prefer allowlisted counts, booleans and
state names. Sanitize structured values before interpolating them into prose.

## Local verification

`tests/unit/billing-output-redaction.test.ts` exercises synthetic references and
opaque semantic-field canaries through nested values, keys, strings, JSON, errors,
browser snapshot output and actual mocked Sentry callbacks. It starts
`scripts/test-billing-output.mjs` in a child process and independently scans stdout,
stderr and both generated report formats. Fixtures are visibly synthetic. The
harness imports no remote client and makes no provider or database call.

## Purchase #2 evidence revalidation

This is revalidation of the retained certification evidence, not a fresh remote
state observation. No new purchase or remote read is needed for this remediation.
The prior evidence records two commercial Paddle transactions, two payment
applications and two canonical links. The control subscription is paid/active
Growth Monthly, reconciliation processed, checkout completed, one base item,
zero seat items and zero approved seats. Effective capacity is 50 clients,
two coach seats, three workspaces and unlimited packages.

Operator reconciliation calls and unknown transaction references were zero.
The retained row fingerprints across 40 tables preserve all pre-existing rows,
including the first purchase; Lemon Squeezy and production were unchanged.
The retained sanitized notification evidence contains both genuine lifecycle
events, delivered once each with HTTP 200 and matched to retained events.
The original pilot was restored; the final certified sales and reconciliation
flags were both false. This local task does not change those established results
or assert that remote state has been freshly observed.

## Changed-file inventory

- `src/lib/redact-billing-private-values.ts`
- `src/lib/redact-hosted-payment-urls.ts`
- `scripts/billing-operator-output.mjs`
- `scripts/test-billing-output.mjs`
- `scripts/paddle-catalogue-preflight.ts`
- `scripts/paddle-legal-readiness.ts`
- `scripts/staging-commercial-apply.mjs`
- `scripts/staging-commercial-catalogue.mjs`
- `scripts/staging-commercial-evidence.mjs`
- `scripts/staging-commercial-plan.mjs`
- `scripts/staging-commercial-preflight.mjs`
- `tests/fixtures/billing-output-canaries.mjs`
- `tests/unit/billing-output-redaction.test.ts`
- `tests/unit/staging-commercial-preflight.test.ts`
- `docs/paddle-output-redaction.md`
- `output/paddle-output-redaction/verification.json`

## Remediation results

The final local unit run passed 3,143 tests across 287 files, including 44 redaction
tests. No test was skipped and no timeout was increased. Full-suite execution used
one worker after an initial concurrent run exceeded the existing five-second limit
in a disposable Git fixture test. An output-boundary source assertion was updated
to require the sanitized error sink. Checkout, browser-provider, webhook,
reconciliation-related, entitlement, portal and Lemon Squeezy unit regressions
passed. Database and Deno runtime paths were not changed, so their suites were not
rerun.

Synthetic stdout, stderr, JSON/Markdown reports and all four mocked Sentry hooks
had zero surviving private canaries. Changed files and sanitized artifacts had
zero unexpected provider/secret/known pilot-identity matches. The raw unit reporter
contained an existing deliberately overlength repeated-character fixture in two
test titles; it was not real provider evidence. Only the sanitized reporter is
retained outside the repository. No private provider value was added to the tests.

Strict TypeScript, production build, lint and diff whitespace checks passed. Lint
retains three unrelated pre-existing warnings. No provider calls, new purchase,
staging writes, production writes, commit or deployment occurred in this task.
