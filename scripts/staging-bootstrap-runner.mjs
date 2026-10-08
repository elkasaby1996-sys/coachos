import { createTimingAdmission } from "./staging-timing-admission.mjs";
import { ensure, releaseIdentity } from "./staging-release-artifacts.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";
import { validateDryRun } from "./billing-retirement-release.mjs";
import { assertObservationFresh } from "./staging-release-observation.mjs";
import { assertEmptySnapshot } from "./staging-bootstrap-observation.mjs";
import { replacementPolicy } from "./staging-replacement-target.mjs";
import {
  BOOTSTRAP_PHASE,
  bootstrapArtifact,
  disposableBootstrap,
  verifyBootstrapDirectory,
} from "./staging-bootstrap-artifacts.mjs";
import {
  validateBootstrapAuthorization,
  verifyBootstrapCheckpoint,
} from "./staging-bootstrap-contracts.mjs";

export async function runBootstrap(
  {
    mode = "plan",
    phase = BOOTSTRAP_PHASE,
    identity,
    context,
    contracts,
    authorization,
    baseline,
    timingAdmission,
    workflowStartedAt,
    root = process.cwd(),
  },
  adapter,
  dependencies = {},
) {
  ensure(
    phase === BOOTSTRAP_PHASE && ["plan", "preflight", "apply"].includes(mode),
    "BOOTSTRAP_ARGUMENTS_INVALID",
  );
  const artifact = bootstrapArtifact(identity, phase);
  if (mode === "plan")
    return {
      phase,
      status: "plan",
      start: 0,
      target: 180,
      artifactDigest: artifact.digest,
      configuration: "replacement_registry_required",
      remoteExecuted: false,
    };
  const now = dependencies.now ?? Date.now,
    policy = dependencies.policy ?? replacementPolicy;
  const currentIdentity =
    dependencies.currentIdentity ?? (() => releaseIdentity(root));
  const currentContext = dependencies.currentContext ?? (() => context);
  let attempted = false,
    stage = "authorization",
    inventoryStarted = false,
    observation,
    directory,
    timing;
  const authorize = () => {
    ensure(
      evidenceDigest(currentIdentity()) === evidenceDigest(identity),
      "BOOTSTRAP_SOURCE_DRIFT",
    );
    ensure(
      evidenceDigest(currentContext()) === evidenceDigest(context),
      "BOOTSTRAP_CONTEXT_DRIFT",
    );
    const a = validateBootstrapAuthorization(
      authorization,
      identity,
      currentContext(),
      policy(),
      contracts,
      now(),
      baseline,
      (
        dependencies.baselineReviewPolicy ?? dependencies.timingReviewPolicy
      )?.(),
    );
    timing ??= createTimingAdmission(
      {
        phase,
        authorization,
        identity,
        context,
        contracts,
        admission: timingAdmission,
        workflowStartedAt,
      },
      { now, policy, reviewPolicy: dependencies.timingReviewPolicy },
    );
    timing.check();
    return a;
  };
  const gate = async () => {
    authorize();
    inventoryStarted = true;
    const fresh = await adapter.observeEmpty();
    authorize();
    assertObservationFresh(fresh, now());
    assertEmptySnapshot(fresh, baseline);
    timing.observation(fresh, "empty");
    ensure(
      fresh.digest === authorization.inventoryDigest &&
        (!observation || fresh.digest === observation.digest),
      "BOOTSTRAP_INVENTORY_DRIFT",
    );
    observation = fresh;
  };
  try {
    await gate();
    if (mode === "preflight")
      return {
        phase,
        status: "preflight_pass",
        remoteExecuted: false,
        inventoryDigest: observation.digest,
      };
    directory = (dependencies.disposableBootstrap ?? disposableBootstrap)(
      root,
      identity,
    );
    stage = "dry_run";
    adapter.command(
      ["link", "--project-ref", context.project],
      directory.directory,
    );
    verifyBootstrapDirectory(directory.directory, artifact);
    const output = adapter.command(
      ["db", "push", "--linked", "--dry-run"],
      directory.directory,
    );
    validateDryRun(
      output,
      artifact.migrations.map((m) => m.filename),
    );
    stage = "closing_observation";
    await gate();
    verifyBootstrapDirectory(directory.directory, artifact);
    authorize();
    assertObservationFresh(observation, now());
    stage = "bootstrap";
    attempted = true;
    const mutationStarted = now();
    adapter.command(["db", "push", "--linked", "--yes"], directory.directory);
    timing.operation("mutation", mutationStarted);
    stage = "checkpoint_180";
    authorize();
    const after = await adapter.observeRelease();
    authorize();
    assertObservationFresh(after, now());
    timing.observation(after);
    ensure(
      after.secretDigest === observation.secretDigest &&
        after.authDigest === observation.authDigest,
      "BOOTSTRAP_CONFIGURATION_DRIFT",
    );
    const checkpoint = verifyBootstrapCheckpoint(
      after,
      identity,
      contracts,
      baseline,
    );
    // Post-push success must still have the same reviewed source, context,
    // registry, artifact and live authority. Check freshness LAST.
    verifyBootstrapDirectory(directory.directory, artifact);
    authorize();
    assertObservationFresh(after, now());
    return {
      phase,
      status: "complete",
      remoteExecuted: true,
      executionCommit: context.commit,
      artifactDigest: artifact.digest,
      timingAdmissionDigest: evidenceDigest(timingAdmission),
      checkpoint,
      commercialCertification: "not_run",
    };
  } catch (error) {
    let ledgerCount = null;
    if (inventoryStarted) {
      try {
        ledgerCount = await adapter.ledgerCount();
      } catch {
        /* indeterminate remains blocked */
      }
    }
    return {
      phase,
      status: "blocked",
      remoteExecuted: attempted,
      failedStep: stage,
      ledgerCount,
      errorCode: /^[A-Z_]+$/.test(error.message ?? "")
        ? error.message
        : "BOOTSTRAP_FAILED",
      recovery: "STOP_FRESH_REVIEW_REQUIRED",
      automaticResume: false,
      newAuthorizationRequired: true,
      timingAdmissionDigest: evidenceDigest(timingAdmission ?? null),
    };
  } finally {
    directory?.cleanup();
  }
}
