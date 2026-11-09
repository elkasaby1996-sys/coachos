# Paddle staging deployment

The selected order is `Ahmed-billing` → staging installation → real Paddle sandbox tests → reviewed merge into `main`.

## Current target and next run

The user corrected the staging target on 2026-11-09:

- Supabase project: `dgogugyuyfourdttvwuy`
- Application origin: `https://repsync-staging.netlify.app`
- Workflow branch: **`Ahmed-billing`**

[Migration Status run 42702256586](https://github.com/elkasaby1996-sys/coachos/actions/runs/42702256586) successfully inspected this project at `344dad4`. The uploaded ZIP matches GitHub's SHA-256 `064887ca5239f86975c4fdb554c1df30e7cd5927a89d9e97b33d145b76673556`. It confirms **180 of 188 migrations**, with the exact canonical prefix and eight pending migrations. The inspection passed; deployment readiness still requires review. The project needs an upgrade; **do not run the empty-project installer**.

| Item                                | Verified result                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Billing policy                      | `test`, sales disabled, reconciliation disabled                                        |
| Deployed functions                  | 15 total; existing expected billing names have active status and matching JWT settings |
| Missing functions                   | `billing-update-payment-method`, `billing-create-paddle-portal`                        |
| Missing setting names at inspection | None; both new API key names are present                                               |
| Live Paddle setting names           | None reported                                                                          |
| Actual database schema              | Differs from the source checkpoint for migration 180                                   |
| Retained history                    | 128 public tables plus Auth users; stable during the inspection                        |
| Unfinished Paddle webhook records   | 28; their processing states still need inspection                                      |
| Scheduled operations                | One, with an effective date of 2026-10-23                                              |

The user confirmed that this project contains entirely synthetic test data. The upgrade will preserve those records; this classification does not authorize a reset, deletion, or replay. Key values, provider permissions, and payments remain unverified.

The screenshot's branch selection was `main`; it must be changed to `Ahmed-billing` to run this implementation. Commit `8bc0335` still targets the replacement project, so dispatch a new run from the updated branch instead of rerunning that old commit. The legacy signed-release registry still labels the corrected target archived; the feature-branch workflows now use the user's explicit target correction and preserve their fixed-target and fresh-project checks.

## Upgrade assessment and sequence

The existing [Supabase Migration Status](https://github.com/elkasaby1996-sys/coachos/actions/workflows/supabase-migration-status.yml) workflow now includes `scripts/staging-upgrade-readiness.mjs`. It runs manually on the selected branch and automatically for `Ahmed-billing` pushes that change the status workflow or its inspection scripts. Its protected `supabase-staging` job still requires GitHub's configured review. It uses only the existing management token, metadata GETs and the database read-only endpoint.

Before remote inspection, a job with no hosted credentials reconstructs migrations 180–188 on a unique disposable local Postgres database using CLI 2.109.1. Every reconstructed schema must match its existing source-bound checkpoint. The local database is then removed. Its artifact contains source-derived schema definitions only; no hosted database contents are included. The protected inspection job reads the artifact from the same workflow run and verifies it against the frozen payload, migration manifest, exact version prefix, and checkpoint before using it.

The assessment compares actual public function definitions, permissions, RLS and schema against that reference. It identifies changed or missing source objects and the changed fields; unrecognized remote object names are represented by hashes. Reports never include actual function bodies, default values, policy expressions, credential values, or webhook contents. Array ordering is reported separately, while the original exact schema comparison remains required. Read-only aggregate queries also separate unfinished webhook states, overdue/future scheduled changes, and subscription provider/environment/status groups. Live-labelled or unknown-environment records require review even when no operation is unfinished.

The assessment hashes retained public rows and Auth users without exporting them, then repeats the observations to reject drift or an observation older than one minute. Schema responses have a fixed 8 MiB limit. Public **Staging schema comparison**, **Staging schema differences**, and **Staging retained ...** notices expose the sanitized diagnostic results alongside the JSON report, so basic investigation does not require downloading another artifact.

Use `upgradeReadiness.schema.diagnostics`, `retainedWorkDetails`, and `blockers` to resolve the recorded mismatch and retained work before preparing an apply run. Run 12 established the mismatch but did not identify the changed objects; the new comparison has been verified locally and awaits its first hosted inspection. A zero-blocker result means the upgrade can be prepared; it does not claim a verified backup, deployed source, provider certification, or deployment authorization.

The pending upgrade sequence is migrations 181–184, retirement migration 185, then migrations 186–188, followed by the canonical billing and non-billing functions. Existing history must remain intact. Before applying, establish a recoverable staging backup and review retained billing obligations and in-flight work. The main-only signed-release runner remains separate; an operational feature-branch upgrade must use the chosen GitHub review model with these data-preservation checks. The initial-install script is intentionally unsuitable for this populated project and will reject it before writes.

## Earlier inventory of the replacement project

[Migration Status run 42688366250](https://github.com/elkasaby1996-sys/coachos/actions/runs/42688366250) succeeded on commit `0d2f33f`. The uploaded `report.json` names replacement project `exmrksgdikfprtfeltzu`, which is not the user's corrected target. Its ZIP SHA-256 matches the run's published artifact digest, `75488e68cbc5376c3c0aaab949d28177716df1db09db34e3ae5ad42621c256be`.

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

Use [this project's Edge Function secrets](https://supabase.com/dashboard/project/dgogugyuyfourdttvwuy/functions/secrets). Run 12 confirms both keys missing in run 11 are now present. Inspection reads names only and does not retrieve credential values.

| Name                                    | Required staging value or purpose                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PADDLE_ENVIRONMENT`                    | `sandbox`                                                                                                               |
| `PADDLE_SANDBOX_API_KEY`                | Sandbox API key for catalogue reads and the implemented subscription/seat operations                                    |
| `PADDLE_SANDBOX_CHECKOUT_API_KEY`       | Dedicated sandbox checkout API key                                                                                      |
| `PADDLE_SANDBOX_PAYMENT_METHOD_API_KEY` | Dedicated sandbox payment-method API key                                                                                |
| `PADDLE_SANDBOX_PORTAL_API_KEY`         | Dedicated sandbox customer-portal-session API key                                                                       |
| `PADDLE_SANDBOX_WEBHOOK_SECRET`         | Notification destination secret for this staging webhook                                                                |
| `PADDLE_SANDBOX_PAYMENT_PAGE_URL`       | `https://repsync-staging.netlify.app/billing/checkout`                                                                  |
| `PADDLE_CHECKOUT_ACCESS_MODE`           | Initially `disabled`; use `pilot` with `PADDLE_CHECKOUT_PILOT_USER_ID` only when the test owner and catalogue are ready |

Enter credential values directly in Supabase. The GitHub `SUPABASE_ACCESS_TOKEN` authenticates deployment/inspection and is distinct from the Paddle runtime settings above. The server API keys and webhook secret must remain outside browser build variables, Git, logs, and shared reports. Follow the route-specific permissions in [the billing configuration guide](paddle-billing.md#configuration).

Create server API keys in Paddle Sandbox's **My account → Settings → Authentication → API keys**. The payment-method key needs `transaction.write` for [preparing the update transaction](https://developer.paddle.com/api-reference/subscriptions/get-subscription-update-payment-method-transaction) and `transaction.read` for inspecting it. The portal key needs `customer_portal_session.write` for [creating a customer portal session](https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session). Store each generated value under the exact Supabase name above. An existing sandbox key with the required permissions also works; credentials need not be shared in chat.

The Paddle sandbox notification destination for the corrected target is `https://dgogugyuyfourdttvwuy.supabase.co/functions/v1/billing-paddle-webhook`. Register the events listed in [the activation guide](paddle-billing.md#catalogue-and-activation) when preparing notification delivery.

## Install from Ahmed-billing with GitHub environment review

This section documents the empty-project path. The verified current project is at migration 180, so it must use the upgrade sequence above instead.

The user selected GitHub's existing required `supabase-staging` environment review for this initial staging installation. The existing **Supabase Staging Empty Bootstrap** workflow now has a separate `Ahmed-billing` installation path. Its legacy main-only signed-founder job remains separate. The feature path does not need the unfinished custom signed-approval integrations.

The canonical application payload remains pinned to `8af05aa48cbccca694b2da447d77f8977ec3401a`: all 188 migrations, 15 billing functions (including three retired-provider tombstones), and the two required non-billing functions. The first 186 migrations are unchanged. To inspect the plan locally without credentials or network access:

```sh
node scripts/staging-initial-install.mjs plan
```

Before running, retain the required reviewer and allow `Ahmed-billing` in the GitHub `supabase-staging` environment, as already done for inventory. The protected job uses the existing `SUPABASE_ACCESS_TOKEN` and, for `apply`, `SUPABASE_DB_PASSWORD` for **this staging project**. Paddle private keys stay in Supabase. No credential values belong in workflow inputs or chat.

After the corrected project's inventory establishes that initial installation is appropriate, open [Supabase Staging Empty Bootstrap](https://github.com/elkasaby1996-sys/coachos/actions/workflows/supabase-staging-bootstrap.yml), select **Run workflow**, and enter:

| Field                 | Value                                                         |
| --------------------- | ------------------------------------------------------------- |
| Branch                | `Ahmed-billing`                                               |
| `mode`                | `apply`                                                       |
| `confirm_commit_sha`  | The full 40-character commit SHA currently at `Ahmed-billing` |
| `confirm_project_ref` | `dgogugyuyfourdttvwuy`                                        |
| `confirm_app_origin`  | `https://repsync-staging.netlify.app`                         |

The workflow tests the source, immutable payload, and all migrations on a disposable local database before the installation job can run. Approve that job through GitHub's required environment review. `apply` includes its own fresh-project checks and dry run; a separate `preflight` run is optional. `preflight` performs only metadata/read-only SQL requests and needs no database password. `plan` runs local checks and produces a plan without entering the protected installation job.

The installer requires a clean checkout of the exact confirmed commit, the fixed branch/repository/workflow, and the fixed staging project and app origin. It checks that there are no installed migrations, deployed functions, application relations/routines/types, Auth users, storage buckets/objects, or unexpected schemas; requires the five private Paddle setting names; and rejects live Paddle settings. It validates the entire pending migration list and repeats its inventory and artifact/source checks immediately before applying migrations. Remote Supabase CLI operations use the repository's guarded wrapper and pinned CLI version 2.109.1.

Installation applies all 188 canonical migrations, verifies the stored test policy with both billing gates disabled, deploys the 17 canonical functions with their required JWT settings, and verifies the resulting inventory. It also sets these non-secret runtime values:

```text
PADDLE_ENVIRONMENT=sandbox
PADDLE_CHECKOUT_ACCESS_MODE=disabled
PADDLE_SANDBOX_PAYMENT_PAGE_URL=https://repsync-staging.netlify.app/billing/checkout
```

Supabase Auth receives the staging app origin as its site URL and `/auth/callback` as its redirect URL. Signup is enabled and email confirmation remains required. Private Paddle keys and webhook secrets are not overwritten.

Read **Initial staging installation** in the job summary or download `staging-initial-install-<run-id>`. The sanitized report includes stage/error code, HTTP status when available, migrations/functions completed, and whether remote writes may have occurred. A failure stops the operation; there is no automatic retry, database reset, or destructive rollback. If writes may have occurred, inspect the report and current migration/function inventory before preparing a targeted continuation. This initial installer refuses an already installed or partially migrated project.

## Finish the staging frontend and sandbox activation

Installation success verifies the backend installation and configuration names. It does not validate private key values, publish Paddle catalogue mappings, enable checkout, deploy the frontend, or prove a payment works. Its only target is the corrected staging project above; production and the replacement project remain outside this operation. It does not merge `main`.

Deploy the matching frontend from the tested commit to `https://repsync-staging.netlify.app`. Its build needs `VITE_SUPABASE_URL=https://dgogugyuyfourdttvwuy.supabase.co`, that project's public anon key, `VITE_BILLING_PROVIDER=paddle`, `VITE_PADDLE_ENVIRONMENT=sandbox`, and `VITE_PADDLE_SANDBOX_CLIENT_TOKEN`. Frontend deployment and catalogue/pilot activation still need their own concrete staging execution steps; the initial installer does not perform them.

## Before merging the billing feature

Verify the eight sandbox plan/seat prices and publish their mappings against the installed canonical catalogue. Prepare the test owner, webhook delivery, and pilot checkout configuration, then activate the test billing gates through the selected deployment/operator path. Record sandbox checkout, initial/later seat purchases and proration, duplicate/delayed webhooks, invoice/portal access, renewal, failed-payment recovery, and cancellation against the deployed commit. Only then complete the required review/checks and merge using a merge commit that preserves the pinned implementation commit.
