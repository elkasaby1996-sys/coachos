# Paddle payment-method update — local server and browser boundary

RepSync does not create a Paddle Customer Portal session for this action. The
provider-neutral `PaymentMethodUpdateCapability` has one intent and routes by
the current subscription's trusted stored provider. Lemon Squeezy and unknown
subscriptions have no adapter here. R2B removes the browser portal flow; the
historical server portal endpoint remains unchanged for PAY-03 retirement.

## Durable preparation

`billing_payment_method_preparations_v2` records provider dispatch and result
state, not debt or a payment. A preparation is bound to a versioned canonical
authority snapshot and, for past-due recovery, the exact R2A1 obligation and
its authority revision. It has `creating`, `ready`, `ambiguous`, `completed`,
`failed`, and `canceled` states. There is deliberately no elapsed-time
`expired` outcome. A claim is committed before the mutation-sensitive Paddle
GET. A claimed uncertain request stays ambiguous and never issues a second
creation GET. An unclaimed lease may fail without claiming that Paddle did or
did not receive a request.

The trusted resolver requires Paddle reconciliation to be enabled before
reservation. Continuation authorization resolves authority again, so a policy
change during provider I/O withholds the transaction token. Sales enablement
is not required for an existing subscription's payment-method action.

The server uses the dedicated sandbox key
`PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY` with `transaction.write` and
`transaction.read`. Past-due release also requires adjustment visibility;
the transport fails closed if the dedicated key cannot return an explicit
adjustment list. It never falls back to checkout or general Paddle keys.
Live use is unsupported. No key is provisioned by this package.

## Mode and authority

For an active subscription, Paddle's generated transaction must have the
trusted customer/subscription, `subscription_payment_method_change` origin,
automatic collection, the current base and approved seat items, and zero
financial totals. The authenticated completion event is nonfinancial and
creates no payment application or entitlement.

For a past-due subscription, the server first resolves exactly one R2A1
`OutstandingBillingObligation` from retained authenticated evidence. The
Paddle endpoint must return that exact transaction with matching identity,
period, item set, amount, and currency. The transport verifies unadjusted
subtotal and tax arithmetic and requires an explicit empty adjustment list
before releasing a debt-collection continuation. A key that cannot expose
that list is insufficient for past-due release. A paid/completed provider response
withholds checkout while signed settlement catches up. Actual recovery still
requires R2A1's authenticated completion proof and unique `renewal` payment
application; `transaction.paid`, a browser callback, and the provider API
response are never payment proof.

## Continuation privacy

The creation endpoint is
`GET /subscriptions/{stored_subscription}/update-payment-method-transaction`.
Despite the verb, active use can create a transaction. A ready preparation
uses only `GET /transactions/{stored_transaction}` for inspection. Both use a
fixed sandbox origin, bounded JSON response, finite deadline, rejected
redirects, and no automatic retries. The browser request contains only
`{"intent":"update_payment_method"}`. The safe response contains the intent,
effect, and a one-use Paddle.js transaction token after durable attachment,
fresh authority verification, and inspection when reusing a ready row. No
provider URL, customer/subscription reference, raw receipt, or preparation ID
is returned. Continuations are never logged, persisted in browser storage, or
treated as settlement evidence.

Local verification uses only the disposable `repsync_reconciliation01`
database and mocked HTTP. Remote key provisioning, deployment, and
provider certification require separate authorization.

## RepSync browser billing management (R2B)

The PT Hub Billing tab now owns payment-method management. There is no broad
Customer Portal action or portal-return flow. Plan, seat and cancellation
authority remains in the existing RepSync workflows; scheduled cancellation
copy only describes verified paid access through the effective date.

The strict browser request contains only the intent. The response is parsed
against the reviewed intent/effect/continuation contract, then immediately
handed to a provider-neutral continuation registry. Only Paddle/test is
registered; unknown providers, historical Lemon Squeezy and live continuations
fail closed. No new-sales selector controls an existing subscription action.

The official `@paddle/paddle-js` wrapper initializes once per application page
with `environment: "sandbox"`. `VITE_PADDLE_SANDBOX_CLIENT_TOKEN` must contain
a sandbox client-side token (`test_` followed by bounded alphanumeric token
characters). Missing/malformed configuration fails before server preparation.
This public client-side token is distinct from all server API keys. No server
API key may have a `VITE_` prefix. Live client tokens are future release work.
The SDK load has a finite deadline and is not automatically retried.

Checkout opens with only `{ transactionId: continuation.token }`, using the
server-prepared transaction. It supplies no items, customer, email, prices,
subscription, URL or browser-selected financial identity. The activation
function returns void. React Query uses `retry: false` and `gcTime: 0`; no
continuation enters mutation data, component state, storage, URLs, telemetry
or logs. Browser errors expose only allowlisted safe messages.

Checkout close/completion callbacks are UI signals only; payloads are discarded.
They trigger a bounded 30-second refresh of payment-method state, provider
summary, account entitlements and capacity. Backend reconciliation remains
the only financial authority. The safe state RPC exposes coarse availability,
not preparation completion. Therefore active update-only completion remains
unconfirmed and offers manual refresh; the UI never invents a completion flag.
Past-due recovery is reflected only after fresh safe server state and processed
active provider summary agree. The recovery warning uses no catalogue-derived
amount. Pending or ambiguous requests cannot automatically prepare again.

Browser verification uses mocked SDK delivery and synthetic transactions on
the isolated `repsync_reconciliation01` local API. No real Paddle transaction
is opened. Remote client-token provisioning, hosted browser certification and
real provider certification are still pending and require separate authorization.

SDK contracts: [initialization](https://developer.paddle.com/paddle-js/methods/paddle-initialize/),
[existing-transaction checkout](https://developer.paddle.com/paddle-js/methods/paddle-checkout-open/),
[client-side tokens](https://developer.paddle.com/paddle-js/about/client-side-tokens/).

# PAY-02 R3 integration correction

The browser uses `get_my_billing_payment_method_state_v1()` for eligibility and
recovery verification. Its reference-free output is derived through the same
private canonical eligibility implementation as preparation. Existing canonical
entitlements provide display text only. Legacy provider summaries and LS linkage
rows provide neither eligibility nor recovery confirmation.

An originally past-due checkout is confirmed only when the safe backend state
becomes eligible active/update-only after authenticated reconciliation. Active
update-only checkouts remain unconfirmed by this projection. The 30-second
verification boundary and transport ambiguity fencing are unchanged.

The old customer-portal entrypoint is an inert compatibility tombstone. Its
historical capability implementation is unreachable from active entrypoints and
remains deferred to PAY-03. Future deployment must overwrite that endpoint with
the tombstone; no remote retirement or certification has occurred here.
