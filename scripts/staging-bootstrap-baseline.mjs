// Local evidence validation only. No enrollment, signing, network or mutation.
import {
  readFileSync,
  openSync,
  closeSync,
  fstatSync,
  lstatSync,
  constants,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ensure, verifyPathBoundary } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { assertReplacementTarget } from "./staging-replacement-target.mjs";
import {
  bootstrapDatabasePolicyDigest,
  BOOTSTRAP_CATALOG_QUERY,
  BOOTSTRAP_SEEDS_QUERY,
  BOOTSTRAP_EMPTY_DATABASE_QUERY,
  BOOTSTRAP_EMPTY_LEDGER_QUERY,
  SQL_CONTEXT,
  databaseProof,
  assertCustomerState,
} from "./staging-bootstrap-database.mjs";
import { assertObservationFresh } from "./staging-release-observation.mjs";
import {
  FOUNDER_MODE,
  FOUNDER_ACCEPTANCE,
  founderPolicy,
  founderGovernanceSchema,
  assertFounderReview,
} from "./staging-founder-governance.mjs";
import {
  assertEvidenceReview,
  timingReviewPolicy,
  timingReviewPayload,
  timingReviewSchema,
  timingSampleBinding,
} from "./staging-timing-evidence.mjs";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  sha = z.string().regex(/^[a-f0-9]{40}$/),
  timestamp = z.string().datetime();
export const BASELINE_REVIEW_DOMAIN = "repsync-staging-virgin-baseline/v2";
export const RETROSPECTIVE_RESIDUAL_RISK =
  "Historical write capability may have existed. Current observations cannot prove pre-capture non-modification or exclude undisclosed changes later restored. Independent approval relies on authenticated operator attestations and reviewed evidence and limitations.";
const evidence = z.array(digest).min(1);
const history = z.discriminatedUnion("mode", [
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("creation_time_exclusion"),
    operatorAuthenticationEvidenceSha256: evidence,
    writersExcludedSinceCreation: z.literal(true),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("retrospective_non_modification"),
    operatorAuthenticationEvidenceSha256: evidence,
    noUnreviewedCustomerModification: z.literal(true),
    customerModificationHistoryKnown: z.literal(true),
    historicalAccess: z.strictObject({
      writeCapabilityMayHaveExisted: z.literal(true),
      actors: z
        .array(
          z.strictObject({
            identity: z.string().trim().min(1),
            writeCapable: z.boolean(),
            evidenceSha256: z.array(digest),
          }),
        )
        .min(1),
      evidenceSha256: z.array(digest),
      limitations: z.array(z.string().trim().min(1)).min(1),
    }),
    knownConfigurationChanges: z.array(
      z.strictObject({
        description: z.string().trim().min(1),
        occurredAt: timestamp,
        authorizationEvidenceSha256: evidence,
        evidenceSha256: evidence,
      }),
    ),
  }),
]);
const independentReview = {
  reviewerIdentity: z.string().trim().min(1),
  independentOfOperator: z.literal(true),
  operatorIdentityAuthenticated: z.literal(true),
  evidenceBindingsVerified: z.literal(true),
};
const historyReview = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("creation_time_exclusion"),
    ...independentReview,
  }),
  z.strictObject({
    mode: z.literal("retrospective_non_modification"),
    ...independentReview,
    historicalWriteCapabilityAcknowledged: z.literal(true),
    accessLimitationsReviewed: z.literal(true),
    configurationChangesReviewed: z.literal(true),
    residualRiskAccepted: z.literal(true),
    residualRiskStatement: z.literal(RETROSPECTIVE_RESIDUAL_RISK),
  }),
]);
const observation = z.record(z.string(), z.unknown());
export const baselineSchema = z.strictObject({
  schemaVersion: z.literal(2),
  classification: z.literal("AMBIGUOUS_MANAGED_BASELINE_PINNED"),
  target: z.strictObject({
    project: z.string().regex(/^[a-z]{20}$/),
    organization: z.string().min(1),
    origin: z.string().url(),
  }),
  source: z.strictObject({
    sha,
    tree: sha,
    identityDigest: digest,
    observerSha256: digest,
    policyDigest: digest,
    querySha256: digest,
  }),
  creation: z.strictObject({
    createdAt: timestamp,
    provenance: z.literal("authorized_infrastructure_creation"),
    provenanceEvidenceSha256: z.array(digest).min(1),
    operatorIdentity: z.string().trim().min(1),
    attestedAt: timestamp,
    noManagedSchemaCustomizationSinceProjectCreation: z.literal(true),
    knownCustomerCustomizations: z.array(z.string()).length(0),
    noRestoreOrImport: z.literal(true),
    history,
    captureExclusion: z.strictObject({
      clientsExcluded: z.literal(true),
      providerIngressExcluded: z.literal(true),
      manualWritersExcluded: z.literal(true),
      backgroundWritersExcluded: z.literal(true),
      establishedAt: timestamp,
      quietWindowEndsAt: timestamp,
    }),
  }),
  databaseProof: observation,
  capture: z.strictObject({
    startedAt: timestamp,
    completedAt: timestamp,
    expiresAt: timestamp,
    opening: observation,
    closing: observation,
    confirmation: observation,
  }),
  completeEvidenceReviewed: z.literal(true),
  creationHistoryReviewed: z.literal(true),
  historyReview,
  reviewEvidenceSha256: digest,
  review: timingReviewSchema,
});
export const founderBaselineSchema = baselineSchema.extend({
  schemaVersion: z.literal(3),
  governance: founderGovernanceSchema,
  historyReview: z.discriminatedUnion(
    "mode",
    historyReview.options.map((schema) =>
      schema.extend({
        independentOfOperator: z.literal(false),
        sameHuman: z.literal(true),
        residualRiskAccepted: z.literal(true),
        residualRiskStatement: z.literal(FOUNDER_ACCEPTANCE),
      }),
    ),
  ),
});
export const baselineReviewMessage = (baseline) =>
  Buffer.from(
    BASELINE_REVIEW_DOMAIN +
      "\n" +
      evidenceDigest(timingReviewPayload(baseline)),
    "utf8",
  );
