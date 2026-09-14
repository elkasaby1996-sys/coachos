# Staging logical backup

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
5. Inspect JSON metadata against the reviewed commit/run/label, independently compare `projectRefSha256` with SHA-256 of the expected staging ref's UTF-8 bytes (no newline), and verify all three file sizes/hashes. `backup-evidence.sha256` contains one lowercase 64-character digest plus a newline: the SHA-256 of the **exact JSON bytes**, not parsed/reformatted JSON. Copy the digest into the separately reviewed private Phase B authorization envelope as `backupEvidenceSha256` only after review. No migration follows automatically.

## Evidence and scope

The artifact contains `roles.sql`, `schema.sql`, `data.sql`, `SHA256SUMS.txt`, `backup-evidence.json` and `backup-evidence.sha256`. The sums file uses standard `digest  filename` lines. JSON is UTF-8, two-space indented with a trailing newline, with schemaVersion 1, environment `staging`, commitSha, githubRunId (string), evidenceLabel, createdAt (UTC ISO timestamp), projectRefSha256, files (filename/sha256/byteLength), storageObjectsIncluded false and remoteMutationPerformed false.

**Database logical backups do not contain Supabase Storage objects.** Storage metadata in the database is not the stored object bytes. Object backup and recovery need a separate reviewed process. Logical dumps are not a physical snapshot or point-in-time recovery; coordinate a quiet staging window because the three dump commands are separate snapshots. Recoverability must be reviewed and tested separately before relying on this backup for migration recovery.

The main-only manual job has read-only repository permission and a 30-minute timeout. Pinned CLI v2.109.1 runs only roles/schema/data dumps. It does not link, push migrations, reset, deploy functions, change secrets, issue SQL writes or call a payment provider. Raw command output is discarded, including on failure; failures print only a static message. The summary contains fixed filenames, byte sizes and hashes only. Failed/partial dumps are not uploaded.

Treat SQL dumps as sensitive database contents, even though JSON evidence is sanitized. Restrict artifact access to authorized repository users, protect local downloads, and keep URLs/passwords/tokens out of issues, PRs, logs and evidence. The workflow never prints the connection URL or password, and JSON contains no plaintext project ref, connection details, database contents or raw logs. Do not enable shell tracing or add raw CLI diagnostics. A failed run requires private configuration review; do not paste secrets into troubleshooting output.
