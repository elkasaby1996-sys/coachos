// BILL-04B/r2: document contracts only. No enrollment, network, writes or execution.
// Reused legacy validators may read fixed source-controlled policy files.
// Caller-supplied context is NOT authenticated by this module. Successful checks
// establish internal consistency, never hosted truth, durable custody or authority.
import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { hash } from "./billing-retirement-release.mjs";
import { canonical, ensure } from "./staging-release-artifacts.mjs";
import {
  evidenceCanonical,
  evidenceDigest,
} from "./staging-release-webhook-history.mjs";
import {
  FOUNDER_MODE,
  FOUNDER_ACCEPTANCE,
  founderScopeSchema,
  founderPolicySchema,
  founderGovernanceSchema,
  founderActionSchema,
} from "./staging-founder-governance.mjs";
import {
  baselineSchema,
  founderBaselineSchema,
  assertBaselineSnapshot,
} from "./staging-bootstrap-baseline.mjs";
import { databaseProof } from "./staging-bootstrap-database.mjs";
import { bootstrapArtifact } from "./staging-bootstrap-artifacts.mjs";
import {
  bootstrapAuthorizationSchema,
  bootstrapBinding,
} from "./staging-bootstrap-contracts.mjs";
import {
  PHASES,
  phasePlan,
  authorizationSchemas,
  validateAuthorization,
} from "./staging-release-contracts.mjs";
import {
  timingReceiptSchema,
  founderTimingReceiptSchema,
} from "./staging-timing-evidence.mjs";
import {
  founderTimingAdmissionSchema,
  timingWorkload,
} from "./staging-timing-admission.mjs";

export const CONTROL_PLANE_MODE = "founder_signed_control_plane_v2";
export const V2_DOMAINS = Object.freeze({
  action: "repsync-founder-staging-action/v2",
  baseline: "repsync-founder-staging-baseline/v2",
  timing: "repsync-founder-staging-timing/v2",
  delivery: "repsync-staging-private-delivery/v3",
  retention: "repsync-staging-retention-ack/v1",
});
export const V2_LIMITS = Object.freeze({
  observationMs: 60_000,
  freshnessMs: 900_000,
  authorizationMs: 1_800_000,
  workflowMs: 2_700_000,
  margin: 1.25,
  baselineBytes: 32 * 1024 * 1024,
});
const digest = z.string().regex(/^[a-f0-9]{64}$/),
  sha = z.string().regex(/^[a-f0-9]{40}$/),
  id = z.string().regex(/^[1-9][0-9]*$/),
  time = z.string().datetime(),
  uuid = z.string().uuid();
const text = z.string().min(1).max(4096);
const scope = founderScopeSchema.extend({ repositoryOwnerId: id });
const identity = founderGovernanceSchema.shape.founder;
const signature = z.strictObject({
  keyId: digest,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
});
const releasePhases = ["EMPTY_TO_180", ...Object.keys(PHASES)];
const fixed = [
  "CAPTURE_BASELINE",
  "STATUS",
  "BACKUP_180",
  "BACKUP_184",
  "PREPARE_INITIAL_NONBILLING_184",
  ...releasePhases,
];
export const capabilitySchema = z.discriminatedUnion("kind", [
  ...fixed.map((kind) =>
    z.strictObject({
      kind: z.literal(kind),
      mode:
        kind === "PREPARE_INITIAL_NONBILLING_184"
          ? z.literal("apply")
          : releasePhases.includes(kind)
            ? z.enum(["preflight", "apply"])
            : z.literal("preflight"),
    }),
  ),
  z.strictObject({
    kind: z.literal("MEASURE_TIMING"),
    mode: z.literal("preflight"),
    phase: z.enum(releasePhases),
    observationKind: z.enum(["empty", "release"]),
    sampleCount: z.literal(3),
    measurementForIntentDigest: digest,
  }),
  z.strictObject({
    kind: z.literal("RECOVERY_INSPECT"),
    mode: z.literal("preflight"),
    blockedOperationId: uuid,
    blockedActionDigest: digest,
  }),
]);
export const V2_CAPABILITIES = Object.freeze([
  ...fixed,
  "MEASURE_TIMING",
  "RECOVERY_INSPECT",
]);
const workflow = z.strictObject({
  repository: scope.shape.repository,
  repositoryId: id,
  repositoryOwnerId: id,
  environment: scope.shape.environment,
  name: z.enum([
    "Supabase Staging Empty Bootstrap",
    "Supabase Staging Commercial Certification",
    "Supabase Migration Status",
    "Supabase Staging Logical Backup",
  ]),
  workflowRef: text,
  workflowSha: sha,
  subject: text,
  runId: id,
  runAttempt: z.number().int().positive(),
  actorId: id,
  ref: z.literal("refs/heads/main"),
  eventName: z.literal("workflow_dispatch"),
  runCreatedAt: time,
  jobStartedAt: time,
});
const source = z.strictObject({
  commit: sha,
  tree: sha,
  executorBuildDigest: digest,
  identityDigest: digest,
  observerSha256: digest,
  securityPolicyDigest: digest,
  querySha256: digest,
  payloadDigest: digest,
  manifestDigest: digest,
});
const plan = z.strictObject({
  startCheckpoint: z.number().int().min(0).max(186).nullable(),
  endCheckpoint: z.number().int().min(0).max(186).nullable(),
  orderedMigrationsDigest: digest,
  checkpointContractDigest: digest,
  artifactPlanDigest: digest,
});
export const operationIntentV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  policyDigest: digest,
  scope,
  workflow,
  source,
  capability: capabilitySchema,
  plan,
});
const key = z.strictObject({
  keyId: digest,
  publicKey: text,
  ownerSubject: text,
  purpose: z.enum(Object.keys(V2_DOMAINS)),
  capabilities: z.array(z.enum(V2_CAPABILITIES)).min(1),
  validFrom: time,
  expiresAt: time,
  revoked: z.boolean(),
});
export const policyV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  mode: z.literal(CONTROL_PLANE_MODE),
  enabled: z.boolean(),
  epoch: uuid,
  activatedAt: time,
  scope,
  founder: identity,
  deliveryIdentity: text,
  retentionIdentity: text,
  oidcSubject: text,
  executorBuildDigest: digest,
  validFrom: time,
  expiresAt: time,
  keys: z.array(key).max(20),
});
export const governanceV2Schema = founderGovernanceSchema.extend({
  schemaVersion: z.literal(2),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  scope,
  acceptanceVersion: z.literal(2),
  approvalModel: z.literal("founder_signature_external_execution"),
});
export const founderBaselineV4Schema = founderBaselineSchema
  .omit({ review: true, reviewEvidenceSha256: true })
  .extend({
    schemaVersion: z.literal(4),
    governance: governanceV2Schema,
    signature,
  });
export const timingReceiptV4Schema = timingReceiptSchema.extend({
  schemaVersion: z.literal(4),
  binding: timingReceiptSchema.shape.binding.extend({
    intentDigest: digest,
    epoch: uuid,
    policyDigest: digest,
    executionTree: sha,
    executorBuildDigest: digest,
  }),
});
const reference = z.strictObject({
  objectId: uuid,
  version: z.number().int().positive(),
  type: z.enum([
    "baseline",
    "history",
    "creation",
    "configuration",
    "backup",
    "recovery",
    "github",
    "observation",
    "exclusions",
  ]),
  byteLength: z.number().int().positive().max(V2_LIMITS.baselineBytes),
  rawSha256: digest,
  semanticSha256: digest,
});
export const evidenceSetSchema = z
  .array(
    z.strictObject({
      reference,
      json: z.string().min(1).max(V2_LIMITS.baselineBytes),
    }),
  )
  .max(100);
