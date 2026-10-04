import { z } from "zod";
import { hash } from "./billing-retirement-release.mjs";
import { ensure, canonical } from "./staging-release-artifacts.mjs";
import { MANAGED_COMPATIBILITY_EXCLUSIONS } from "./staging-logical-backup-data.mjs";

// The protected envelope binds the exact original JSON bytes. Restore proof is
// a separately reviewed document, not an inference from a successful dump.
export function validateRecoveryBundle(bundle, authorization) {
  const parsed = z
    .strictObject({
      backupEvidence: z.string().min(1),
      restoreProof: z.string().min(1),
    })
    .safeParse(bundle);
  ensure(parsed.success, "RELEASE_RECOVERY_BUNDLE_MISSING");
  const { backupEvidence, restoreProof } = parsed.data;
  ensure(
    hash(backupEvidence) === authorization.backup.evidenceSha256 &&
      hash(restoreProof) === authorization.backup.restore.evidenceSha256,
    "RELEASE_RECOVERY_BYTES_MISMATCH",
  );
  let backup, restore;
  try {
    backup = JSON.parse(backupEvidence);
    restore = JSON.parse(restoreProof);
  } catch {
    throw new Error("RELEASE_RECOVERY_JSON_INVALID");
  }
  const b = authorization.backup;
  ensure(
    backup.schemaVersion === 3 &&
      backup.environment === "staging" &&
      backup.commitSha === authorization.executionCommit &&
      backup.projectRefSha256 === authorization.projectSha256 &&
      backup.createdAt === b.createdAt &&
      backup.portableRestoreData === true &&
      backup.authUsersIncluded === true &&
      backup.applicationSchemasExcluded === false &&
      backup.storageObjectsIncluded === false &&
      backup.remoteMutationPerformed === false &&
      backup.migrationLedgerIncluded === true &&
      backup.migrationLedgerSha256 === b.migrationLedgerSha256 &&
      backup.ledgerRowsSha256 === b.ledgerRowsSha256 &&
      canonical(backup.ledgerVersions) === canonical(b.ledger) &&
      Number.isSafeInteger(backup.publicCopyTargetCount) &&
      backup.publicCopyTargetCount > 0 &&
      canonical(backup.managedCompatibilityExclusions) ===
        canonical(MANAGED_COMPATIBILITY_EXCLUSIONS),
    "RELEASE_BACKUP_METADATA_MISMATCH",
  );
  ensure(
    Array.isArray(backup.files) &&
      canonical(backup.files.map((f) => f.filename)) ===
        canonical([
          "roles.sql",
          "schema.sql",
          "data.sql",
          "migration-ledger.json",
        ]) &&
      backup.files[3].sha256 === b.migrationLedgerSha256 &&
      backup.files.every(
        (f) =>
          Number.isSafeInteger(f.byteLength) &&
          f.byteLength > 0 &&
          /^[a-f0-9]{64}$/.test(f.sha256),
      ),
    "RELEASE_BACKUP_COMPONENTS_INVALID",
  );
  ensure(
    restore.schemaVersion === 3 &&
      restore.environment === "staging" &&
      restore.executionCommit === authorization.executionCommit &&
      restore.projectSha256 === authorization.projectSha256 &&
      restore.backupEvidenceSha256 === b.evidenceSha256 &&
      restore.verifiedAt === b.restore.verifiedAt &&
      canonical(restore.sourceLedger) === canonical(b.ledger) &&
      canonical(restore.restoredLedger) === canonical(b.ledger) &&
      restore.migrationLedgerSha256 === b.migrationLedgerSha256 &&
      restore.restoredLedgerRowsSha256 === b.ledgerRowsSha256 &&
      restore.isolatedTarget === true &&
      restore.authUsersRestored === true &&
      restore.retainedHistoryVerified === true &&
      Number.isSafeInteger(restore.expectedApplicationTargetCount) &&
      restore.expectedApplicationTargetCount >= backup.publicCopyTargetCount &&
      restore.expectedApplicationTargetCount ===
        restore.restoredApplicationTargetCount &&
      restore.retirementCompatible === true,
    "RELEASE_RESTORE_PROOF_MISMATCH",
  );
  return true;
}
