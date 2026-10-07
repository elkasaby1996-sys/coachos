# Staging logical backup

Fresh replacement projects use [the fixed empty bootstrap](staging-fresh-bootstrap.md)
before the first 180 backup. The archived staging and production projects are deny
targets. Bootstrap does not substitute for the fresh 180 backup and actual restore
proof, nor for the later fresh 184 recovery bundle. Replacement identity must be
reviewed in the source registry and match the workflow configuration.

PR-OPS-STAGING-01 binds the existing manual backup workflow to the protected `supabase-staging` GitHub environment. It creates database logical dumps and sanitized evidence for review before PR-PRICE-11 Phase B migration apply. Creating an artifact does not prove restore success or authorize apply. Restore remains a separately reviewed operation.

## Configure after merge

1. In repository Settings → Environments, configure `supabase-staging` with required reviewers and a deployment branch restriction to `main`. The YAML names the environment; administrators must configure its protections.
2. Set environment variables `STAGING_SUPABASE_PROJECT_REF` and `PRODUCTION_SUPABASE_PROJECT_REF` to independently verified, distinct twenty-letter lowercase project refs. Missing or invalid production deny-values block the run.
3. In the **staging** Supabase dashboard, open **Connect**, select the PostgreSQL URI for **Session Pooler** (port 5432), and replace the password placeholder privately with the database password, percent-encoding reserved characters. Verify the pooler username is `postgres.<staging-ref>`. Store the complete URI as environment secret `STAGING_SUPABASE_DB_URL` in `supabase-staging`. Do not use a repository-wide generic secret. No Supabase access token or service-role token is needed.

The validator accepts the bound Session Pooler host `aws-<number>-<region>.pooler.supabase.com` with that exact username, or direct `db.<staging-ref>.supabase.co` with username `postgres`, using `postgres://` or `postgresql://`, database `/postgres`, and port 5432 (or its default). Transaction pooler port 6543, arbitrary hosts, query overrides, fragments, missing passwords, local/internal hosts, placeholders and production refs anywhere in the decoded URL are rejected. Confirmation must exactly match staging. Unsupported connection formats require a reviewed validator change.

## Dispatch and review

1. In GitHub Actions, select **Supabase Staging Logical Backup** → **Run workflow**, selecting `main`.
2. Set `confirm_project_ref` to the verified staging ref and `evidence_label` to `pre-commercial-apply` or another non-sensitive lowercase alphanumeric/hyphen label (1–64 characters, first character alphanumeric). Never put refs, credentials, tokens or customer information in the label. Approve the protected environment after reviewing the target and commit.
3. Wait for success and download `supabase-staging-logical-backup-<run-id>-<evidence-label>`. The artifact expires after **seven days**. Preserve a protected recovery copy before expiration if the apply/recovery window extends beyond that period; never commit it to Git.
4. In the extracted backup directory, verify `sha256sum -c SHA256SUMS.txt`. Compute `sha256sum backup-evidence.json` and compare its digest with `backup-evidence.sha256`. On PowerShell, use `Get-FileHash -Algorithm SHA256` for each file and compare with the recorded hashes (case-insensitively).
5. Inspect JSON metadata against the reviewed commit/run/label, independently compare `projectRefSha256` with SHA-256 of the expected staging ref's UTF-8 bytes (no newline), and verify all four component sizes/hashes, including `migration-ledger.json`. `backup-evidence.sha256` contains one lowercase 64-character digest plus a newline: the SHA-256 of the **exact JSON bytes**, not parsed/reformatted JSON. Bind the digest and ledger hashes into the separately reviewed private release authorization only after review. No migration follows automatically.

## Evidence and scope

### Boundary before PR-BILLING-BACKUP-01

