// BILL-04C/r2: local repository only, no transport, credential or executor.
// Inject a parameterized PostgreSQL query client. No connection URL is accepted.
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CONTROL_PLANE_MODE,
  V2_LIMITS,
  claimRecordSchema,
  digestV2,
  operationSlotV2,
  validateIntentV2,
  validateSignedV2,
  validateReferenceGraphV2,
  validateLifecycleStateV2,
} from "../../scripts/staging-founder-authorization-v2.mjs";

const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const authoritySchema = z.strictObject({
  kind: z.literal("SYNTHETIC_LOCAL_ONLY"),
  epoch: uuid,
  bootChallenge: digest,
  headDigest: digest,
});
const operationSchema = z.strictObject({
  operationId: uuid,
  actionDigest: digest,
});
const commandSchema = operationSchema.extend({
  sequence: z.number().int().positive(),
  commandDigest: digest,
  artifactDigest: digest,
});
const stopSchema = operationSchema.extend({
  outcome: z.enum([
    "FAILED",
    "REVOKED",
    "OUTCOME_UNKNOWN",
    "BLOCKED_RETENTION",
  ]),
});
const claimRequest = z.strictObject({
  intent: z.unknown(),
  action: z.unknown(),
  claimId: uuid,
  permitId: uuid,
});
const advanceRequest = z.strictObject({
  graph: z.unknown(),
  context: z.unknown(),
  permitId: uuid,
  nextState: z.enum(["RETENTION_CONFIRMED", "RUNNING"]),
});
const parse = (schema, value, code = "LEDGER_REQUEST_INVALID") => {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(code);
  return result.data;
};
const statements = Object.freeze({
  claim: "SELECT ledger_api.claim($1::jsonb) AS result",
  advance: "SELECT ledger_api.advance($1::jsonb) AS result",
  reserve: "SELECT ledger_api.reserve_command($1::jsonb) AS result",
  stop: "SELECT ledger_api.stop($1::jsonb) AS result",
  status:
    "SELECT ledger_api.status(($1::jsonb->>'operationId')::uuid, $1::jsonb->>'actionDigest') AS result",
  disarm: "SELECT ledger_api.disarm() AS result",
});
const ensure = (ok, code) => {
  if (!ok) throw new Error(code);
};

// This creates a binding, NOT approval. Authenticated admission and external
// epoch verification do not exist here. SQL additionally requires an owner-only
// exact synthetic permit. No caller-supplied boolean is an authority primitive.
export function claimBindingV2(intent, action, claimId, context) {
  parse(uuid, claimId);
  const i = validateIntentV2(intent, context);
  const a = validateSignedV2(action, "action", { ...context, intent: i });
  ensure(a.intentDigest === digestV2(i), "LEDGER_ACTION_INTENT_MISMATCH");
  const target = {
    project: i.scope.project,
    organization: i.scope.organization,
    origin: i.scope.origin,
  };
  // Same project cannot acquire a second lock by varying origin/run/epoch/key.
  const targetKey = digestV2({
    project: target.project,
    organization: target.organization,
  });
  const workflowMs =
    i.capability.kind === "STATUS"
      ? V2_LIMITS.freshnessMs
      : ["BACKUP_180", "BACKUP_184"].includes(i.capability.kind)
        ? V2_LIMITS.authorizationMs
        : V2_LIMITS.workflowMs;
  return Object.freeze({
    claimId,
    nonce: a.nonce,
    actionDigest: digestV2(a),
    intentDigest: digestV2(i),
    epoch: i.epoch,
    policyDigest: i.policyDigest,
    target,
    targetKey,
    slot: operationSlotV2(i),
    capability: i.capability.kind,
    blockedOperationId:
      i.capability.kind === "RECOVERY_INSPECT"
        ? i.capability.blockedOperationId
        : null,
    blockedActionDigest:
      i.capability.kind === "RECOVERY_INSPECT"
        ? i.capability.blockedActionDigest
        : null,
    runCreatedAt: i.workflow.runCreatedAt,
    notBefore: a.governance.createdAt,
    // Full technical/evidence deadlines belong to future authenticated admission.
    // The owner-only permit may tighten this deadline, never extend it.
    expiresAt: new Date(
      Math.min(
        Date.parse(a.governance.expiresAt),
        Date.parse(i.workflow.jobStartedAt) + workflowMs,
      ),
    ).toISOString(),
  });
}

