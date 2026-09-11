# Lemon Squeezy Customer Portal

PR-PRICE-06 adds hosted billing management for existing provider-linked paid history. The provider owns billing history, payment methods, billing information, tax ID, cancellation and resumption. RepSync retains canonical entitlements and capacity; portal navigation never changes them.

## Owner authorization and retrieval

`billing-create-customer-portal-link` accepts exactly `{ purpose: "manage_billing" | "update_payment_method" }`. It authenticates the Supabase user and resolves that user's canonical PT profile, owned billing account, current local subscription and Lemon Squeezy linkage through a service-only RPC. The browser cannot choose an account, environment, Store, customer, subscription or destination. Another coach may manage their own paid account, but cannot target another owner's account. Clients and anonymous callers are denied.

The existing adapter retrieves the Subscription on every click and extracts only identity, status and the two relevant URL fields. Provider/environment/Store/customer/subscription identity must match the database. Ownership and current linkage are rechecked after retrieval. Update-payment-method requires local past_due/grace and provider past_due/unpaid; expired history may open Manage billing but does not advertise payment recovery. No second provider client is introduced.

## Canonical lifecycle

Cancellation with future `ends_at` remains local active with full access and `cancel_at_period_end=true`. Billing displays its date and directs the owner to Manage billing to resume before then. Resumption clears cancellation and obsolete provider end/expiry projections, retaining the original plan, cadence and paid row. Expiration uses the existing expired contract and permits new Checkout when otherwise eligible.

Past_due retains full access and offers both billing actions. Unpaid maps to grace and existing-delivery-only access. Recovery follows verified current provider active state; no local retry dates or timers emulate the provider's payment schedule.

`subscription_plan_changed` is supported as a reconciliation signal. For an existing link, any changed Product, Variant or Price records `BILLING_UNAPPROVED_PLAN_CHANGE`, preserves the entire local subscription and capacity, marks provider reconciliation manual_review, and durably acknowledges the delivery as ignored. No approved plan-change operation exists in this PR. Price identity includes cadence: [Lemon Squeezy retains old immutable prices and creates a new Price when pricing changes](https://docs.lemonsqueezy.com/api/prices/the-price-object). Renewal timestamps are not cadence evidence. PR-PRICE-07 must introduce an explicit approved local operation before any plan/cadence change can be accepted.

## Billing and portal return

Billing retains its entitlement card, capacity meters and eligible Checkout. Its local provider summary supplies safe status, cancellation date, reconciliation health, a snapshot revision and whether durable deliveries are pending. Provider IDs and signed URLs are absent.

`/pt-hub/settings/billing?portal=return` is a navigation hint. Handling removes only `portal`, refreshes entitlements, provider summary and capacity, and checks every two seconds for at most thirty seconds. Canonical cancellation/expiration/manual-review, a detected change or an error ends polling early. No change produces a neutral message and manual Refresh; pending reconciliation remains explicitly pending. A resumed message requires an observed canonical cancellation-to-active transition. Returning without a pre-navigation baseline cannot establish that a payment method was updated. Refresh remains available after polling and on errors.

Portal queries/mutations mount only inside Billing. AuthProvider, ThemeProvider, login, callback destination logic, bootstrap and global startup do not load provider state.

## Migration and limits

One forward migration, `20260911020000_billing_customer_portal.sql`, adds narrow read RPCs and replaces reconciliation. It adds no table or column, rewrites no commercial data, and does not edit prior migrations. Existing RLS and direct-table denials remain. Rollback is application revert plus a reviewed compensating migration restoring prior functions while preserving billing history.

Upgrades, downgrades, cadence changes, proration, additional seats, pause controls, invoices API/UI, refunds, coupons, client payments, commissions and live deployment are deferred. The hosted portal can display provider billing history; RepSync does not add an invoice-list API or UI.

See [security](lemon-squeezy-portal-security.md), [Store configuration and proof runbook](lemon-squeezy-portal-test-runbook.md), and [verification](pr-price-06-verification.md).

Controlled plan switching is implemented separately in [PR-PRICE-07](lemon-squeezy-plan-changes.md).
