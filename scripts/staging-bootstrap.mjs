// Default PLAN is local only. This module never creates an authorization.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ensure, releaseIdentity } from "./staging-release-artifacts.mjs";
import {
  replacementPolicy,
  assertReplacementTarget,
} from "./staging-replacement-target.mjs";
import { gitState, confirmationInputs } from "./staging-commercial-plan.mjs";
import { validateConfirmations } from "./staging-commercial-contracts.mjs";
import { createRemoteAdapter } from "./staging-release-observation.mjs";
import { createBootstrapObserver } from "./staging-bootstrap-observation.mjs";
import { runBootstrap } from "./staging-bootstrap-runner.mjs";
import { BOOTSTRAP_PHASE } from "./staging-bootstrap-artifacts.mjs";
import { assertObservationFresh } from "./staging-release-observation.mjs";
import { evidenceDigest } from "./staging-release-webhook-history.mjs";

export async function runBootstrapCli(
  argv = process.argv.slice(2),
  env = process.env,
) {
  ensure(
    argv.length <= 1 &&
      ["plan", "preflight", "apply"].includes(argv[0] ?? "plan"),
    "BOOTSTRAP_ARGUMENTS_INVALID",
  );
  const mode = argv[0] ?? "plan",
    root = process.cwd(),
    identity = releaseIdentity(root);
  const policy = replacementPolicy(),
    contracts = JSON.parse(
      readFileSync("config/staging-release-checkpoints.json", "utf8"),
    );
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  ensure(
    git(["rev-parse", `${policy.reviewedSource}^{tree}`]) ===
      policy.reviewedTree,
    "BOOTSTRAP_PINNED_TREE_DRIFT",
  );
  ensure(
    git(["merge-base", policy.reviewedSource, "HEAD"]) ===
      policy.reviewedSource ||
      git(["rev-parse", "HEAD^{tree}"]) === policy.reviewedTree,
    "BOOTSTRAP_PINNED_SOURCE_MISSING",
  );
  if (mode === "plan") return runBootstrap({ mode, identity }, null);
  ensure(
    env.GITHUB_ACTIONS === "true" &&
      env.GITHUB_REF === "refs/heads/main" &&
      env.GITHUB_WORKFLOW === "Supabase Staging Empty Bootstrap",
    "BOOTSTRAP_PROTECTED_WORKFLOW_REQUIRED",
  );
  const getContext = () => {
    const state = gitState(root, policy.reviewedSource),
      inputs = confirmationInputs(env);
    validateConfirmations(inputs, state);
    ensure(
      state.commit === env.GITHUB_SHA &&
        git(["merge-base", policy.reviewedSource, "HEAD"]) ===
          policy.reviewedSource,
      "BOOTSTRAP_SOURCE_INVALID",
    );
    assertReplacementTarget(
      inputs.project,
      inputs.origin,
      replacementPolicy(),
      true,
    );
    return { ...inputs, clean: state.clean };
  };
  const context = getContext();
  ensure(
    env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_DB_PASSWORD,
    "BOOTSTRAP_CREDENTIAL_MISSING",
  );
  if (mode === "apply")
    ensure(
      env.ALLOW_REMOTE_SUPABASE === "I_UNDERSTAND_THIS_TOUCHES_REMOTE" &&
        env.SUPABASE_PROJECT_REF === context.project,
      "BOOTSTRAP_MUTATION_AUTHORITY_REQUIRED",
    );
  let authorization, timingAdmission;
  try {
    authorization = JSON.parse(env.STAGING_BOOTSTRAP_AUTHORIZATION);
    timingAdmission = JSON.parse(env.STAGING_TIMING_ADMISSION);
  } catch {
    throw new Error("BOOTSTRAP_AUTHORIZATION_INVALID");
  }
  const empty = createBootstrapObserver(context, env),
    release = createRemoteAdapter(context, env);
  const adapter = {
    observeEmpty: empty.observe,
    async observeRelease() {
      const startedAt = new Date().toISOString();
      const opening = await empty.databaseProof(180);
      const value = await release.observe();
      const closing = await empty.databaseProof(180);
      ensure(
        evidenceDigest(opening) === evidenceDigest(closing),
        "DATABASE_DRIFT",
      );
      value.facts.databaseProof = closing;
      value.observedAt = startedAt;
      value.stability = {
        ...value.stability,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      assertObservationFresh(value);
      return value;
    },
    ledgerCount: empty.ledgerCount,
    command(args, directory) {
      // No functions, arbitrary targets, repair commands or caller-supplied args.
      const allowed = [
        ["link", "--project-ref", context.project],
        ["db", "push", "--linked", "--dry-run"],
        ["db", "push", "--linked", "--yes"],
      ];
      ensure(
        allowed.some((a) => JSON.stringify(a) === JSON.stringify(args)),
        "BOOTSTRAP_COMMAND_DENIED",
      );
      // The runner has just rechecked the source/context and THEN freshness.
      // Do not insert another expensive Git scan after that freshness boundary.
      assertReplacementTarget(
        context.project,
        context.origin,
        replacementPolicy(),
        true,
      );
      return release.command(args, directory);
    },
  };
  return runBootstrap(
    {
      mode,
      phase: BOOTSTRAP_PHASE,
      identity,
      context,
      contracts,
      authorization,
      timingAdmission,
      workflowStartedAt: env.STAGING_WORKFLOW_STARTED_AT,
      root,
    },
    adapter,
    { currentContext: getContext },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await runBootstrapCli();
    console.log(JSON.stringify(result));
    if (result.status === "blocked") process.exitCode = 1;
  } catch (error) {
    console.error(
      /^[A-Z_]+$/.test(error.message ?? "")
        ? error.message
        : "BOOTSTRAP_LOCAL_VALIDATION_FAILED",
    );
    process.exitCode = 1;
  }
}
