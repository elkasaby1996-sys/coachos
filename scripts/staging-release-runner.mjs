import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ensure,
  canonical,
  releaseIdentity,
  disposableArtifact,
  verifyMigrationDirectory,
  verifyFunctionDirectory,
  verifyDeploymentConfiguration,
} from "./staging-release-artifacts.mjs";
import {
  phasePlan,
  validateAuthorization,
  exactLedger,
  assertPolicy,
  assertHistory,
  assertDrain,
  assertScheduled,
  verifyDatabase,
  verifyFunctions,
  assertApprovedFunctionInventory,
} from "./staging-release-contracts.mjs";
import { hash, validateDryRun } from "./billing-retirement-release.mjs";
import {
  FUNCTION_CONTRACTS,
  LS_TOMBSTONES,
  CONFIGURATION_CLASSES,
} from "./billing-deployment-contract.mjs";
import { assertObservationFresh } from "./staging-release-observation.mjs";

export function assertConfiguration(observation, authorization) {
  const c = authorization.configuration;
  ensure(
    observation.secretDigest === c.secretInventorySha256 &&
      observation.authDigest === c.authConfigurationSha256,
    "RELEASE_CONFIGURATION_DRIFT",
  );
  // Workflow and frontend names have separate owners; only function-owned names are remote secrets.
  const names = [
    ...CONFIGURATION_CLASSES.PADDLE_REQUIRED.filter(
      (n) => !n.startsWith("VITE_"),
    ),
    ...CONFIGURATION_CLASSES.SHARED_REQUIRED.filter(
      (n) => !["SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"].includes(n),
    ),
  ];
  ensure(
    names.every((n) => observation.secretNames.includes(n)),
    "RELEASE_CONFIGURATION_PRESENCE",
  );
  ensure(
    observation.authConfig.site_url === c.siteUrl &&
      observation.authConfig.disable_signup === false &&
      observation.authConfig.mailer_autoconfirm === false,
    "RELEASE_AUTH_CONFIGURATION_DRIFT",
  );
  const redirects = observation.authConfig.uri_allow_list
    .split(",")
    .filter(Boolean);
  ensure(
    redirects.length > 0 && redirects.every((u) => c.redirectUrls.includes(u)),
    "RELEASE_AUTH_CONFIGURATION_DRIFT",
  );
}
export function assertTransition(before, after, functionName = null) {
  assertPolicy(after);
  assertHistory(before.facts.history, after.facts.history);
  ensure(
    before.secretDigest === after.secretDigest &&
      before.authDigest === after.authDigest,
    "RELEASE_CONFIGURATION_DRIFT",
  );
  const unaffected = (o) =>
    o.functions
      .filter((f) => f.name !== functionName)
      .sort((a, b) => a.name.localeCompare(b.name));
  ensure(
    canonical(unaffected(before)) === canonical(unaffected(after)),
    "RELEASE_FUNCTION_INVENTORY_DRIFT",
  );
}
export async function runRelease(
  {
    phase,
    mode,
    authorization,
    context,
    identity,
    contracts,
    root = process.cwd(),
  },
  adapter,
  dependencies = {},
) {
  ensure(["plan", "preflight", "apply"].includes(mode), "RELEASE_MODE_INVALID");
  const plan = phasePlan(phase, identity);
  if (mode === "plan")
    return {
      schemaVersion: 2,
      status: "plan",
      phase,
      plan,
      remoteExecuted: false,
      commercialCertification: "not_run",
    };
  const native = JSON.parse(
    readFileSync(
      join(
        root,
        "supabase/tests/fixtures/lemon_squeezy_retired_functions.json",
      ),
      "utf8",
    ),
  );
  const now = dependencies.now ?? Date.now;
  const configurationDigest = identity.payload.records.find(
    (r) => r.path === "supabase/config.toml",
  ).sha256;
  const currentContext = dependencies.currentContext ?? (() => context);
  const currentIdentity =
    dependencies.currentIdentity ?? (() => releaseIdentity(root));
  const emit = dependencies.emit ?? (() => {});
  let inventoryStarted = false;
  let auth,
    observation,
    reference,
    stage = "authorization",
    count = plan.start;
  const report = {
    schemaVersion: 2,
    status: "running",
    phase,
    authorizationDigest: hash(canonical(authorization)),
    executionCommit: context.commit,
    observedAt: new Date(now()).toISOString(),
    ledgerCount: null,
    completedSteps: [],
    checkpoints: [],
    remoteExecuted: false,
    commercialCertification: "not_run",
  };
  function authorize() {
    auth = validateAuthorization(
      authorization,
      phase,
      currentIdentity(),
      currentContext(),
      hash(canonical(contracts)),
      now(),
    );
  }
  async function gate(expected = count) {
    authorize();
    inventoryStarted = true;
    const fresh = await adapter.observe();
    // Network inventory must not outlive authority or recovery-evidence expiry.
    authorize();
    assertObservationFresh(fresh, now());
    exactLedger(fresh, identity.manifest, expected);
    assertPolicy(fresh);
    assertConfiguration(fresh, auth);
    assertScheduled(fresh, auth);
    assertDrain(fresh, auth);
    report.webhookHistory = fresh.facts.webhookHistory;
    assertApprovedFunctionInventory(fresh);
    if (observation)
      ensure(fresh.digest === observation.digest, "RELEASE_IMMEDIATE_DRIFT");
    observation = fresh;
    report.observationStability = fresh.stability;
    report.ledgerCount = fresh.facts.versions.length;
    return fresh;
  }
  function readyForMutation() {
    // Local artifact validation may also consume time. Revalidate the exact
    // authority/source and the original observation clock at the last boundary.
    authorize();
    assertObservationFresh(observation, now());
  }
  function checkpoint(label) {
    const e = {
      stage: label,
      ledgerCount: count,
      observedAt: new Date(now()).toISOString(),
      inventoryDigest: observation.digest,
      databaseContractDigest: observation.facts.contractDigest,
      historyPreserved: true,
      flagsDisabled: true,
      providerRequests: "operator_audit_required",
      commercialCertification: "not_run",
    };
    e.digest = hash(canonical(e));
    report.checkpoints.push(e);
    emit(report);
  }
  async function migration(stageName) {
    stage = stageName;
    const artifact = (dependencies.disposableArtifact ?? disposableArtifact)(
      root,
      identity,
      stageName,
    );
    try {
      await gate();
      adapter.command(
        ["link", "--project-ref", context.project],
        artifact.directory,
      );
      verifyMigrationDirectory(
        artifact.directory,
        artifact.artifact,
        configurationDigest,
      );
      const dryRun = adapter.command(
        ["db", "push", "--linked", "--dry-run"],
        artifact.directory,
      );
      validateDryRun(
        dryRun,
        identity.manifest.migrations.approved
          .slice(count, artifact.artifact.target)
          .map((m) => m.filename),
      );
      // Expensive planning/CLI dry-run cannot satisfy this immediate mutation gate.
      await gate();
      verifyMigrationDirectory(
        artifact.directory,
        artifact.artifact,
        configurationDigest,
      );
      readyForMutation();
      report.remoteExecuted = true;
      adapter.command(["db", "push", "--linked", "--yes"], artifact.directory);
      const after = await adapter.observe();
      exactLedger(after, identity.manifest, artifact.artifact.target);
      assertTransition(observation, after);
      assertConfiguration(after, auth);
      verifyDatabase(after, artifact.artifact.target, contracts, native);
      assertHistory(reference.facts.history, after.facts.history);
      if (stageName === "baseline")
        ensure(
          after.facts.history.billing_payment_method_preparations_v2 ===
            "d751713988987e9331980363e24189ce",
          "RELEASE_BASELINE_POPULATION",
        );
      observation = after;
      count = artifact.artifact.target;
      report.ledgerCount = count;
      checkpoint(`${stageName}_checkpoint`);
    } finally {
      artifact.cleanup();
    }
  }
  async function deploy(modeName, classification) {
    const artifact = (dependencies.disposableArtifact ?? disposableArtifact)(
      root,
      identity,
      "activation",
      modeName,
    );
    try {
      const names =
        modeName === "containment"
          ? [...LS_TOMBSTONES, ...identity.containment.map((f) => f.name)]
          : FUNCTION_CONTRACTS.filter((f) =>
              classification === "billing"
                ? f.classification !== "NON_BILLING"
                : f.classification === "NON_BILLING",
            ).map((f) => f.name);
      for (const name of names) {
        stage = `${modeName}_${name}`;
        await gate();
        // Rebuild/check source identity immediately before every artifact mutation.
        const expected =
          modeName === "containment" && !LS_TOMBSTONES.includes(name)
            ? identity.containment.find((f) => f.name === name)
            : identity.functions.find((f) => f.name === name);
        verifyFunctionDirectory(artifact.directory, expected, modeName);
        verifyDeploymentConfiguration(artifact.directory, configurationDigest);
        readyForMutation();
        report.remoteExecuted = true;
        adapter.command(
          [
            "functions",
            "deploy",
            name,
            "--project-ref",
            context.project,
            ...(expected.verifyJwt ? [] : ["--no-verify-jwt"]),
          ],
          artifact.directory,
        );
        const deployed = await adapter.observe();
        exactLedger(deployed, identity.manifest, count);
        assertTransition(observation, deployed, name);
        const generation = deployed.functions.find((f) => f.name === name);
        ensure(generation?.status === "ACTIVE", "RELEASE_FUNCTION_NOT_ACTIVE");
        ensure(
          generation?.verify_jwt === expected.verifyJwt,
          "RELEASE_JWT_DRIFT",
        );
        const proof = await adapter.verifyArtifact(name, expected, modeName);
        ensure(proof === expected.digest, "RELEASE_FUNCTION_IDENTITY_DRIFT");
        const after = await adapter.observe();
        ensure(
          after.digest === deployed.digest,
          "RELEASE_DEPLOYED_GENERATION_DRIFT",
        );
        exactLedger(after, identity.manifest, count);
        assertTransition(observation, after, name);
        ensure(
          after.functions.find((f) => f.name === name)?.verify_jwt ===
            expected.verifyJwt,
          "RELEASE_JWT_DRIFT",
        );
        if (LS_TOMBSTONES.includes(name)) await adapter.probe(name);
        const postProbe = await adapter.observe();
        ensure(postProbe.digest === after.digest, "RELEASE_PROBE_SIDE_EFFECT");
        observation = postProbe;
        observation.artifacts = { ...(report.artifacts ?? {}), [name]: proof };
        report.artifacts = observation.artifacts;
        report.functionProofs = {
          ...(report.functionProofs ?? {}),
          [name]: {
            version: generation.version,
            verifyJwt: generation.verify_jwt,
            artifact:
              modeName === "containment" && !LS_TOMBSTONES.includes(name)
                ? "containment"
                : "final",
          },
        };
        report.completedSteps.push(stage);
        emit(report);
        // Artifact proofs are kept separately from inventory digest, which remains stable.
      }
    } finally {
      artifact.cleanup();
    }
  }
  try {
    authorize();
    stage = "initial_inventory";
    await gate();
    ensure(
      observation.digest === auth.inventory.digest,
      "RELEASE_REVIEWED_INVENTORY_DRIFT",
    );
    verifyDatabase(observation, plan.start, contracts, native);
    reference = observation;
    assertDrain(observation, auth);
    if (mode === "preflight")
      return { ...report, status: "preflight_pass", remoteExecuted: false };
    for (const step of plan.steps) {
      stage = step;
      if (["baseline", "retirement", "activation"].includes(step))
        await migration(step);
      else if (step === "containment") {
        await deploy("containment");
        verifyFunctions(
          { ...observation, artifacts: report.artifacts },
          identity,
          "containment",
        );
        checkpoint("containment_verified");
      } else if (step === "drain") {
        await gate();
        assertDrain(observation, auth);
        checkpoint("drain_verified");
      } else if (
        step === "retirement_checkpoint" ||
        step === "activation_checkpoint"
      ) {
        await gate();
        verifyDatabase(observation, count, contracts, native);
        checkpoint(step);
      } else if (step === "billing" || step === "nonbilling")
        await deploy("final", step);
      else if (step === "final") {
        await gate();
        verifyDatabase(observation, 186, contracts, native);
        verifyFunctions(
          { ...observation, artifacts: report.artifacts },
          identity,
          "final",
        );
        assertHistory(reference.facts.history, observation.facts.history);
        for (const f of identity.outsideFunctions.filter((f) =>
          observation.functions.some((r) => r.name === f.name),
        )) {
          await gate();
          ensure(
            (await adapter.verifyArtifact(f.name, f, "final")) === f.digest,
            "RELEASE_FUNCTION_IDENTITY_DRIFT",
          );
          const after = await adapter.observe();
          ensure(
            after.digest === observation.digest,
            "RELEASE_IMMEDIATE_DRIFT",
          );
        }
        report.invariants = {
          APPLICATION_RUNTIME_LS_EXECUTION: "ZERO",
          DATABASE_APPLICATION_LS_AUTHORITY: "ZERO",
          ACTIVE_TOOLING_LS_DEPENDENCY: "ZERO",
          REMOTE_DEPLOYED_LS_EXECUTION: "ZERO",
        };
        checkpoint("final_verified");
      }
      report.completedSteps.push(step);
      emit(report);
    }
    report.status = "complete";
    report.observedAt = new Date(now()).toISOString();
    emit(report);
    return report;
  } catch (error) {
    if (error.stability) report.observationStability = error.stability;
    // Never continue or infer a remote state from a failed CLI return.
    let actual = null;
    if (inventoryStarted || report.remoteExecuted) {
      try {
        actual = await adapter.observe();
        report.ledgerCount = actual.facts.versions.length;
      } catch {
        report.ledgerCount = null;
      }
    }
    const recovery = {
      schemaVersion: 2,
      status: "blocked",
      phase,
      authorizationDigest: report.authorizationDigest,
      executionCommit: context.commit,
      observedAt: new Date(now()).toISOString(),
      ledgerCount: report.ledgerCount,
      inventoryDigest: actual?.digest ?? null,
      functionStates: (actual?.functions ?? [])
        .filter((f) => FUNCTION_CONTRACTS.some((c) => c.name === f.name))
        .map((f) => ({
          name: f.name,
          version: f.version,
          verifyJwt: f.verify_jwt,
          artifact:
            report.functionProofs?.[f.name]?.version === f.version &&
            report.functionProofs[f.name].verifyJwt === f.verify_jwt
              ? report.functionProofs[f.name].artifact
              : "unknown",
        })),
      completedSteps: report.completedSteps,
      failedStep: stage,
      errorCode: /^[A-Z_]+$/.test(error.message ?? "")
        ? error.message
        : "RELEASE_OPERATION_FAILED",
      newAuthorizationRequired: true,
    };
    emit({ ...report, status: "blocked", recovery });
    return { ...report, status: "blocked", recovery };
  }
}
export function writeReleaseEvidence(
  report,
  directory = "output/staging-release",
) {
  mkdirSync(directory, { recursive: true });
  // Only fixed-vocabulary evidence, hashes, counts, timestamps and approved names.
  writeFileSync(
    join(directory, "release-evidence.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