export function baselineSourceBinding(
  identity,
  context,
  policy,
  governancePolicy = founderPolicy(),
) {
  return {
    sha: context.commit,
    tree: context.tree,
    identityDigest: evidenceDigest(identity),
    observerSha256: timingSampleBinding("empty", identity, context)
      .observerSha256,
    policyDigest: evidenceDigest({
      policy,
      databasePolicyDigest: bootstrapDatabasePolicyDigest(),
      review: timingReviewPolicy(),
      ...(context.governanceMode === FOUNDER_MODE
        ? { founder: governancePolicy }
        : {}),
    }),
    querySha256: evidenceDigest([
      BOOTSTRAP_CATALOG_QUERY,
      BOOTSTRAP_SEEDS_QUERY,
      BOOTSTRAP_EMPTY_DATABASE_QUERY,
      BOOTSTRAP_EMPTY_LEDGER_QUERY,
    ]),
  };
}
export function assertBaselineSnapshot(snapshot, baseline) {
  const f = snapshot.facts;
  ensure(
    f && evidenceDigest(f.sqlContext) === evidenceDigest(SQL_CONTEXT),
    "BOOTSTRAP_SQL_CONTEXT_INVALID",
  );
  assertCustomerState(f?.databaseProof, 0);
  ensure(
    evidenceDigest(f.databaseProof) === evidenceDigest(baseline.databaseProof),
    "BOOTSTRAP_BASELINE_DATABASE_BINDING",
  );
  const p = snapshot.project;
  ensure(
    p?.id === baseline.target.project &&
      p.organization_id === baseline.target.organization &&
      p.status === "ACTIVE_HEALTHY" &&
      Date.parse(p.created_at) === Date.parse(baseline.creation.createdAt) &&
      snapshot.projectDigest === evidenceDigest(p),
    "BOOTSTRAP_BASELINE_PROJECT_BINDING",
  );
  ensure(
    snapshot.authConfig?.site_url === baseline.target.origin &&
      typeof snapshot.authConfig.uri_allow_list === "string" &&
      typeof snapshot.authConfig.disable_signup === "boolean" &&
      typeof snapshot.authConfig.mailer_autoconfirm === "boolean" &&
      snapshot.authCustomerState?.complete === true &&
      snapshot.authCustomerState.unapprovedIntegrations === 0 &&
      snapshot.authCustomerState.integrationDigest ===
        evidenceDigest({ sso: { items: [] }, integrations: [] }) &&
      /^[a-f0-9]{64}$/.test(snapshot.authDigest) &&
      /^[a-f0-9]{64}$/.test(snapshot.secretDigest) &&
      Array.isArray(snapshot.secretNames) &&
      snapshot.secretNames.every((n) => typeof n === "string") &&
      new Set(snapshot.secretNames).size === snapshot.secretNames.length &&
      Array.isArray(snapshot.functions) &&
      snapshot.functions.length === 0,
    "BOOTSTRAP_BASELINE_METADATA_INCOMPLETE",
  );
  ensure(
    typeof f.ledgerPresent === "boolean" &&
      Array.isArray(f.versions) &&
      f.versions.length === 0 &&
      [
        "applicationRelations",
        "applicationFunctions",
        "customSchemas",
        "authUsers",
        "storageObjects",
        "storageBuckets",
      ].every((k) => f[k] === 0),
    "BOOTSTRAP_BASELINE_CUSTOMER_STATE",
  );
}
// Approval expires with a short capture window. Bootstrap authorization can be
// shorter, never longer; a changed source or project needs fresh independent review.
export function validateVirginBaseline(
  raw,
  identity,
  context,
  policy,
  now = Date.now(),
  reviewPolicy = timingReviewPolicy(),
  governancePolicy = founderPolicy(),
) {
  const founder = context.governanceMode === FOUNDER_MODE;
  const parsed = (founder ? founderBaselineSchema : baselineSchema).safeParse(
    raw,
  );
  ensure(parsed.success, "BOOTSTRAP_BASELINE_INVALID");
  const b = parsed.data;
  if (founder) {
    assertFounderReview(
      b,
      "baseline",
      "EMPTY_TO_180",
      context,
      governancePolicy,
      now,
    );
    ensure(
      b.creation.operatorIdentity === b.governance.operatorIdentity &&
        b.target.organization === b.governance.scope.organization &&
        b.historyReview.reviewerIdentity === b.governance.approverIdentity &&
        Date.parse(b.governance.createdAt) >=
          Date.parse(b.capture.completedAt) &&
        Date.parse(b.governance.expiresAt) <= Date.parse(b.capture.expiresAt),
      "BOOTSTRAP_BASELINE_FOUNDER_BINDING",
    );
  } else
    assertEvidenceReview(
      b,
      BASELINE_REVIEW_DOMAIN,
      reviewPolicy,
      "BOOTSTRAP_BASELINE_REVIEW_REQUIRED",
    );
  ensure(
    b.historyReview.mode === b.creation.history.mode &&
      (founder
        ? b.historyReview.reviewerIdentity === b.creation.operatorIdentity
        : b.historyReview.reviewerIdentity !== b.creation.operatorIdentity),
    "BOOTSTRAP_BASELINE_HISTORY_REVIEW_INVALID",
  );
  assertCandidate(b, identity, context, policy, now, governancePolicy);
  return b;
}
const candidateSchema = baselineSchema.omit({
  completeEvidenceReviewed: true,
  creationHistoryReviewed: true,
  historyReview: true,
  reviewEvidenceSha256: true,
  review: true,
});
const founderCandidateSchema = founderBaselineSchema.omit({
  governance: true,
  completeEvidenceReviewed: true,
  creationHistoryReviewed: true,
  historyReview: true,
  reviewEvidenceSha256: true,
  review: true,
});
export function validateBaselineCandidate(
  raw,
  identity,
  context,
  policy,
  now = Date.now(),
  governancePolicy = founderPolicy(),
) {
  const founder = context.governanceMode === FOUNDER_MODE;
  const parsed = (founder ? founderCandidateSchema : candidateSchema).safeParse(
    raw,
  );
  ensure(parsed.success, "BOOTSTRAP_BASELINE_CANDIDATE_INVALID");
  assertCandidate(
    parsed.data,
    identity,
    context,
    policy,
    now,
    governancePolicy,
  );
  return {
    status: founder
      ? "CANDIDATE_REQUIRES_FOUNDER_REVIEW"
      : "CANDIDATE_REQUIRES_INDEPENDENT_REVIEW",
    operational: false,
    evidenceSha256: evidenceDigest(parsed.data),
  };
}
function assertCandidate(b, identity, context, policy, now, governancePolicy) {
  assertReplacementTarget(context.project, context.origin, policy, true);
  ensure(
    b.target.project === context.project &&
      b.target.origin === context.origin &&
      evidenceDigest(b.source) ===
        evidenceDigest(
          baselineSourceBinding(identity, context, policy, governancePolicy),
        ),
    "BOOTSTRAP_BASELINE_BINDING",
  );
  const start = Date.parse(b.capture.startedAt),
    end = Date.parse(b.capture.completedAt),
    expiry = Date.parse(b.capture.expiresAt),
    created = Date.parse(b.creation.createdAt);
  const exclusion = b.creation.captureExclusion;
  ensure(
    Date.parse(exclusion.establishedAt) >= created &&
      Date.parse(exclusion.establishedAt) <= start &&
      Date.parse(exclusion.quietWindowEndsAt) > expiry,
    "BOOTSTRAP_BASELINE_CAPTURE_EXCLUSION_INVALID",
  );
  if (b.creation.history.mode === "retrospective_non_modification") {
    ensure(
      b.creation.history.knownConfigurationChanges.every(
        (change) =>
          Date.parse(change.occurredAt) >= created &&
          Date.parse(change.occurredAt) <= end,
      ),
      "BOOTSTRAP_BASELINE_CONFIGURATION_HISTORY_INVALID",
    );
  }
  ensure(
    created <= start &&
      start <= end &&
      end <= now &&
      now < expiry &&
      expiry > end &&
      expiry - start <= 30 * 60_000 &&
      now - start <= 15 * 60_000 &&
      Date.parse(b.creation.attestedAt) >= created &&
      Date.parse(b.creation.attestedAt) <= end,
    "BOOTSTRAP_BASELINE_STALE",
  );
  assertObservationFresh(
    {
      observedAt: b.capture.startedAt,
      stability: {
        stable: true,
        startedAt: b.capture.startedAt,
        completedAt: b.capture.completedAt,
      },
    },
    end,
  );
  databaseProof(b.databaseProof);
  for (const s of [
    b.capture.opening,
    b.capture.closing,
    b.capture.confirmation,
  ])
    assertBaselineSnapshot(s, b);
  ensure(
    evidenceDigest(b.capture.opening) === evidenceDigest(b.capture.closing) &&
      evidenceDigest(b.capture.closing) ===
        evidenceDigest(b.capture.confirmation),
    "BOOTSTRAP_BASELINE_CAPTURE_DRIFT",
  );
}
// Fixed, source-reviewed target-specific evidence location. No environment path,
// remote registration or automatic refresh. No file exists for the replacement.
export function readBaselineEvidence(project) {
  ensure(/^[a-z]{20}$/.test(project), "BOOTSTRAP_BASELINE_TARGET_INVALID");
  let descriptor;
  try {
    // Already ignored private evidence, OUTSIDE the execution Git tree. Putting
    // source SHA/tree inside a tracked baseline would make a self-referential pin.
    const root = fileURLToPath(new URL("../", import.meta.url));
    const path = fileURLToPath(
      new URL(
        `../output/staging-release/bootstrap-baselines/${project}.json`,
        import.meta.url,
      ),
    );
    verifyPathBoundary(root, path);
    descriptor = openSync(
      path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    const opened = fstatSync(descriptor, { bigint: true }),
      after = lstatSync(path, { bigint: true });
    ensure(
      opened.isFile() &&
        after.isFile() &&
        opened.size <= 32n * 1024n * 1024n &&
        after.dev === opened.dev &&
        after.ino === opened.ino,
      "BOOTSTRAP_BASELINE_FILE_INVALID",
    );
    verifyPathBoundary(root, path);
    // Validate and consume the same opened file, never a pre-open path snapshot.
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } catch {
    throw new Error("BOOTSTRAP_BASELINE_NOT_REGISTERED");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
