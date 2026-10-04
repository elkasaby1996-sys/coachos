# Paddle-only retirement deployment manifest

RepSync is pre-launch. Paddle is the sole active provider; LS history remains inert. A valid local contract is not deployment authority.

scripts/billing-deployment-contract.mjs is the authoritative function/security/config/scenario metadata. config/staging-commercial-certification.json freezes186 normalized hashes. Migrations1–184 and their aggregate prefix fingerprint are immutable. Migration185 is pre-launch LS database-authority retirement, not customer migration or a forensic classifier. Migration186 separately implements catalogue/cadence activation and normalized paid-state projections; migrations1–185 are unchanged by PAY-04.

## Exact deployment unit

Fourteen billing functions plus two nonbilling gateways. The actual Paddle webhook is included; the three LS names remain deployable tombstones to overwrite old remote code.

| Function                              | Class         | verify_jwt | Auth / unauthorized response                                                   |
| ------------------------------------- | ------------- | ---------- | ------------------------------------------------------------------------------ |
| billing-create-lemon-squeezy-checkout | LS_TOMBSTONE  | true       | none-static; gateway-401; handler-410                                          |
| billing-create-paddle-checkout        | PADDLE_ACTIVE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-lemon-squeezy-webhook         | LS_TOMBSTONE  | false      | none-static; handler-410                                                       |
| billing-paddle-webhook                | PADDLE_ACTIVE | false      | Paddle-Signature-raw-body-timestamp-HMAC; 400; oversize-413; configuration-503 |
| billing-create-customer-portal-link   | LS_TOMBSTONE  | true       | none-static; gateway-401; handler-410                                          |
| billing-update-payment-method         | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-preview-plan-change           | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-change-subscription-plan      | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-cancel-scheduled-plan-change  | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-refresh-plan-change           | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-preview-coach-seat-change     | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-change-coach-seat-quantity    | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-cancel-scheduled-seat-change  | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| billing-refresh-coach-seat-change     | SHARED_PADDLE | true       | getUser-and-account-owner; 401-or-403                                          |
| open-wearables                        | NON_BILLING   | true       | existing-gateway-contract; 401-or-403                                          |
| exercise-dataset-search               | NON_BILLING   | true       | existing-gateway-contract; 401-or-403                                          |

marketing-lead-submit is NON_BILLING outside this billing deployment unit. sync-exercises has no index.ts entrypoint and is REMOVE_FROM_ACTIVE_DEPLOYMENT. Neither omission authorizes remote deletion. Unexpected remote billing/LS/portal functions stop for separate classification.

Entitlements, recovery state and capacity/reservations also use existing DB RPCs; no separate recovery/entitlement Edge function is invented.

## Security and identity

Both webhook names use verify_jwt=false. Paddle instead authenticates bounded original raw bytes with Paddle-Signature HMAC/timestamp checks before ingestion. Invalid signature400, oversize413, configuration503, unsupported method405. Acceptance alone is not commercial activation.

Other billing endpoints use verify_jwt=true. Active handlers additionally authenticate getUser/account owner and enforce server authority. Tombstone handlers do not authenticate/read secrets, but checkout/portal gateway missing JWT returns401 before handler410. All tombstones: POST410, other405, inert OPTIONS, no-store, no provider/DB/runtime/logging side effects. Portal retains BILLING_PORTAL_RETIRED; checkout/webhook BILLING_PROVIDER_RETIRED.

Future apply passes --no-verify-jwt only to the two approved webhooks, validates local config and checks actual remote JWT/version metadata after deployment. Previously existing functions must advance version; unchanged version cannot prove overwrite. Independent source-artifact/response/no-side-effect probes remain mandatory.

## Drift gates

Require clean exact reviewed main execution SHA/base ancestry; an uncommitted tooling candidate is not deployable. Version-2 phase contracts allow exact180 for baseline181–184, then separately authorized184→185→186 with intervening retirement/schema checkpoints. Fixed resume states require fresh observation/recovery authorization. Each bounded artifact and dry-run must match its exact phase sequence. Never repair ledgers, select arbitrary targets or include unreviewed migrations.

Envelope binds manifest, complete non-private function-source artifact digest, project/origin, fresh actual read-only inventory, backup identity/digest/restore proof, disabled checkout/sales/reconciliation and expected pending suffix. Recheck schema/function/ACL/secret-name digests immediately before mutation. No secret values are logged; no LS key is required.

Post-apply186 ledger, native RPC denial, zero definer bypass and complete function metadata are required. CLI completion is not certification or production release. See [staging procedure](staging-commercial-certification.md), [production readiness](production-billing-retirement.md), [evidence](staging-commercial-evidence.md) and [rollback](staging-commercial-rollback.md). Original outdated manifests are archived.

PAY-04 scope: migration 185 is unchanged retirement authority; migration 186 is trusted Launch/Growth/Scale monthly/annual activation and the bounded normalized paid-state seam. Scheduled plan/seat cancellation is intentionally unsupported (HTTP409 CANNOT_CANCEL); subscription cancellation/undo remains a separate product decision. No remote deployment or certification is implied.

# PAY-05B bounded deployment artifacts

The canonical [phase procedure](staging-release-phases.md) preserves this full 186-migration manifest. Disposable artifacts project exact fixed prefixes 184, 185 and 186; every filename/hash is checked before guarded execution. This projection never edits or hides canonical migrations. The final billing payload is frozen at `9a9f79ff2ba7aada9ff2c24f162360d9c03b33a0`; release tooling successors must preserve it.
