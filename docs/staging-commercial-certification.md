# Staging commercial certification

PR-PRICE-11 Phase A is local preparation. No staging commercial scenario has been run. Local fixtures never certify a real test purchase, deployed webhook, staging billing or production readiness.

## Audit and deliberate gate

Base: `7692f4fbc8a47a3f5a9e04a5328c3d716511ffc7`, fetched from origin/main. It contains PR-PRICE-10 public catalogue v2 (three plans, two saleable public features, no public add-ons), PR-PRICE-09 quantity billing, PR-PRICE-08 access enforcement and the PR-PRICE-05/06/07 Checkout, webhook, portal and plan foundations.

The previous staging workflow repeated npm ci, lint, build, full units and CLI setup. It linked using SUPABASE_PROJECT_ID, pushed all pending migrations and deployed only open-wearables and exercise-dataset-search. All eleven billing entrypoints were omitted although all eleven JWT entries existed. Open Wearables relied on the JWT default; Phase A makes that true contract explicit.

Baseline full units: 1,784 tests, 1,771 passing and 13 failures in nine files, no skips. **Apply requires a restored, fully green full suite.** No failure exemptions, retries, skipped tests, count-only allowlist, continue-on-error or production permission follow from this harness. Exact failure identities are retained in the verification report to detect regressions; they are not an apply waiver.

CI runs lint/format/build and local plus configured-account browser checks. Release readiness is manual and uses configured secrets; verify:release itself runs lint, format, build and browser smoke, not units. Supabase CI starts a local DB, lints and runs pgTAP. The existing manual migration-status workflow links then lists the remote ledger. The backup workflow dumps roles/schema/data to a seven-day artifact; it does not back up Storage objects. Neither workflow was invoked. Production workflow behavior is unchanged and is not authorized by this PR.

## Phase A commands

```powershell
npm run staging:commercial:validate
npm run staging:commercial:test
npm run staging:commercial:plan
npm run staging:commercial:evidence
npm run staging:commercial:catalogue
```

Validate and tests need no credentials or network. The planner performs only filesystem and read-only Git operations. The default plan invocation exits 1 when confirmations are absent; it writes a safe blocked artifact. Evidence exits 1 for the unrun template. Catalogue defaults to the fixed local Docker database, assumes anon role and compares the whole v2 payload.

For a positive synthetic plan, set CONFIRM_COMMIT_SHA to HEAD, both STAGING_SUPABASE_PROJECT_REF and CONFIRM_PROJECT_REF to the same fake twenty-letter ref, PRODUCTION_SUPABASE_PROJECT_REF to a different fake ref, STAGING_APPLICATION_ORIGIN and CONFIRM_APP_ORIGIN to `https://staging.example.com`, and PRODUCTION_APPLICATION_ORIGIN to `https://app.example.com`. Run on a clean reviewed checkout. These examples are placeholders, not project discovery. A successful plan still reports a blocked commercial verdict. Never use synthetic target values for apply.

The planner accepts `--manifest`, `--confirm-commit-sha`, `--confirm-project-ref`, `--confirm-app-origin`, and `--evidence-label`. Protected environment variables supply the independent target expectations. Origin must be an exact HTTPS origin with a staging DNS label, no credentials/port/path, and must differ from the production origin. Unknown production deny-values block validation; do not guess them. Custom staging domains without a staging label require a reviewed policy change.

## Separately authorized Phase B

Use `.github/workflows/supabase-deploy-staging.yml` only after authorization naming the exact resources. Required dispatch inputs: mode (default plan), confirm_commit_sha, confirm_project_ref, confirm_app_origin and evidence_label. The workflow is main-only, serializes all staging runs and uses protected environment `supabase-staging`; configure required reviewers on that environment. Branch protection and environment protection are operational prerequisites, not created by Phase A.

Plan installs dependencies once, runs contract checks and writes sanitized commands. It receives no Supabase or provider credentials and installs no Supabase CLI. Apply adds quality checks, pinned CLI v2.109.1, explicit authorization preflight, a fresh blocking full-unit run, guarded link, exact remote-prefix validation, migration dry-run/push, thirteen explicit function deploys and final ledger verification. No provider API, remote secret write or auth-settings write is automated. Raw CLI stdout/stderr are captured privately and are never printed or uploaded.

