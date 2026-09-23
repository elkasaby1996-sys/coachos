# Paddle identity supersession

Paddle customer and subscription rows are immutable provider shadows. Each billing account, provider, and environment has one current customer identity; older customer and subscription shadows remain queryable with `superseded` status and forward links to their replacements. The append-only transition ledger binds each replacement to its verified event evidence and correlated checkout without copying provider payloads or credentials.

Evidence strength is ordered conservatively: ambiguous pre-existing rows are `unknown_legacy`, retained certification-fixture rows may be classified `certification_fixture` only from exact fixture, webhook, checkout, and zero-authority lineage, and newly admitted signed events create `verified_provider_event` identities. Provider reference prefixes do not establish provenance.

Automatic supersession is limited to `subscription.created` in the Sandbox/test environment. The event must correlate to a persisted non-fixture checkout for the same account, its active verified mappings and item snapshot must match, and the old certification identity must have no canonical subscription, payment application, approved seat, entitlement, or capacity authority. The transition, new shadows, event evidence, and ledger row commit atomically under the existing account and Paddle ingress locks.

A different real identity or an `unknown_legacy` identity remains an identity conflict and requires manual review. Live identities are never automatically superseded. Late events for a superseded subscription are retained as stale evidence and cannot reactivate it; exact replay reuses the stored event and does not create another transition.

Supersession records provider evidence only. It does not link an account subscription, approve seats, apply a payment, grant entitlements or capacity, change sales or reconciliation policy, call Paddle, or transition checkout state.

Local verification is covered by `paddle_identity_supersession.sql`, the migration-boundary backfill harness, and the real-session concurrency harness. These tests use synthetic identifiers and a disposable local Supabase database.
