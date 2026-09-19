# PADDLE-WEBHOOK-01-PREP

Branch: `codex/paddle-webhook-01-prep`, based on merged main `55b883d`.

This dormant server capability verifies a notification signature and returns
sanitized provider observations. For the three explicitly supported event types,
it also returns an instance-bound merged `VerifiedEventV2` receipt. It has no
deployed endpoint, network client, persistence dependency, reconciliation action,
checkout, or commercial effect. Catalogue publication and Lemon Squeezy are unchanged.

## Trusted configuration

`createPaddleSandboxWebhookVerifier` accepts trusted server composition only:

- `environment`: exactly `test`.
- `secrets`: one or two `{ environment: "sandbox", value: string }` entries from
  the notification destination's secret store. Two allow a bounded rotation
  overlap. Empty, repeated, malformed, mixed/live, or unknown settings fail closed.
- `now`: optional trusted epoch-millisecond clock; defaults to `Date.now` and may
  be fixed in tests. Timestamp tolerance is fixed at five seconds, not supplied by
  requests or configurable to disable replay-window checking.

No environment variables are read by this module. Secret strings are captured at
composition and used literally, without base64/hex decoding or trimming. Tests use
clearly synthetic, deterministic strings. No real secret is needed.

Paddle notification secrets do not encode sandbox/live provenance. Trusted
composition must attest that the secret was obtained for a sandbox destination;
cryptography cannot detect a live secret falsely labeled sandbox by trusted code.
The API deliberately has no generic-secret fallback, destination selector, or
browser configuration. Unknown fields (including alternate live secrets) are rejected.

## Request boundary and signature verification

`verify({ method, headers, rawBody })` accepts POST and a byte array. `headers` is
an array of original name/value pairs, not a pre-collapsed `Headers` object. Future
ingress must preserve duplicate-header visibility (or reject coalesced signature
values) and impose a streaming body limit before allocating the body passed here.

The capability enforces:

- A nonempty body of at most 262,144 bytes and a private plain `Uint8Array` copy
  before the first asynchronous operation. Buffer views are copied, not sliced;
  SharedArrayBuffer-backed bodies are rejected. Callers cannot mutate retained bytes.
- At most 64 header entries and 16 KiB of header names/values.
- Exactly one case-insensitive `Paddle-Signature` entry; combined/comma forms and
  duplicate entries are rejected. The bounded grammar is
  `ts=<positive epoch seconds>;h1=<64 hex characters>` with up to eight `h1`
  components. Duplicate `ts`, unknown fields, whitespace variants, bad hex, and
  oversized representations are rejected. Duplicate valid `h1` values are harmless
  and count toward the eight-signature bound.
- JSON UTF-8 content type, absent/identity content encoding, and exact byte length
  when Content-Length is present. Unsupported encoding, signed invalid UTF-8,
  BOM-prefixed JSON, and invalid JSON fail closed.
- HMAC-SHA256 of timestamp text, a literal colon, and exact body bytes. JSON is
  neither decoded nor parsed before authentication. All signatures are compared
  against all configured keys, without an early return on a match.
- Native `node:crypto` `timingSafeEqual` over fixed 32-byte digests. Tests exercise
  equality, differing positions, and public length rejection; they do not claim to
  statistically prove runtime timing. The intended server runtime must support
  the Node crypto compatibility module (Node and compatible Deno runtimes).
- Both past and future signature timestamps must fall within five seconds of the
  trusted clock, at whole-second precision. This checks delivery freshness, not
  the age of the event's `occurred_at`.

Static public errors contain only a code: `configuration`, `request_invalid`,
`body_too_large`, `signature_header_invalid`, `timestamp_outside_tolerance`,
`signature_invalid`, `event_invalid`, `receipt_invalid`, or `verification_failed`.
Raw bytes, headers, signature material, secrets, provider payloads, and unexpected
exception causes are not logged or attached to errors.

## Envelope and observations

Only after authentication, require an object envelope containing `event_id`,
`event_type`, `occurred_at`, `notification_id`, and object `data`. References remain
opaque exact strings with the merged proof reference bounds. Unknown fields at
every level are dropped; no spread of provider data enters retained proof.

Observed timestamps retain their exact spelling, fractional precision (up to
nanoseconds), and UTC offset. Calendar rollover, invalid dates, unrepresentable
years, and leap seconds are rejected. No arrival timestamp substitutes for provider time.

| Event                   | Retained data facts                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `transaction.completed` | Transaction, subscription/customer references; observed completed status; currency; bounded price/product/quantity/unit-money items |
| `subscription.created`  | Subscription/customer references; observed state and item state; optional transaction correlation                                   |
| `subscription.updated`  | Subscription/customer references; observed state and item state; no invented transaction correlation                                |
| Other event names       | Exact envelope facts and explicit `unsupported` / `event_type_not_supported`; provider `data` is discarded                          |