The original workflow ran three independent CLI v2.109.1 dumps: `--role-only`, the default schema dump, and `--data-only --use-copy`. It supplied neither `--schema` nor `--exclude`. The CLI filters reserved roles and platform-managed schema definitions itself; the schema dump therefore is not a copy of the managed Auth schema. Its data dump includes application data, Auth identity/internal data and Storage metadata, subject to the CLI's built-in internal-schema and migration-history exclusions. It does not exclude all Auth data. The repository previously checked only nonempty files and hashes, not COPY targets or portability.

In `CERT-ROLLBACK-001`, the immutable approved artifact restored all 108 application COPY targets and `auth.users`. A separate local restore derivative omitted five newer managed Auth relations because the local platform schema lagged Supabase Platform. No application relation was filtered. This is the compatibility boundary being made explicit; it is not an application schema or billing redesign.

### Portable recovery boundary

Supabase Platform's managed schemas can be newer than a local/self-hosted restore environment. `scripts/staging-logical-backup-data.mjs` centrally defines these exact compatibility exclusions:

- `auth.mfa_recovery_code_sets`
- `auth.mfa_recovery_codes`
- `auth.scim_tokens`
- `auth.scim_users`
- `auth.one_time_tokens`

Only these five managed relations are omitted from portable data. **`auth.users`, public/application data and commercial billing data remain included.** Other Auth tables and custom application schemas are retained. The validator rejects wildcards, malformed or duplicate names, `auth.users`, every `public.*` relation and every relation outside the exact managed allowlist. Changes to the boundary require code review; workflow inputs and environment variables cannot override it. Managed omissions do not represent RepSync application-data loss, but the artifact is not a complete backup of platform-managed MFA/SCIM/token state. Compatibility with every future platform version is not guaranteed.

The workflow uses native `supabase db dump --data-only --use-copy --exclude "$exclusions"`; the roles and schema commands are unchanged. CLI **v2.109.1** supports a comma-separated list and maps each entry to a quoted `pg_dump --exclude-table` pattern. This was checked using the exact binary's `db dump --help`, an offline `--dry-run` with synthetic localhost credentials, and the tagged [CLI exclusion implementation](https://github.com/supabase/cli/blob/v2.109.1/apps/cli/src/legacy/commands/db/shared/legacy-pg-dump.env.ts). Since this is a data-only dump, these exact table exclusions omit their data only; no schema-wide exclusion or column rewriting is added. Never run a dry-run with real credentials in visible logs: it prints connection details.

Native exclusion patterns may match no table on an older platform; this is allowed. The evidence list records the exact **configured exclusions**, not a claim that all five tables existed or held rows. Before hashes/evidence are written, a read-only COPY parser requires a complete `auth.users` block and at least one `public` block, rejects duplicate targets, malformed/unterminated COPY blocks and non-COPY data formats, and requires all five managed targets to be absent. Empty tables still have COPY blocks and remain valid. It never rewrites the native output. Unsupported or ambiguous SQL fails closed and requires private review; no partial artifact is uploaded.

For an older raw dump that contains **all five** managed COPY blocks, an optional offline derivative can be created with:

```sh
node scripts/staging-logical-backup.mjs portable-copy /private/original/data.sql /private/derived/data.sql
```

Use a protected directory outside Git. This command contacts no database, keeps the source immutable and requires a new destination file. It removes only whole approved COPY blocks, leaving every retained byte (including line endings, rows, comments and sequence statements) unchanged. Missing requested blocks, malformed input or missing application/Auth identity data cause failure before output creation. The internal filter's explicitly empty exclusion list is a validated byte-identical no-op; the CLI always requests all five. This strict no-match failure differs intentionally from native dump-time exclusions. The workflow does not run this fallback or silently repair failed native output. A derivative has different hashes: keep it separate from the approved artifact and record its provenance and digest privately; never replace the original evidence.

### Evidence and restore verification

The artifact contains `roles.sql`, `schema.sql`, `data.sql`, `migration-ledger.json`, `SHA256SUMS.txt`, `backup-evidence.json` and `backup-evidence.sha256`. The sums file uses standard `digest  filename` lines. JSON is UTF-8, two-space indented with a trailing newline, with schemaVersion **3**, environment `staging`, commitSha, githubRunId (string), evidenceLabel, createdAt (UTC ISO timestamp), projectRefSha256, files (filename/sha256/byteLength), storageObjectsIncluded false and remoteMutationPerformed false. It retains the version-2 portability fields:

