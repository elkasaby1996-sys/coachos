# RepSync staging release phases (PAY-05B)

This is deployment tooling, not deployment or Paddle certification evidence. The immutable billing payload is `9a9f79ff2ba7aada9ff2c24f162360d9c03b33a0`. All migrations, application source, final Edge source and Supabase runtime configuration must remain identical in Git to that payload. Windows checkout CRLF conversion is normalized for deterministic artifact hashes; deployment artifacts never rewrite canonical files.

## Plan and preflight

`npm run staging:release:plan -- BASELINE_180_TO_184` is local only. It validates the full 186 manifest/frozen payload and emits a sanitized deterministic plan. There is no arbitrary migration target, skip, force or repair input.

The manual main-only `supabase-deploy-staging.yml` workflow runs quality checks and the full unit suite before protected preflight/apply. Both remote modes require a new version-2 `STAGING_RELEASE_AUTHORIZATION` and `STAGING_RELEASE_RECOVERY_BUNDLE`. Old retirement envelopes are incompatible. The old unbounded staging apply CLI is disabled. Production has a separate workflow and receives no request from this runner. Production project/origin values are deny-targets only.

Envelope schemas are exported from `scripts/staging-release-contracts.mjs`. Build private envelopes from observed facts, never the fake unit fixture. Bind execution SHA, frozen payload digest, full manifest, exact start/end ledgers, every pending migration/hash, three fixed artifact digests, final/containment/outside function digests and JWT contracts, inventory, recovery documents, configuration, provider mapping attestations, disabled policy, creation/expiry, operational drain/retry review and the database checkpoint-contract digest. Approval applies to that exact operation.

Authorization expires within 30 minutes; inventory/configuration evidence is at most 15 minutes old; backups are at most 24 hours old and must remain retained. The runner revalidates source, authorization, configuration, flags, scheduled boundary and exact inventory immediately before each mutation. A CLI dry-run cannot satisfy the final drift check. Expired evidence blocks the phase, including midway through deployment.

Inventory age starts before the first read, not when collection completes. Collection exceeding 60 seconds fails closed, and a second database inventory must match the first before the observation is usable. The runner checks its remaining freshness after source validation and before mutation. Artifact validation rejects symlinks/junctions in every path component inside the disposable root, not only individual files.

## Baseline 180 to 184 and checkpoint 184

`BASELINE_180_TO_184` requires exactly the reviewed 180 prefix. It constructs a disposable directory containing precisely migrations 1–184 and independently checks filenames/hashes. The pinned CLI dry-run must list 181–184 in order, then the guarded push runs in that directory. Canonical migrations 185/186 remain present in the repository and absent from this artifact.

No function deployment occurs in baseline. Post-apply requires ledger 184, the populated-rehearsal database contract (definitions, ACL/RLS and schema), an empty payment-method preparation table, disabled policy, and unchanged retained public rows/Auth users. The generated checkpoint contains hashes/counts and can be bound into the next private authorization. CLI success alone cannot pass it.

## Containment and drain

`RETIREMENT_ACTIVATION_184_TO_186` is a separate authorization with a fresh 184 recovery checkpoint. It first deploys the three final frozen LS tombstones, then static release-only 503 artifacts for the eleven remaining approved billing names, including the otherwise missing payment-method name. The final business source is never modified. Containment has no imports, environment access, database client or provider capability; exact source equality is enforced. Webhooks return retryable failure and never acknowledge discarded evidence.

Every deployment is followed by pinned CLI `functions download --use-api` and exact transitive source-digest verification. This includes the existing Paddle checkout's relative dependency on `src/lib/legal-site.ts`. JWT metadata and `ACTIVE` status are independently checked; missing status, `THROTTLED` and `REMOVED` cannot pass. Missing, relocated, rewritten or incomplete downloaded source fails closed; a version increment is insufficient. The first authorized remote release must establish that the pinned download format preserves this source closure. No remote validation is claimed by local tests.

Authenticated handler POST probes verify all three tombstones (410 and the reviewed code), using a privately supplied `STAGING_TOMBSTONE_PROBE_JWT`. Gateway 401 is not accepted as tombstone proof. Source identity establishes absence of provider/DB capabilities; full retained-row fingerprints and inventory before/after probes detect DB/configuration changes. No provider API is called by the release runner.

Clients/jobs must be paused and pre-existing invocations drained under the approved quiet window. The repository has no cross-service atomic lock that can forcibly stop a previously dispatched provider request. Operator quiescence/provider-request audit and a reviewed upstream retry window are required evidence, not automated claims. The runner blocks creating/ready/ambiguous checkout attempts, nonterminal unscheduled plan/seat work, payment-method work, received/deferred/failed/manual-review webhook work and open certification fixtures. It never deletes, completes or reclassifies them. A reviewed scheduled operation is allowed only when its count matches authorization, every effective date is non-NULL and finite, and its earliest boundary is after authorization expiry. An explicit invalid-boundary count is required, so a future minimum cannot hide another row with a missing or infinite date.

## Retirement 185 and retirement checkpoint

The retirement artifact contains precisely 1–185. From verified 184, dry-run must contain only 185. After push, exact ledger/schema contracts, all 28 native RPC denials, indirect callable-wrapper reachability, retained history and disabled policy are checked. Tombstones remain deployed throughout. Any failed retirement proof stops before 186. No LS grant/code restoration occurs.

## Activation 186 and final function deployment

