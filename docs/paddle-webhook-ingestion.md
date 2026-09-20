# Paddle webhook ingestion

`billing-paddle-webhook` composes the existing exact-byte Sandbox verifier with `ingest_verified_paddle_event_v1`. It is not deployed by this change. No Paddle API client or provider mutation is involved.

## Authentication and HTTP

The Edge Function accepts POST without a Supabase user JWT (`verify_jwt=false`). Authentication is the existing Paddle HMAC verifier, including its five-second timestamp tolerance. The body is streamed into a fixed 262,144-byte buffer, with declared and observed size checks. JSON parsing occurs only after exact-byte signature verification.

Fetch does not expose original wire header entries: it coalesces repeated fields. The adapter preserves the exposed values without splitting, trimming or reconstructing signatures. PREP rejects comma-coalesced signatures and repeated timestamp representations. Deployment must preserve this rejection behavior; it must never select one of multiple signature fields upstream.

Trusted configuration requires `PADDLE_ENVIRONMENT=sandbox` and `PADDLE_SANDBOX_WEBHOOK_SECRET`. Optional `PADDLE_SANDBOX_WEBHOOK_SECRET_PREVIOUS` permits exactly two distinct notification secrets during rotation. Missing, empty, duplicated or invalid secrets fail closed. Generic and live webhook secret variables are rejected. Secrets are notification endpoint secrets, not API keys; no values belong in repository files.

Invalid requests return static 400/413 responses; non-POST requests return 405. Authenticated unsupported events return 200 without creating a receipt or persistence call. Supported events return 200 only after the atomic RPC confirms durable acceptance; internal failures return static 503 for redelivery. No bodies, signatures, database errors or identifiers are logged or returned.

## Receipt and evidence boundary

Only a receipt minted by the composed verifier can be serialized by its `ingestionArguments` capability. Its private observation is independently cloned, so caller edits to the returned observation cannot affect persistence. The receipt is never imported from JSON.

The narrow service-only RPC validates closed proof/observation schemas, fixes provider/environment to Paddle/test, uses a fixed search path, and retains the existing `billing_verified_evidence_v2` authenticated-event proof. This is the merged receipt ledger; `billing_evidence_v2` remains the unchanged structural-only foundation. No synthetic structural proof is manufactured to bypass its constraints. Event evidence has `payment_authority=false` and cannot satisfy a payment application predicate.

`billing_webhook_events_v2` stores logical event identity. New append-only `billing_paddle_event_observations` and `billing_paddle_event_deliveries` tables retain sanitized item facts, exact occurrence timestamp, disposition, delivery identity, raw digest and verified-evidence linkage. Raw bodies are never retained. All direct DML is denied, including service-role DML, with RLS and history protection intact.

## Replay and correlation

Logical identity is the provider event reference. Its immutable sanitized observation excludes only notification identity; changing any other observation fact fails closed. An exact notification/body repeat returns idempotent success. A new notification for the same observation records additional delivery/evidence provenance without reapplying shadow state. Reusing a notification for another event or body fails closed and returns a retryable HTTP failure; operational review is required, not automatic repair.

Ownership comes only from an exact known checkout transaction reference or an existing immutable subscription/customer identity. Unknown events remain pending. A subscription update arriving before create is retained pending, without guessing ownership or automatically replaying it later. A subsequently correlated create may establish the shadow; the retained pending update remains for future separately authorized reconciliation. Existing shadows accept newer provider status snapshots; older observations remain stale evidence. Equal-timestamp contradictory state is retained for manual review. No provider item collection is promoted into reconciled canonical subscription items.

Known checkout item sets must match its stored base/seat mappings and quantities, active published prices, product provenance when supplied, USD amounts and immutable checkout snapshot. General subscription observations permit active or retired verified mappings, one base quantity of one, at most one extra-seat role, a common cadence and bounded purchased extras. Contradictions remain manual-review evidence and cannot create/update shadow state. Customer/subscription ownership changes and contradictory checkout identity claims fail closed.

No checkout state transition is performed. A known creating/ready/ambiguous checkout can supply correlation only when its transaction identity is already persisted; an ambiguous attempt without that identity stays pending. There is no provider retry or attempt creation.

## Locks and authority

Writers take policy/account locks in the existing order, then a Sandbox ingress advisory lock, then the merged logical-evidence lock. The coarse ingress lock serializes delivery/shadow uniqueness claims. If correlation becomes known after lock acquisition, the operation fails with a retryable category and rereads on redelivery rather than acquiring a new account out of order. Checkout writers never acquire the ingress lock.

Shadow subscriptions always retain null canonical links, zero approved seats and pending reconciliation. Sales and reconciliation flags are never modified. No canonical subscription, payment application, entitlement or access writer is invoked. Legacy Lemon Squeezy paths and prior migrations remain unchanged.

## Local verification

The pgTAP suite covers durable event/delivery replay, conflicts, checkout correlation, unknown ownership, item mismatch, shadow identity, chronological handling, privileges/history and unchanged entitlement/capacity results. The concurrency runner is restricted to the disposable local checkout proof container and uses observed PostgreSQL lock waits. Fixtures use synthetic identifiers only and the database must be reset afterward.
