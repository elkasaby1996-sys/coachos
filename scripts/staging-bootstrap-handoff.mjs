// Read-only planning checks. No synthetic authorization or remote configuration.
import { ensure } from "./staging-release-artifacts.mjs";
import { PHASES } from "./staging-release-contracts.mjs";
import {
  FUNCTION_CONTRACTS,
  CONFIGURATION_CLASSES,
} from "./billing-deployment-contract.mjs";

export function initialHandoff(observation, identity) {
  const missingConfiguration = [
    ...CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter(
      (n) => !n.startsWith("VITE_"),
    ),
    ...CONFIGURATION_CLASSES.SHARED_REQUIRED.filter(
      (n) => !["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"].includes(n),
    ),
  ].filter((n) => !observation.secretNames.includes(n));
  const requiredNonbilling = FUNCTION_CONTRACTS.filter(
    (f) => f.classification === "NON_BILLING",
  );
  const missingNonbilling = requiredNonbilling
    .filter((f) => {
      const actual = observation.functions.find((a) => a.name === f.name),
        expected = identity.functions.find((a) => a.name === f.name);
      return (
        !actual ||
        actual.status !== "ACTIVE" ||
        actual.verify_jwt !== f.verifyJwt ||
        observation.artifacts?.[f.name] !== expected?.digest
      );
    })
    .map((f) => f.name);
  return {
    missingConfiguration,
    missingNonbilling,
    baselineRequires:
      "fresh v3 config/mapping/backup/restore/quiet-window authorization",
    cutoverRequires:
      "both frozen nonbilling artifacts verified before containment",
    frontendClientToken:
      "separate presence and exact-environment attestation required",
    providerIsolation:
      "separate proof required; a new webhook URL is insufficient",
    readyForRelease: false,
  };
}

export function phaseWorkload(phase, outsideFunctions = 0) {
  const plan = PHASES[phase];
  ensure(
    plan && Number.isSafeInteger(outsideFunctions) && outsideFunctions >= 0,
    "TIMING_PHASE_INVALID",
  );
  let observations = 1,
    migrations = 0,
    deployments = 0;
  for (const step of plan.steps) {
    if (["baseline", "retirement", "activation"].includes(step)) {
      migrations++;
      observations += 3;
    } else if (["containment", "billing", "nonbilling"].includes(step)) {
      const count = step === "nonbilling" ? 2 : 14;
      deployments += count;
      observations += 4 * count;
    } else if (
      [
        "drain",
        "retirement_checkpoint",
        "activation_checkpoint",
        "final",
      ].includes(step)
    )
      observations++;
    else throw new Error("TIMING_UNKNOWN_STEP");
  }
  if (plan.steps.includes("final")) observations += 2 * outsideFunctions;
  return { observations, migrations, deployments };
}

export function phaseTimingAssessment({
  phase,
  observationSamplesMs,
  mutationAllowanceMs,
  localValidationAllowanceMs,
  authorizationRemainingMs,
  workflowRemainingMs,
  inventoryRemainingMs,
  configurationRemainingMs,
  recoveryRemainingMs,
  quietWindowRemainingMs,
  outsideFunctions = 0,
}) {
  const workload = phaseWorkload(phase, outsideFunctions);
  ensure(
    Array.isArray(observationSamplesMs) &&
      observationSamplesMs.length >= 3 &&
      observationSamplesMs.every((n) => Number.isFinite(n) && n > 0),
    "TIMING_SAMPLES_REQUIRED",
  );
  for (const value of [
    mutationAllowanceMs,
    localValidationAllowanceMs,
    authorizationRemainingMs,
    workflowRemainingMs,
    inventoryRemainingMs,
    configurationRemainingMs,
    recoveryRemainingMs,
    quietWindowRemainingMs,
  ])
    ensure(Number.isFinite(value) && value > 0, "TIMING_ALLOWANCE_REQUIRED");
  const worstObservationMs = Math.max(...observationSamplesMs);
  const estimatedMs = Math.ceil(
    1.25 *
      (workload.observations * worstObservationMs +
        mutationAllowanceMs +
        localValidationAllowanceMs),
  );
  const budgetMs = Math.min(
    30 * 60_000,
    authorizationRemainingMs,
    45 * 60_000,
    workflowRemainingMs,
    15 * 60_000,
    inventoryRemainingMs,
    configurationRemainingMs,
    recoveryRemainingMs,
    quietWindowRemainingMs,
  );
  return {
    ...workload,
    worstObservationMs,
    estimatedMs,
    budgetMs,
    observationMarginPass: 1.25 * worstObservationMs < 60_000,
    wholePhaseMarginPass: estimatedMs < budgetMs,
    verdict:
      1.25 * worstObservationMs < 60_000 && estimatedMs < budgetMs
        ? "MEASURED_PLAN_FITS"
        : "BLOCK_AND_REVIEW",
    guarantee: false,
  };
}
