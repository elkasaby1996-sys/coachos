# Plan-change test runbook

Normal verification uses local Supabase and injected fake provider state. No Lemon Squeezy API credential, external subscription, charge or Store setting is required. Start from merged PR-PRICE-06 and record the full-unit baseline before edits.

1. Run local start, clean database reset, database lint and all pgTAP files. SQL tests roll back synthetic mappings and accounts.
2. Run targeted provider/handler/contracts/component tests and Deno checks for all seven Billing endpoints.
3. Run lint, formatting, build and full units. Compare failing file plus full test name with baseline; inherited failures are not a green-unit verdict.
4. Run Billing browser tests and the original auth pair with four workers and zero retries.
5. Run `npm run verify:release` twice consecutively on unchanged implementation and tests. Compare hashes and skipped test identities.

The plan-change browser fixture creates worker-isolated owners and real local paid/linkage rows. Six shared immutable synthetic mappings are inserted idempotently. Only the provider transport is injected: the real authenticated handler, SQL operation/preflight/reconciliation and capacity queries execute. Synthetic HMAC invoice deliveries exercise payment gating. The existing checkout/portal suites keep their own injected boundaries. Run database reset before SQL verification after browser fixtures; browser mappings intentionally remain local and must never be promoted to remote configuration.

Required negative cases include PayPal, unknown processor, wrong identity, stale/duplicate invoices, wrong billing reason, no-op/mixed direction, nonowner, over-capacity, pending/reserved commitments, data quality, mapping retirement, third mapping, response ambiguity and atomic rollback. Confirm no forbidden details appear in browser text or safe responses. Inspect the mobile preview and preserve its synthetic status when reporting evidence.

## Separate real test-mode proof

Real test-mode proof requires separate explicit authorization for named resources. It has not been performed by this implementation. A later authorized run must validate all six actual Variant/Price mappings, processor family, immediate updated invoice success/failure/recovery, period-end/cadence behavior, cancellation restoration, provider clock/order behavior, duplicate/out-of-order webhooks and the deployed function boundary. Verify the provider's renewal date behavior for each cadence transition. Record test-mode evidence separately from fixtures; never store signed URLs or credentials in source or artifacts.

Live enablement also requires approved function deployment, remote migration/mapping setup, Store configuration with Customer Portal plan switching disabled, and operational handling of ambiguous/manual-review states. Passing local tests is not authorization or proof for those changes. Seats, refunds, coupons, client payments and general feature enforcement remain outside this runbook.
