# Production retirement deployment readiness

Local workflow/contracts only; no production access or hosted execution. .github/workflows/supabase-deploy-production.yml replaces the former unguarded migration push/nonbilling-only deployment with main-only protected supabase-production modes: plan (default), read-only preflight and separately authorized retirement apply.

## Retirement-only contract

The shared repository manifest supplies migration hashes/function set/JWT metadata, not staging target configuration. Target project/origin and envelope come only from PRODUCTION variables/PRODUCTION_RETIREMENT_AUTHORIZATION. Staging values are comparison boundaries, never deployment targets. The confirmed reviewed SHA must match clean dispatched main/base ancestry.

The strict production envelope binds commit, manifest/artifact, production project/origin, approved184/185/186 prefix, fresh inventory, production zero-obligation classification, backup digest/identity and restore proof. providerMode=disabled; checkout/sales/reconciliation disabled; productionReleaseAuthorized=false. A staging envelope/backup, stale proof, unexpected root, wrong origin/target or older/divergent suffix stops.

Future preflight validates local contracts/quality/units, then performs only read-only Management API metadata and schema-qualified SELECTs. Apply rechecks actual inventory before mutations, links through the guarded wrapper, compares ledger and actual dry-run suffix, applies only the exact reviewed185/186 ordered suffix or empty and deploys every Paddle/shared billing function plus three tombstones and existing gateways with proper JWT flags. No function delete, provider transaction, config/secret/flag update, fixture reset or migration repair is automated.

Post-deploy: all186 versions; function names/JWT and advancing versions; zero native/indirect LS application grants; no forensic classifier; disabled flags. Command/metadata completion does not prove handler source, HTTP behavior or no downstream side effects. Independent artifact download/version proof and tombstone/Paddle security/history probes remain pending certification gates. Partial/failing work emits sanitized stage/count status, never raw errors/envelopes.

## Explicit production commercial-release blockers

Current Paddle factories are sandbox-only and reject generic/live API/webhook/client configuration. Changing sandbox→live secrets is not a supported implementation or authorized action. A separately reviewed live-runtime/configuration/mapping/SDK delta and real certification are required before commercial production billing can be enabled.

Application subscription cancellation/resume is not implemented; scheduled plan/seat cancellation and cancellation-status presentation are not substitutes. Product decision is required before launch.

Remote project settings, actual ledgers/functions, production obligations, backup/restore evidence and hosted workflow permission/API response compatibility are NOT ASSESSED. Read-only endpoint unavailability/permission/schema mismatch stops; never grant more authority or silently switch to a writable endpoint.

Release authorization is a separate later gate after production inventory, staging retirement/reset/certification, live support and product decisions. This workflow can prepare the retirement-only change but never declares Paddle commercial launch ready.

PAY-04 scope: migration 185 is unchanged retirement authority; migration 186 is trusted Launch/Growth/Scale monthly/annual activation and the bounded normalized paid-state seam. Scheduled plan/seat cancellation is intentionally unsupported (HTTP409 CANNOT_CANCEL); subscription cancellation/undo remains a separate product decision. No remote deployment or certification is implied.