export function verifyAuditChain(events) {
  ensure(Array.isArray(events) && events.length > 0, "LEDGER_AUDIT_INVALID");
  let previous = "0".repeat(64);
  let operation;
  events.forEach((event, index) => {
    const body = JSON.parse(event.payloadText);
    operation ??= body.operationId;
    ensure(
      event.sequence === index + 1 &&
        body.sequence === index + 1 &&
        body.operationId === operation &&
        event.previousHash === previous,
      "LEDGER_AUDIT_INVALID",
    );
    const actual = createHash("sha256")
      .update(
        `repsync-control-plane-audit/v1\n${previous}\n${event.payloadText}`,
      )
      .digest("hex");
    ensure(actual === event.eventHash, "LEDGER_AUDIT_INVALID");
    previous = actual;
  });
  return Object.freeze({
    operational: false,
    independentRetention: false,
    eventCount: events.length,
    headDigest: previous,
  });
}

export function createReplayLedger({ query, syntheticAuthority }) {
  ensure(
    typeof query === "function" && typeof syntheticAuthority === "function",
    "LEDGER_AUTHORITY_UNAVAILABLE",
  );
  async function call(name, request, needsAuthority = true) {
    try {
      const authority = needsAuthority
        ? parse(
            authoritySchema,
            await syntheticAuthority(),
            "LEDGER_AUTHORITY_UNAVAILABLE",
          )
        : undefined;
      const { rows } = await query(
        statements[name],
        name === "disarm"
          ? []
          : [
              JSON.stringify({
                ...request,
                ...(authority ? { authority } : {}),
              }),
            ],
      );
      const value = rows?.[0]?.result;
      if (name === "disarm")
        return Object.freeze({
          operational: false,
          executionEligible: false,
          state: "DISARMED",
        });
      ensure(
        value &&
          value.operational === false &&
          value.executionEligible === false,
        "LEDGER_RESULT_INVALID",
      );
      return Object.freeze(value);
    } catch (error) {
      // Never expose SQL, connection strings, PostgreSQL details or private data.
      const code = /^LEDGER_[A-Z_]+$/.test(error?.message ?? "")
        ? error.message
        : "LEDGER_DATABASE_REJECTED";
      throw new Error(code);
    }
  }
  return Object.freeze({
    operational: false,
    executionEligible: false,
    async claim(request, context) {
      const { intent, action, claimId, permitId } = parse(
        claimRequest,
        request,
      );
      const binding = claimBindingV2(intent, action, claimId, context);
      const result = await call("claim", { permitId, binding });
      claimRecordSchema.parse({
        schemaVersion: 1,
        mode: CONTROL_PLANE_MODE,
        epoch: binding.epoch,
        policyDigest: binding.policyDigest,
        claimId,
        actionDigest: binding.actionDigest,
        intentDigest: binding.intentDigest,
        nonce: binding.nonce,
        slot: binding.slot,
        consumed: true,
        state: result.state,
        targetOwnership: result.targetOwnership,
        claimedAt: new Date(result.claimedAt).toISOString(),
      });
      return result;
    },
    async advance(request) {
      const { graph, context, permitId, nextState } = parse(
        advanceRequest,
        request,
      );
      const proof = validateReferenceGraphV2(graph, context);
      const stored = await call(
        "status",
        { operationId: proof.claimId, actionDigest: proof.actionDigest },
        false,
      );
      ensure(
        digestV2(stored.claimRecord) === digestV2(graph.claim),
        "LEDGER_RETAINED_CLAIM_MISMATCH",
      );
      validateLifecycleStateV2({
        schemaVersion: 1,
        actionDigest: proof.actionDigest,
        claimId: proof.claimId,
        epoch: graph.intent.epoch,
        state: nextState,
        consumed: true,
        targetOwnership:
          graph.intent.capability.kind === "RECOVERY_INSPECT"
            ? "INSPECTION"
            : nextState === "RUNNING"
              ? "OWNED"
              : "RESERVED",
        dispatchCount: 0,
        credentialAccessCount: 0,
        executorFenced: false,
        processTerminated: false,
        terminalEvidenceRetained: false,
        retentionAckDigest: proof.retentionAckDigest,
        updatedAt: new Date(context.now).toISOString(),
      });
      return call("advance", {
        operationId: proof.claimId,
        actionDigest: proof.actionDigest,
        permitId,
        nextState,
        retentionAckDigest: proof.retentionAckDigest,
        verifiedPackageDigest: digestV2(graph.retention),
        claimDigest: digestV2(graph.claim),
      });
    },
    async reserveCommand(request) {
      return call("reserve", parse(commandSchema, request));
    },
    async stop(request) {
      return call("stop", parse(stopSchema, request), false);
    },
    async status(request) {
      return call("status", parse(operationSchema, request), false);
    },
    disarm() {
      return call("disarm", {}, false);
    },
  });
}