```json
{
  "portableRestoreData": true,
  "managedCompatibilityExclusions": [
    "auth.mfa_recovery_code_sets",
    "auth.mfa_recovery_codes",
    "auth.scim_tokens",
    "auth.scim_users",
    "auth.one_time_tokens"
  ],
  "authUsersIncluded": true,
  "applicationSchemasExcluded": false
}
```

It also records `publicCopyTargetCount` and `copyTargetCount` as structural counts, without table names, customer IDs or raw rows. `applicationSchemasExcluded: false` describes the compatibility policy: no application schema is filtered. It is not a live source-catalog completeness attestation. `portableRestoreData: true` records validation against this known boundary, not a successful restore. Old version 1 artifacts remain immutable and do not gain these claims retroactively.

The backup workflow generates version 3. The legacy `authorizationSchema` / `validateApplyAuthorization` in `staging-commercial-preflight.mjs`, also exported by `staging-commercial-apply.mjs`, accept only the operator-reviewed `backupEvidenceSha256`: a strict 64-character lowercase hexadecimal digest of the exact JSON bytes. That old contract is content-agnostic; regression tests retain digest compatibility with versions 1–3. The PAY-05B phased executor instead verifies version-3 backup and restore documents and their explicit ledger bindings. Old version-1/2 artifacts remain immutable historical evidence and cannot satisfy a new phase authorization. The old unbounded apply entry point remains disabled.

The separate version-1 schemas in `staging-commercial-contracts.mjs`, `staging-commercial-preflight.mjs` and `staging-commercial-evidence.mjs` describe the deployment manifest, preflight results and deployment/scenario certification records respectively, including `CERT-ROLLBACK-001`. They do not consume backup JSON and remain strict version 1. The rollback runbook records the privately reviewed backup digest; it does not load a backup artifact into the certification schema. No unrelated version validation is relaxed.

A restore proof must privately inventory **all application COPY targets**, including custom schemas and commercial billing relations, compare against the expected source inventory, and verify each target restored along with `auth.users`. Check row counts and relevant application invariants; the presence of one application block is only a generation guard, not a substitute for completeness verification. The prior proof's **108 / 108** is historical evidence, not a fixed count for future schemas. Record the actual restored/expected counts and compare the public target count with the new evidence. Any missing application target fails the proof. Review managed-schema compatibility separately and do not broaden exclusions to make a failed restore pass.

Offline verification for this change also exercised the exact CLI v2.109.1 generated dump script against a disposable PostgreSQL 17 fixture with networking disabled and no published ports. Native exclusion removed exactly five managed COPY targets while retaining 108 synthetic public tables, `auth.users` and one custom-schema table, with byte-identical retained COPY blocks. The offline derivative passed the same validator. This fixture check is not a new staging backup or restore certification.

**Database logical backups do not contain Supabase Storage objects.** Storage metadata in the database is not the stored object bytes. Object backup and recovery need a separate reviewed process. Logical dumps are not a physical snapshot or point-in-time recovery; coordinate a quiet staging window because the three dump commands are separate snapshots. Recoverability must be reviewed and tested separately before relying on this backup for migration recovery.

The main-only manual job has read-only repository permission and a 30-minute timeout. Pinned CLI v2.109.1 runs only roles/schema/data dumps. The runner must also provide `psql`; its absence blocks before capture. A fixed read-only SELECT captures the ledger before and after those dumps, with startup SQL disabled and a statement timeout. Validated connection fields are supplied privately through the child environment, never ledger-query arguments or logs. TLS is required and inherited host-address/service overrides are removed. The job does not link, push migrations, reset, deploy functions, change secrets, issue SQL writes or call a payment provider. Raw command output is discarded, including on failure; failures print only a static message. The summary contains fixed filenames, byte sizes and hashes only. Failed/partial dumps are not uploaded.

