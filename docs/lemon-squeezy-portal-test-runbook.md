# Customer Portal configuration and proof runbook

This PR performs no remote Supabase or Lemon Squeezy action. Local tests use synthetic provider responses, worker-isolated identities and local database transactions. They do not prove a real test-mode portal or live self-service billing.

## Required Store configuration

An operator must separately verify the following for both the test and live Store contexts. Never assume test configuration establishes live configuration. Dashboard capability labels and available switches must be checked in the actual Store. If any prohibited capability cannot be disabled, do not enable this integration until that operational gap is resolved.

| Capability                                   | Required setting |
| -------------------------------------------- | ---------------- |
| Billing history                              | Enabled          |
| Payment method management                    | Enabled          |
| Customer/billing information                 | Enabled          |
| Tax ID                                       | Enabled          |
| Cancellation and resumption                  | Enabled          |
| Upgrade/downgrade Product or Variant changes | Disabled         |
| Monthly/annual cadence changes               | Disabled         |
| Pause/unpause                                | Disabled         |
| Seat/quantity changes                        | Disabled         |
| Coupons/promotions                           | Disabled         |

The back link for each environment is its RepSync application origin plus `/pt-hub/settings/billing?portal=return`. Provider-issued URLs are consumed as returned; RepSync never appends a redirect parameter to a signed URL. [The official portal guide](https://docs.lemonsqueezy.com/help/online-store/customer-portal) describes signed access and custom domains; [Subscription URLs](https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object) document the two selected URL fields.

Server configuration uses existing BILLING_PROVIDER_ENVIRONMENT, BILLING_APP_BASE_URL, LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_WEBHOOK_SECRET plus BILLING_PORTAL_ALLOWED_HOSTS. Keep these server-only. The allowlist contains exact verified provider Store/custom-domain hosts for that environment. Never configure production with a local callback URL. Secrets and actual signed links do not belong in this document.

Webhook subscriptions must include subscription_created, subscription_updated, subscription_cancelled, subscription_resumed, subscription_expired, subscription_payment_failed, subscription_payment_success, subscription_payment_recovered and subscription_plan_changed. Existing pause/unpause events remain safely reconciled but no pause controls are offered by RepSync.

## Deterministic local verification

Run local start/reset/lint/pgTAP, focused billing-provider/portal/component tests, all affected Edge Function Deno checks, lint, format, build and the full unit suite. Compare exact failure identities with merged main. Run the Billing browser files and original auth pair with four workers/zero retries, then run verify:release twice consecutively on unchanged implementation/test files. Preserve inherited failure/skip evidence explicitly.

SQL proves owner resolution, private-table denials, future cancellation, resume, recovery, duplicate/stale behavior, expiry and plan/capacity preservation. Injectable handler tests prove authorization failures and exact provider identity rechecks, URL validation, no-store, provider failures and no capability logging. Browser fixtures run the real portal handler with a fake provider and mocked canonical reads; they do not exercise deployed Edge Functions. Browser return tests prove query cleanup, bounded polling and manual refetch of summary/capacity.

## Separately authorized real test-mode proof

Only after explicit approval naming the remote resources, an operator should verify the Store settings above and exercise fresh portal retrieval, cancellation with future ends_at, resumption before expiry, payment-method update, failed-payment recovery and verified webhook reconciliation. Verify the corresponding local paid row remains unique and its approved plan/capacity stays unchanged. Confirm disabled plan/cadence/pause/quantity controls in the actual portal. Record safe outcomes and timestamps, never a capability, API key, signature, identity/payment data or raw response.

Code cannot prove dashboard settings until this real test-mode workflow is exercised. Live Store configuration and deployment require separate approval even after successful test-mode proof. No live-enabled verdict is warranted from deterministic tests alone.

Rollback preserves commercial history: revert the application and use a reviewed compensating migration for the new/changed RPCs. Do not delete provider history or edit deployed historical migrations. PR-PRICE-07 must supply approved plan-change operations before the disabled plan/cadence capabilities can be considered.
