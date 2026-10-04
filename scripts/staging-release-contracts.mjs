import { z } from "zod";
import {
  ensure,
  canonical,
  FROZEN_PAYLOAD,
} from "./staging-release-artifacts.mjs";
import {
  hash,
  assertFunctionInventory,
  assertRetiredDatabaseAuthority,
} from "./billing-retirement-release.mjs";
import { validateOrigin } from "./staging-commercial-contracts.mjs";
import { validateProviderMappings } from "./staging-commercial-provider.mjs";
import {
  FUNCTION_CONTRACTS,
  SECRET_NAMES,
  LS_TOMBSTONES,
  OUTSIDE_BILLING_DEPLOYMENT,
} from "./billing-deployment-contract.mjs";

export const PHASES = Object.freeze({
  BASELINE_180_TO_184: { start: 180, end: 184, steps: ["baseline"] },
  RESUME_BASELINE_180_TO_184: { start: 180, end: 184, steps: ["baseline"] },
  RETIREMENT_ACTIVATION_184_TO_186: {
    start: 184,
    end: 186,
    steps: [
      "containment",
      "drain",
      "retirement",
      "activation",
      "billing",
      "nonbilling",
      "final",
    ],
  },
  RESUME_BASELINE_181_TO_184: { start: 181, end: 184, steps: ["baseline"] },
  RESUME_BASELINE_182_TO_184: { start: 182, end: 184, steps: ["baseline"] },
  RESUME_BASELINE_183_TO_184: { start: 183, end: 184, steps: ["baseline"] },
  RESUME_CUTOVER_184_TO_186: {
    start: 184,
    end: 186,
    steps: [
      "containment",
      "drain",
      "retirement",
      "activation",
      "billing",
      "nonbilling",
      "final",
    ],
  },
  RESUME_ACTIVATION_185_TO_186: {
    start: 185,
    end: 186,
    steps: [
      "containment",
      "drain",
      "retirement_checkpoint",
      "activation",
      "billing",
      "nonbilling",
      "final",
    ],
  },
  RESUME_FINAL_186: {
    start: 186,
    end: 186,
    steps: [
      "containment",
      "drain",
      "retirement_checkpoint",
      "activation_checkpoint",
      "billing",
      "nonbilling",
      "final",
    ],
  },
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const timestamp = z.iso.datetime();
const versions = z.array(z.string().regex(/^\d{14}$/));
const functionBinding = z.strictObject({
  name: z.string(),
  verifyJwt: z.boolean(),
  digest,
  entrypointSha256: digest,
});
export const recoverySchema = z.strictObject({
  schemaVersion: z.literal(2),
  status: z.literal("blocked"),
  phase: z.enum(Object.keys(PHASES)),
  authorizationDigest: digest,
  executionCommit: sha,
  observedAt: timestamp,
  ledgerCount: z.number().int().min(0).max(186).nullable(),
  inventoryDigest: digest.nullable(),
  functionStates: z.array(
    z.strictObject({
      name: z.enum(FUNCTION_CONTRACTS.map((f) => f.name)),
      version: z.number().int().positive(),
      verifyJwt: z.boolean(),
      artifact: z.enum(["final", "containment", "unknown"]),
    }),
  ),
  completedSteps: z.array(z.string()),
  failedStep: z.string(),
  errorCode: z.string().regex(/^[A-Z_]+$/),
  newAuthorizationRequired: z.literal(true),
});
const recovery = z.strictObject({ evidence: recoverySchema, digest });
const backup = z.strictObject({
  evidenceSha256: digest,
  createdAt: timestamp,
  expiresAt: timestamp,
  executionCommit: sha,
  projectSha256: digest,
  ledger: versions,
  quietWindowReviewed: z.literal(true),
  releaseLock: z.literal("supabase-staging-commercial"),
  componentsVerified: z.literal(true),
  authUsersIncluded: z.literal(true),
  applicationCompletenessVerified: z.literal(true),
  migrationLedgerIncluded: z.literal(true),
  migrationLedgerSha256: digest,
  ledgerRowsSha256: digest,
  storageObjectsIncluded: z.literal(false),
  managedExclusionsReviewed: z.literal(true),
  restore: z.strictObject({
    evidenceSha256: digest,
    backupEvidenceSha256: digest,
    verifiedAt: timestamp,
    isolatedTarget: z.literal(true),
    allApplicationTargetsRestored: z.literal(true),
    authUsersRestored: z.literal(true),
    retainedHistoryVerified: z.literal(true),
    ledgerVerified: z.literal(true),
    migrationLedgerSha256: digest,
    restoredLedgerRowsSha256: digest,
  }),
});
const config = z.strictObject({
  evidenceSha256: digest,
  observedAt: timestamp,
  secretInventorySha256: digest,
  authConfigurationSha256: digest,
  requiredNames: z.array(z.string()),
  paddleEnvironment: z.literal("sandbox"),
  checkoutAccessMode: z.literal("disabled"),
  siteUrl: z.string(),
  redirectUrls: z.array(z.string()).min(1),
  signupEnabled: z.literal(true),
  confirmationsEnabled: z.literal(true),
  paymentPageReviewed: z.literal(true),
  frontendTokenReviewed: z.literal(true),
  originsReviewed: z.literal(true),
  providerMappings: z.unknown(),
});
const common = {
  schemaVersion: z.literal(2),
  operationId: z.string().uuid(),
  executionCommit: sha,
  frozenPayloadCommit: z.literal(FROZEN_PAYLOAD),
  payloadDigest: digest,
  manifestDigest: digest,
  projectSha256: digest,
  originSha256: digest,
  productionDenyProjectSha256: digest,
  productionDenyOriginSha256: digest,
  createdAt: timestamp,
  expiresAt: timestamp,
  startVersions: versions,
  endVersions: versions,
  pendingMigrations: z.array(
    z.strictObject({ filename: z.string(), sha256: digest }),
  ),
  migrationArtifacts: z.strictObject({
    baseline: digest,
    retirement: digest,
    activation: digest,
  }),
  finalFunctions: z.array(functionBinding),
  outsideFunctions: z.array(functionBinding),
  containmentFunctions: z.array(functionBinding),
  inventory: z.strictObject({ digest, observedAt: timestamp }),
  backup,
  configuration: config,
  salesEnabled: z.literal(false),
  reconciliationEnabled: z.literal(false),
  syntheticClassification: z.strictObject({
    evidenceSha256: digest,
    result: z.literal("synthetic_only"),
  }),
  checkpointContractDigest: digest,
  operational: z.strictObject({
    quiescenceEvidenceSha256: digest,
    providerRequestAuditEvidenceSha256: digest,
    retryWindowReviewed: z.literal(true),
    retryWindowEndsAt: timestamp,
    clientsAndJobsPaused: z.literal(true),
    oldInvocationsDrained: z.literal(true),
    scheduledOperationsCount: z.number().int().nonnegative(),
  }),
};
// Distinct strict schemas: no optional old-format fields and no operator target.
export const authorizationSchemas = Object.fromEntries(
  Object.keys(PHASES).map((phase) => [
    phase,
    z.strictObject({
      ...common,
      phase: z.literal(phase),
      ...(phase.startsWith("RESUME_") ? { recovery } : {}),
    }),
  ]),
);
export function ledger(manifest, count) {
  return manifest.migrations.approved
    .slice(0, count)
    .map((m) => m.filename.slice(0, 14));
}
export function phasePlan(phase, identity) {
  ensure(Object.hasOwn(PHASES, phase), "RELEASE_PHASE_INVALID");
  const p = PHASES[phase];
  return {
    phase,
    ...p,
    startVersions: ledger(identity.manifest, p.start),
    endVersions: ledger(identity.manifest, p.end),
    pendingMigrations: identity.manifest.migrations.approved.slice(
      p.start,
      p.end,
    ),
    migrationArtifacts: Object.fromEntries(
      Object.entries(identity.migrations).map(([k, v]) => [k, v.digest]),
    ),
    finalFunctions: identity.functions,
    outsideFunctions: identity.outsideFunctions,
    containmentFunctions: identity.containment,
  };
}
export function validateBoundary(context) {
  ensure(
    /^[a-z]{20}$/.test(context.project ?? "") &&
      context.project === context.expectedProject &&
      /^[a-z]{20}$/.test(context.productionProject ?? "") &&
      context.project !== context.productionProject,
    "RELEASE_PROJECT_BOUNDARY",
  );
  validateOrigin(context.origin);
  ensure(
    context.origin === context.expectedOrigin &&
      context.productionOrigin &&
      context.origin !== context.productionOrigin,
    "RELEASE_ORIGIN_BOUNDARY",
  );
  ensure(
    context.clean && /^[a-f0-9]{40}$/.test(context.commit ?? ""),
    "RELEASE_SOURCE_INVALID",
  );
}
export function validateAuthorization(
  raw,
  phase,
  identity,
  context,
  checkpointDigest,
  now = Date.now(),
) {
  ensure(Object.hasOwn(authorizationSchemas, phase), "RELEASE_PHASE_INVALID");
  const parsed = authorizationSchemas[phase].safeParse(raw);
  ensure(parsed.success, "RELEASE_AUTHORIZATION_INVALID");
  const a = parsed.data,
    p = phasePlan(phase, identity);
  validateBoundary(context);
  for (const [field, value] of Object.entries({
    executionCommit: context.commit,
    payloadDigest: identity.payload.digest,
    manifestDigest: hash(canonical(identity.manifest)),
    projectSha256: hash(context.project),
    originSha256: hash(context.origin),
    productionDenyProjectSha256: hash(context.productionProject),
    productionDenyOriginSha256: hash(context.productionOrigin),
    checkpointContractDigest: checkpointDigest,
    startVersions: p.startVersions,
    endVersions: p.endVersions,
    pendingMigrations: p.pendingMigrations,
    migrationArtifacts: p.migrationArtifacts,
    finalFunctions: p.finalFunctions,
    outsideFunctions: p.outsideFunctions,
    containmentFunctions: p.containmentFunctions,
  }))
    ensure(
      canonical(a[field]) === canonical(value),
      "RELEASE_AUTHORIZATION_BINDING",
    );
  const age = (s) => now - Date.parse(s);
  ensure(
    age(a.createdAt) >= 0 &&
      age(a.createdAt) <= 30 * 60_000 &&
      Date.parse(a.expiresAt) > now &&
      Date.parse(a.expiresAt) - Date.parse(a.createdAt) <= 30 * 60_000,
    "RELEASE_AUTHORIZATION_STALE",
  );
  ensure(
    age(a.inventory.observedAt) >= 0 &&
      age(a.inventory.observedAt) <= 15 * 60_000,
    "RELEASE_INVENTORY_STALE",
  );
  const b = a.backup;
  ensure(
    age(b.createdAt) >= 0 &&
      age(b.createdAt) <= 24 * 60 * 60_000 &&
      Date.parse(b.expiresAt) > now &&
      Date.parse(b.expiresAt) <=
        Date.parse(b.createdAt) + 7 * 24 * 60 * 60_000 &&
      b.executionCommit === context.commit &&
      b.projectSha256 === hash(context.project) &&
      canonical(b.ledger) === canonical(p.startVersions),
    "RELEASE_BACKUP_INVALID",
  );
  ensure(
    b.restore.backupEvidenceSha256 === b.evidenceSha256 &&
      b.restore.migrationLedgerSha256 === b.migrationLedgerSha256 &&
      b.restore.restoredLedgerRowsSha256 === b.ledgerRowsSha256 &&
      Date.parse(b.restore.verifiedAt) >= Date.parse(b.createdAt) &&
      age(b.restore.verifiedAt) >= 0,
    "RELEASE_RESTORE_INVALID",
  );
  const c = a.configuration;
  ensure(
    age(c.observedAt) >= 0 &&
      age(c.observedAt) <= 15 * 60_000 &&
      canonical(c.requiredNames) === canonical(SECRET_NAMES) &&
      c.siteUrl === context.origin &&
      c.redirectUrls.every((u) => u === `${context.origin}/auth/callback`),
    "RELEASE_CONFIGURATION_INVALID",
  );
  validateProviderMappings(c.providerMappings);
  ensure(
    c.providerMappings.mappings.every((m) =>
      [m.productRef, m.priceRef, m.seatProductRef, m.seatPriceRef].every((r) =>
        r.startsWith("sha256:"),
      ),
    ),
    "RELEASE_MAPPING_ATTESTATION_INVALID",
  );
  ensure(
    Date.parse(a.operational.retryWindowEndsAt) > Date.parse(a.expiresAt),
    "RELEASE_RETRY_WINDOW_INVALID",
  );
  if (a.recovery) {
    const e = a.recovery.evidence;
    ensure(
      a.recovery.digest === hash(canonical(e)) &&
        e.authorizationDigest !== hash(canonical(a)) &&
        e.executionCommit === a.executionCommit &&
        Date.parse(a.createdAt) > Date.parse(e.observedAt) &&
        e.ledgerCount === p.start,
      "RELEASE_RESUME_AUTHORIZATION_INVALID",
    );
  }
  return a;
}
export function exactLedger(observation, manifest, count) {
  ensure(
    canonical(observation.facts.versions) ===
      canonical(ledger(manifest, count)),
    "RELEASE_LEDGER_DRIFT",
  );
}
export function assertPolicy(observation) {
  ensure(
    observation.facts.policy?.sales === false &&
      observation.facts.policy?.reconciliation === false,
    "RELEASE_POLICY_ENABLED",
  );
}
export function assertHistory(before, after) {
  ensure(
    before && after && Object.keys(before).length > 0,
    "RELEASE_HISTORY_MISSING",
  );
  for (const [table, digest] of Object.entries(before))
    ensure(after[table] === digest, "RELEASE_HISTORY_CHANGED");
}
export function assertDrain(observation) {
  const categories = observation.facts.work;
  ensure(
    categories &&
      Object.keys(categories).length >= 8 &&
      Object.values(categories).every((n) => Number.isSafeInteger(n) && n >= 0),
    "RELEASE_DRAIN_EVIDENCE_MISSING",
  );
  ensure(
    Object.values(categories).every((n) => n === 0),
    "RELEASE_IN_FLIGHT_WORK",
  );
}
export function assertScheduled(observation, authorization) {
  const s = observation.facts.scheduled;
  ensure(
    s &&
      s.count === authorization.operational.scheduledOperationsCount &&
      s.invalidBoundaries === 0 &&
      (s.count === 0 ||
        Date.parse(s.earliest) > Date.parse(authorization.expiresAt)),
    "RELEASE_SCHEDULED_BOUNDARY_UNSAFE",
  );
}
export function verifyDatabase(observation, count, contracts, native) {
  assertPolicy(observation);
  const expected = contracts.checkpoints[String(count)];
  ensure(
    expected && observation.facts.contractDigest === expected.digest,
    "RELEASE_DATABASE_CONTRACT_DRIFT",
  );
  if (count >= 185)
    assertRetiredDatabaseAuthority(observation.facts.functions, native);
}
export function verifyFunctions(observation, identity, mode) {
  assertFunctionInventory(observation.functions, true);
  for (const f of identity.outsideFunctions) {
    const remote = observation.functions.find((r) => r.name === f.name);
    if (remote) ensure(remote.verify_jwt === f.verifyJwt, "RELEASE_JWT_DRIFT");
  }
  const expected =
    mode === "containment"
      ? identity.functions
          .filter((f) => LS_TOMBSTONES.includes(f.name))
          .concat(identity.containment)
      : identity.functions;
  for (const f of expected) {
    const remote = observation.functions.find((r) => r.name === f.name);
    ensure(remote?.status === "ACTIVE", "RELEASE_FUNCTION_NOT_ACTIVE");
    ensure(
      remote?.verify_jwt === f.verifyJwt &&
        observation.artifacts?.[f.name] ===
          (mode === "containment" && !LS_TOMBSTONES.includes(f.name)
            ? f.entrypointSha256
            : f.digest),
      "RELEASE_FUNCTION_IDENTITY_DRIFT",
    );
  }
}
export function assertApprovedFunctionInventory(observation) {
  assertFunctionInventory(observation.functions);
  ensure(
    observation.functions.every(
      (f) =>
        expectedFunctionNames.includes(f.name) ||
        OUTSIDE_BILLING_DEPLOYMENT.includes(f.name),
    ),
    "RELEASE_UNCLASSIFIED_FUNCTION",
  );
}
export function recoveryPlan(evidence) {
  const result = recoverySchema.safeParse(evidence);
  ensure(result.success, "RELEASE_RECOVERY_INVALID");
  const count = evidence.ledgerCount;
  const phase =
    count === 180
      ? "RESUME_BASELINE_180_TO_184"
      : count === 181
        ? "RESUME_BASELINE_181_TO_184"
        : count === 182
          ? "RESUME_BASELINE_182_TO_184"
          : count === 183
            ? "RESUME_BASELINE_183_TO_184"
            : count === 184
              ? "RESUME_CUTOVER_184_TO_186"
              : count === 185
                ? "RESUME_ACTIVATION_185_TO_186"
                : count === 186
                  ? "RESUME_FINAL_186"
                  : null;
  return {
    status: "authorization_required",
    phase,
    evidenceDigest: hash(canonical(evidence)),
    automaticResume: false,
  };
}
export const expectedFunctionNames = FUNCTION_CONTRACTS.map((f) => f.name);
