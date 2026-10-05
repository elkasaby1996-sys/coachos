// Local plan by default. Remote capabilities require the protected main workflow
// and a new strict phase envelope; importing this module never accesses a project.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  releaseIdentity,
  ensure,
  canonical,
} from "./staging-release-artifacts.mjs";
import { phasePlan, PHASES } from "./staging-release-contracts.mjs";
import { runRelease, writeReleaseEvidence } from "./staging-release-runner.mjs";
import { createRemoteAdapter } from "./staging-release-observation.mjs";
import { confirmationInputs, gitState } from "./staging-commercial-plan.mjs";
import { validateConfirmations } from "./staging-commercial-contracts.mjs";
import { hash } from "./billing-retirement-release.mjs";
import { validateRecoveryBundle } from "./staging-release-recovery-evidence.mjs";

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  ensure(argv.length <= 2, "RELEASE_ARGUMENTS_INVALID");
  const [mode = "plan", phase = "BASELINE_180_TO_184"] = argv;
  ensure(
    ["plan", "preflight", "apply"].includes(mode) &&
      Object.hasOwn(PHASES, phase),
    "RELEASE_ARGUMENTS_INVALID",
  );
  const root = process.cwd(),
    identity = releaseIdentity(root);
  const contracts = JSON.parse(
    readFileSync("config/staging-release-checkpoints.json", "utf8"),
  );
  ensure(
    contracts.frozenPayloadCommit === identity.payload.frozenCommit &&
      contracts.manifestDigest === hash(canonical(identity.manifest)),
    "RELEASE_CHECKPOINT_SOURCE_DRIFT",
  );
  if (mode === "plan") {
    const plan = {
      schemaVersion: 2,
      status: "plan",
      phase,
      plan: phasePlan(phase, identity),
      payloadDigest: identity.payload.digest,
      checkpointContractDigest: hash(canonical(contracts)),
      remoteExecuted: false,
      commercialCertification: "not_run",
    };
    writeReleaseEvidence(plan);
    return plan;
  }
  ensure(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.GITHUB_WORKFLOW === "Supabase Staging Commercial Certification",
    "PROTECTED_STAGING_RELEASE_REQUIRED",
  );
  const getContext = () => {
    const inputs = confirmationInputs(env),
      state = gitState(root, identity.manifest.requiredBaseCommit);
    validateConfirmations(inputs, state);
    ensure(env.GITHUB_SHA === state.commit, "RELEASE_SOURCE_INVALID");
    return { ...inputs, clean: state.clean };
  };
  const context = getContext();
  ensure(
    env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_DB_PASSWORD,
    "RELEASE_RUNNER_SECRET_MISSING",
  );
  if (mode === "apply")
    ensure(
      env.ALLOW_REMOTE_SUPABASE === "I_UNDERSTAND_THIS_TOUCHES_REMOTE" &&
        env.SUPABASE_PROJECT_REF === context.project,
      "RELEASE_MUTATION_AUTHORITY_REQUIRED",
    );
  let authorization;
  try {
    authorization = JSON.parse(env.STAGING_RELEASE_AUTHORIZATION);
  } catch {
    throw new Error("RELEASE_AUTHORIZATION_INVALID");
  }
  let recoveryBundle;
  try {
    recoveryBundle = JSON.parse(env.STAGING_RELEASE_RECOVERY_BUNDLE);
  } catch {
    throw new Error("RELEASE_RECOVERY_BUNDLE_MISSING");
  }
  validateRecoveryBundle(recoveryBundle, authorization);
  const report = await runRelease(
    { phase, mode, authorization, context, identity, contracts, root },
    createRemoteAdapter(
      context,
      env,
      fetch,
      authorization.webhookHistory?.review,
    ),
    { currentContext: getContext, emit: writeReleaseEvidence },
  );
  writeReleaseEvidence(report);
  return report;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const report = await runCli();
    console.log(
      JSON.stringify({
        status: report.status,
        phase: report.phase,
        ledgerCount: report.ledgerCount ?? null,
        commercialCertification: "not_run",
        errorCode: report.recovery?.errorCode ?? null,
      }),
    );
    if (report.status === "blocked") process.exitCode = 1;
  } catch (error) {
    console.error(
      /^[A-Z_]+$/.test(error.message ?? "")
        ? error.message
        : "RELEASE_LOCAL_VALIDATION_FAILED",
    );
    process.exitCode = 1;
  }
}