Items are limited to 32 and use positive bounded integer quantities. Amounts stay
nonnegative integer minor-unit strings (up to 35 digits), with uppercase
three-letter currency representations. These are observed price facts, not
settlement arithmetic. The transaction observation deliberately does not assert
paid amount, settlement/completion time, validated payment attempts, access, or
RepSync commercial identity. Unsupported/malformed facts in a supported event fail
closed instead of creating optimistic evidence.

## Merged receipt integration and replay facts

The capability privately composes `createVerifiedEvidenceBoundaryV2`; it does not
change that boundary, the proof parser, SQL, or catalogue code. Only the private
authenticated verifier can supply an event proof to mint `VerifiedEventV2`.
Mandatory subscription/transaction retrieval slots throw and are not exposed.
No subscription or transaction receipt is minted from nested webhook JSON.

The public surface is just `verify` and `readReplayFacts`. The latter validates the
token using the merged boundary and the instance's observation WeakMap, and
returns fresh copies. Forged, copied, cross-instance, and cross-environment tokens
fail. Real receipts are frozen, nonserializable, and contain no provider facts.
Concurrent verifications never share mutable per-request observation state.

Replay facts contain `provider`, `environment`, `eventRef`, `notificationRef`,
`eventType`, `occurredAt`, `rawPayloadSha256`, and sanitized `observation`:

- `eventRef` is logical event identity.
- `notificationRef` is delivery identity, never a deduplication key for events.
- `rawPayloadSha256` hashes exact received bytes; whitespace changes produce
  different delivery evidence even when logical event identity is unchanged.
- `occurredAt` is exact provider event time, never receipt/arrival time.

Two explicit compatibility limits preserve the merged contract:

1. Its event proof requires millisecond UTC timestamps, so only its internal
   `eventEvidence.occurredAt` is projected to milliseconds. Exact provider time is
   retained in replay facts and observations; no migration changes this contract.
2. Its event proof can describe only a transaction or subscription resource.
   Unknown event types therefore return an authenticated unsupported observation,
   replay facts, and `receipt: null`. They are not assigned fabricated resource
   semantics. Later explicit failure/recovery handlers can reuse the same signature
   verifier and receipt provenance when their resource contract is reviewed.

The subscription-created transaction correlation remains in the observation;
the merged subscription-event proof requires `identity.transactionRef = null`.
This is not a loss of correlation in replay facts and is not transaction proof.

No replay deduplication, SQL argument surface, DB writer, payment application,
entitlement function, production route, or provider API call is reachable from
this capability. Valid signatures, active subscription states, completed transaction
observations, event receipts, and unsupported events do not grant payment/access.

## Verification

The synthetic test suite exercises raw-byte signatures, header ambiguity, rotation,
timestamp boundaries, native comparison behavior, body/header limits, encoding,
envelope validation, all observation variants, redaction, mutable-input snapshots,
concurrency, replay identity, receipt forgery/isolation, and payment/access hard stops.
The existing unit network guard remains active for fetch and sockets.

Focused and regression command:

```powershell
npx vitest run tests/unit/paddle-webhook.test.ts tests/unit/billing-verified-evidence.test.ts tests/unit/billing-catalogue-publication.test.ts tests/unit/paddle-catalogue.test.ts tests/unit/network-boundary.test.ts tests/unit/billing-adapter.test.ts tests/unit/billing-commercial-ports.test.ts tests/unit/billing-provider.test.ts
```

Strict server check:

```powershell
npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --skipLibCheck supabase/functions/_shared/paddle-webhook/index.ts tests/unit/paddle-webhook.test.ts
```

No real Paddle credentials, IDs, API requests, or webhook deliveries are used.

Results: 110 focused webhook tests pass; the eight-file regression selection passes
438 tests. The full unit suite passes 2,628 tests across 276 files. Strict server
TypeScript, application build/typecheck, targeted server ESLint, repository lint,
Prettier, and diff checks pass. Repository lint retains three unrelated existing
frontend warnings. The credential/private-key/provider-ID pattern scan finds no
matches in the six new files.

## OFFICE PC PADDLE-CATALOGUE-02 overlap

All six files are new: four modules under `_shared/paddle-webhook`, one unit-test
file, and this document. No merged authority/publication, receipt-boundary, migration,
Lemon Squeezy, shared setup, or configuration files are edited. Textual conflict risk
is low unless OFFICE PC adds the same paths. Both lanes may consume the existing
receipt boundary; its contract remains unchanged here. No advertised PC2 remote
branch was available during inspection, so an actual two-branch merge comparison
was not possible. Review any future shared-boundary changes semantically.

Provider contracts checked against official Paddle documentation:
[signature verification](https://developer.paddle.com/webhooks/about/signature-verification/),
[transaction.completed](https://developer.paddle.com/webhooks/transactions/transaction-completed/),
[subscription.created](https://developer.paddle.com/webhooks/subscriptions/subscription-created/),
and [subscription.updated](https://developer.paddle.com/webhooks/subscriptions/subscription-updated/).
