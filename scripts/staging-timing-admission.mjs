// Supplemental reviewed admission; never extends v3 authority or freshness.
import { z } from "zod";
import { ensure } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { phaseWorkload } from "./staging-bootstrap-handoff.mjs";
import { replacementPolicy } from "./staging-replacement-target.mjs";
import { LS_TOMBSTONES } from "./billing-deployment-contract.mjs";
import {
  timingReceiptSchema,
  timingReviewSchema,
  validateTimingReceipt,
  assertTimingReview,
  timingReviewPolicy,
  timingSampleBinding,
} from "./staging-timing-evidence.mjs";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sample = z.strictObject({
  receipt: timingReceiptSchema,
  receiptSha256: digest,
});
export const timingAdmissionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  bindingDigest: digest,
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  reviewEvidenceSha256: digest,
  completeObservationsReviewed: z.literal(true),
  review: timingReviewSchema,
  samples: z.strictObject({
    empty: z.array(sample).max(100),
    release: z.array(sample).max(100),
  }),
  allowances: z.strictObject({
    mutationMs: z.number().int().min(1000),
    downloadMs: z.number().int().min(1000),
    probeMs: z.number().int().min(1000),
    localValidationMs: z.number().int().min(1000),
  }),
});
export function timingWorkload(phase, identity) {
  if (phase === "EMPTY_TO_180")
    return {
      observations: 3,
      migrations: 1,
      deployments: 0,
      downloads: 0,
      probes: 0,
      unmeasuredTerminalObservations: 1,
    };
  const work = phaseWorkload(phase, identity.outsideFunctions.length);
  return {
    ...work,
    unmeasuredTerminalObservations: 0,
    downloads:
      work.deployments +
      (work.deployments ? identity.outsideFunctions.length : 0),
    probes: work.deployments ? LS_TOMBSTONES.length * 2 : 0,
  };
}
export function timingBinding(
  phase,
  authorization,
  identity,
  context,
  contracts,
  policy = replacementPolicy(),
) {
  const observer = timingSampleBinding(
    phase === "EMPTY_TO_180" ? "empty" : "release",
    identity,
    context,
  );
  return {
    schemaVersion: 1,
    phase,
    authorizationDigest: evidenceDigest(authorization),
    identityDigest: evidenceDigest(identity),
    context,
    contracts,
    policy,
    // The observer has just read the complete policy. Bind that SAME source
    // snapshot rather than performing a redundant second read in this binding.
    databasePolicyDigest: observer.securityPolicyDigest,
    reviewPolicy: timingReviewPolicy(),
    observer,
    workload: timingWorkload(phase, identity),
    observationLimitMs: 60_000,
    margin: 1.25,
    workflowLimitMs: 45 * 60_000,
  };
}
export function createTimingAdmission(
  {
    phase,
    authorization,
    identity,
    context,
    contracts,
    admission,
    workflowStartedAt,
  },
  options = {},
) {
  const parsed = timingAdmissionSchema.safeParse(admission);
  ensure(parsed.success, "TIMING_ADMISSION_REQUIRED");
  const a = parsed.data,
    workload = timingWorkload(phase, identity);
  let remaining = {
      ...workload,
      mutations: workload.migrations + workload.deployments,
    },
    worst = 0;
  const now = options.now ?? Date.now,
    policy = options.policy ?? replacementPolicy;
  const start = Date.parse(workflowStartedAt);
  ensure(
    Number.isFinite(start) && start <= now(),
    "TIMING_WORKFLOW_CLOCK_REQUIRED",
  );
  const required = phase === "EMPTY_TO_180" ? ["empty"] : ["release"];
  assertTimingReview(a, (options.reviewPolicy ?? timingReviewPolicy)());
  const receipts = new Set(),
    ids = new Set(),
    observations = new Set();
  ensure(
    a.samples[phase === "EMPTY_TO_180" ? "release" : "empty"].length === 0,
    "TIMING_SAMPLES_INVALID",
  );
  let sampleDeadline = Infinity;
  for (const kind of required) {
    ensure(a.samples[kind].length >= 3, "TIMING_SAMPLES_REQUIRED");
    let previousEnd = -Infinity;
    for (const entry of [...a.samples[kind]].sort(
      (x, y) =>
        Date.parse(x.receipt.startedAt) - Date.parse(y.receipt.startedAt),
    )) {
      const s = validateTimingReceipt(
        entry.receipt,
        kind,
        identity,
        context,
        phase === "EMPTY_TO_180" ? authorization.baselineEvidenceSha256 : null,
      );
      ensure(
        entry.receiptSha256 === evidenceDigest(s),
        "TIMING_RECEIPT_DIGEST",
      );
      const begin = Date.parse(s.startedAt),
        end = Date.parse(s.completedAt),
        duration = end - begin;
      ensure(
        duration > 0 &&
          duration < 60_000 &&
          begin >= previousEnd &&
          end <= Date.parse(a.createdAt) &&
          !receipts.has(entry.receiptSha256) &&
          !ids.has(s.sampleId) &&
          !observations.has(s.completeObservationSha256),
        "TIMING_SAMPLES_INVALID",
      );
      receipts.add(entry.receiptSha256);
      ids.add(s.sampleId);
      observations.add(s.completeObservationSha256);
      previousEnd = end;
      worst = Math.max(worst, duration);
      sampleDeadline = Math.min(sampleDeadline, begin + 15 * 60_000);
    }
  }
  const deadlines = [
    Date.parse(a.expiresAt),
    sampleDeadline,
    Date.parse(authorization.expiresAt),
    Date.parse(
      phase === "EMPTY_TO_180"
        ? authorization.inventoryObservedAt
        : authorization.inventory.observedAt,
    ) +
      15 * 60_000,
    start + 45 * 60_000,
    Date.parse(
      phase === "EMPTY_TO_180"
        ? authorization.operational.quietWindowEndsAt
        : authorization.operational.retryWindowEndsAt,
    ),
  ];
  if (phase !== "EMPTY_TO_180")
    deadlines.push(
      Date.parse(authorization.configuration.observedAt) + 15 * 60_000,
      Date.parse(authorization.backup.expiresAt),
      Date.parse(authorization.backup.createdAt) + 24 * 60 * 60_000,
    );
  function check() {
    assertTimingReview(a, (options.reviewPolicy ?? timingReviewPolicy)());
    ensure(
      a.bindingDigest ===
        evidenceDigest(
          timingBinding(
            phase,
            authorization,
            identity,
            context,
            contracts,
            policy(),
          ),
        ),
      "TIMING_ADMISSION_BINDING",
    );
    const current = now(),
      created = Date.parse(a.createdAt);
    ensure(
      created <= current &&
        Date.parse(a.expiresAt) > created &&
        Date.parse(a.expiresAt) - created <= 15 * 60_000 &&
        deadlines.every(Number.isFinite),
      "TIMING_ADMISSION_STALE",
    );
    const estimatedMs = Math.ceil(
      1.25 *
        ((remaining.observations - remaining.unmeasuredTerminalObservations) *
          worst +
          remaining.unmeasuredTerminalObservations * 60_000 +
          remaining.mutations * a.allowances.mutationMs +
          remaining.downloads * a.allowances.downloadMs +
          remaining.probes * a.allowances.probeMs +
          a.allowances.localValidationMs),
    );
    ensure(
      1.25 * worst < 60_000 && current + estimatedMs < Math.min(...deadlines),
      "TIMING_ADMISSION_BLOCKED",
    );
    return {
      estimatedRemainingMs: estimatedMs,
      remainingObservations: remaining.observations,
      guarantee: false,
    };
  }
  check();
  return {
    check,
    observation(observation, kind = "release") {
      const duration =
        Date.parse(observation.stability?.completedAt) -
        Date.parse(observation.stability?.startedAt);
      ensure(
        Number.isFinite(duration) &&
          duration >= 0 &&
          remaining.observations > 0,
        "TIMING_OBSERVATION_INVALID",
      );
      if (phase === "EMPTY_TO_180" && kind === "release") {
        ensure(
          remaining.unmeasuredTerminalObservations === 1 &&
            remaining.observations === 1 &&
            duration <= 60_000,
          "TIMING_OBSERVATION_INVALID",
        );
        remaining.unmeasuredTerminalObservations--;
      } else {
        ensure(
          phase !== "EMPTY_TO_180" ||
            (kind === "empty" &&
              remaining.observations >
                remaining.unmeasuredTerminalObservations),
          "TIMING_OBSERVATION_INVALID",
        );
        worst = Math.max(worst, duration);
      }
      remaining.observations--;
      check();
    },
    operation(kind, startedAt) {
      const key = {
        mutation: "mutations",
        download: "downloads",
        probe: "probes",
      }[kind];
      ensure(
        key &&
          remaining[key] > 0 &&
          now() >= startedAt &&
          now() - startedAt <= a.allowances[kind + "Ms"],
        "TIMING_OPERATION_OVERRUN",
      );
      remaining[key]--;
      check();
    },
  };
}