Supply `STAGING_COMMERCIAL_AUTHORIZATION` privately through the protected environment only after review. Its strict schema is exported by `scripts/staging-commercial-apply.mjs`. It binds reviewedCommit, canonical JSON manifest SHA-256, target project/origin SHA-256, approvedRemoteVersions, backupEvidenceSha256, exact auth site/callback settings, normalized provider mappings, required name-presence attestation, billing environment/origin, portal hosts, and portal/webhook/rollback review attestations. For the manifest hash use SHA-256 of JSON.stringify of the validated JSON object. Fake provider references are rejected at apply. The envelope must be reissued after any commit, migration, manifest or target change. Attestations are operator evidence; they do not query or configure hosted settings.

Auth proof must include signup enabled, confirmation enabled, exact site origin, exact `/auth/callback` redirect, an actual synthetic confirmation round-trip and denial of malicious redirect input. Validate host configuration separately before declaring CERT-AUTH-001 passed. Never push local TOML auth localhost settings to hosted auth.

## Deployment allowlist

- `billing-create-lemon-squeezy-checkout`
- `billing-lemon-squeezy-webhook`
- `billing-create-customer-portal-link`
- `billing-preview-plan-change`
- `billing-change-subscription-plan`
- `billing-cancel-scheduled-plan-change`
- `billing-refresh-plan-change`
- `billing-preview-coach-seat-change`
- `billing-change-coach-seat-quantity`
- `billing-cancel-scheduled-seat-change`
- `billing-refresh-coach-seat-change`
- `open-wearables`
- `exercise-dataset-search`

Owner endpoints and the two nonbilling functions require JWT; the HMAC-authenticated webhook has verify_jwt=false. No directory glob controls deployment. marketing-lead-submit and sync-exercises are intentionally outside this reviewed deployment set.

## Scenario matrix

All scenarios are critical. The JSON manifest includes concrete prerequisites, safe inputs, steps, local/provider outcomes, required assertion codes and cleanup. Monthly and annual activation steps cover all three plans. Source: `config/staging-commercial-scenarios.json`.

| ID                 | Scenario                     | Real staging status |
| ------------------ | ---------------------------- | ------------------- |
| CERT-DEPLOY-001    | Migration history            | not_run             |
| CERT-DEPLOY-002    | Function allowlist           | not_run             |
| CERT-AUTH-001      | Signup and callback redirect | not_run             |
| CERT-CATALOGUE-001 | Anonymous v2 parity          | not_run             |
| CERT-CHECKOUT-001  | Monthly activation           | not_run             |
| CERT-CHECKOUT-002  | Annual activation            | not_run             |
| CERT-WEBHOOK-001   | Signature rejection          | not_run             |
| CERT-WEBHOOK-002   | Duplicate replay             | not_run             |
| CERT-WEBHOOK-003   | Delayed creation             | not_run             |
| CERT-PORTAL-001    | Portal URL security          | not_run             |
| CERT-PORTAL-002    | Cancellation and resume      | not_run             |
| CERT-RECOVERY-001  | Payment failure and recovery | not_run             |
| CERT-PLAN-001      | Immediate upgrade            | not_run             |
| CERT-PLAN-002      | Scheduled downgrade          | not_run             |
| CERT-PLAN-003      | Cancel scheduled downgrade   | not_run             |
| CERT-SEAT-001      | Seat increase and payment    | not_run             |
| CERT-SEAT-002      | Seat reduction               | not_run             |
| CERT-SEAT-003      | Cancel reduction             | not_run             |
| CERT-ACCESS-001    | Active full access           | not_run             |
| CERT-ACCESS-002    | Grace existing delivery      | not_run             |
| CERT-ACCESS-003    | Expired recovery access      | not_run             |
| CERT-SECURITY-001  | Log redaction                | not_run             |
| CERT-ROLLBACK-001  | Rollback drill               | not_run             |

Local Billing suites exercise injected provider transports and local SQL. A real staging run must separately prove provider behavior and deployed boundaries. Record fixture and staging scopes distinctly.

## Authorization stop

Phase A stops before any remote operation, including remote migration list or link. The generated `output/staging-commercial/plan/authorization-request.json` names the reviewed commit, full approved migration range/hashes, exact functions/secrets/scenarios, proposed command order and placeholder project, application origin, test Store and webhook endpoint. Review that artifact and fill named resources privately before requesting Phase B. It is a request, not authorization. No automatic purchase, webhook registration, mapping insertion, secret change or live operation follows from it.

See [deployment manifest](staging-commercial-deployment-manifest.md), [evidence](staging-commercial-evidence.md), [rollback](staging-commercial-rollback.md), and [verification](pr-price-11-verification.md).