const exclusions = baselineSchema.shape.creation.shape.captureExclusion;
const readAuthorization = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.enum(V2_CAPABILITIES.filter((p) => !releasePhases.includes(p))),
  intentDigest: digest,
  createdAt: time,
  expiresAt: time,
  inventoryObservedAt: time,
  exclusions,
});
// Existing inner authorization schemas keep every field and their original meaning.
export const innerAuthorizationSchema = z.union([
  bootstrapAuthorizationSchema,
  ...Object.values(authorizationSchemas),
  readAuthorization,
]);
const objects = z.array(reference).max(100);
export const timingAdmissionV4Schema = z.strictObject({
  schemaVersion: z.literal(4),
  completeObservationsReviewed: z.literal(true),
  governance: governanceV2Schema,
  intentDigest: digest,
  authorizationDigest: digest,
  evidenceSetDigest: digest,
  baselineEvidenceSha256: digest.nullable(),
  samples: z
    .array(
      z.strictObject({ receipt: timingReceiptV4Schema, receiptSha256: digest }),
    )
    .min(3)
    .max(100),
  workload: z.strictObject({
    observations: z.number().int().positive(),
    migrations: z.number().int().nonnegative(),
    deployments: z.number().int().nonnegative(),
    downloads: z.number().int().nonnegative(),
    probes: z.number().int().nonnegative(),
    unmeasuredTerminalObservations: z.number().int().nonnegative(),
  }),
  allowances: z.strictObject({
    mutationMs: z.number().int().min(1000),
    downloadMs: z.number().int().min(1000),
    probeMs: z.number().int().min(1000),
    localValidationMs: z.number().int().min(1000),
    controlPlaneMs: z.number().int().min(1000),
  }),
  observationLimitMs: z.literal(60_000),
  freshnessMs: z.literal(900_000),
  authorizationLimitMs: z.literal(1_800_000),
  workflowLimitMs: z.literal(2_700_000),
  margin: z.literal(1.25),
  signature,
});
export const founderActionV2Schema = z.strictObject({
  schemaVersion: z.literal(2),
  governance: governanceV2Schema,
  intentDigest: digest,
  authorizationDigest: digest,
  timingAdmissionDigest: digest.nullable(),
  evidence: objects,
  nonce: uuid,
  signature,
});
export const deliveryManifestV3Schema = z.strictObject({
  schemaVersion: z.literal(3),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  policyDigest: digest,
  intentDigest: digest,
  actionDigest: digest,
  objects,
  createdAt: time,
  expiresAt: time,
  signature,
});
const slot = z.strictObject({
  repositoryId: id,
  environment: scope.shape.environment,
  runId: id,
  runAttempt: z.number().int().positive(),
  phase: z.enum([
    ...V2_CAPABILITIES.filter((p) => p !== "MEASURE_TIMING"),
    ...releasePhases.map((p) => `MEASURE_TIMING:${p}`),
  ]),
  mode: z.enum(["preflight", "apply"]),
});
export const claimRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  policyDigest: digest,
  claimId: uuid,
  actionDigest: digest,
  intentDigest: digest,
  nonce: uuid,
  slot,
  consumed: z.literal(true),
  state: z.literal("CLAIMED_PENDING_RETENTION"),
  targetOwnership: z.enum(["RESERVED", "INSPECTION"]),
  claimedAt: time,
});
export const retentionManifestV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  policyDigest: digest,
  actionDigest: digest,
  intentDigest: digest,
  deliveryManifestDigest: digest,
  claimDigest: digest,
  objects,
  createdAt: time,
  retainUntil: time,
});
export const retentionAcknowledgementV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  policyDigest: digest,
  actionDigest: digest,
  claimId: uuid,
  packageManifestDigest: digest,
  encryptedArchiveSha256: digest,
  archiveByteLength: z.number().int().positive(),
  custodyIdentity: text,
  retainedAt: time,
  retainUntil: time,
  signature,
});
export const lifecycleStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  actionDigest: digest,
  claimId: uuid,
  epoch: uuid,
  state: z.enum([
    "VALIDATED",
    "CLAIMED_PENDING_RETENTION",
    "RETENTION_CONFIRMED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "REVOKED",
    "OUTCOME_UNKNOWN",
    "BLOCKED_RETENTION",
  ]),
  consumed: z.boolean(),
  targetOwnership: z.enum([
    "NONE",
    "RESERVED",
    "OWNED",
    "QUARANTINED",
    "INSPECTION",
  ]),
  dispatchCount: z.number().int().nonnegative(),
  credentialAccessCount: z.number().int().nonnegative(),
  executorFenced: z.boolean(),
  processTerminated: z.boolean(),
  terminalEvidenceRetained: z.boolean(),
  retentionAckDigest: digest.nullable(),
  updatedAt: time,
});
export const executionReceiptV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal(CONTROL_PLANE_MODE),
  epoch: uuid,
  actionDigest: digest,
  claimId: uuid,
  retentionAckDigest: digest,
  executorBuildDigest: digest,
  startedAt: time,
  completedAt: time,
  result: z.enum(["SUCCEEDED", "FAILED", "REVOKED", "OUTCOME_UNKNOWN"]),
  outcomeEvidenceDigest: digest,
});
export const epochReplacementSchema = z.strictObject({
  schemaVersion: z.literal(1),
  oldEpoch: uuid,
  newEpoch: uuid,
  bootChallenge: digest,
  executorBuildDigest: digest,
  restoredLedgerDigest: digest,
  authoritativeHeadDigest: digest,
  previousEpochRetired: z.literal(true),
  startsDisarmed: z.literal(true),
  unresolvedTargetsRemainQuarantined: z.literal(true),
  activatedAt: time,
});
export const liveStatusSchema = z.strictObject({
  schemaVersion: z.literal(1),
  actionDigest: digest,
  claimId: uuid,
  epoch: uuid,
  policyDigest: digest,
  observedAt: time,
  revoked: z.boolean(),
  state: lifecycleStateSchema.shape.state,
});

