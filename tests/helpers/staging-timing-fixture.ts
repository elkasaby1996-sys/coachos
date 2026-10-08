// Synthetic timing authority for local tests only. Never used by workflows.
import { timingBinding } from "../../scripts/staging-timing-admission.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { generateKeyPairSync, sign } from "node:crypto";
import { hash } from "../../scripts/billing-retirement-release.mjs";
import {
  timingReceipt,
  timingReviewPayload,
  timingReviewMessage,
} from "../../scripts/staging-timing-evidence.mjs";
import {
  baselineReviewMessage,
  baselineSourceBinding,
} from "../../scripts/staging-bootstrap-baseline.mjs";
import {
  bootstrapDatabaseProfiles,
  SQL_CONTEXT,
  databaseProof,
  applyCanonicalDelta,
} from "../../scripts/staging-bootstrap-database.mjs";
// Ephemeral test key is trusted only by explicit runner test dependencies.
// The checked-in operational reviewKeys list stays empty and rejects these fixtures.
const keys = generateKeyPairSync("ed25519");
const keyId = hash(keys.publicKey.export({ type: "spki", format: "der" }));
export const timingTestReviewPolicy = () => ({
  schemaVersion: 1,
  reviewKeys: [
    {
      keyId,
      publicKey: keys.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    },
  ],
});
export function signTimingFixture(admission: any) {
  admission.review = { keyId, signature: "" };
  admission.reviewEvidenceSha256 = evidenceDigest(
    timingReviewPayload(admission),
  );
  admission.review.signature = sign(
    null,
    timingReviewMessage(admission),
    keys.privateKey,
  ).toString("base64");
  return admission;
}
export function signBaselineFixture(baseline: any) {
  baseline.review = { keyId, signature: "" };
  baseline.reviewEvidenceSha256 = evidenceDigest(timingReviewPayload(baseline));
  baseline.review.signature = sign(
    null,
    baselineReviewMessage(baseline),
    keys.privateKey,
  ).toString("base64");
  return baseline;
}
export function emptyDatabaseFixture() {
  const p = bootstrapDatabaseProfiles();
  const components = p.requiredEmptyTables.map((name: string) => ({
    name,
    count: 0,
    digest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
    unfiltered: true,
    rows: name === "storage.buckets" ? [] : null,
  }));
  const catalog = [
    ...p.customerSecurity.publicDefaultAcls,
    ["subscription_count", "*", 0],
    ["temporary_object_count", "*", 0],
    ["namespace", "public", ["public", "postgres", null]],
    ...components.map((c: any) => ["relation", c.name, ["r"]]),
  ];
  return databaseProof({
    customerSecurity: structuredClone(p.customerSecurity.records),
    customerSecurityCount: p.customerSecurity.records.length,
    customerSecurityComplete: true,
    securityCatalogs: { complete: true, roleSettings: 0, parameterAcls: 0 },
    sqlCatalogDigest: "a".repeat(64),
    sqlPlatformDigest: "b".repeat(64),
    sqlContext: SQL_CONTEXT,
    platformComplete: true,
    dataTables: components.map((p: any) => p.name).sort(),
    platform: components,
    catalog,
    catalogCount: catalog.length,
    platformCount: components.length,
  });
}
export function checkpointDatabaseFixture(baseline: any) {
  const p = bootstrapDatabaseProfiles();
  const platform = baseline.databaseProof.platform.map(
    (c: any) =>
      p.delta180.platform.find((v: any) => v.name === c.name)?.after ?? c,
  );
  for (const change of p.delta180.platform)
    if (!platform.some((c: any) => c.name === change.name))
      platform.push(change.after);
  const catalog = applyCanonicalDelta(
    baseline.databaseProof.catalog,
    p.delta180.catalog,
  );
  return databaseProof(
    {
      customerSecurity: structuredClone(p.customerSecurity.records),
      customerSecurityCount: p.customerSecurity.records.length,
      customerSecurityComplete: true,
      securityCatalogs: structuredClone(
        baseline.databaseProof.securityCatalogs,
      ),
      sqlCatalogDigest: "c".repeat(64),
      sqlPlatformDigest: "d".repeat(64),
      sqlContext: SQL_CONTEXT,
      platformComplete: true,
      dataTables: platform.map((c: any) => c.name).sort(),
      platform,
      catalog,
      catalogCount: catalog.length,
      platformCount: platform.length,
    },
    p.delta180.seedDigest,
  );
}
export function baselineFixture(
  identity: any,
  context: any,
  policy: any,
  now: number,
  snapshot: any,
) {
  const stamp = (n: number) => new Date(n).toISOString();
  return signBaselineFixture({
    schemaVersion: 1,
    classification: "AMBIGUOUS_MANAGED_BASELINE_PINNED",
    target: {
      project: context.project,
      organization: snapshot.project.organization_id,
      origin: context.origin,
    },
    source: baselineSourceBinding(identity, context, policy),
    creation: {
      createdAt: snapshot.project.created_at,
      provenance: "authorized_infrastructure_creation",
      provenanceEvidenceSha256: ["e".repeat(64)],
      operatorIdentity: "synthetic-test-operator",
      attestedAt: stamp(now),
      noManagedSchemaCustomizationSinceProjectCreation: true,
      knownCustomerCustomizations: [],
      writersExcludedSinceCreation: true,
      noRestoreOrImport: true,
    },
    databaseProof: snapshot.facts.databaseProof,
    capture: {
      startedAt: stamp(now),
      completedAt: stamp(now),
      expiresAt: stamp(now + 30 * 60_000),
      opening: structuredClone(snapshot),
      closing: structuredClone(snapshot),
      confirmation: structuredClone(snapshot),
    },
    completeEvidenceReviewed: true,
    creationHistoryReviewed: true,
    reviewEvidenceSha256: "f".repeat(64),
  });
}
export function timingFixture(
  phase: string,
  authorization: any,
  identity: any,
  context: any,
  contracts: any,
  now: number,
  policy?: any,
) {
  const stamp = (n: number) => new Date(n).toISOString();
  const kind = phase === "EMPTY_TO_180" ? "empty" : "release";
  const surface = Object.fromEntries(
    [
      "DATABASE_DRIFT",
      "FUNCTION_INVENTORY_DRIFT",
      "CONFIGURATION_DRIFT",
      "AUTH_CONFIGURATION_DRIFT",
      ...(kind === "empty" ? ["PROJECT_DRIFT"] : []),
    ].map((k) => [k, "a".repeat(64)]),
  );
  const group = () =>
    Array.from({ length: 3 }, (_, i) => {
      const observation = {
        ...(kind === "empty"
          ? { baselineEvidenceSha256: authorization.baselineEvidenceSha256 }
          : {}),
        digest: "a".repeat(64),
        observedAt: stamp(now - 10_000 - i * 1000),
        stability: {
          startedAt: stamp(now - 10_000 - i * 1000),
          completedAt: stamp(now - 9_900 - i * 1000),
          stable: true,
          categories: [],
          proof: {
            opening: structuredClone(surface),
            closing: structuredClone(surface),
            confirmation: structuredClone(surface),
          },
        },
      };
      const receipt = timingReceipt(kind, observation, identity, context);
      return { receipt, receiptSha256: evidenceDigest(receipt) };
    });
  return signTimingFixture({
    schemaVersion: 2,
    bindingDigest: evidenceDigest(
      timingBinding(phase, authorization, identity, context, contracts, policy),
    ),
    createdAt: stamp(now),
    expiresAt: stamp(now + 10 * 60_000),
    reviewEvidenceSha256: "b".repeat(64),
    completeObservationsReviewed: true,
    samples: {
      empty: phase === "EMPTY_TO_180" ? group() : [],
      release: phase === "EMPTY_TO_180" ? [] : group(),
    },
    allowances: {
      mutationMs: 1000,
      downloadMs: 1000,
      probeMs: 1000,
      localValidationMs: 1000,
    },
  });
}
