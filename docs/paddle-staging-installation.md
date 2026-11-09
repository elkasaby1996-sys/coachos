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

Use [this project's Edge Function secrets](https://supabase.com/dashboard/project/exmrksgdikfprtfeltzu/functions/secrets). The report establishes that these exact names are absent here; it does not inspect secrets in another project or their values in GitHub.

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

## Installation payload and deployment decision

The canonical payload remains pinned to `8af05aa48cbccca694b2da447d77f8977ec3401a`. Local plan generation validates the source and prepares the existing phases without contacting staging:

```sh
node scripts/staging-bootstrap.mjs plan
node scripts/staging-release.mjs plan BASELINE_180_TO_184
node scripts/staging-release.mjs plan RETIREMENT_ACTIVATION_184_TO_188
```

These cover migrations 0→180→184→188 and the corresponding existing deployment artifacts. They are plans, not remote authorization or evidence that the initial installation is ready to execute. The first 186 migrations remain unchanged; the last two add the completed billing implementation.

The existing bootstrap/release execution path still requires `main`, an enabled founder policy, and trusted approval/replay integrations. The source policy has `enabled: false`, and those integrations are unavailable in the operational runner. Adding `Ahmed-billing` to GitHub's allowed staging branches fixed the read-only status check; it did not enable this installer.

A staging authorization design decision is pending: implement a feature-branch installation path under GitHub's actual required environment review, with the fixed staging target and fresh-project checks, or complete the custom signed-approval system. Do not infer that successful inventory authorizes bypassing either path's controls. Keep production and archived projects outside this initial staging installation and keep `main` unchanged until testing succeeds.

After that path is ready, install the verified migrations and billing functions, then deploy the matching frontend to `https://repsync-staging-replacement.netlify.app`. Its build needs `VITE_SUPABASE_URL=https://exmrksgdikfprtfeltzu.supabase.co`, that project's public anon key, `VITE_BILLING_PROVIDER=paddle`, `VITE_PADDLE_ENVIRONMENT=sandbox`, and `VITE_PADDLE_SANDBOX_CLIENT_TOKEN`. The inventory did not verify frontend configuration or deployment.

## Before merging the billing feature

Verify the eight sandbox plan/seat prices and publish their mappings against the installed canonical catalogue. Prepare the test owner, webhook delivery, and pilot checkout configuration, then activate the test billing gates through the selected deployment/operator path. Record sandbox checkout, initial/later seat purchases and proration, duplicate/delayed webhooks, invoice/portal access, renewal, failed-payment recovery, and cancellation against the deployed commit. Only then complete the required review/checks and merge using a merge commit that preserves the pinned implementation commit.
