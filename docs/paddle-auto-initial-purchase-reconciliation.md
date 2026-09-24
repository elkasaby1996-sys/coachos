# Paddle automatic initial-purchase reconciliation

LOCAL ONLY implementation on `codex/paddle-auto-reconciliation-01`, based on
merged main `7662fd131355303731e32146e2b0ecbe0fdf6392`. No deployment, provider
calls, remote policy changes, or hosted data writes are part of this task.

## Audited boundary and authority

Before this change, the Paddle Edge ingress made one service RPC, retained
verified evidence, and stopped. The reviewed initial reconciler read durable
retained evidence and left the checkout `ready` after activation.
[PostgREST runs each request in its own transaction](https://docs.postgrest.org/en/stable/references/transactions.html).
The second RPC is separately awaited only after successful ingestion returns.
Thus dispatcher failure cannot roll back the preceding ingress commit.

The final chain is:

Paddle signature → committed verified evidence → service-only event dispatcher
→ independent initial-purchase reconciler proof → payment application
→ canonical paid subscription/origin/item/link → checkout completion
→ existing canonical entitlement/capacity readers.

Webhook verification is not payment authority. Neither an event name nor provider
status grants access. The existing `paddle-initial-purchase-v1` proof and
`paddle-reconciliation-v1` validator remain unchanged. Provider mappings,
checkout provenance, completed payment evidence, identity, zero seats,
environment and cross-ledger exclusion are independently validated by
`reconcile_paddle_initial_purchase_v1(uuid,text)`.

## Closed contracts

`ingest_verified_paddle_event_v1` now returns exactly:

```ts
{ accepted: true, reused: boolean, eventId: string, eventType:
  "transaction.completed" | "subscription.created" | "subscription.updated" }
```

`eventId` is an internal UUID, stable across exact replay and a new notification
for the same logical event. No provider refs, account/user identities, raw proof,
signature or observation are returned. This result remains service-internal;
the HTTP body is still only `accepted` or `rejected`.

`reconcile_paddle_initial_purchase_event_v1(p_event uuid)` accepts only that
internal UUID. It returns exactly `{ status }`:

| Status           | Meaning                                                     |
| ---------------- | ----------------------------------------------------------- |
| `disabled`       | Reconciliation flag false; no authority call or state write |
| `not_applicable` | Event is outside the two initial-purchase event kinds       |
| `pending`        | Complementary retained evidence has not arrived             |
| `applied`        | Reviewed initial reconciler committed first activation      |
| `reused`         | Reviewed reconciler verified the existing exact effect      |

The dispatcher uses SECURITY DEFINER to access private retained evidence and the
existing authority boundary. Owner is `postgres`, search path is fixed to
`pg_catalog,public`, and EXECUTE is service_role only (plus trusted owner/admin).
PUBLIC, anon and authenticated have no execution grant; no table grant is added.
The TypeScript database port has a closed union of the two RPC names and argument
shapes, and validates exact result keys, types, event identity and supported kind.

The dispatcher holds the policy share lock, then the existing billing account
lock, and re-reads the shadow after locking. It never acquires the ingress
advisory lock. Ingress keeps its existing account → ingress order. Presence of
counterpart evidence includes manual-review evidence; proof failure cannot be
misreported as pending. Missing account/correlation after a counterpart exists
is a sanitized hard failure. Unexpected SQL exceptions propagate to Edge.

## Delivery and failure behavior

For transaction-first delivery, ingress retains the transaction and dispatch
returns pending. The subsequent subscription-created ingress commits the current
identity/shadow; its dispatcher activates. Subscription-first delivery works in
the reverse order. Normal ordering requires no redelivery.

Disabled, pending, applied and reused return HTTP 200. `subscription.updated`
only ingests; Edge does not call initial-purchase dispatch. Authenticated
unsupported events retain the existing acknowledgment behavior.

Ingestion failure, malformed RPC output, hard proof rejection and unexpected
dispatcher failure return generic HTTP 503. Paddle retry can then reuse committed
ingestion and retry the dispatcher without duplicating evidence or authority.
The Edge response never exposes database errors or private reconciliation facts.

With reconciliation disabled, evidence ingestion and reviewed identity
supersession remain available, but no payment, canonical link, entitlement effect
or checkout completion is added. Sales remains separately gated.

## Atomic checkout completion and compatibility

The existing reconciler now completes the matching `ready` checkout in its own
transaction, setting `completed_subscription_id` to the current provider shadow
and `completed_at` to `clock_timestamp()`, the application lifecycle transition
time. This is not a provider payment timestamp. All authority writes and checkout
completion commit or roll back together, including deferred item validators.

An exact retry of a correctly completed checkout does not update its immutable
terminal row or timestamp. A processed subscription with a still-ready checkout
can complete it only after the full existing proof, canonical origin, payment,
item and link checks succeed and reconciliation is explicitly enabled. The
migration does not repair any row. A mismatched completed checkout fails closed.
A forced completion failure rolls back all new authority while preserving the
previously committed ingestion evidence for safe retry.

Payment/checkout uniqueness, one-current canonical subscription and cross-ledger
LS guards remain unchanged. Approved extra seats remain zero. Existing canonical
readers derive Growth features and limits; no provider-specific entitlements are
introduced. Renewals, plan/seat changes, cancellations, refunds, proration,
positive seats and live activation remain unsupported.

## Rollout and containment

Migration: `20260923220540_paddle_auto_initial_purchase_reconciliation.sql`.
Deploying it alone is dormant and does not enable flags. A future separately
authorized deployment must apply the migration before the Edge change. The old
Edge accepts the extended ingestion result; the new Edge fails closed against an
old ingestion contract. No frontend change is needed.

Disabling reconciliation contains future authority calls while evidence continues
to ingest. It does not reverse committed purchases or entitlements. There is no
destructive down migration or automatic data repair. Any production rollout or
staging normalization requires separate authorization.

## Local verification

Synthetic fixtures only. The disposable project is
`repsync-paddle-reconciliation01`; application databases and hosted projects are
excluded. Run database tests sequentially with lint/advisors, avoiding known
pgTAP-versus-lint tooling contention. New verification entry points:

- `supabase/tests/paddle_auto_initial_purchase_reconciliation.sql`
- `scripts/test-paddle-auto-reconciliation-concurrency.py`
- `scripts/test-paddle-auto-reconciliation-migration.py`

The existing reconciliation regression runner retains all prior race proofs.
The populated migration test verifies unchanged data, existing RPC ACLs and all
unrelated function definitions, unchanged advisor findings, and no automatic
completion of an already-processed/ready checkout.

## Verified results

| Gate                                                | Result                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Full DB suite                                       | 2,225 assertions / 27 files passed                                                                                                      |
| New automatic reconciliation DB suite               | 50 assertions passed                                                                                                                    |
| Existing initial reconciliation suite               | 89 assertions passed                                                                                                                    |
| Full unit suite                                     | 3,099 tests / 286 files passed                                                                                                          |
| Webhook ingress units                               | 37 passed                                                                                                                               |
| New real-session concurrency                        | 11 cases, zero deadlocks                                                                                                                |
| Existing concurrency harnesses                      | 57 cases, zero deadlocks                                                                                                                |
| Populated migration boundary                        | Data unchanged; prior ACLs and unrelated functions unchanged; processed checkout stays ready                                            |
| Canonical result per successful fixture             | One payment, one paid Growth subscription, one canonical link, one base item, one completed checkout; zero extra seats                  |
| Entitlement/capacity                                | Existing canonical Growth feature and capacity readers pass; 50 clients, two included coach seats, three workspaces, unlimited packages |
| LS/cross-ledger regressions                         | Pass; conflicting obligation rejects Paddle activation                                                                                  |
| Strict TypeScript / Deno / build                    | Pass                                                                                                                                    |
| ESLint                                              | Zero errors; three existing warnings                                                                                                    |
| Prettier / git diff check                           | Pass                                                                                                                                    |
| Clean-schema DB lint                                | Zero findings                                                                                                                           |
| Advisors                                            | 50 unchanged baseline warnings; zero new                                                                                                |
| Migration manifest                                  | 174 total; one new migration; previous 173 hashes unchanged                                                                             |
| Provider calls / staging writes / production writes | 0 / 0 / 0                                                                                                                               |
| Leakage                                             | No credentials, real provider references, private evidence or env files in the change                                                   |

The first overlapping unit run timed out in two repository-scanning tests.
The authoritative sequential full run passed without changing tests or timeouts.
An initial advisor comparison included 26 warnings from disposable fixture-helper
functions; the harness now removes that helper schema while retaining all public
billing data before comparing deployed-schema advisors. The unchanged 50-warning
baseline then passed. DB lint and pgTAP ran sequentially; no tooling deadlock
occurred. The final disposable database was reconstructed with both flags false.

## Reviewed change inventory

1. `config/staging-commercial-certification.json`
2. `docs/staging-commercial-deployment-manifest.md`
3. `docs/paddle-auto-initial-purchase-reconciliation.md`
4. `scripts/test-paddle-auto-reconciliation-concurrency.py`
5. `scripts/test-paddle-auto-reconciliation-migration.py`
6. `supabase/functions/_shared/paddle-webhook/ingress.ts`
7. `supabase/migrations/20260923220540_paddle_auto_initial_purchase_reconciliation.sql`
8. `supabase/tests/fixtures/paddle_auto_reconciliation_fixture.psql`
9. `supabase/tests/paddle_auto_initial_purchase_reconciliation.sql`
10. `tests/unit/paddle-webhook-ingress.test.ts`

No commit, deployment, CI-classification change, policy enablement or hosted
configured-account execution is included.
