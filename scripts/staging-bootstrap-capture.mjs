// Explicit read-only library entry point; imports do not capture or write files.
// Operator evidence is supplied separately. No review, registration or signer.
import { execFileSync } from "node:child_process";
import { ensure, releaseIdentity } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import {
  baselineSchema,
  baselineSourceBinding,
  assertBaselineSnapshot,
  validateBaselineCandidate,
} from "./staging-bootstrap-baseline.mjs";
import {
  createBootstrapCaptureReader,
  CAPTURE_ORGANIZATION,
} from "./staging-bootstrap-observation.mjs";
import {
  replacementPolicy,
  assertReplacementTarget,
} from "./staging-replacement-target.mjs";
import { assertObservationFresh } from "./staging-release-observation.mjs";

function assertExecutionSource(root, identity, context) {
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  ensure(
    git("rev-parse", "HEAD") === context.commit &&
      git("rev-parse", "HEAD^{tree}") === context.tree &&
      git("status", "--porcelain", "--untracked-files=all") === "" &&
      evidenceDigest(releaseIdentity(root)) === evidenceDigest(identity),
    "BOOTSTRAP_CAPTURE_SOURCE_DRIFT",
  );
}

export async function captureBaselineCandidate(
  { identity, context, env, operator, expiresAt, root = process.cwd() },
  dependencies = {},
) {
  const now = dependencies.now ?? Date.now;
  const policy = replacementPolicy();
  const started = now();
  const startedAt = new Date(started).toISOString();
  assertReplacementTarget(context.project, context.origin, policy, true);
  ensure(
    context.organization === CAPTURE_ORGANIZATION &&
      /^[a-f0-9]{40}$/.test(context.commit) &&
      /^[a-f0-9]{40}$/.test(context.tree),
    "BOOTSTRAP_CAPTURE_TARGET_BINDING",
  );
  const creation = baselineSchema.shape.creation.safeParse(operator);
  // Incomplete assertions are never filled in by the collector. Reject before
  // requesting credentials, invoking transport or collecting private evidence.
  if (
    !creation.success ||
    !baselineSchema.shape.capture.shape.expiresAt.safeParse(expiresAt).success
  )
    return { status: "EVIDENCE_INCOMPLETE", operational: false };
  const c = creation.data;
  const expiry = Date.parse(expiresAt);
  ensure(
    Number.isFinite(expiry) &&
      expiry > started &&
      expiry - started <= 30 * 60_000 &&
      Date.parse(c.createdAt) <= Date.parse(c.attestedAt) &&
      Date.parse(c.attestedAt) <= started &&
      Date.parse(c.captureExclusion.establishedAt) >= Date.parse(c.createdAt) &&
      Date.parse(c.captureExclusion.establishedAt) <= started &&
      Date.parse(c.captureExclusion.quietWindowEndsAt) > expiry,
    "BOOTSTRAP_BASELINE_CAPTURE_EXCLUSION_INVALID",
  );
  ensure(
    typeof env?.SUPABASE_ACCESS_TOKEN === "string" &&
      env.SUPABASE_ACCESS_TOKEN.length > 0 &&
      env.STAGING_SUPABASE_PROJECT_REF === context.project,
    "BOOTSTRAP_CAPTURE_CREDENTIAL_BOUNDARY",
  );
  const assertSource = dependencies.assertSource ?? assertExecutionSource;
  const fresh = () => {
    ensure(now() < expiry, "BOOTSTRAP_BASELINE_STALE");
    assertObservationFresh(
      {
        observedAt: startedAt,
        stability: {
          stable: true,
          startedAt,
          completedAt: new Date(now()).toISOString(),
        },
      },
      now(),
    );
  };
  assertSource(root, identity, context);
  const source = baselineSourceBinding(identity, context, policy);
  fresh();
  let proof;
  const reader = createBootstrapCaptureReader(
    context,
    env,
    dependencies.transport ?? fetch,
    {
      createdAt: c.createdAt,
      beforeRead: fresh,
      readTimeout: () =>
        Math.max(1, Math.min(30_000, 60_000 - (now() - started))),
      assertSnapshot: (snapshot) => {
        proof ??= snapshot.facts.databaseProof;
        assertBaselineSnapshot(snapshot, {
          target: {
            project: context.project,
            organization: CAPTURE_ORGANIZATION,
            origin: context.origin,
          },
          creation: c,
          databaseProof: proof,
        });
      },
    },
  );
  const observations = {};
  for (const name of ["opening", "closing", "confirmation"]) {
    observations[name] = await reader.snapshot();
    fresh();
    assertSource(root, identity, context);
    ensure(
      evidenceDigest(source) ===
        evidenceDigest(baselineSourceBinding(identity, context, policy)),
      "BOOTSTRAP_CAPTURE_SOURCE_DRIFT",
    );
    fresh();
  }
  const candidate = {
    schemaVersion: 2,
    classification: "AMBIGUOUS_MANAGED_BASELINE_PINNED",
    target: {
      project: context.project,
      organization: CAPTURE_ORGANIZATION,
      origin: context.origin,
    },
    source,
    creation: c,
    databaseProof: proof,
    capture: {
      startedAt,
      completedAt: new Date(now()).toISOString(),
      expiresAt,
      ...observations,
    },
  };
  validateBaselineCandidate(candidate, identity, context, policy, now());
  // Include local validation in the same clock, then bind the final completion.
  fresh();
  assertSource(root, identity, context);
  ensure(
    evidenceDigest(source) ===
      evidenceDigest(baselineSourceBinding(identity, context, policy)),
    "BOOTSTRAP_CAPTURE_SOURCE_DRIFT",
  );
  fresh();
  candidate.capture.completedAt = new Date(now()).toISOString();
  const result = validateBaselineCandidate(
    candidate,
    identity,
    context,
    policy,
    now(),
  );
  fresh();
  return {
    ...result,
    candidate,
    summary: { observations: 3, databaseReads: 6, operational: false },
  };
}
