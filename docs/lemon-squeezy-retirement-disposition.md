# Lemon Squeezy pre-launch retirement

RepSync has not commercially launched. The founder locks the absence of real production customers, payments, paid subscriptions and LS obligations. Lemon Squeezy was attempted in development/staging Test Mode with synthetic users; the merchant application was rejected. Paddle was approved and is the sole intended launch provider. This is not migration of real legacy subscribers.

The completed local Task-01/02 candidate establishes:

- APPLICATION_RUNTIME_LS_EXECUTION = ZERO
- DATABASE_APPLICATION_LS_AUTHORITY = ZERO
- REMOTE_DEPLOYED_LS_EXECUTION = NOT ASSESSED

Historical LS schema, immutable migrations 1–184, identifiers, audit rows and cross-ledger ownership guards remain deliberately retained. Owner-only historical function bodies are administrative evidence, not application billing authority. Unknown ownership still fails closed.

## Migration 185

20261001224659_lemon_squeezy_retirement_disposition.sql is narrow pre-launch database-authority retirement, not a financial forensic engine. Normalized SHA256: a972af711406f8e337a1519cc43a2ec035aa49c55f867a220f2f811fae38163f. PAY-04 leaves it unchanged and adds separate commercial activation migration186; the current manifest contains186 migrations. Local/repository evidence says185 is undeployed to shared environments; remote ledgers remain unassessed. Contrary evidence is a STOP.

It revokes 28 native LS RPCs from PUBLIC/anon/authenticated/service_role, closes shared definer fallbacks, preserves Paddle/v2 paid authority and trial/free capacity, and performs no retained-row deletion/update/reclassification. Task 02 records full local SQL, ACL, concurrency and populated 184→185 preservation proofs. Task 03 changes no database authority and does not claim remote verification.

## Temporary tombstones

Keep billing-create-lemon-squeezy-checkout, billing-lemon-squeezy-webhook and billing-create-customer-portal-link deployable to overwrite old remote implementations. POST 410, other methods 405, inert OPTIONS, no-store; zero runtime/provider/DB/secret/payload-logging dependencies. Checkout/webhook use BILLING_PROVIDER_RETIRED; the existing portal uses BILLING_PORTAL_RETIRED.

Checkout/portal retain verify_jwt=true, so missing JWT receives gateway 401 before the static handler. LS webhook verify_jwt=false allows direct 410. Verify deployed artifact/version identity, handler behavior, no side effects and DB denial separately. Allowlist omission never proves remote deletion.

## Separate future gates

1. Review/commit the combined candidate under separate authorization; require clean exact SHA and green local gates.
2. Authorized read-only production zero-obligation and staging synthetic-data classification.
3. Fresh private environment/commit-bound backup and disposable restore proof.
4. Authorized retirement deployment of only migration 185 and exact Paddle/shared/tombstone set.
5. Independent artifact, response, no-side-effect, history and DB-authority verification.
6. Authorized staging quarantine/reset and fresh Paddle cohort.
7. LS remote secret/config removal only after consumer/tombstone verification.
8. Paddle-only staging certification; separate production commercial-release authorization.

Current Paddle runtime is sandbox-only. Production live billing and application subscription cancel/resume remain explicit release/product-decision blockers, not silently supported capabilities.

See [deployment](staging-commercial-deployment-manifest.md), [reset](staging-billing-reset.md), [production inventory](production-zero-ls-obligations.md), [matrix](paddle-only-certification.md) and [configuration](paddle-configuration-readiness.md).

The original forensic design and R1/R2/R3/R4 review notes are preserved in [historical evidence](archive/prelaunch-tooling/lemon-squeezy-retirement-disposition.md.txt), not current launch requirements.