// Signed input must use this parser BEFORE any ordinary JSON.parse. Decoded key
// equality catches escaped duplicate names too. No getters/prototypes/cycles are
// admitted through the object API. Every failure uses a secret-safe fixed code.
export function parseSignedJson(input) {
  let json;
  try {
    json =
      typeof input === "string"
        ? input
        : new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new Error("V2_JSON_INVALID");
  }
  ensure(
    typeof json === "string" &&
      Buffer.byteLength(json) <= V2_LIMITS.baselineBytes,
    "V2_JSON_SIZE",
  );
  let at = 0,
    nodes = 0;
  const whitespace = () => {
    while (" \t\r\n".includes(json[at] ?? "x")) at++;
  };
  const string = () => {
    const start = at++;
    while (at < json.length) {
      const ch = json[at++];
      if (ch === "\\") {
        at++;
        continue;
      }
      if (ch === '"') {
        let value;
        try {
          value = JSON.parse(json.slice(start, at));
        } catch {
          throw new Error("V2_JSON_INVALID");
        }
        ensure(
          Buffer.from(value, "utf8").toString("utf8") === value,
          "V2_JSON_AMBIGUOUS",
        );
        return value;
      }
    }
    throw new Error("V2_JSON_INVALID");
  };
  const value = (depth) => {
    ensure(depth <= 64 && ++nodes <= 1_000_000, "V2_JSON_COMPLEXITY");
    whitespace();
    if (json[at] === '"') return string();
    if (json[at] === "{" || json[at] === "[") {
      const object = json[at++] === "{",
        end = object ? "}" : "]",
        result = object ? Object.create(null) : [],
        seen = new Set();
      whitespace();
      if (json[at] === end) {
        at++;
        return result;
      }
      while (true) {
        whitespace();
        let key;
        if (object) {
          ensure(json[at] === '"', "V2_JSON_INVALID");
          key = string();
          ensure(!seen.has(key), "V2_JSON_DUPLICATE_KEY");
          seen.add(key);
          whitespace();
          ensure(json[at++] === ":", "V2_JSON_INVALID");
        }
        const next = value(depth + 1);
        if (object) result[key] = next;
        else result.push(next);
        whitespace();
        if (json[at] === end) {
          at++;
          return result;
        }
        ensure(json[at++] === ",", "V2_JSON_INVALID");
      }
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        json.slice(at),
      )?.[0];
    ensure(token, "V2_JSON_INVALID");
    at += token.length;
    const parsed = JSON.parse(token);
    if (typeof parsed === "number")
      ensure(
        Number.isFinite(parsed) &&
          !Object.is(parsed, -0) &&
          (!Number.isInteger(parsed) || Number.isSafeInteger(parsed)) &&
          JSON.stringify(parsed) === token,
        "V2_JSON_AMBIGUOUS",
      );
    return parsed;
  };
  const result = value(0);
  whitespace();
  ensure(at === json.length, "V2_JSON_INVALID");
  return result;
}
function assertJson(value, stack = new Set(), depth = 0) {
  ensure(depth <= 64, "V2_JSON_COMPLEXITY");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    ensure(
      Buffer.from(value, "utf8").toString("utf8") === value,
      "V2_JSON_AMBIGUOUS",
    );
    return;
  }
  if (typeof value === "number") {
    ensure(
      Number.isFinite(value) &&
        !Object.is(value, -0) &&
        (!Number.isInteger(value) || Number.isSafeInteger(value)),
      "V2_JSON_AMBIGUOUS",
    );
    return;
  }
  ensure(
    value &&
      typeof value === "object" &&
      !stack.has(value) &&
      (Array.isArray(value)
        ? Object.getPrototypeOf(value) === Array.prototype
        : [Object.prototype, null].includes(Object.getPrototypeOf(value))),
    "V2_JSON_AMBIGUOUS",
  );
  const names = Reflect.ownKeys(value);
  ensure(
    names.every(
      (k) =>
        typeof k === "string" &&
        ((k === "length" && Array.isArray(value)) ||
          (Object.getOwnPropertyDescriptor(value, k)?.enumerable &&
            "value" in Object.getOwnPropertyDescriptor(value, k))),
    ),
    "V2_JSON_AMBIGUOUS",
  );
  if (Array.isArray(value))
    ensure(
      Object.keys(value).length === value.length &&
        Object.keys(value).every((k, i) => k === String(i)),
      "V2_JSON_AMBIGUOUS",
    );
  stack.add(value);
  for (const k of Object.keys(value)) assertJson(value[k], stack, depth + 1);
  stack.delete(value);
}
export function canonicalV2(value) {
  assertJson(value);
  return evidenceCanonical(value);
}
export function digestV2(value) {
  return hash(canonicalV2(value));
}
function parse(schema, raw, code) {
  const value =
    typeof raw === "string" || raw instanceof Uint8Array
      ? parseSignedJson(raw)
      : raw;
  assertJson(value);
  const result = schema.safeParse(value);
  ensure(result.success, code);
  return result.data;
}
function equal(a, b, code) {
  ensure(digestV2(a) === digestV2(b), code);
}
function fresh(start, end, now, limit, code) {
  const a = Date.parse(start),
    b = Date.parse(end);
  ensure(a <= now && now < b && b > a && b - a <= limit, code);
}

export function signingPayloadV2(document) {
  assertJson(document);
  ensure(
    document.signature &&
      Object.keys(document.signature).sort().join() === "keyId,signature",
    "V2_SIGNATURE_INVALID",
  );
  const { signature: sig, ...payload } = document;
  return { ...payload, signingKeyId: sig.keyId };
}
export function signingMessageV2(document, purpose) {
  ensure(Object.hasOwn(V2_DOMAINS, purpose), "V2_SIGNING_PURPOSE_INVALID");
  return Buffer.from(
    `${V2_DOMAINS[purpose]}\n${canonicalV2(signingPayloadV2(document))}`,
    "utf8",
  );
}
export function validatePolicyV2(raw, now) {
  const p = parse(policyV2Schema, raw, "V2_POLICY_INVALID");
  ensure(
    Number.isFinite(now) && p.enabled && p.keys.length > 0,
    "V2_POLICY_DISABLED",
  );
  fresh(p.validFrom, p.expiresAt, now, Infinity, "V2_POLICY_EXPIRED");
  ensure(
    Date.parse(p.activatedAt) <= now &&
      Date.parse(p.validFrom) <= Date.parse(p.activatedAt) &&
      new Set(p.keys.map((k) => k.keyId)).size === p.keys.length &&
      new Set([p.deliveryIdentity, p.retentionIdentity, p.founder.subject])
        .size === 3,
    "V2_KEY_POLICY_INVALID",
  );
  for (const k of p.keys) {
    const owner =
      k.purpose === "delivery"
        ? p.deliveryIdentity
        : k.purpose === "retention"
          ? p.retentionIdentity
          : p.founder.subject;
    ensure(
      k.ownerSubject === owner &&
        new Set(k.capabilities).size === k.capabilities.length &&
        Date.parse(k.validFrom) >= Date.parse(p.validFrom) &&
        Date.parse(k.expiresAt) <= Date.parse(p.expiresAt) &&
        Date.parse(k.validFrom) < Date.parse(k.expiresAt),
      "V2_KEY_POLICY_INVALID",
    );
    try {
      const publicKey = createPublicKey(k.publicKey);
      ensure(
        publicKey.asymmetricKeyType === "ed25519" &&
          hash(publicKey.export({ type: "spki", format: "der" })) === k.keyId,
        "V2_KEY_POLICY_INVALID",
      );
    } catch {
      throw new Error("V2_KEY_POLICY_INVALID");
    }
  }
  return p;
}
const signedSchemas = {
  action: founderActionV2Schema,
  baseline: founderBaselineV4Schema,
  timing: timingAdmissionV4Schema,
  delivery: deliveryManifestV3Schema,
  retention: retentionAcknowledgementV1Schema,
};
export function validateSignedV2(raw, purpose, context) {
  ensure(Object.hasOwn(signedSchemas, purpose), "V2_SIGNING_PURPOSE_INVALID");
  const d = parse(signedSchemas[purpose], raw, "V2_DOCUMENT_INVALID"),
    p = validatePolicyV2(context.policy, context.now),
    i = validateIntentV2(context.intent, context);
  equal(i.scope, p.scope, "V2_SCOPE_BINDING");
  ensure(
    i.epoch === p.epoch && i.policyDigest === digestV2(p),
    "V2_EPOCH_POLICY_BINDING",
  );
  const g = d.governance;
  equal(g?.scope ?? i.scope, p.scope, "V2_SCOPE_BINDING");
  ensure(
    (g?.epoch ?? d.epoch) === p.epoch &&
      (g?.policyDigest ?? d.policyDigest) === digestV2(p),
    "V2_EPOCH_POLICY_BINDING",
  );
  if (g) {
    equal(g.founder, p.founder, "V2_GOVERNANCE_BINDING");
    ensure(
      g.executionCommit === i.source.commit &&
        g.executionTree === i.source.tree &&
        g.operatorIdentity === p.founder.subject &&
        g.approverIdentity === p.founder.subject,
      "V2_GOVERNANCE_BINDING",
    );
  }
  const start = g?.createdAt ?? d.createdAt ?? d.retainedAt,
    end = g?.expiresAt ?? d.expiresAt ?? d.retainUntil;
  fresh(
    start,
    end,
    context.now,
    purpose === "timing"
      ? V2_LIMITS.freshnessMs
      : purpose === "retention"
        ? Infinity
        : V2_LIMITS.authorizationMs,
    "V2_DOCUMENT_EXPIRED",
  );
  ensure(
    Date.parse(start) >= Date.parse(p.activatedAt),
    "V2_DOCUMENT_PREACTIVATION",
  );
  const k = p.keys.find((k) => k.keyId === d.signature.keyId);
  ensure(
    k &&
      k.purpose === purpose &&
      k.capabilities.includes(
        purpose === "baseline" ? "EMPTY_TO_180" : i.capability.kind,
      ) &&
      !k.revoked &&
      Date.parse(k.validFrom) <= Date.parse(start) &&
      context.now < Date.parse(k.expiresAt) &&
      (purpose === "retention" || Date.parse(end) <= Date.parse(k.expiresAt)),
    "V2_KEY_PURPOSE_DENIED",
  );
  ensure(
    Buffer.from(d.signature.signature, "base64").toString("base64") ===
      d.signature.signature &&
      verify(
        null,
        signingMessageV2(d, purpose),
        createPublicKey(k.publicKey),
        Buffer.from(d.signature.signature, "base64"),
      ),
    "V2_SIGNATURE_INVALID",
  );
  return d;
}