From a passed 185 checkpoint, the 1–186 artifact dry-run must contain only 186. Exact 186 database contracts prove the reviewed provider/catalogue surfaces and permissions. No provider transaction or runtime-flag activation occurs.

Only then deploy the fourteen final billing functions. Deploy the two allowlisted nonbilling functions in a distinct substage. Verify each exact source closure and JWT setting. Final verification repeats ledger/database/history/policy checks and requires final identities for every billing/nonbilling name, all tombstones intact, and zero containment remaining. The outside-scope `marketing-lead-submit` is never deployed/deleted; if present, its frozen source identity is independently checked. Unclassified remote functions block the release.

Only these successful source/behavior/database checks permit ZERO classifications for application LS execution, database application LS authority, active tooling LS dependency and remote deployed LS execution. Historical migration bodies and retained LS rows remain evidence and do not fail the retirement classification merely because they reference LS.

## Configuration and recovery evidence

The current phase contracts deliberately require the complete final configuration attestation even for baseline: sandbox environment, dedicated API/checkout/payment-method credentials, webhook secret, payment page, disabled checkout, frontend token and exact staging auth/origin configuration. Function-owned secret-name presence is checked remotely; workflow/frontend ownership is attested separately. The exact relevant secret-inventory and Auth configuration digests are rechecked. Credential validity, merchant/page approval, origin allowlists and provider catalogue facts require separate private operator proof. Secret-name presence is not credential validation.

Do not set/retire secrets through this runner. LS secret removal is later separate authorization after final consumers, tombstones and DB retirement pass. Historical LS catalogue rows are preserved. Pilot checkout/sales/reconciliation activation and a fresh isolated owner remain separate purchase-certification gates. Global reconciliation can process historical Paddle events; pilot checkout alone does not isolate them.

The recovery bundle contains the exact original JSON bytes as `backupEvidence` and `restoreProof` strings. Their SHA-256 values must match the authorization. Backup and restore documents now require version **3**; older documents cannot satisfy the phase contract. Backup metadata must match staging/project/commit/time, portable managed exclusions, Auth inclusion, all three nonempty dump components and the separate `migration-ledger.json` artifact. The pinned CLI excludes its migration ledger from ordinary dumps. The protected backup job captures full ledger rows before the dumps and compares them afterward, rejecting any version, name or statement drift. Authorization binds both the exact artifact bytes (`migrationLedgerSha256`) and complete ordered row digest (`ledgerRowsSha256`), plus the exact prefix. A boolean assertion alone is insufficient.

Restore proof version 3 must name `environment`, `executionCommit`, `projectSha256`, `backupEvidenceSha256`, `verifiedAt`, `sourceLedger`, `restoredLedger`, `migrationLedgerSha256`, `restoredLedgerRowsSha256`, `isolatedTarget`, `authUsersRestored`, `retainedHistoryVerified`, `expectedApplicationTargetCount`, `restoredApplicationTargetCount`, and `retirementCompatible`. All success assertions must be true; target counts and the full ledger row digest must agree with backup evidence and authorization. Private restore rehearsal must verify the dump bytes, every application/custom-schema target, Auth identities and full ledger rows using `verifyRestoredLedger` in `scripts/staging-backup-ledger.mjs`. Reconstructing the same version list by replaying migrations is not ledger recovery proof. These documents remain operator-reviewed evidence; the release runner never restores, repairs the ledger or generates a backup. See the [private restore procedure](staging-logical-backup.md#pay-05b-migration-ledger-recovery).

Backup and release workflows share concurrency group `supabase-staging-commercial`, without cancellation. This prevents their protected jobs overlapping. Manual actions outside these workflows still require the same operator exclusion window. Roles/schema/data are separate logical snapshots; Storage object bytes and five approved managed Auth relations are outside the portable backup. Preserve private recovery evidence beyond artifact retention where needed.

## Failure, recovery and resume

Every failure stops. Sanitized recovery evidence records the actual freshly observed ledger count/inventory digest, completed substages, each approved function's version/JWT and final/containment/unknown identity, failure category, execution SHA and previous authorization digest. A source proof is valid only for the same observed deployed generation; changes during download block. If observation fails, state is unknown; do not infer it from CLI status. No ledger repair, automatic retry/resume or LS restoration exists.

Supported newly authorized resume phases are fixed: baseline from 180/181/182/183 to 184, cutover from 184, activation from 185, and finalization from 186. A resume envelope must bind the previous recovery evidence/digest, be created later, re-observe the exact supported prefix and bind a fresh backup/restore proof for that actual starting state. It redeploys containment and re-proves retirement before proceeding where applicable. Unsupported prefixes require a separate review; they cannot select an arbitrary target. Recovery plans never execute themselves.

Completed deployment evidence leaves every commercial scenario `not_run`. First purchase, webhook delivery certification, catalogue validation, plan/seat/payment recovery and production commercial readiness require their own authorization and observable outcomes.

## Local rehearsal

`scripts/test-staging-release-rehearsal.py` only accepts the fixed disposable local reconciliation workdir/container and cached CLI 2.109.1. It reuses existing legacy/catalogue/signed-ingress/initial-period fixtures, preserving all fixture actors. It reconstructs 180, exercises bounded local pushes to 184/185/186, compares retained rows/Auth users, checks ACL/RLS and retirement/provider boundaries, and generates source-bound checkpoint digests. Fixed local resets also establish partial-baseline resume contracts. Existing checkpoint digests must match; a rehearsal never silently replaces reviewed digests. Cleanup reconstructs the disposable DB at 186 with disabled policy.
