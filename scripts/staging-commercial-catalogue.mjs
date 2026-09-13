import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { requireCheck } from "./staging-commercial-contracts.mjs";

export function readSnapshot(root = ".") {
  // The frozen TS file is a data literal. Parse it, never execute supplied code.
  const source = readFileSync(
    `${root}/src/features/commercial-catalogue/public-catalogue-v2.generated.ts`,
    "utf8",
  );
  const json = source
    .replace(/^export default\s*/, "")
    .replace(/\s*as const;\s*$/, "")
    .replace(/([,{]\s*)([A-Za-z][A-Za-z0-9]*):/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(json);
}
export function catalogueDiff(actual, expected) {
  const paths = [];
  function visit(a, b, path) {
    if (Object.is(a, b)) return;
    if (
      typeof a !== typeof b ||
      a == null ||
      b == null ||
      typeof b !== "object" ||
      Array.isArray(a) !== Array.isArray(b)
    ) {
      paths.push(path);
      return;
    }
    if (Array.isArray(b)) {
      if (a.length !== b.length) paths.push(`${path}.length`);
      b.forEach((v, i) => visit(a[i], v, `${path}[${i}]`));
    } else {
      if (Object.keys(a).some((k) => !Object.hasOwn(b, k)))
        paths.push(`${path}.[unexpected-field]`);
      for (const [k, v] of Object.entries(b)) visit(a[k], v, `${path}.${k}`);
    }
  }
  visit(actual, expected, "$catalogue");
  return paths;
}
export function assertCatalogue(actual, snapshot = readSnapshot()) {
  const features = new Set(
    snapshot.plans.flatMap((p) => p.features.map((f) => f.featureKey)),
  );
  requireCheck(
    snapshot.schemaVersion === 2 &&
      snapshot.plans.length === 3 &&
      features.size === 2 &&
      snapshot.addons.length === 0 &&
      snapshot.trial.durationDays === 14 &&
      snapshot.trial.cardRequired === false,
    "SNAPSHOT_CONTRACT_INVALID",
  );
  const paths = catalogueDiff(actual, snapshot);
  return { match: paths.length === 0, paths };
}
export function validateCatalogueEndpoint(url, project) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error("CATALOGUE_URL_INVALID");
  }
  requireCheck(
    /^[a-z]{20}$/.test(project ?? "") &&
      target.origin === url &&
      target.protocol === "https:" &&
      target.hostname === `${project}.supabase.co` &&
      !target.username &&
      !target.password &&
      !target.port,
    "CATALOGUE_STAGING_URL_REQUIRED",
  );
  return target;
}
export async function fetchStagingCatalogue(
  { url, anonKey, project, confirmedProject, productionProject, authorized },
  transport = fetch,
) {
  requireCheck(
    authorized === "STAGING_ANONYMOUS_READ" &&
      project === confirmedProject &&
      /^[a-z]{20}$/.test(productionProject ?? "") &&
      project !== productionProject,
    "CATALOGUE_AUTHORIZATION_REQUIRED",
  );
  validateCatalogueEndpoint(url, project);
  requireCheck(
    typeof anonKey === "string" && anonKey.length > 0,
    "ANON_KEY_REQUIRED",
  );
  // Disallow redirects so an API key cannot leave the confirmed origin.
  const response = await transport(
    `${url}/rest/v1/rpc/get_public_commercial_catalogue_v2`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  requireCheck(response.ok, "CATALOGUE_REQUEST_FAILED");
  return assertCatalogue(await response.json());
}
export function localCatalogue() {
  const raw = execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_coachos",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-c",
      "set role anon; select public.get_public_commercial_catalogue_v2();",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return assertCatalogue(JSON.parse(raw.trim().replace(/^SET\s*/, "")));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    requireCheck(
      process.argv.length <= 3 &&
        [undefined, "--local", "--staging"].includes(process.argv[2]),
      "CATALOGUE_MODE_INVALID",
    );
    const result =
      process.argv[2] === "--staging"
        ? await fetchStagingCatalogue({
            url: process.env.STAGING_SUPABASE_URL,
            anonKey: process.env.STAGING_ANON_KEY,
            project: process.env.STAGING_SUPABASE_PROJECT_REF,
            confirmedProject: process.env.CONFIRM_PROJECT_REF,
            productionProject: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
            authorized: process.env.ALLOW_STAGING_CATALOGUE_READ,
          })
        : localCatalogue();
    console.log(JSON.stringify(result));
    if (!result.match) process.exitCode = 1;
  } catch {
    console.error("CATALOGUE_CHECK_FAILED");
    process.exitCode = 1;
  }
}