export function reviewedCapabilityPlan(capability, identity, contracts) {
  const c = parse(capabilitySchema, capability, "V2_CAPABILITY_INVALID"),
    phase = c.kind === "MEASURE_TIMING" ? c.phase : c.kind;
  let start = null,
    end = null,
    migrations = [],
    artifact = null;
  if (phase === "EMPTY_TO_180") {
    start = 0;
    end = 180;
    artifact = bootstrapArtifact(identity);
    migrations = artifact.migrations;
  } else if (Object.hasOwn(PHASES, phase)) {
    artifact = phasePlan(phase, identity);
    start = artifact.start;
    end = artifact.end;
    migrations = artifact.pendingMigrations;
  } else if (phase === "CAPTURE_BASELINE") start = end = 0;
  else if (
    ["BACKUP_180", "BACKUP_184", "PREPARE_INITIAL_NONBILLING_184"].includes(
      phase,
    )
  )
    start = end = phase === "BACKUP_180" ? 180 : 184;
  if (c.kind === "MEASURE_TIMING") {
    end = start;
    migrations = [];
    artifact = {
      measurementPhase: c.phase,
      observationKind: c.observationKind,
      sampleCount: 3,
    };
  }
  if (phase === "PREPARE_INITIAL_NONBILLING_184") {
    artifact = identity.functions.filter((f) =>
      ["open-wearables", "exercise-dataset-search"].includes(f.name),
    );
    ensure(
      artifact.length === 2 &&
        new Set(artifact.map((f) => f.name)).size === 2 &&
        artifact.every((f) => f.verifyJwt === true),
      "V2_PREPARATION_ARTIFACT_INVALID",
    );
  }
  return {
    startCheckpoint: start,
    endCheckpoint: end,
    orderedMigrationsDigest: digestV2(migrations),
    // Preserve the existing v3 authorization field's serialization contract.
    checkpointContractDigest: hash(canonical(contracts)),
    artifactPlanDigest: digestV2(artifact),
  };
}
function workflowLimitMs(capability) {
  if (capability.kind === "STATUS") return 900_000;
  if (["BACKUP_180", "BACKUP_184"].includes(capability.kind)) return 1_800_000;
  return V2_LIMITS.workflowMs;
}
export function validateIntentV2(raw, context) {
  const i = parse(operationIntentV2Schema, raw, "V2_INTENT_INVALID"),
    p = validatePolicyV2(context.policy, context.now);
  equal(i, context.intent, "V2_EXPECTED_INTENT_BINDING");
  equal(i.scope, p.scope, "V2_SCOPE_BINDING");
  ensure(
    i.epoch === p.epoch && i.policyDigest === digestV2(p),
    "V2_EPOCH_POLICY_BINDING",
  );
  const w = i.workflow,
    c = i.capability;
  const file =
    ["CAPTURE_BASELINE", "EMPTY_TO_180"].includes(c.kind) ||
    (c.kind === "MEASURE_TIMING" && c.phase === "EMPTY_TO_180")
      ? "supabase-staging-bootstrap.yml"
      : c.kind === "STATUS"
        ? "supabase-migration-status.yml"
        : c.kind.startsWith("BACKUP_")
          ? "supabase-manual-backup.yml"
          : "supabase-deploy-staging.yml";
  const names = {
    "supabase-staging-bootstrap.yml": "Supabase Staging Empty Bootstrap",
    "supabase-deploy-staging.yml": "Supabase Staging Commercial Certification",
    "supabase-migration-status.yml": "Supabase Migration Status",
    "supabase-manual-backup.yml": "Supabase Staging Logical Backup",
  };
  ensure(
    w.repositoryId === p.scope.repositoryId &&
      w.repositoryOwnerId === p.scope.repositoryOwnerId &&
      w.subject === p.oidcSubject &&
      w.actorId === p.founder.githubUserId &&
      w.workflowRef ===
        `${p.scope.repository}/.github/workflows/${file}@refs/heads/main` &&
      w.name === names[file] &&
      w.workflowSha === i.source.commit,
    "V2_WORKFLOW_BINDING",
  );
  ensure(
    Date.parse(w.runCreatedAt) >= Date.parse(p.activatedAt) &&
      Date.parse(w.jobStartedAt) >= Date.parse(w.runCreatedAt) &&
      Date.parse(w.jobStartedAt) <= context.now &&
      context.now < Date.parse(w.jobStartedAt) + workflowLimitMs(c) &&
      i.source.executorBuildDigest === p.executorBuildDigest,
    "V2_ACTIVATION_WORKFLOW_BINDING",
  );
  ensure(
    i.source.identityDigest === digestV2(context.identity) &&
      i.source.payloadDigest === context.identity.payload.digest &&
      i.source.manifestDigest ===
        hash(JSON.stringify(context.identity.manifest)),
    "V2_SOURCE_IDENTITY_BINDING",
  );
  equal(
    i.plan,
    reviewedCapabilityPlan(c, context.identity, context.contracts),
    "V2_PLAN_BINDING",
  );
  if (c.kind === "MEASURE_TIMING")
    ensure(
      c.observationKind === (c.phase === "EMPTY_TO_180" ? "empty" : "release"),
      "V2_MEASUREMENT_KIND_INVALID",
    );
  return i;
}
export function operationSlotV2(intent) {
  const i = parse(operationIntentV2Schema, intent, "V2_INTENT_INVALID"),
    w = i.workflow,
    c = i.capability;
  return {
    repositoryId: w.repositoryId,
    environment: i.scope.environment,
    runId: w.runId,
    runAttempt: w.runAttempt,
    phase: c.kind === "MEASURE_TIMING" ? `MEASURE_TIMING:${c.phase}` : c.kind,
    mode: c.mode,
  };
}

