import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { validateBundle } from "./staging-commercial-plan.mjs";
import { hash } from "./billing-retirement-release.mjs";
import {
  FUNCTION_CONTRACTS,
  OUTSIDE_BILLING_DEPLOYMENT,
  IMMUTABLE_MIGRATION_PREFIX_SHA,
  LS_TOMBSTONES,
  UNSUPPORTED_SCENARIOS,
} from "./billing-deployment-contract.mjs";

const fail = (code) => {
  throw new Error(code);
};
export function validateRuntimeSource(source, path) {
  // Parse executable syntax, not raw text: historical comments and redaction
  // regexes remain safety evidence, while imports and all string/template forms
  // are checked. No entire runtime file is exempted from the guard.
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node) => {
    const literal =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateLiteralToken(node);
    if (
      (literal || ts.isIdentifier(node)) &&
      (/createLemonSqueezy|handleBillingWebhook|LEMONSQUEEZY_(?:API_KEY|WEBHOOK_SECRET)|api\.lemonsqueezy\.com/i.test(
        node.text,
      ) ||
        (literal && /lemon[_ -]?squeezy/i.test(node.text)))
    )
      fail("ACTIVE_LS_APPLICATION_RUNTIME_REINTRODUCED");
    ts.forEachChild(node, visit);
  };
  visit(file);
}
export function validateBillingRetirement(root = process.cwd()) {
  const manifest = validateBundle(root);
  if (
    hash(JSON.stringify(manifest.migrations.approved.slice(0, 184))) !==
    IMMUTABLE_MIGRATION_PREFIX_SHA
  )
    fail("IMMUTABLE_MIGRATION_PREFIX_DRIFT");
  const entrypoints = readdirSync(join(root, "supabase/functions"), {
    withFileTypes: true,
  })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(join(root, "supabase/functions", d.name, "index.ts")),
    )
    .map((d) => d.name)
    .sort();
  const expected = [
    ...FUNCTION_CONTRACTS.map((f) => f.name),
    ...OUTSIDE_BILLING_DEPLOYMENT,
  ].sort();
  if (JSON.stringify(entrypoints) !== JSON.stringify(expected))
    fail("UNCLASSIFIED_FUNCTION_ENTRYPOINT");
  const walk = (directory) =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap((d) => {
      const relative = `${directory}/${d.name}`;
      return d.isDirectory()
        ? walk(relative)
        : /\.[cm]?[jt]sx?$/.test(relative)
          ? [relative]
          : [];
    });
  const runtime = [...walk("src"), ...walk("supabase/functions")];
  const retired = JSON.parse(
    readFileSync(
      join(
        root,
        "supabase/tests/fixtures/lemon_squeezy_retired_functions.json",
      ),
      "utf8",
    ),
  );
  if (retired.length !== 28) fail("RETIRED_RPC_INVENTORY_DRIFT");
  for (const relative of runtime) {
    const source = readFileSync(join(root, relative), "utf8");
    validateRuntimeSource(source, relative);
    for (const signature of retired)
      if (new RegExp(`\\b${signature.split("(")[0]}\\b`).test(source))
        fail("RETIRED_LS_RPC_APPLICATION_CALLER");
  }
  const scenes = JSON.parse(
    readFileSync(
      join(root, "config/staging-commercial-scenarios.json"),
      "utf8",
    ),
  );
  for (const scene of scenes) {
    for (const source of scene.localEvidence) readFileSync(join(root, source));
    if (
      UNSUPPORTED_SCENARIOS.includes(scene.id) ===
      scene.requiredForCertification
    )
      fail("UNSUPPORTED_SCENARIO_CONTRACT_INVALID");
    if (
      /lemon|squeezy|portal/i.test(scene.title) &&
      scene.id !== "CERT-LS-NEGATIVE-001"
    )
      fail("LIVE_LS_CERTIFICATION_SCENARIO");
  }
  // Permanent DB tests remain active in Supabase CI; archives are outside supabase/tests.
  for (const file of [
    "lemon_squeezy_database_retirement.sql",
    "lemon_squeezy_retired_state_routing.sql",
    "billing_cross_ledger_guards.sql",
  ])
    readFileSync(join(root, "supabase/tests", file));
  return {
    valid: true,
    activeProvider: "paddle",
    migrations: 186,
    billingFunctions: manifest.functions.billing.length,
    tombstones: LS_TOMBSTONES.length,
    activeLSRuntime: 0,
    dbAuthorityRegressionSuiteRequired: true,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(validateBillingRetirement()));
  } catch (error) {
    console.error(
      /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "BILLING_RETIREMENT_VALIDATION_FAILED",
    );
    process.exitCode = 1;
  }
}
