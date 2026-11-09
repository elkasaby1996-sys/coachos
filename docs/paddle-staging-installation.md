# Initial Paddle staging installation

The selected order is `Ahmed-billing` → staging installation → real Paddle sandbox tests → reviewed merge into `main`.

## Observed starting point

[Migration Status run 42688366250](https://github.com/elkasaby1996-sys/coachos/actions/runs/42688366250) succeeded on commit `0d2f33f`. The uploaded `report.json` names the confirmed staging project `exmrksgdikfprtfeltzu`. Its ZIP SHA-256 matches the run's published artifact digest, `75488e68cbc5376c3c0aaab949d28177716df1db09db34e3ae5ad42621c256be`.

| Item                            | Observed result                                                           |
| ------------------------------- | ------------------------------------------------------------------------- |
| Recorded migrations             | 0 of 188; the entire pending filename list matches the canonical manifest |
| Billing functions               | All 15 expected functions are missing                                     |
| Billing runtime policy          | Absent                                                                    |
| Required Paddle server settings | Eight names are missing, listed below                                     |
| Live Paddle settings            | No names beginning `PADDLE_LIVE_` were reported                           |
| Real provider payments          | Not verified                                                              |

This confirms authenticated inspection. It does not prove the project has no other tables, users, storage, or customizations. Fresh-project checks remain necessary before an initial installation. No migration, function deployment, secret update, or payment was performed by the status workflow.

## Settings on the confirmed staging project

Use [this project's Edge Function secrets](https://supabase.com/dashboard/project/exmrksgdikfprtfeltzu/functions/secrets). The report found these names absent at inspection time. The user has since reported updating all keys and links; installation checks their current names again, without retrieving or printing credential values.

| Name                                    | Required staging value or purpose                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PADDLE_ENVIRONMENT`                    | `sandbox`                                                                                                               |
| `PADDLE_SANDBOX_API_KEY`                | Sandbox API key for catalogue reads and the implemented subscription/seat operations                                    |
| `PADDLE_SANDBOX_CHECKOUT_API_KEY`       | Dedicated sandbox checkout API key                                                                                      |
| `PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY` | Dedicated sandbox payment-method API key                                                                                |
| `PADDLE_SANDBOX_PORTAL_API_KEY`         | Dedicated sandbox customer-portal-session API key                                                                       |
| `PADDLE_SANDBOX_WEBHOOK_SECRET`         | Notification destination secret for this staging webhook                                                                |
| `PADDLE_SANDBOX_PAYMENT_PAGE_URL`       | `https://repsync-staging-replacement.netlify.app/billing/checkout`                                                      |
| `PADDLE_CHECKOUT_ACCESS_MODE`           | Initially `disabled`; use `pilot` with `PADDLE_CHECKOUT_PILOT_USER_ID` only when the test owner and catalogue are ready |

Enter credential values directly in Supabase. The GitHub `SUPABASE_ACCESS_TOKEN` authenticates deployment/inspection and is distinct from the Paddle runtime settings above. The server API keys and webhook secret must remain outside browser build variables, Git, logs, and shared reports. Follow the route-specific permissions in [the billing configuration guide](paddle-billing.md#configuration).

The eventual Paddle sandbox notification destination is `https://exmrksgdikfprtfeltzu.supabase.co/functions/v1/billing-paddle-webhook`. Register the events listed in [the activation guide](paddle-billing.md#catalogue-and-activation) when preparing notification delivery.

## Install from Ahmed-billing with GitHub environment review

The user selected GitHub's existing required `supabase-staging` environment review for this initial staging installation. The existing **Supabase Staging Empty Bootstrap** workflow now has a separate `Ahmed-billing` installation path. Its legacy main-only signed-founder job remains separate. The feature path does not need the unfinished custom signed-approval integrations.

The canonical application payload remains pinned to `8af05aa48cbccca694b2da447d77f8977ec3401a`: all 188 migrations, 15 billing functions (including three retired-provider tombstones), and the two required non-billing functions. The first 186 migrations are unchanged. To inspect the plan locally without credentials or network access:

```sh
node scripts/staging-initial-install.mjs plan
```

Before running, retain the required reviewer and allow `Ahmed-billing` in the GitHub `supabase-staging` environment, as already done for inventory. The protected job uses the existing `SUPABASE_ACCESS_TOKEN` and, for `apply`, `SUPABASE_DB_PASSWORD` for **this staging project**. Paddle private keys stay in Supabase. No credential values belong in workflow inputs or chat.

Open [Supabase Staging Empty Bootstrap](https://github.com/elkasaby1996-sys/coachos/actions/workflows/supabase-staging-bootstrap.yml), select **Run workflow**, and enter:

| Field                 | Value                                                         |
| --------------------- | ------------------------------------------------------------- |
| Branch                | `Ahmed-billing`                                               |
| `mode`                | `apply`                                                       |
| `confirm_commit_sha`  | The full 40-character commit SHA currently at `Ahmed-billing` |
| `confirm_project_ref` | `exmrksgdikfprtfeltzu`                                        |
| `confirm_app_origin`  | `https://repsync-staging-replacement.netlify.app`             |

The workflow tests the source, immutable payload, and all migrations on a disposable local database before the installation job can run. Approve that job through GitHub's required environment review. `apply` includes its own fresh-project checks and dry run; a separate `preflight` run is optional. `preflight` performs only metadata/read-only SQL requests and needs no database password. `plan` runs local checks and produces a plan without entering the protected installation job.

The installer requires a clean checkout of the exact confirmed commit, the fixed branch/repository/workflow, and the fixed staging project and app origin. It checks that there are no installed migrations, deployed functions, application relations/routines/types, Auth users, storage buckets/objects, or unexpected schemas; requires the five private Paddle setting names; and rejects live Paddle settings. It validates the entire pending migration list and repeats its inventory and artifact/source checks immediately before applying migrations. Remote Supabase CLI operations use the repository's guarded wrapper and pinned CLI version 2.109.1.

Installation applies all 188 canonical migrations, verifies the stored test policy with both billing gates disabled, deploys the 17 canonical functions with their required JWT settings, and verifies the resulting inventory. It also sets these non-secret runtime values:

```text
PADDLE_ENVIRONMENT=sandbox
PADDLE_CHECKOUT_ACCESS_MODE=disabled
PADDLE_SANDBOX_PAYMENT_PAGE_URL=https://repsync-staging-replacement.netlify.app/billing/checkout
```

Supabase Auth receives the staging app origin as its site URL and `/auth/callback` as its redirect URL. Signup is enabled and email confirmation remains required. Private Paddle keys and webhook secrets are not overwritten.

Read **Initial staging installation** in the job summary or download `staging-initial-install-<run-id>`. The sanitized report includes stage/error code, HTTP status when available, migrations/functions completed, and whether remote writes may have occurred. A failure stops the operation; there is no automatic retry, database reset, or destructive rollback. If writes may have occurred, inspect the report and current migration/function inventory before preparing a targeted continuation. This initial installer refuses an already installed or partially migrated project.

## Finish the staging frontend and sandbox activation

Installation success verifies the backend installation and configuration names. It does not validate private key values, publish Paddle catalogue mappings, enable checkout, deploy the frontend, or prove a payment works. It does not deploy to production or the archived staging project, and does not merge `main`.

Deploy the matching frontend from the tested commit to `https://repsync-staging-replacement.netlify.app`. Its build needs `VITE_SUPABASE_URL=https://exmrksgdikfprtfeltzu.supabase.co`, that project's public anon key, `VITE_BILLING_PROVIDER=paddle`, `VITE_PADDLE_ENVIRONMENT=sandbox`, and `VITE_PADDLE_SANDBOX_CLIENT_TOKEN`. Frontend deployment and catalogue/pilot activation still need their own concrete staging execution steps; the initial installer does not perform them.

## Before merging the billing feature

Verify the eight sandbox plan/seat prices and publish their mappings against the installed canonical catalogue. Prepare the test owner, webhook delivery, and pilot checkout configuration, then activate the test billing gates through the selected deployment/operator path. Record sandbox checkout, initial/later seat purchases and proration, duplicate/delayed webhooks, invoice/portal access, renewal, failed-payment recovery, and cancellation against the deployed commit. Only then complete the required review/checks and merge using a merge commit that preserves the pinned implementation commit.