function evidenceRecords(raw) {
  const records = parse(evidenceSetSchema, raw, "V2_EVIDENCE_INVALID"),
    seen = new Set(),
    semantic = new Set();
  for (const e of records) {
    const r = e.reference,
      identity = `${r.objectId}:${r.version}`;
    ensure(
      !seen.has(identity) && !semantic.has(`${r.type}:${r.semanticSha256}`),
      "V2_EVIDENCE_DUPLICATE",
    );
    seen.add(identity);
    semantic.add(`${r.type}:${r.semanticSha256}`);
    ensure(
      Buffer.byteLength(e.json, "utf8") === r.byteLength &&
        hash(Buffer.from(e.json, "utf8")) === r.rawSha256,
      "V2_EVIDENCE_RAW_BINDING",
    );
    ensure(
      digestV2(parseSignedJson(e.json)) === r.semanticSha256,
      "V2_EVIDENCE_SEMANTIC_BINDING",
    );
  }
  return records;
}
function validateBaselineRecord(records, context, required) {
  const rows = records.filter((e) => e.reference.type === "baseline");
  ensure(rows.length === (required ? 1 : 0), "V2_BASELINE_REQUIRED");
  if (!required) return null;
  const b = validateSignedV2(rows[0].json, "baseline", context),
    g = b.governance;
  equal(
    b.target,
    {
      project: context.intent.scope.project,
      organization: context.intent.scope.organization,
      origin: context.intent.scope.origin,
    },
    "V2_BASELINE_TARGET_BINDING",
  );
  equal(b.source, context.baselineSource, "V2_BASELINE_SOURCE_BINDING");
  ensure(
    b.source.sha === context.intent.source.commit &&
      b.source.tree === context.intent.source.tree &&
      b.source.identityDigest === context.intent.source.identityDigest &&
      b.source.observerSha256 === context.intent.source.observerSha256 &&
      b.source.querySha256 === context.intent.source.querySha256,
    "V2_BASELINE_SOURCE_BINDING",
  );
  ensure(
    b.creation.operatorIdentity === g.operatorIdentity &&
      b.historyReview.reviewerIdentity === g.approverIdentity &&
      b.historyReview.mode === b.creation.history.mode,
    "V2_HISTORY_BINDING",
  );
  const start = Date.parse(b.capture.startedAt),
    end = Date.parse(b.capture.completedAt),
    expiry = Date.parse(b.capture.expiresAt),
    creation = Date.parse(b.creation.createdAt),
    attested = Date.parse(b.creation.attestedAt),
    excluded = b.creation.captureExclusion;
  ensure(
    creation <= attested &&
      attested <= end &&
      creation <= Date.parse(excluded.establishedAt) &&
      Date.parse(excluded.establishedAt) <= start &&
      Date.parse(excluded.quietWindowEndsAt) > expiry &&
      start <= end &&
      end <= context.now &&
      end - start <= V2_LIMITS.observationMs &&
      context.now - start <= V2_LIMITS.freshnessMs &&
      expiry > context.now &&
      expiry - start <= V2_LIMITS.authorizationMs &&
      Date.parse(g.createdAt) >= end &&
      Date.parse(g.expiresAt) <= expiry,
    "V2_BASELINE_WINDOW_INVALID",
  );
  if (b.creation.history.mode === "retrospective_non_modification")
    ensure(
      b.creation.history.knownConfigurationChanges.every(
        (v) =>
          creation <= Date.parse(v.occurredAt) &&
          Date.parse(v.occurredAt) <= end,
      ),
      "V2_HISTORY_BINDING",
    );
  databaseProof(b.databaseProof);
  for (const s of [
    b.capture.opening,
    b.capture.closing,
    b.capture.confirmation,
  ])
    assertBaselineSnapshot(s, b);
  equal(b.capture.opening, b.capture.closing, "V2_BASELINE_DRIFT");
  equal(b.capture.closing, b.capture.confirmation, "V2_BASELINE_DRIFT");
  return b;
}
function validateInner(raw, context, baseline) {
  const i = context.intent,
    c = i.capability,
    u = parse(innerAuthorizationSchema, raw, "V2_INNER_AUTHORIZATION_INVALID");
  if (c.kind === "EMPTY_TO_180") {
    const a = parse(
      bootstrapAuthorizationSchema,
      u,
      "V2_INNER_AUTHORIZATION_INVALID",
    );
    ensure(
      a.executionCommit === i.source.commit &&
        a.baselineEvidenceSha256 === digestV2(baseline) &&
        a.bindingDigest ===
          evidenceDigest(
            bootstrapBinding(
              context.identity,
              context.releaseContext,
              context.registry,
              context.contracts,
              baseline,
            ),
          ),
      "V2_INNER_BINDING",
    );
    ensure(
      Date.parse(a.inventoryObservedAt) >=
        Date.parse(baseline.capture.completedAt) &&
        Date.parse(a.expiresAt) <= Date.parse(baseline.capture.expiresAt) &&
        Date.parse(a.expiresAt) <= Date.parse(baseline.governance.expiresAt),
      "V2_INNER_WINDOW_INVALID",
    );
  } else if (Object.hasOwn(PHASES, c.kind))
    validateAuthorization(
      u,
      c.kind,
      context.identity,
      context.releaseContext,
      i.plan.checkpointContractDigest,
      context.now,
    );
  else {
    const a = parse(readAuthorization, u, "V2_INNER_AUTHORIZATION_INVALID");
    ensure(
      a.kind === c.kind && a.intentDigest === digestV2(i),
      "V2_INNER_BINDING",
    );
  }
  fresh(
    u.createdAt,
    u.expiresAt,
    context.now,
    V2_LIMITS.authorizationMs,
    "V2_INNER_EXPIRED",
  );
  const observed = u.inventoryObservedAt ?? u.inventory.observedAt,
    quiet =
      u.operational?.quietWindowEndsAt ??
      u.operational?.retryWindowEndsAt ??
      u.exclusions.quietWindowEndsAt;
  ensure(
    Date.parse(observed) <= Date.parse(u.createdAt) &&
      context.now - Date.parse(observed) <= V2_LIMITS.freshnessMs &&
      Date.parse(quiet) > Date.parse(u.expiresAt),
    "V2_INNER_WINDOW_INVALID",
  );
  if (u.exclusions)
    ensure(
      Date.parse(u.exclusions.establishedAt) <= Date.parse(observed),
      "V2_EXCLUSION_WINDOW_INVALID",
    );
  return u;
}
function validateTiming(raw, context, u, records, baseline) {
  const i = context.intent,
    c = i.capability;
  if (!releasePhases.includes(c.kind)) {
    ensure(raw === null, "V2_UNEXPECTED_TIMING");
    return null;
  }
  ensure(raw !== null, "V2_TIMING_REQUIRED");
  const refs = records.map((e) => e.reference);
  const t = validateSignedV2(raw, "timing", context),
    baselineDigest = baseline ? digestV2(baseline) : null;
  ensure(
    t.intentDigest === digestV2(i) &&
      t.authorizationDigest === digestV2(u) &&
      t.evidenceSetDigest === digestV2(refs) &&
      t.baselineEvidenceSha256 === baselineDigest,
    "V2_TIMING_BINDING",
  );
  equal(
    t.workload,
    timingWorkload(c.kind, context.identity),
    "V2_TIMING_WORKLOAD_BINDING",
  );
  const ids = new Set(),
    receiptDigests = new Set(),
    proofs = new Set();
  let previous = -Infinity,
    worst = 0,
    deadline = Math.min(
      Date.parse(u.expiresAt),
      Date.parse(t.governance.expiresAt),
      Date.parse(i.workflow.jobStartedAt) + workflowLimitMs(c),
      Date.parse(u.inventoryObservedAt ?? u.inventory.observedAt) +
        V2_LIMITS.freshnessMs,
      Date.parse(
        u.operational.quietWindowEndsAt ?? u.operational.retryWindowEndsAt,
      ),
    );
  if (baseline)
    deadline = Math.min(
      deadline,
      Date.parse(baseline.capture.startedAt) + V2_LIMITS.freshnessMs,
      Date.parse(baseline.capture.expiresAt),
      Date.parse(baseline.governance.expiresAt),
    );
  if (u.configuration)
    deadline = Math.min(
      deadline,
      Date.parse(u.configuration.observedAt) + V2_LIMITS.freshnessMs,
      Date.parse(u.backup.expiresAt),
      Date.parse(u.backup.createdAt) + 86_400_000,
    );
  const surfaces = [
    "DATABASE_DRIFT",
    "FUNCTION_INVENTORY_DRIFT",
    "CONFIGURATION_DRIFT",
    "AUTH_CONFIGURATION_DRIFT",
    ...(c.kind === "EMPTY_TO_180" ? ["PROJECT_DRIFT"] : []),
  ].sort();
  for (const entry of [...t.samples].sort(
    (a, b) => Date.parse(a.receipt.startedAt) - Date.parse(b.receipt.startedAt),
  )) {
    const q = entry.receipt,
      b = q.binding,
      begin = Date.parse(q.startedAt),
      end = Date.parse(q.completedAt);
    ensure(
      entry.receiptSha256 === digestV2(q) &&
        b.intentDigest === digestV2(i) &&
        b.epoch === i.epoch &&
        b.policyDigest === i.policyDigest &&
        b.executionCommit === i.source.commit &&
        b.executionTree === i.source.tree &&
        b.executorBuildDigest === i.source.executorBuildDigest &&
        b.identityDigest === i.source.identityDigest &&
        b.observerSha256 === i.source.observerSha256 &&
        b.securityPolicyDigest === i.source.securityPolicyDigest &&
        b.projectSha256 === hash(i.scope.project) &&
        b.originSha256 === hash(i.scope.origin) &&
        b.baselineEvidenceSha256 === baselineDigest &&
        b.kind === (c.kind === "EMPTY_TO_180" ? "empty" : "release"),
      "V2_TIMING_SAMPLE_BINDING",
    );
    ensure(
      begin >= previous &&
        end > begin &&
        end - begin < V2_LIMITS.observationMs &&
        end <= Date.parse(t.governance.createdAt) &&
        !ids.has(q.sampleId) &&
        !receiptDigests.has(entry.receiptSha256) &&
        !proofs.has(q.completeObservationSha256),
      "V2_TIMING_SAMPLE_INVALID",
    );
    const retained = records.find(
      (e) =>
        e.reference.type === "observation" &&
        e.reference.semanticSha256 === q.completeObservationSha256,
    );
    ensure(retained, "V2_TIMING_OBSERVATION_MISSING");
    const observation = parseSignedJson(retained.json);
    ensure(
      observation.digest === q.observationDigest &&
        observation.observedAt === q.startedAt &&
        (c.kind !== "EMPTY_TO_180" ||
          observation.baselineEvidenceSha256 === baselineDigest) &&
        observation.stability?.startedAt === q.startedAt &&
        observation.stability?.completedAt === q.completedAt &&
        observation.stability?.stable === true,
      "V2_TIMING_OBSERVATION_BINDING",
    );
    equal(
      observation.stability.proof,
      q.proof,
      "V2_TIMING_OBSERVATION_BINDING",
    );
    equal(
      observation.stability.categories,
      q.categories,
      "V2_TIMING_OBSERVATION_BINDING",
    );
    for (const s of Object.values(q.proof))
      equal(Object.keys(s).sort(), surfaces, "V2_TIMING_SURFACES_INVALID");
    equal(q.proof.opening, q.proof.closing, "V2_TIMING_DRIFT");
    equal(q.proof.closing, q.proof.confirmation, "V2_TIMING_DRIFT");
    previous = end;
    worst = Math.max(worst, end - begin);
    deadline = Math.min(deadline, begin + V2_LIMITS.freshnessMs);
    ids.add(q.sampleId);
    receiptDigests.add(entry.receiptSha256);
    proofs.add(q.completeObservationSha256);
  }
  const w = t.workload,
    a = t.allowances,
    estimate = Math.ceil(
      1.25 *
        ((w.observations - w.unmeasuredTerminalObservations) * worst +
          w.unmeasuredTerminalObservations * V2_LIMITS.observationMs +
          (w.migrations + w.deployments) * a.mutationMs +
          w.downloads * a.downloadMs +
          w.probes * a.probeMs +
          a.localValidationMs +
          a.controlPlaneMs),
    );
  ensure(
    worst * 1.25 < V2_LIMITS.observationMs && context.now + estimate < deadline,
    "V2_TIMING_BUDGET_BLOCKED",
  );
  return t;
}

