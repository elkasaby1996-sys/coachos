# Paddle staging deployment

The selected order is `Ahmed-billing` → staging installation → real Paddle sandbox tests → reviewed merge into `main`.

## Current target and next run

The user corrected the staging target on 2026-11-09:

- Supabase project: `dgogugyuyfourdttvwuy`
- Application origin: `https://repsync-staging.netlify.app`
- Workflow branch: **`Ahmed-billing`**

[Upgrade run #6](https://github.com/elkasaby1996-sys/coachos/actions/runs/42792290161) successfully deployed the backend at `0bcbf6d8205eb3e370dc7ba2215b9a80bb7afd23`. Its downloaded report confirms `backend_upgraded_sandbox_disabled`, **188 of 188 migrations**, `backupVerified=true`, all 17 canonical functions deployed, and preservation of the reviewed grants and retained test work. Checkout, sales and reconciliation remain disabled. Frontend deployment, catalogue verification/activation and real sandbox payments remain pending. **Do not rerun the upgrade or empty-project installer to deploy the frontend.**

Before that upgrade, [Migration Status run 42707688666](https://github.com/elkasaby1996-sys/coachos/actions/runs/42707688666) inspected this project at `131f1bc`, with **180 of 188 migrations**, the exact canonical prefix and eight pending migrations. Its public notices identify the precise schema differences and retained work below. The earlier uploaded run 42702256586 report was verified against GitHub's SHA-256 `064887ca5239f86975c4fdb554c1df30e7cd5927a89d9e97b33d145b76673556`.

| Item                                | Verified result                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Billing policy                      | `test`, sales disabled, reconciliation disabled                                        |
| Deployed functions                  | 15 total; existing expected billing names have active status and matching JWT settings |
| Missing functions                   | `billing-update-payment-method`, `billing-create-paddle-portal`                        |
| Missing setting names at inspection | None; both new API key names are present                                               |
| Live Paddle setting names           | None reported                                                                          |
| Actual database schema              | 22 changed fields: four table ACLs, 15 UUID defaults, three constraints                |
| Retained history                    | 128 public tables plus Auth users; stable during the inspection                        |
| Unfinished Paddle webhook records   | 17 deferred and 11 manual review; all in the test environment                          |
| Scheduled operations                | One overdue Paddle test operation, effective 2026-10-23                                |

The user confirmed that this project contains entirely synthetic test data. The upgrade will preserve those records; this classification does not authorize a reset, deletion, or replay. Key values, provider permissions, and payments remain unverified.

[Upgrade run #3](https://github.com/elkasaby1996-sys/coachos/actions/runs/42718545354) passed source/database checks and the installed-schema compatibility check, then stopped during local recovery with `UPGRADE_BACKUP_MANAGED_COLUMNS_DIFFER`. The hosted Auth or migration-history table contains columns absent from the CLI's local schema. No hosted writes occurred, no verified backup was uploaded, and staging remains at migration 180. The corrected recovery process captures the managed column definitions and restores their complete row shape locally before verifying the original hashes.

[Upgrade run #4](https://github.com/elkasaby1996-sys/coachos/actions/runs/42782915567) passed the managed-column restoration but stopped at `UPGRADE_RESTORED_HISTORY_DIFFERS`, again before hosted writes. The same failure was reproduced locally when JSON conversion rounded large integers or changed decimal precision/scale; the public run did not identify individual affected records. The corrected snapshot format preserves PostgreSQL's original JSON text, verifies captured bytes against the source hashes before restoring, and uses explicit `C` ordering for row hashes across database locales. The local regression includes precise numeric values in application data, Auth metadata and the full migration ledger.

[Upgrade run #5](https://github.com/elkasaby1996-sys/coachos/actions/runs/42788122184) passed source quality checks but could not start its local database because host port `54322` was already occupied. The database image downloaded successfully; the protected hosted job never started. The database job now uses `scripts/staging-upgrade-local-checks.mjs` to create a unique temporary project with available ports, copy the verified migrations and SQL fixtures, and run database lint/tests, all schema checkpoints and populated recovery. It removes only its own local project afterward. Existing stacks and the tracked Supabase configuration stay unchanged. This can be rehearsed with CLI 2.109.1 and Docker while another local stack is running:

```bash
node scripts/staging-upgrade-local-checks.mjs /tmp/staging-schema-reference.json
```

The screenshot's branch selection was `main`; it must be changed to `Ahmed-billing` to run this implementation. Commit `8bc0335` still targets the replacement project, so dispatch a new run from the updated branch instead of rerunning that old commit. The legacy signed-release registry still labels the corrected target archived; the feature-branch workflows now use the user's explicit target correction and preserve their fixed-target and fresh-project checks.

## Upgrade assessment and sequence

The existing [Supabase Migration Status](https://github.com/elkasaby1996-sys/coachos/actions/workflows/supabase-migration-status.yml) workflow now includes `scripts/staging-upgrade-readiness.mjs`. It runs manually on the selected branch and automatically for `Ahmed-billing` pushes that change the status workflow or its inspection scripts. Its protected `supabase-staging` job still requires GitHub's configured review. It uses only the existing management token, metadata GETs and the database read-only endpoint.

Before remote inspection, a job with no hosted credentials reconstructs migrations 180–188 on a unique disposable local Postgres database using CLI 2.109.1. Every reconstructed schema must match its existing source-bound checkpoint. The local database is then removed. Its artifact contains source-derived schema definitions only; no hosted database contents are included. The protected inspection job reads the artifact from the same workflow run and verifies it against the frozen payload, migration manifest, exact version prefix, and checkpoint before using it.

The assessment compares actual public function definitions, permissions, RLS and schema against that reference. It identifies changed or missing source objects and the changed fields; unrecognized remote object names are represented by hashes. Reports never include actual function bodies, default values, policy expressions, credential values, or webhook contents. Array ordering is reported separately, while the original exact schema comparison remains required. Read-only aggregate queries also separate unfinished webhook states, overdue/future scheduled changes, and subscription provider/environment/status groups. Live-labelled or unknown-environment records require review even when no operation is unfinished.

The assessment hashes retained public rows and Auth users without exporting them, then repeats the observations to reject drift or an observation older than one minute. Schema responses have a fixed 8 MiB limit. Public **Staging schema comparison**, **Staging schema differences**, and **Staging retained ...** notices expose the sanitized diagnostic results alongside the JSON report, so basic investigation does not require downloading another artifact.

Run 13 identifies ACL differences on `_archive_workout_log_items`, `_archive_workout_template_items`, `notification_preferences`, and `notifications`. The remaining changes are 15 UUID defaults and three digest constraints. Public function definitions/grants, RLS, policies, indexes and triggers match the source. Those notices identify changed fields; upgrade run #3 subsequently passed the exact compatibility verifier. The apply path accepts only the exact source schema or the recorded hosted baseline digest, allowing narrowly specified extension qualification for those expressions and preserving the four inventoried ACLs. An unexpected expression or permission value stops the run before hosted writes; the workflow does not repair or replace those permissions.

The retained subscriptions are six active legacy subscriptions and four Paddle subscriptions (two active, one canceled, one paused), all labelled test. The upgrade preserves these records, all 28 deferred/manual-review webhook records and the overdue test operation. It rejects runnable checkouts, active operations, received/processing webhooks, future scheduled changes, and live/unknown environment labels. It does not replay, expire, or mark retained work complete.

## Upgrade the populated project with GitHub environment review

[Supabase Staging Billing Upgrade](https://github.com/elkasaby1996-sys/coachos/actions/workflows/supabase-staging-billing-upgrade.yml) is the operational path for the current project. A push changing this workflow or its upgrade scripts on `Ahmed-billing` automatically queues an **apply** run. Source quality, unit tests, database tests, all nine schema checkpoints, and a populated local recovery regression run before the protected job. The recovery regression reproduces mismatched Auth/migration-history columns, verifies full restored rows, and rolls back its source fixtures. It uses no hosted credentials. This branch-triggered workflow does not require registration through a merge into `main`.

After those checks pass, open the queued run and choose **Review deployments → supabase-staging → Approve and deploy**. This existing GitHub environment review authorizes the actual staging upgrade. The job uses the existing `SUPABASE_ACCESS_TOKEN` and this project's `SUPABASE_DB_PASSWORD` from GitHub secrets. Paddle private keys stay in Supabase; no secret values or project confirmations need copying into workflow inputs. If manual dispatch is available, select `Ahmed-billing` and `mode=apply`; `mode=preflight` prepares and uploads a verified backup without hosted writes.

The fixed target is `dgogugyuyfourdttvwuy`, app origin `https://repsync-staging.netlify.app`. The workflow binds execution to the exact checked-out GitHub SHA, repository, branch, workflow and run attempt. It uses CLI 2.109.1 through the guarded remote wrapper and verifies the frozen application payload `8af05aa48cbccca694b2da447d77f8977ec3401a`. To inspect the source-only plan locally:

```sh
node scripts/staging-populated-upgrade.mjs plan
```

The protected job performs this sequence:

1. Verify the installed migration prefix, schema, disabled test policy, secret names, function metadata and retained test work. Capture every public table, `auth.users`, and the full migration ledger through read-only requests, including the two managed tables' column names/types. Keep each table's PostgreSQL JSON serialization as text, and verify its original hash before restoration; never decode/re-encode numeric row values for storage or insertion. Repeat observations, including exact database-computed ledger-row hashes, to reject row or managed-schema drift.
2. Reconstruct the application schema on an isolated local database, align its Auth-user and migration-history columns with the captured managed column shapes, restore the captured rows and inventoried table ACLs there, and verify every complete retained table hash plus the full ledger. The local administrator adds hosted-only fields and removes local-only fields with `RESTRICT`; hosted managed schemas remain untouched. Only validated PostgreSQL built-in types are admitted, and hosted default/generated SQL expressions are never executed. Remove that local database. This recovery proof must succeed before any hosted write.
3. Encrypt the private snapshot with AES-256-GCM and a scrypt key derived from the existing database password. Upload `staging-upgrade-backup-<run-id>-<attempt>` successfully before continuing. Bind the snapshot to this project, commit, run and attempt, and check staging again immediately before applying.
4. Set sandbox mode, keep checkout disabled and set the staging payment-page URL. Deploy containment handlers for all 15 billing routes, with webhook containment first. These temporarily stop new billing requests while the schema is upgraded.
5. Apply only pending canonical migrations through checkpoints 184, 185 and 188. Verify schema, retained row hashes, original ledger rows, existing ACLs and retained work after each phase. Deploy all 17 canonical functions, restoring the Paddle webhook last; verify final active/JWT metadata and preserve any separately classified non-billing function.

Success is `backend_upgraded_sandbox_disabled`: migration 188, canonical function deployment, retained records intact, and sales/reconciliation/checkout still disabled. Auth settings, frontend deployment, catalogue publication and provider payment tests are separate follow-up work.

### Backup scope and failure handling

The encrypted recovery artifact is retained by GitHub for **seven days**. Retain a downloaded copy and the database password used for that run in secure storage if a longer recovery window is needed; a later password rotation does not decrypt an older backup. Public reports contain only aggregate results and digests. Plaintext snapshots, credentials and row contents are not uploaded or logged.

The private snapshot uses `schemaVersion: 2` and `dataEncoding: postgres-jsonb-text-v1`; table data values are original PostgreSQL JSON strings. Preserve those strings when recovering data. Parsing them as JavaScript numbers and serializing them again can silently change large integers, high-precision fractions and decimal scale. The encrypted-envelope format remains version 1. Older snapshot formats cannot authorize an apply run.

This is a targeted backup of public application tables, Auth users, migration history and verified schema, not a full Supabase project backup. Other managed Auth tables, storage objects, hosted settings, deployed function versions and Paddle resources are outside the snapshot and are not deleted by the upgrade. Local restoration is verified; the workflow provides no automatic hosted restore or destructive rollback.

Read **Staging billing upgrade** in the job summary or download `staging-billing-upgrade-<run-id>-<attempt>`. Its `stage`, `code`, optional HTTP/SQL error fields, and `remoteWritesMayHaveOccurred` distinguish a preflight block from a partial deployment. `migrationCount` is the last successfully verified checkpoint, which can lag the database after a failed migration command. Inspect current state before continuing.

If restored history differs, the public notice also reports `authUsersDiffer` and `publicTableIndexes`. Indexes are zero-based positions in the alphabetically sorted source table list at the installed checkpoint. These identify the affected tables without exposing row values, account IDs or hosted-only managed fields. A failed capture or restore never produces a verified backup or starts deployment.

A failure stops without automatic retry, reset, deletion, replay, or rollback. The runner supports canonical prefixes 180–188 so a reviewed continuation can capture a **new** backup and apply only the remaining migrations. Partial runs may leave billing routes contained. Resolve the recorded failure and inspect the current migration/function state before rerunning; do not repair the migration ledger or reset staging merely to bypass a failed check.

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

This section records the earlier empty-project path. The current populated project has already completed its upgrade to migration 188.

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

Backend installation or upgrade success verifies schema/deployment checks and configuration names. It does not validate private key values, publish Paddle catalogue mappings, enable checkout, deploy the frontend, or prove a payment works. Its only target is the corrected staging project above; production and the replacement project remain outside this operation. It does not merge `main`.

Deploy the matching frontend from the tested commit to `https://repsync-staging.netlify.app`. Its build needs `VITE_SUPABASE_URL=https://dgogugyuyfourdttvwuy.supabase.co`, that project's public anon key, `VITE_BILLING_PROVIDER=paddle`, `VITE_PADDLE_ENVIRONMENT=sandbox`, and `VITE_PADDLE_SANDBOX_CLIENT_TOKEN`. Verify the staging Auth site and callback URLs when preparing the test owner. Frontend deployment and catalogue/pilot activation still need their own concrete staging execution steps; the backend upgrade does not perform them.

After upgrade run #6, the user confirmed that the **repsync-staging** Netlify site still deploys `main`. In that site's **Project configuration → Build & deploy → Continuous deployment → Branches and deploy contexts**, change **Production branch** to `Ahmed-billing`. Netlify uses this setting name for the default branch of each site, including a staging site. Ensure the build environment variables above apply to this site's production deploy context, then use **Deploys → Trigger deploy → Deploy site**. The existing build command is `npm run build` and publish directory is `dist`; the SPA redirect is already in `netlify.toml`.

The checkout page and customer-portal/frontend changes are on `Ahmed-billing`; 13 application files differ from `main`. A read-only check of the current entry and billing JavaScript chunks confirmed the intended Supabase project but did not find a sandbox browser token in those two chunks. This limited observation does not establish all deployed configuration. Verify the token in Netlify without sending credential values in chat. Direct catalogue reads from this cloud executor received Paddle's Cloudflare HTTP 403 block, so that request did not verify the key, products or prices. GitHub's backend upgrade report also explicitly records zero provider calls and no verified payments.

The subsequent Netlify deployment published entry `index-C0Po08rd.js`, the new checkout page and customer-portal integration. Inspection found a sandbox browser token and the intended Supabase project. The deployed public publishable key successfully read Auth settings and the public catalogue; that catalogue exactly matched the frozen source snapshot. Chromium loaded `/billing/checkout` without JavaScript errors. Opening it without a transaction displays its expected incomplete-checkout message; this is not a payment test. Signup is enabled. The selected test owner uses a fresh email and still needs registration/confirmation to be established.

### Inspect Paddle prices and confirmation-email configuration

The **Paddle Staging Readiness** workflow uses the same protected `supabase-staging` environment on `Ahmed-billing`. Its source checks pass before the inspection job can be reviewed. Relevant script/workflow/test pushes queue the check. Approve **Inspect sandbox catalogue and staging email settings** through the existing GitHub environment review.

The job uses `SUPABASE_ACCESS_TOKEN` for a fixed read-only catalogue query and `GET /config/auth`, and `PADDLE_SANDBOX_API_KEY` for the existing GET-only sandbox catalogue capability. The Paddle key must be available to this GitHub environment as well as the deployed Supabase functions; if absent, the report names `PADDLE_SANDBOX_API_KEY_MISSING_IN_GITHUB`. No database password, service-role key, SMTP password or browser token is required by this job.

Its sanitized `staging-sandbox-readiness-<run-id>` artifact reports canonical prices, candidate counts and discrepancies for all eight plan/cadence pairs, fresh checks of explicitly stored active mappings, disabled/enabled policy observations, and safe Auth configuration flags. It never selects candidate IDs, publishes mappings, modifies settings, sends mail, creates accounts, enables checkout, or creates provider transactions. Product/price/version IDs, sender addresses, SMTP credentials and provider response bodies stay out of its report. A successful inspection is not payment certification or permission to enable billing; candidate observations still need explicit verified publication, and real payment tests remain pending.

The user uses Resend for email. Confirmation mail is sent by **Supabase Auth**, so the staging project's **Authentication → Email → SMTP settings** must also use Resend. The inspection distinguishes `smtp.resend.com` from another custom SMTP provider or Supabase defaults and checks the staging site URL and `/auth/callback` allowlist. It does not verify SMTP credentials or email delivery. Complete signup on the staging site with the chosen test email and confirm the delivered link; keep the password on the site. The SMTP password/API key remains backend configuration, never a `VITE_*` variable.

## Before merging the billing feature

Verify the eight sandbox plan/seat prices and publish their mappings against the installed canonical catalogue. Prepare the test owner, webhook delivery, and pilot checkout configuration, then activate the test billing gates through the selected deployment/operator path. Record sandbox checkout, initial/later seat purchases and proration, duplicate/delayed webhooks, invoice/portal access, renewal, failed-payment recovery, and cancellation against the deployed commit. Only then complete the required review/checks and merge using a merge commit that preserves the pinned implementation commit.
