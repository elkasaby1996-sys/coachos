# RepSync subscriptions and coach seats

Implemented on `Ahmed-billing`: Paddle checkout for Launch, Growth, and Scale, monthly or annual subscriptions, seats purchased at checkout, subsequent seat changes, existing plan changes, payment-method updates, and Paddle customer portal access for invoices and cancellation. The merchant payment page is `/billing/checkout`.

Browser completion starts confirmation polling. Only paired, authenticated payment/subscription evidence grants access. Replays do not create another subscription, seat allocation, or payment application. Closing checkout does not confirm payment.

## Configuration

Use separate Supabase projects for sandbox and production. The database pins its environment after paid authority exists; do not convert an existing sandbox billing project into production.

| Setting                                                   | Sandbox                                       | Production                                 |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------ |
| Server `PADDLE_ENVIRONMENT`                               | `sandbox`                                     | `production`                               |
| Database `billing_runtime_policy.entitlement_environment` | `test`                                        | `live`                                     |
| Browser `VITE_PADDLE_ENVIRONMENT`                         | `sandbox`                                     | `production`                               |
| Browser `VITE_BILLING_PROVIDER`                           | `paddle`                                      | `paddle`                                   |
| Public browser token                                      | `VITE_PADDLE_SANDBOX_CLIENT_TOKEN` (`test_…`) | `VITE_PADDLE_LIVE_CLIENT_TOKEN` (`live_…`) |
| Catalogue/plan/seat API key                               | `PADDLE_SANDBOX_API_KEY`                      | `PADDLE_LIVE_API_KEY`                      |
| Checkout API key                                          | `PADDLE_SANDBOX_CHECKOUT_API_KEY`             | `PADDLE_LIVE_CHECKOUT_API_KEY`             |
| Payment-method API key                                    | `PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY`       | `PADDLE_LIVE_PAYMENT_METHOD_API_KEY`       |
| Customer portal API key                                   | `PADDLE_SANDBOX_PORTAL_API_KEY`               | `PADDLE_LIVE_PORTAL_API_KEY`               |
| Notification secret                                       | `PADDLE_SANDBOX_WEBHOOK_SECRET`               | `PADDLE_LIVE_WEBHOOK_SECRET`               |
| Previous notification secret, optional                    | `PADDLE_SANDBOX_WEBHOOK_SECRET_PREVIOUS`      | `PADDLE_LIVE_WEBHOOK_SECRET_PREVIOUS`      |
| Merchant payment page                                     | `PADDLE_SANDBOX_PAYMENT_PAGE_URL`             | `PADDLE_LIVE_PAYMENT_PAGE_URL`             |
| Optional dashboard-created hosted launcher                | `PADDLE_SANDBOX_HOSTED_CHECKOUT_LAUNCH_URL`   | `PADDLE_LIVE_HOSTED_CHECKOUT_LAUNCH_URL`   |

The payment page must be the approved HTTPS app URL ending in `/billing/checkout`, without a query or fragment. Configure Paddle's default payment link and approved domain accordingly. The SPA host must serve the app on that path. API origins are fixed to `sandbox-api.paddle.com` and `api.paddle.com`. Mixed-realm credentials and custom API origins are rejected. Server keys, notification secrets, and Supabase service keys must never enter `VITE_*` configuration.

Scope keys to their routes: products/prices read for catalogue; subscriptions read/update for plans/seats; transactions create/read for checkout; `transaction.read` and `transaction.write` for card updates; `customer_portal_session.write` for invoices/cancellation portal sessions. Portal authority comes from the authenticated account owner. Session URLs are ephemeral and must not be logged or saved.

Existing Supabase URL, anon key, service-role key, and authenticated browser sessions remain required. The webhook is the only billing route without gateway JWT verification; it verifies the raw body, signature, timestamp, and selected realm's notification secret.

## Catalogue and activation

Create four recurring products and eight USD prices, without provider trials or geographic price overrides. RepSync manages its own trial. Base-plan quantity is one; additional seats are a separate recurring item with the same cadence.

| Product    | Monthly      | Annual        | Additional seat maximum |
| ---------- | ------------ | ------------- | ----------------------- |
| Launch     | $19          | $190          | 1                       |
| Growth     | $59          | $590          | 3                       |
| Scale      | $119         | $1,190        | 5                       |
| Coach seat | $12 per seat | $120 per seat | Determined by the plan  |

Bind actual product/price IDs and RepSync canonical version IDs in a private catalogue binding with `environment: test` or `live`. The [catalogue verifier](paddle-catalogue-verifier.md) and [publication contract](paddle-catalogue-publication.md) verify all eight prices before activation. `scripts/paddle-catalogue-preflight.ts` now selects the configured realm and remains read-only. Do not commit provider IDs or secrets.

Apply both new migrations, deploy all 15 billing functions (including `billing-create-paddle-portal`), and build the frontend with matching public configuration. The manifest pins 188 migrations; the first 186 are unchanged. Old release approvals and artifact digests do not authorize this changed payload. Retirement deployment continues to leave commercial sales disabled. Preserve the pinned implementation commit when merging this branch (use a merge commit); squashing requires a new reviewed payload pin and checkpoint binding before the release planner can pass.

Register `billing-paddle-webhook` for `subscription.created`, `subscription.updated`, `subscription.past_due`, `transaction.completed`, `transaction.updated`, `transaction.paid`, `transaction.payment_failed`, `transaction.past_due`, and `transaction.canceled`. Retain existing adjustment notification subscriptions if configured. Verify notification delivery and retries in the selected environment.