export const referenceGraphSchema = z.strictObject({
  intent: operationIntentV2Schema,
  evidence: evidenceSetSchema,
  authorization: innerAuthorizationSchema,
  timing: timingAdmissionV4Schema.nullable(),
  action: founderActionV2Schema,
  delivery: deliveryManifestV3Schema,
  claim: claimRecordSchema,
  retention: retentionManifestV1Schema,
  acknowledgement: retentionAcknowledgementV1Schema,
});
export function validateReferenceGraphV2(raw, expected) {
  const b = parse(referenceGraphSchema, raw, "V2_GRAPH_INVALID"),
    i = validateIntentV2(b.intent, expected),
    context = { ...expected, intent: i },
    records = evidenceRecords(b.evidence),
    refs = records.map((e) => e.reference);
  const releaseContext = expected.releaseContext;
  ensure(
    releaseContext &&
      releaseContext.commit === i.source.commit &&
      releaseContext.tree === i.source.tree &&
      releaseContext.project === i.scope.project &&
      releaseContext.organization === i.scope.organization &&
      releaseContext.origin === i.scope.origin &&
      releaseContext.clean === true &&
      releaseContext.productionProject ===
        expected.registry.productionProject &&
      releaseContext.productionOrigin === expected.registry.productionOrigin,
    "V2_CONTEXT_BINDING",
  );
  const requiresBaseline =
    i.capability.kind === "EMPTY_TO_180" ||
    (i.capability.kind === "MEASURE_TIMING" &&
      i.capability.phase === "EMPTY_TO_180");
  const baseline = validateBaselineRecord(records, context, requiresBaseline),
    u = validateInner(b.authorization, context, baseline),
    t = validateTiming(b.timing, context, u, records, baseline),
    a = validateSignedV2(b.action, "action", context),
    actionDigest = digestV2(a),
    intentDigest = digestV2(i);
  ensure(
    a.intentDigest === intentDigest &&
      a.authorizationDigest === digestV2(u) &&
      a.timingAdmissionDigest === (t ? digestV2(t) : null),
    "V2_ACTION_BINDING",
  );
  equal(a.evidence, refs, "V2_ACTION_EVIDENCE_BINDING");
  ensure(
    Date.parse(a.governance.createdAt) >= Date.parse(u.createdAt) &&
      Date.parse(a.governance.expiresAt) <= Date.parse(u.expiresAt) &&
      (!t ||
        (Date.parse(a.governance.createdAt) >=
          Date.parse(t.governance.createdAt) &&
          Date.parse(a.governance.expiresAt) <=
            Date.parse(t.governance.expiresAt))),
    "V2_ACTION_WINDOW_BINDING",
  );
  const d = validateSignedV2(b.delivery, "delivery", context);
  ensure(
    d.actionDigest === actionDigest && d.intentDigest === intentDigest,
    "V2_DELIVERY_BINDING",
  );
  equal(d.objects, refs, "V2_DELIVERY_OBJECT_BINDING");
  ensure(
    Date.parse(d.createdAt) >= Date.parse(a.governance.createdAt) &&
      Date.parse(d.expiresAt) <= Date.parse(a.governance.expiresAt),
    "V2_DELIVERY_WINDOW_BINDING",
  );
  const c = b.claim;
  ensure(
    c.epoch === i.epoch &&
      c.policyDigest === i.policyDigest &&
      c.actionDigest === actionDigest &&
      c.intentDigest === intentDigest &&
      c.nonce === a.nonce &&
      c.targetOwnership ===
        (i.capability.kind === "RECOVERY_INSPECT" ? "INSPECTION" : "RESERVED"),
    "V2_CLAIM_BINDING",
  );
  equal(c.slot, operationSlotV2(i), "V2_CLAIM_SLOT_BINDING");
  const r = b.retention;
  ensure(
    r.epoch === i.epoch &&
      r.policyDigest === i.policyDigest &&
      r.actionDigest === actionDigest &&
      r.intentDigest === intentDigest &&
      r.deliveryManifestDigest === digestV2(d) &&
      r.claimDigest === digestV2(c),
    "V2_RETENTION_BINDING",
  );
  equal(r.objects, refs, "V2_RETENTION_OBJECT_BINDING");
  const k = validateSignedV2(b.acknowledgement, "retention", context);
  ensure(
    k.actionDigest === actionDigest &&
      k.claimId === c.claimId &&
      k.packageManifestDigest === digestV2(r) &&
      k.custodyIdentity === expected.policy.retentionIdentity &&
      Date.parse(k.retainUntil) >= Date.parse(r.retainUntil),
    "V2_RETENTION_ACK_BINDING",
  );
  ensure(
    Date.parse(d.createdAt) <= Date.parse(c.claimedAt) &&
      Date.parse(c.claimedAt) <= Date.parse(r.createdAt) &&
      Date.parse(r.createdAt) <= Date.parse(k.retainedAt) &&
      Date.parse(k.retainedAt) <= context.now &&
      Date.parse(r.retainUntil) >= Date.parse(a.governance.expiresAt),
    "V2_RETENTION_ORDER_INVALID",
  );
  const required = [
    "github",
    "history",
    "creation",
    "exclusions",
    ...(Object.hasOwn(PHASES, i.capability.kind) ||
    i.capability.kind === "PREPARE_INITIAL_NONBILLING_184"
      ? ["configuration", "backup", "recovery"]
      : []),
  ];
  ensure(
    required.every((type) => refs.some((r) => r.type === type)),
    "V2_REQUIRED_EVIDENCE_MISSING",
  );
  const boundEvidence = (hashes, type) =>
    hashes.every((d) =>
      refs.some(
        (r) =>
          (!type || r.type === type) &&
          (r.rawSha256 === d || r.semanticSha256 === d),
      ),
    );
  for (const g of [a.governance, t?.governance, baseline?.governance].filter(
    Boolean,
  )) {
    ensure(
      boundEvidence(g.provenanceEvidenceSha256, "creation") &&
        boundEvidence(g.historicalEvidenceSha256, "history") &&
        boundEvidence(g.founder.authenticationEvidenceSha256, "github"),
      "V2_GOVERNANCE_EVIDENCE_MISSING",
    );
  }
  if (baseline)
    ensure(
      boundEvidence(baseline.creation.provenanceEvidenceSha256, "creation") &&
        boundEvidence(
          baseline.creation.history.operatorAuthenticationEvidenceSha256,
          "github",
        ),
      "V2_HISTORY_EVIDENCE_MISSING",
    );
  if (baseline?.creation.history.mode === "retrospective_non_modification") {
    const h = baseline.creation.history;
    ensure(
      boundEvidence(h.historicalAccess.evidenceSha256, "history") &&
        h.historicalAccess.actors.every((actor) =>
          boundEvidence(actor.evidenceSha256, "history"),
        ) &&
        h.knownConfigurationChanges.every(
          (change) =>
            boundEvidence(change.evidenceSha256, "configuration") &&
            boundEvidence(change.authorizationEvidenceSha256),
        ),
      "V2_HISTORY_EVIDENCE_MISSING",
    );
  }
  if (u.configuration)
    ensure(
      boundEvidence([u.configuration.evidenceSha256], "configuration") &&
        boundEvidence(
          [u.backup.evidenceSha256, u.backup.restore.evidenceSha256],
          "backup",
        ) &&
        boundEvidence([u.webhookHistory.review.evidenceSha256], "history") &&
        boundEvidence([u.operational.quiescenceEvidenceSha256], "exclusions") &&
        boundEvidence(
          [u.operational.providerRequestAuditEvidenceSha256],
          "configuration",
        ) &&
        boundEvidence([u.syntheticClassification.evidenceSha256], "history") &&
        (!u.recovery || boundEvidence([u.recovery.digest], "recovery")),
      "V2_INNER_EVIDENCE_MISSING",
    );
  if (releasePhases.includes(i.capability.kind)) {
    const inventoryDigest = u.inventoryDigest ?? u.inventory.digest;
    const observedAt = u.inventoryObservedAt ?? u.inventory.observedAt;
    ensure(
      records.some((e) => {
        if (e.reference.type !== "observation") return false;
        const observed = parseSignedJson(e.json);
        const begin = Date.parse(observedAt),
          end = Date.parse(observed.stability?.completedAt);
        return (
          observed.digest === inventoryDigest &&
          (i.capability.kind !== "EMPTY_TO_180" ||
            observed.baselineEvidenceSha256 === digestV2(baseline)) &&
          observed.observedAt === observedAt &&
          observed.stability?.startedAt === observedAt &&
          observed.stability?.stable === true &&
          end >= begin &&
          end - begin <= V2_LIMITS.observationMs &&
          end <= Date.parse(u.createdAt)
        );
      }),
      "V2_INVENTORY_EVIDENCE_MISSING",
    );
  }
  // No provided database/claim/status/custody record is promoted to live authority.
  return Object.freeze({
    operational: false,
    status: "CONTRACT_GRAPH_VALID",
    executionEligible: false,
    actionDigest,
    intentDigest,
    claimId: c.claimId,
    retentionAckDigest: digestV2(k),
    externalRequirements: Object.freeze([
      "AUTHENTICATED_GITHUB",
      "CURRENT_EPOCH_AND_REVOCATION",
      "DURABLE_UNIQUE_CLAIM",
      "TARGET_OWNERSHIP",
      "INDEPENDENT_RETENTION",
      "LIVE_TECHNICAL_GATES",
    ]),
  });
}

