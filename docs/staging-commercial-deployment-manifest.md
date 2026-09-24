# Staging commercial deployment manifest

`config/staging-commercial-certification.json` is the reviewed machine-readable source. `scripts/staging-commercial-contracts.mjs` validates every object with strict Zod schemas. Unknown fields, duplicate/missing/unreviewed functions, secret-name drift and scenario-set changes fail. schemaVersion is 1; environment is staging and providerEnvironment is test.

The billing allowlist now also registers `billing-create-paddle-checkout` with
`verify_jwt=true` (14 total functions including the two nonbilling gateways).
It remains disabled without explicit server rollout configuration. Its dedicated
checkout key and trusted URLs are conditional runtime settings, not new required
LS deployment secrets. See [dormant Paddle checkout runtime](paddle-checkout-activation.md)
for configuration and separate future deployment/activation requirements.

## Commit and source

The required base is `7692f4fbc8a47a3f5a9e04a5328c3d716511ffc7`. The confirmed forty-character SHA must equal current HEAD. Git must be clean including untracked files, origin/main must contain the base, and HEAD must descend from origin/main. Supported source branches are main and the Phase A feature branch; a detached checkout is accepted only for GitHub refs/heads/main. The deployed workflow runs only on main. It never checks out arbitrary confirmation input. Review again if origin/main or the dispatched commit moves.

## Migration drift

