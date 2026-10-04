// Private recovery artifact, never a migration-repair or remote-restore runner.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = () => {
  throw new Error("BACKUP_LEDGER_INVALID");
};
export const LEDGER_QUERY =
  "select coalesce(jsonb_agg(to_jsonb(m) order by version),'[]'::jsonb) from supabase_migrations.schema_migrations m;";
export function ledgerVersions(rows) {
  if (!Array.isArray(rows) || rows.length < 180 || rows.length > 186) fail();
  const approved = JSON.parse(
    readFileSync(
      new URL(
        "../config/staging-commercial-certification.json",
        import.meta.url,
      ),
    ),
  ).migrations.approved;
  const versions = rows.map((r) => r?.version);
  if (
    JSON.stringify(versions) !==
    JSON.stringify(
      approved.slice(0, rows.length).map((r) => r.filename.slice(0, 14)),
    )
  )
    fail();
  return versions;
}
// JSONB key ordering is not an identity assumption. Preserve values and row order.
export function ledgerRowsDigest(rows) {
  ledgerVersions(rows);
  return sha256(
    JSON.stringify(
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    ),
  );
}
export function validateLedgerArtifact(
  value,
  { commit, projectSha256 },
  now = Date.now(),
) {
  if (
    value?.schemaVersion !== 1 ||
    value.executionCommit !== commit ||
    value.projectSha256 !== projectSha256 ||
    !/^[a-f0-9]{40}$/.test(commit ?? "") ||
    !/^[a-f0-9]{64}$/.test(projectSha256 ?? "") ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    Date.parse(value.startedAt) > Date.parse(value.completedAt) ||
    Date.parse(value.completedAt) > now ||
    now - Date.parse(value.startedAt) > 24 * 60 * 60_000
  )
    fail();
  return {
    versions: ledgerVersions(value.rows),
    rowsSha256: ledgerRowsDigest(value.rows),
  };
}
export function verifyRestoredLedger(
  artifactBytes,
  restoredRows,
  binding,
  now = Date.now(),
) {
  const expected = validateLedgerArtifact(
    JSON.parse(artifactBytes),
    binding,
    now,
  );
  if (ledgerRowsDigest(restoredRows) !== expected.rowsSha256)
    throw new Error("RESTORED_LEDGER_MISMATCH");
  return {
    migrationLedgerSha256: sha256(artifactBytes),
    restoredLedgerRowsSha256: expected.rowsSha256,
    ledgerCount: expected.versions.length,
  };
}