const terminal = [
  "SUCCEEDED",
  "FAILED",
  "REVOKED",
  "OUTCOME_UNKNOWN",
  "BLOCKED_RETENTION",
];
function zeroDispatch(s) {
  return (
    s.dispatchCount === 0 &&
    s.credentialAccessCount === 0 &&
    s.executorFenced &&
    s.processTerminated
  );
}
export function validateLifecycleStateV2(raw) {
  // credentialAccessCount counts protected target credentials. Authentication
  // to the replay ledger / retention custodian is a separate external boundary.
  const s = parse(lifecycleStateSchema, raw, "V2_STATE_INVALID");
  ensure(s.consumed === (s.state !== "VALIDATED"), "V2_CONSUMPTION_INVALID");
  if (s.state === "VALIDATED")
    ensure(
      s.targetOwnership === "NONE" &&
        s.dispatchCount === 0 &&
        s.credentialAccessCount === 0 &&
        s.retentionAckDigest === null,
      "V2_STATE_OWNERSHIP_INVALID",
    );
  if (["CLAIMED_PENDING_RETENTION", "RETENTION_CONFIRMED"].includes(s.state))
    ensure(
      ["RESERVED", "INSPECTION"].includes(s.targetOwnership) &&
        s.dispatchCount === 0 &&
        s.credentialAccessCount === 0,
      "V2_PREDISPATCH_REQUIRED",
    );
  if (s.state === "CLAIMED_PENDING_RETENTION")
    ensure(s.retentionAckDigest === null, "V2_RETENTION_STATE_INVALID");
  if (["RETENTION_CONFIRMED", "RUNNING", "SUCCEEDED"].includes(s.state))
    ensure(s.retentionAckDigest !== null, "V2_RETENTION_REQUIRED");
  if (s.state === "RUNNING")
    ensure(
      ["OWNED", "INSPECTION"].includes(s.targetOwnership) &&
        !s.executorFenced &&
        !s.processTerminated,
      "V2_STATE_OWNERSHIP_INVALID",
    );
  if (s.state === "SUCCEEDED")
    ensure(
      s.targetOwnership === "NONE" &&
        s.executorFenced &&
        s.processTerminated &&
        s.terminalEvidenceRetained,
      "V2_SUCCESS_RELEASE_INVALID",
    );
  if (["FAILED", "REVOKED", "BLOCKED_RETENTION"].includes(s.state))
    ensure(
      s.targetOwnership === "QUARANTINED" ||
        (s.targetOwnership === "NONE" && zeroDispatch(s)),
      "V2_UNSAFE_TARGET_RELEASE",
    );
  if (s.state === "BLOCKED_RETENTION")
    ensure(
      s.dispatchCount === 0 && s.credentialAccessCount === 0,
      "V2_PREDISPATCH_REQUIRED",
    );
  if (s.state === "OUTCOME_UNKNOWN")
    ensure(s.targetOwnership === "QUARANTINED", "V2_UNSAFE_TARGET_RELEASE");
  if (s.dispatchCount > 0 || s.credentialAccessCount > 0)
    ensure(s.retentionAckDigest !== null, "V2_RETENTION_REQUIRED");
  return s;
}
export function validateTransitionV2(before, after, graph, context) {
  const a = validateLifecycleStateV2(before),
    b = validateLifecycleStateV2(after);
  ensure(!terminal.includes(a.state), "V2_TERMINAL_IMMUTABLE");
  const edges = {
    VALIDATED: ["CLAIMED_PENDING_RETENTION"],
    CLAIMED_PENDING_RETENTION: [
      "RETENTION_CONFIRMED",
      "BLOCKED_RETENTION",
      "REVOKED",
      "FAILED",
      "OUTCOME_UNKNOWN",
    ],
    RETENTION_CONFIRMED: ["RUNNING", "REVOKED", "FAILED", "OUTCOME_UNKNOWN"],
    RUNNING: ["SUCCEEDED", "FAILED", "REVOKED", "OUTCOME_UNKNOWN"],
  };
  ensure(edges[a.state].includes(b.state), "V2_TRANSITION_INVALID");
  ensure(
    a.actionDigest === b.actionDigest &&
      a.claimId === b.claimId &&
      a.epoch === b.epoch &&
      (!a.consumed || b.consumed) &&
      b.dispatchCount >= a.dispatchCount &&
      b.credentialAccessCount >= a.credentialAccessCount &&
      Date.parse(b.updatedAt) >= Date.parse(a.updatedAt) &&
      (!a.retentionAckDigest || a.retentionAckDigest === b.retentionAckDigest),
    "V2_STATE_BINDING",
  );
  // Terminal incident records cannot authorize protected activity before the
  // retained RUNNING transition. Quarantine does not grant execution authority.
  ensure(
    a.state === "RUNNING" ||
      b.state === "RUNNING" ||
      (b.dispatchCount === a.dispatchCount &&
        b.credentialAccessCount === a.credentialAccessCount),
    "V2_PREDISPATCH_REQUIRED",
  );
  if (["RETENTION_CONFIRMED", "RUNNING"].includes(b.state)) {
    ensure(graph && context, "V2_RETENTION_REQUIRED");
    const proof = validateReferenceGraphV2(graph, context);
    ensure(
      proof.actionDigest === b.actionDigest &&
        proof.claimId === b.claimId &&
        graph.intent.epoch === b.epoch &&
        proof.retentionAckDigest === b.retentionAckDigest &&
        Date.parse(graph.acknowledgement.retainedAt) <=
          Date.parse(b.updatedAt) &&
        Date.parse(b.updatedAt) <= context.now,
      "V2_STATE_RETENTION_BINDING",
    );
    ensure(
      b.targetOwnership ===
        (graph.intent.capability.kind === "RECOVERY_INSPECT"
          ? "INSPECTION"
          : b.state === "RUNNING"
            ? "OWNED"
            : "RESERVED"),
      "V2_STATE_OWNERSHIP_INVALID",
    );
  }
  return Object.freeze({
    operational: false,
    status: "CONTRACT_TRANSITION_VALID",
    consumed: b.consumed,
    targetOwnership: b.targetOwnership,
  });
}
export function validateEpochReplacementV2(raw, expected) {
  const e = parse(epochReplacementSchema, raw, "V2_EPOCH_REPLACEMENT_INVALID");
  equal(e, expected, "V2_EPOCH_REPLACEMENT_BINDING");
  ensure(e.oldEpoch !== e.newEpoch, "V2_EPOCH_REUSE_DENIED");
  return {
    operational: false,
    status: "EPOCH_REPLACEMENT_REQUIRES_EXTERNAL_ACTIVATION",
    oldApprovalsReusable: false,
    quarantinesReleased: false,
  };
}
export function validateLiveStatusV2(raw, finalizedAction, claim, now) {
  const s = parse(liveStatusSchema, raw, "V2_LIVE_STATUS_INVALID");
  const action = parse(
    founderActionV2Schema,
    finalizedAction,
    "V2_DOCUMENT_INVALID",
  );
  const consumed = parse(claimRecordSchema, claim, "V2_CLAIM_INVALID");
  ensure(
    s.actionDigest === digestV2(action) &&
      consumed.actionDigest === s.actionDigest &&
      s.claimId === consumed.claimId &&
      consumed.epoch === s.epoch &&
      consumed.policyDigest === s.policyDigest &&
      s.epoch === action.governance.epoch &&
      s.policyDigest === action.governance.policyDigest &&
      Date.parse(s.observedAt) <= now &&
      now - Date.parse(s.observedAt) <= V2_LIMITS.freshnessMs &&
      !s.revoked &&
      !terminal.includes(s.state),
    "V2_LIVE_STATUS_REJECTED",
  );
  return {
    operational: false,
    authenticated: false,
    status: "LIVE_STATUS_BINDING_ONLY",
  };
}
export function validateExecutionReceiptV2(raw, graph, context) {
  const r = parse(
      executionReceiptV1Schema,
      raw,
      "V2_EXECUTION_RECEIPT_INVALID",
    ),
    proof = validateReferenceGraphV2(graph, context);
  ensure(
    r.epoch === graph.intent.epoch &&
      r.actionDigest === proof.actionDigest &&
      r.claimId === proof.claimId &&
      r.retentionAckDigest === proof.retentionAckDigest &&
      r.executorBuildDigest === graph.intent.source.executorBuildDigest &&
      Date.parse(graph.acknowledgement.retainedAt) <= Date.parse(r.startedAt) &&
      Date.parse(r.startedAt) <= Date.parse(r.completedAt) &&
      Date.parse(r.completedAt) <= context.now,
    "V2_EXECUTION_RECEIPT_BINDING",
  );
  return {
    operational: false,
    authenticated: false,
    status: "EXECUTION_RECEIPT_BINDING_ONLY",
  };
}