The manifest freezes 171 migrations from `20260326084615_baseline_schema.sql` through `20260922094541_paddle_certification_fixture_authority_retirement.sql`. Every filename and SHA-256 is recorded. Hashes normalize CRLF to LF so Windows and Linux checkouts agree; other changes fail. The complete directory must match, timestamp versions must be unique and sorted, and the expected last file must match. Historical SQL is unchanged. PADDLE-CHECKOUT-01 appends its dormant checkout lifecycle migration without authorizing remote deployment. PADDLE-CATALOGUE-01 appends the three already-merged BILLING-DB-01, BILLING-DB-02 and BILLING-PROOF-01 migrations plus its new catalogue migration, preserving all 162 previously approved entries. See the [separate synchronization delta](paddle-catalogue-publication.md#frozen-staging-manifest-synchronization). This synchronization does not authorize a remote deployment.

Before apply, an authorized operator supplies the independently reviewed remote ledger version list and private backup digest. During apply, the actual CLI ledger must equal that list and be an exact prefix of the approved files. Unknown remote versions, gaps, reordering, local-only holes and divergent rows block. The pending suffix is precisely the approved list after that prefix. No include-all or repair flag is used. Post-apply ledger must equal the full list. The CLI ledger contains versions, not historical SQL checksums; this cannot detect a remote manual schema edit or an altered historical migration body. The operator must separately resolve schema drift and verify backup recovery before authorization. Never infer an empty remote ledger because no Phase A remote read occurred.

## Secret names and ownership

Only names appear here. No normal verification command requires credentials.

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `BILLING_PROVIDER_ENVIRONMENT`
- `BILLING_APP_BASE_URL`
- `BILLING_PORTAL_ALLOWED_HOSTS`
- `OPEN_WEARABLES_API_URL`
- `OPEN_WEARABLES_API_KEY`
- `ALLOWED_WEARABLE_REDIRECT_ORIGINS`
- `EXERCISE_DATASET_BASE_URL`
- `EXERCISE_DATASET_API_KEY`
- `EXERCISE_DATASET_API_KEY_HEADER`

SUPABASE_ACCESS_TOKEN and SUPABASE_DB_PASSWORD are deploy-runner secrets. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are platform-provided function values. Billing and gateway values belong to their server functions; Vite must never receive provider/service-role secrets. BILLING_PROVIDER_ENVIRONMENT must be test; BILLING_APP_BASE_URL must equal the confirmed staging origin. BILLING_PORTAL_ALLOWED_HOSTS contains exact approved test Store/custom hosts. EXERCISE_DATASET_API_HOST is conditional on the chosen upstream and must be reviewed if required. The gateway may have a fallback configuration, but this certification requires explicit dataset credentials.

The protected runner additionally needs STAGING_COMMERCIAL_AUTHORIZATION, an authorization envelope described in the certification runbook. It is not a function secret. Phase B verifies required name presence across these owners without copying or outputting values. The remoteSecretNamesPresent envelope field is a cross-owner operator attestation, not a list of values installed in Supabase. No secret-setting command is emitted or run.

## Provider adapter

`staging-commercial-provider.mjs` consumes normalized objects only. Phase A fixtures use fake references. A later authorized adapter must hash actual references consistently, enumerate live references to detect test/live collisions, and preserve test_mode/environment, Store/Product/Variant/Price linkage, all six unique plan/cadence pairs, currency, base amounts, plan version 1, interval count 1, absent trial/setup/usage/decimal prices, subscription category, package size 1 and two graduated tiers. All three current plans support seats, so base-only contracts are insufficient for certification. The first tier ends at one unit and charges the plan base; the infinity tier charges 1,200 monthly or 12,000 annual USD minor units and zero fixed fees.

Amounts: Launch 1,900/19,000; Growth 5,900/59,000; Scale 11,900/119,000 monthly/annual USD minor units. No Lemon Squeezy transport exists in this validator. A normalized fixture pass cannot establish that actual Store configuration matches; preserve a private operator verification reference in the authorization process.

## Catalogue parity

`npm run staging:commercial:catalogue` uses only local Docker, anon SQL role and the frozen TypeScript literal. It parses the literal as data rather than executing it. Exact comparison includes every plan, feature label, capacity and trial field. Unexpected keys produce only `[unexpected-field]`, never their names or values.

Future `--staging` mode requires ALLOW_STAGING_CATALOGUE_READ=STAGING_ANONYMOUS_READ, explicit STAGING_SUPABASE_URL, STAGING_ANON_KEY, STAGING_SUPABASE_PROJECT_REF, matching CONFIRM_PROJECT_REF and a distinct PRODUCTION_SUPABASE_PROJECT_REF. Only exact HTTPS `<confirmed-ref>.supabase.co` is accepted; HTTP, localhost, foreign hosts, userinfo, paths and ports fail. Redirects are refused. The anon key is only sent to that confirmed origin, never printed. CLI failures report a constant safe code. This mode was not invoked in Phase A.

## Guarded commands

The remote wrapper now checks conflicting project flags and validates the local link file for linked DB commands. It does not append unsupported --project-ref flags to db push or migration list. Passwords must come from the environment. The wrapper invokes an installed CLI without a shell; staging installs v2.109.1. Other manual users of the wrapper must explicitly install that CLI. The production workflow is unchanged. See [certification](staging-commercial-certification.md) for the exact function list and authorization boundary.

PADDLE-WEBHOOK-01 appends the local-only ingestion migration. The new Paddle endpoint is deliberately absent from the existing staging apply function allowlist; deploying it and configuring its notification secrets require a separately reviewed staging deployment.

PADDLE-CERT-FIXTURE-01 appends a staging-QA certification authority migration for separate review. This manifest update does not authorize remote deployment or QA-account designation. The fixture RPCs must be retired under PADDLE-CERT-FIXTURE-02 before Paddle sales activation.

PADDLE-CERT-FIXTURE-02 appends exactly one retirement migration, preserving all
170 previous entries and hashes, including PR #232. The latest pointer advances
to `20260922094541_paddle_certification_fixture_authority_retirement.sql`.
Webhook staging ingress certification already passed. After deployment, the
temporary fixture RPCs and private gate are absent; permanent historical evidence
remains. See the [retirement and Auth cleanup runbook](paddle-checkout-certification-fixture.md).
This manifest change neither deploys staging nor enables sales/reconciliation.

# Local PADDLE-RECONCILIATION-01 inventory

The local migration inventory now contains 173 migrations, ending with
`20260923151445_paddle_initial_purchase_reconciliation.sql`. The previous 172
entries and hashes are unchanged. This checksum update is not deployment or
reconciliation-enablement authorization. No remote target is changed by this task.

# Local PADDLE-AUTO-RECONCILIATION-01 inventory

The inventory contains 174 migrations, ending with
`20260923220540_paddle_auto_initial_purchase_reconciliation.sql`. All previous
173 entries and hashes remain unchanged. This local implementation does not
apply migrations remotely or enable either Paddle policy flag. The migration
performs no data repair; an already-processed checkout remains unchanged until
an explicitly enabled, fully proven reconciliation call.