Treat SQL dumps as sensitive database contents, even though JSON evidence is sanitized. Restrict artifact access to authorized repository users, protect local downloads, and keep URLs/passwords/tokens out of issues, PRs, logs and evidence. The workflow never prints the connection URL or password, and `backup-evidence.json` contains no plaintext project ref, connection details, database contents or raw logs. Do not enable shell tracing or add raw CLI diagnostics. A failed run requires private configuration review; do not paste secrets into troubleshooting output.

## PAY-05B migration-ledger recovery

The pinned CLI excludes `supabase_migrations` from ordinary logical dumps. The new private `migration-ledger.json` is therefore a separate required component, not a claim about `data.sql`. It preserves every ledger column, including historical statement arrays, in version order. Treat this JSON as sensitive database contents, just like the SQL dumps; only `backup-evidence.json` is sanitized. The capture compares full rows before/after the dumps and rejects drift even if the migration count stays the same. Supported source prefixes are exactly 180–186 of the reviewed manifest. This comparison detects ledger drift; it does not make the independent data dumps atomic.

Version-3 backup evidence records `migrationLedgerIncluded: true`, the exact file SHA-256 in both `files` and `migrationLedgerSha256`, `ledgerVersions`, and `ledgerRowsSha256`. The latter hashes every field of every ordered row with deterministic object-key ordering. Historical statements are preserved, not normalized or regenerated. `createdAt` is the first ledger-read start time, so all collection time counts toward the 24-hour freshness limit. Backup and restore phase envelopes require these digests and fail if any binding differs.

For a separately authorized restore rehearsal:

1. Verify the four file hashes, exact backup-evidence bytes, source project hash, execution commit, fresh timestamps and retained artifact availability. Use an isolated disposable target with a compatible managed schema. Never run this procedure against staging or production as migration-history repair.
2. Restore the three logical SQL components using the reviewed private recovery procedure. Separately restore the captured full ledger rows into that isolated target's compatible ledger table. Preserve column values and statement arrays; do not synthesize ledger entries by replaying migrations. Abort if the destination ledger is nonempty or its structure is incompatible; do not merge, truncate or overwrite it to force success.
3. Read restored rows with the fixed `LEDGER_QUERY` exported by `scripts/staging-backup-ledger.mjs`. Call its pure `verifyRestoredLedger(artifactBytes, restoredRows, { commit, projectSha256 })` using the original private artifact bytes and independently expected bindings. It validates the ordered prefix, capture age (24 hours), artifact identity and full restored-row equality. The helper contacts no database and returns only `migrationLedgerSha256`, `restoredLedgerRowsSha256` and `ledgerCount`. A matching count or version list alone cannot pass.
4. Independently verify all application/custom-schema targets, retained row contents, Auth users and required ACL/RLS/invariants. Create a private version-3 restore-proof document with the fields required by the [phase contract](staging-release-phases.md#configuration-and-recovery-evidence), using the helper's verified hashes. Review and bind the exact proof bytes in the phase authorization. Ledger verification alone is not complete restoration or commercial certification.

Local automated rehearsal round-trips full synthetic/local ledger rows through a temporary SQL table, verifies equality and rejects an altered historical statement. It neither creates a staging backup nor certifies a real recovery artifact. Restore execution remains separate from release execution; no remote restore/repair runner is added.

# PAY-05B release exclusion and recovery binding

Backup and release jobs now share the fixed `supabase-staging-commercial` concurrency group. The [phase model](staging-release-phases.md) requires exact backup JSON bytes and separately reviewed restore-proof bytes, bound to execution commit/project/time and the actual starting ledger. Pre-baseline recovery evidence covers 180; cutover needs a fresh 184 checkpoint; resume needs fresh evidence for its observed state. The existing portable exclusions, protected environment and private dump handling are unchanged. A quiet operator window remains necessary for the three separate logical snapshots and actions outside these workflows.