// Dispatch is inspection only. Legacy schemas/validators are neither modified nor
// used to reinterpret a V2 document. No operational caller imports this module.
export function parseVersionedFounderDocument(raw, kind) {
  const value =
    typeof raw === "string" || raw instanceof Uint8Array
      ? parseSignedJson(raw)
      : raw;
  assertJson(value);
  const legacy = {
    policy: founderPolicySchema,
    governance: founderGovernanceSchema,
    action: founderActionSchema,
    baseline: founderBaselineSchema,
    receipt: founderTimingReceiptSchema,
    timing: founderTimingAdmissionSchema,
  };
  const current = {
    policy: policyV2Schema,
    governance: governanceV2Schema,
    action: founderActionV2Schema,
    baseline: founderBaselineV4Schema,
    receipt: timingReceiptV4Schema,
    timing: timingAdmissionV4Schema,
    delivery: deliveryManifestV3Schema,
    claim: claimRecordSchema,
    retention: retentionManifestV1Schema,
    acknowledgement: retentionAcknowledgementV1Schema,
    execution: executionReceiptV1Schema,
  };
  const mode = value?.mode ?? value?.governance?.mode;
  const schemas =
    mode === FOUNDER_MODE || (kind === "receipt" && value?.schemaVersion === 3)
      ? legacy
      : mode === CONTROL_PLANE_MODE ||
          (kind === "baseline" && value?.schemaVersion === 4) ||
          (kind === "receipt" && value?.schemaVersion === 4) ||
          (kind === "timing" && value?.schemaVersion === 4)
        ? current
        : null;
  ensure(
    schemas && Object.hasOwn(schemas, kind),
    "V2_VERSION_MODE_UNSUPPORTED",
  );
  return {
    operational: false,
    document: parse(schemas[kind], value, "V2_VERSION_MODE_UNSUPPORTED"),
  };
}
