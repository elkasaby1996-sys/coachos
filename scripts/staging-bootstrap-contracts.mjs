import { z } from "zod";
import { ensure, canonical } from "./staging-release-artifacts.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { assertReplacementTarget } from "./staging-replacement-target.mjs";
import { validateVirginBaseline } from "./staging-bootstrap-baseline.mjs";
import { timingReviewPolicy } from "./staging-timing-evidence.mjs";
import {
  assertDatabaseProof,
  bootstrapDatabasePolicyDigest,
} from "./staging-bootstrap-database.mjs";
import {
  bootstrapArtifact,
  BOOTSTRAP_PHASE,
} from "./staging-bootstrap-artifacts.mjs";
import {
  validateBoundary,
  exactLedger,
  assertPolicy,
  verifyDatabase,
} from "./staging-release-contracts.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const bootstrapAuthorizationSchema = z.strictObject({
  schemaVersion: z.literal(2),
  phase: z.literal(BOOTSTRAP_PHASE),
  executionCommit: z.string().regex(/^[a-f0-9]{40}$/),
  bindingDigest: digest,
  inventoryDigest: digest,
  inventoryObservedAt: z.string().datetime(),
  baselineEvidenceSha256: digest,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  operational: z.strictObject({
    newlyCreatedEmptyProject: z.literal(true),
    noImportedHistory: z.literal(true),
    clientsExcluded: z.literal(true),
    providerIngressExcluded: z.literal(true),
    manualWritersExcluded: z.literal(true),
    backgroundWritersExcluded: z.literal(true),
    noManagedSchemaCustomizationSinceProjectCreation: z.literal(true),
    quietWindowEndsAt: z.string().datetime(),
  }),
});

// The digest binds the COMPLETE ordered migration records, config, immutable
// functions, checkpoint and reviewed deny/allow registry, not just a count.
export function bootstrapBinding(
  identity,
  context,
  policy,
  contracts,
  baseline,
) {
  return {
    phase: BOOTSTRAP_PHASE,
    executionCommit: context.commit,
    executionTree: context.tree,
    baselineEvidenceSha256: evidenceDigest(baseline),
    projectSha256: hash(context.project),
    originSha256: hash(context.origin),
    productionProjectSha256: hash(context.productionProject),
    productionOriginSha256: hash(context.productionOrigin),
    policy,
    payloadDigest: identity.payload.digest,
    manifest: identity.manifest,
    artifact: bootstrapArtifact(identity),
    checkpoints: contracts,
    bootstrapDatabasePolicyDigest: bootstrapDatabasePolicyDigest(),
    finalFunctions: identity.functions,
    containment: identity.containment,
    startVersions: [],
    endVersions: identity.manifest.migrations.approved
      .slice(0, 180)
      .map((m) => m.filename.slice(0, 14)),
    deployedFunctions: [],
    commercialFlags: { sales: false, reconciliation: false },
  };
}

export function validateBootstrapAuthorization(
  raw,
  identity,
  context,
  policy,
  contracts,
  now = Date.now(),
  baseline,
  reviewPolicy = timingReviewPolicy(),
) {
  const result = bootstrapAuthorizationSchema.safeParse(raw);
  ensure(result.success, "BOOTSTRAP_AUTHORIZATION_INVALID");
  const a = result.data;
  const b = validateVirginBaseline(
    baseline,
    identity,
    context,
    policy,
    now,
    reviewPolicy,
  );
  validateBoundary(context);
  assertReplacementTarget(context.project, context.origin, policy, true);
  ensure(
    context.productionProject === policy.productionProject,
    "BOOTSTRAP_PRODUCTION_DENY_MISMATCH",
  );
  ensure(
    a.executionCommit === context.commit &&
      a.bindingDigest ===
        evidenceDigest(
          bootstrapBinding(identity, context, policy, contracts, b),
        ) &&
      a.baselineEvidenceSha256 === evidenceDigest(b),
    "BOOTSTRAP_AUTHORIZATION_BINDING",
  );
  const created = Date.parse(a.createdAt),
    expiry = Date.parse(a.expiresAt),
    observed = Date.parse(a.inventoryObservedAt);
  ensure(
    created <= now &&
      now < expiry &&
      expiry > created &&
      expiry - created <= 30 * 60_000 &&
      observed <= created &&
      now - observed <= 15 * 60_000 &&
      Date.parse(a.operational.quietWindowEndsAt) > expiry,
    "BOOTSTRAP_AUTHORIZATION_STALE",
  );
  ensure(
    observed >= Date.parse(b.capture.completedAt) &&
      expiry <= Date.parse(b.capture.expiresAt),
    "BOOTSTRAP_BASELINE_AUTHORIZATION_WINDOW",
  );
  ensure(
    contracts.frozenPayloadCommit === identity.payload.frozenCommit &&
      contracts.manifestDigest === hash(canonical(identity.manifest)),
    "BOOTSTRAP_CHECKPOINT_BINDING",
  );
  return a;
}

export function verifyBootstrapCheckpoint(
  observation,
  identity,
  contracts,
  baseline,
) {
  exactLedger(observation, identity.manifest, 180);
  assertPolicy(observation);
  verifyDatabase(observation, 180, contracts, []);
  ensure(observation.functions.length === 0, "BOOTSTRAP_FUNCTIONS_NOT_EMPTY");
  const f = observation.facts;
  assertDatabaseProof(f.databaseProof, 180, baseline);
  ensure(
    f.work &&
      Object.keys(f.work).length >= 8 &&
      Object.values(f.work).every((v) => v === 0) &&
      f.scheduled?.count === 0 &&
      f.scheduled.invalidBoundaries === 0,
    "BOOTSTRAP_UNEXPECTED_WORK",
  );
  // The cold install seeds exactly these six reference tables. ALL remaining
  // public tables and auth.users must be empty, not just currently open work.
  const referenceTables = [
    "commercial_features",
    "billing_runtime_policy",
    "commercial_plan_versions",
    "commercial_addon_versions",
    "commercial_trial_policy_versions",
    "commercial_plan_feature_entitlements",
  ];
  const tables = [...f.tables.map((t) => t.name), "auth.users"];
  ensure(
    evidenceDigest(Object.keys(f.history ?? {}).sort()) ===
      evidenceDigest([...tables].sort()),
    "BOOTSTRAP_HISTORY_SCOPE",
  );
  for (const table of tables.filter((t) => !referenceTables.includes(t)))
    ensure(
      f.history?.[table] === "d751713988987e9331980363e24189ce",
      "BOOTSTRAP_HISTORY_NOT_EMPTY",
    );
  const h = f.webhookHistory;
  ensure(
    h &&
      h.retainedNonterminalWebhookCount === 0 &&
      h.activeBlockingWebhookCount === 0 &&
      h.historicalSafeWebhookCount === 0,
    "BOOTSTRAP_HISTORY_CLASSIFICATION",
  );
  return {
    ledgerCount: 180,
    databaseContractDigest: f.contractDigest,
    historyDigest: evidenceDigest(f.history),
    flagsDisabled: true,
    noFunctionsDeployed: true,
    commercialCertification: "not_run",
  };
}
