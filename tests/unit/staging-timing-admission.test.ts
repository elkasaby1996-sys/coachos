import { describe, it, expect } from "vitest";
import {
  timingFixture,
  timingTestReviewPolicy,
  signTimingFixture,
} from "../helpers/staging-timing-fixture";
import {
  createTimingAdmission,
  timingBinding,
} from "../../scripts/staging-timing-admission.mjs";
import { evidenceDigest } from "../../scripts/staging-release-webhook-history.mjs";
import { timingReviewPolicy } from "../../scripts/staging-timing-evidence.mjs";

const now = Date.parse("2026-10-07T10:00:00Z");
const stamp = (offset = 0) => new Date(now + offset).toISOString();
function fixture(phase = "RETIREMENT_ACTIVATION_184_TO_186") {
  const authorization = {
    expiresAt: stamp(30 * 60_000),
    inventoryObservedAt: stamp(),
    inventory: { observedAt: stamp() },
    configuration: { observedAt: stamp() },
    operational: {
      quietWindowEndsAt: stamp(30 * 60_000),
      retryWindowEndsAt: stamp(30 * 60_000),
    },
    backup: { createdAt: stamp(-60_000), expiresAt: stamp(30 * 60_000) },
  };
  const identity = { outsideFunctions: [], source: "frozen" };
  const context = {
    commit: "a".repeat(40),
    project: "s".repeat(20),
    origin: "https://replacement-staging.example.com",
  };
  const contracts = {},
    policy = { source: "test-only" };
  const input = {
    phase,
    authorization,
    identity,
    context,
    contracts,
    admission: timingFixture(
      phase,
      authorization,
      identity,
      context,
      contracts,
      now,
      policy,
    ),
    workflowStartedAt: stamp(),
  };
  let clock = now;
  const options = {
    now: () => clock,
    policy: () => policy,
    reviewPolicy: timingTestReviewPolicy,
  };
  function resign() {
    for (const s of [
      ...input.admission.samples.empty,
      ...input.admission.samples.release,
    ])
      s.receiptSha256 = evidenceDigest(s.receipt);
    signTimingFixture(input.admission);
  }
  function rebind() {
    input.admission.bindingDigest = evidenceDigest(
      timingBinding(phase, authorization, identity, context, contracts, policy),
    );
    resign();
  }
  return {
    input,
    options,
    resign,
    rebind,
    setClock: (n: number) => {
      clock = n;
    },
    run: () => createTimingAdmission(input, options),
  };
}

describe("independently reviewed timing admission", () => {
  it.each(["EMPTY_TO_180", "RETIREMENT_ACTIVATION_184_TO_186"])(
    "accepts a signed, complete local test control for %s",
    (phase) => {
      expect(fixture(phase).run().check().estimatedRemainingMs).toBeGreaterThan(
        0,
      );
    },
  );
  it("keeps operational trust empty and rejects synthetic test authority", () => {
    const f = fixture();
    expect(timingReviewPolicy().reviewKeys).toEqual([]);
    expect(() =>
      createTimingAdmission(f.input, {
        ...f.options,
        reviewPolicy: timingReviewPolicy,
      }),
    ).toThrow("TIMING_REVIEW_REQUIRED");
  });
  it.each(["signature", "hash", "allowance", "key"])(
    "rejects unsigned alteration of %s",
    (kind) => {
      const f = fixture(),
        a = f.input.admission;
      if (kind === "signature") a.review.signature = "A".repeat(86) + "==";
      if (kind === "hash") a.reviewEvidenceSha256 = "f".repeat(64);
      if (kind === "allowance") a.allowances.mutationMs++;
      if (kind === "key") a.review.keyId = "f".repeat(64);
      expect(f.run).toThrow("TIMING_REVIEW_REQUIRED");
    },
  );
  it("rechecks revocation at later boundaries", () => {
    const f = fixture(),
      gate = f.run();
    f.options.reviewPolicy = () => ({ schemaVersion: 1, reviewKeys: [] });
    expect(gate.check).toThrow("TIMING_REVIEW_REQUIRED");
  });
  it.each(["source", "identity", "target", "origin", "observer"])(
    "rejects rebinding old receipts to another %s even with a new review",
    (kind) => {
      const f = fixture();
      if (kind === "source") f.input.context.commit = "b".repeat(40);
      if (kind === "identity") f.input.identity.source = "changed";
      if (kind === "target") f.input.context.project = "t".repeat(20);
      if (kind === "origin")
        f.input.context.origin = "https://other-staging.example.com";
      if (kind === "observer")
        f.input.admission.samples.release[0].receipt.binding.observerSha256 =
          "b".repeat(64);
      f.rebind();
      expect(f.run).toThrow("TIMING_RECEIPT_BINDING");
    },
  );
  it.each([
    "missing-surface",
    "changed-surface",
    "duplicate-observation",
    "duplicate-id",
    "overlap",
    "stale",
    "receipt-hash",
    "legacy",
  ])("rejects reviewed but invalid evidence: %s", (kind) => {
    const f = fixture(),
      a = f.input.admission,
      samples = a.samples.release,
      r = samples[0].receipt;
    if (kind === "missing-surface") delete r.proof.confirmation.DATABASE_DRIFT;
    if (kind === "changed-surface")
      r.proof.confirmation.DATABASE_DRIFT = "f".repeat(64);
    if (kind === "duplicate-observation")
      r.completeObservationSha256 =
        samples[1].receipt.completeObservationSha256;
    if (kind === "duplicate-id") r.sampleId = samples[1].receipt.sampleId;
    if (kind === "overlap") r.startedAt = samples[1].receipt.startedAt;
    if (kind === "stale") f.setClock(now + 15 * 60_000);
    if (kind === "legacy") a.schemaVersion = 1;
    f.resign();
    if (kind === "receipt-hash") {
      samples[0].receiptSha256 = "f".repeat(64);
      signTimingFixture(a);
    }
    expect(f.run).toThrow(/TIMING_/);
  });
  it.each([42_000, 45_000, 60_000])(
    "blocks complete %i ms samples before work",
    (duration) => {
      const f = fixture();
      f.input.admission.samples.release.forEach((s: any, i: number) => {
        s.receipt.startedAt = stamp(-240_000 + i * 65_000);
        s.receipt.completedAt = stamp(-240_000 + i * 65_000 + duration);
      });
      f.resign();
      expect(f.run).toThrow(/TIMING_/);
    },
  );
  it("reserves the whole terminal 60 seconds and margin", () => {
    const f = fixture("EMPTY_TO_180");
    expect(f.run().check().estimatedRemainingMs).toBeGreaterThan(75_000);
    f.input.admission.expiresAt = stamp(60_000);
    f.resign();
    expect(f.run).toThrow("TIMING_ADMISSION_BLOCKED");
  });
  it("includes backup maximum age even when backup expiry is later", () => {
    const f = fixture();
    expect(f.run().check().estimatedRemainingMs).toBeGreaterThan(60_000);
    f.input.authorization.backup.createdAt = stamp(-24 * 60 * 60_000 + 60_000);
    f.rebind();
    expect(f.run).toThrow("TIMING_ADMISSION_BLOCKED");
  });
});
