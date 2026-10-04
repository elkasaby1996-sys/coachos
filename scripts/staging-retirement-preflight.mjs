// FUTURE protected staging inspection. Local preflight remains independently read-only/offline.
import { pathToFileURL } from "node:url";
import { billingOutput } from "./billing-operator-output.mjs";
import { runPreflight } from "./staging-commercial-preflight.mjs";
import {
  readDeploymentInventory,
  compareReviewedInventory,
} from "./billing-retirement-remote-inventory.mjs";
export async function runStagingRetirementPreflight(dependencies = {}) {
  const context = (dependencies.runPreflight ?? runPreflight)("preflight");
  const observation = await (
    dependencies.readDeploymentInventory ?? readDeploymentInventory
  )({ ...context, mode: "preflight" });
  compareReviewedInventory(observation, context.auth);
  return {
    environment: "staging",
    readOnlyInventoryVerified: true,
    remoteMutationPerformed: false,
    billingCertification: "not_run",
    functionCount: observation.inventory.functions.length,
    migrationCount: observation.inventory.facts.versions.length,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    billingOutput.log(await runStagingRetirementPreflight());
  } catch {
    billingOutput.error("STAGING_RETIREMENT_READ_ONLY_PREFLIGHT_BLOCKED");
    process.exitCode = 1;
  }
}