After verifying the catalogue and configuration, enable reconciliation using the existing trusted operator workflow. `PADDLE_CHECKOUT_ACCESS_MODE=pilot` plus `PADDLE_CHECKOUT_PILOT_USER_ID` limits checkout to the chosen account owner; `all` opens checkout to authenticated account owners. Unknown/missing modes are disabled. Database gates `paddle_sales_enabled` and `paddle_reconciliation_enabled` also require explicit activation. No migration enables them.

Remote changes require a named project and the guarded workflow in [AGENTS.md](../AGENTS.md). This branch has not been deployed remotely or used to make a real payment.

## Verification and limits

Local database tests cover both realms, every plan/cadence, supported seat quantities, both webhook orders, duplicate payments, cross-owner and cross-realm rejection, later seat/plan changes, payment-method preparation, and verified cancellation updates. Browser tests use an injected Paddle SDK and local Supabase; they cannot certify a real Paddle account.

Before live sales, complete real sandbox checkout, renewal, failed-payment recovery, invoice, seat proration, cancellation, and retry tests, followed by a controlled live purchase on the approved domain. Verify taxes, receipts, notification delivery, and entitlement changes.

Existing limits remain: plan changes require no additional seats; scheduled plan/seat reductions cannot be undone through RepSync; payment-method updates wait for conflicting/uncertain operations to resolve. Seat reductions take effect at renewal; increases require confirmed payment. Portal cancellation follows Paddle's confirmation flow and paid-period access rules. Subscription resume is not exposed as a RepSync action.

If a provider request may have succeeded, inspect the retained operation and provider transaction before starting another charge. Disable new checkout during an incident while preserving reconciliation and financial history.

## Inspect staging with existing GitHub and Supabase secrets

The verified report from run 42698712938 covers corrected project `dgogugyuyfourdttvwuy`: 180 of 188 migrations are installed, billing is in test mode with both gates disabled, and the payment-method/portal functions and their two key names were missing. The user has since reported adding those keys. This project needs an upgrade, so do not use the empty-project installer. See the [staging deployment guide](paddle-staging-installation.md) for the verified report and expanded read-only upgrade assessment.

The selected release order is **`Ahmed-billing` → staging → real Paddle sandbox tests → reviewed merge into `main`**. Keep the billing feature on its branch until staging tests pass. The corrected staging target is Supabase project `dgogugyuyfourdttvwuy` and app `https://repsync-staging.netlify.app`; provider payments use Paddle sandbox.

The repository administrator must first allow the exact branch `Ahmed-billing` in **Settings → Environments → supabase-staging → Deployment branches and tags**. Retain existing allowed branches and required reviewers. This is a scoped staging branch-policy update for the user's selected release order; production permissions and targets remain separate.

Then use GitHub **Actions → Supabase Migration Status → Run workflow**, select `Ahmed-billing`, and run it. Approve the job if the environment requires a reviewer. The updated inventory workflow is already published on that branch; no merge into `main` is needed for this check.

The updated workflow uses the existing `SUPABASE_ACCESS_TOKEN` available to the protected `supabase-staging` GitHub environment. Its target is fixed to the corrected staging project `dgogugyuyfourdttvwuy`. It needs no database password, Paddle key copied into GitHub, or credentials in the Codex cloud environment.

GitHub rejected [run 42627510363](https://github.com/elkasaby1996-sys/coachos/actions/runs/42627510363/job/129196143896) before any step ran: **Branch "Ahmed-billing" is not allowed to deploy to supabase-staging due to environment protection rules.** This restriction also applies to read-only jobs that reference the protected environment. Re-running before the branch-policy update will fail again. This failure does not establish anything about the validity of secrets or database state.

The job summary and `staging-billing-status-<run-id>` artifact contain only a sanitized report: migration version prefix and pending filenames, missing/inactive billing functions, JWT configuration mismatches, required server-setting names that are missing, and the stored billing policy. It uses only Management API metadata reads and the database **read-only** query endpoint. It performs no linking, migrations, deployment, secret changes, provider calls, or payment actions.

If inspection fails, read the **Staging billing inventory** error annotation for its `stage`, `code`, and optional `httpStatus`. The same fields are available in the job summary and artifact's `report.json`; share these diagnostic fields, not credential values. Older runs may show only "Process completed with exit code 1" publicly, in which case use the signed-in job summary or download that run's report. A run re-executed at an old commit retains its old script; updated annotations require a new workflow dispatch on the current branch.

A successful inventory run does not validate migration hashes, deployed source, secret values, the frontend token, Paddle products/prices, or real payments. Keep Paddle runtime credentials in Supabase and retain the environment protection rules.

The user selected GitHub's existing required environment review for initial staging installation. **Supabase Staging Empty Bootstrap** now includes an `Ahmed-billing` path that runs source/database checks before its protected installation job. It uses the existing management token and staging database password, fixes the project/origin, confirms the exact source commit, and requires fresh application state before applying the canonical 188 migrations and deploying 17 functions. It configures staging Auth and sandbox runtime settings with checkout disabled. The legacy main-only signed-founder path remains separate. Follow the [installation inputs and failure-handling instructions](paddle-staging-installation.md#install-from-ahmed-billing-with-github-environment-review); this backend job does not deploy the frontend, publish catalogue mappings, or activate sales.

Deploy matching backend and frontend versions to the confirmed staging targets, then verify real sandbox subscription checkout, extra-seat purchase and proration, webhook reconciliation/replays, invoices, renewal, failed-payment recovery, and cancellation. Record results against the tested commit. Only after staging verification and required review/checks pass, merge the feature into `main` using **Create a merge commit** to preserve the pinned implementation commit. Staging success does not itself enable live payments.
