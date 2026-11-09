import {
  functionArtifactDigest,
  hash,
} from "../../../scripts/billing-retirement-release.mjs";

/** Synthetic metadata only; not authorization or evidence for a real environment. */
export function retirementFixture(
  manifest: any,
  commit: string,
  project: string,
  root = process.cwd(),
  environment = "staging",
) {
  return {
    environment,
    providerMode: environment === "staging" ? "sandbox" : "disabled",
    observedAt: new Date().toISOString(),
    inventorySha256: "b".repeat(64),
    functionArtifactSha256: functionArtifactDigest(root),
    expectedPendingMigrations: manifest.migrations.approved
      .slice(184)
      .map((m: { filename: string }) => m.filename),
    backupCreatedAt: new Date().toISOString(),
    backupEnvironment: environment,
    backupCommitSha: commit,
    backupProjectSha256: hash(project),
    backupRestoreProofSha256: "c".repeat(64),
    classificationEvidenceSha256: "d".repeat(64),
    schemaDriftReviewed: true,
    classificationResult:
      environment === "staging" ? "synthetic_only" : "zero_obligation",
    paddleSalesDisabled: true,
    paddleReconciliationDisabled: true,
    checkoutAccessMode: "disabled",
  };
}
